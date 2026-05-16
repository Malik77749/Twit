// Rate Limiter Module — Client-side rate limiting with server-side backup
import { ref, get, set, update } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const LIMITS = {
    post: {
        cooldownMs: 30000,      // 30 seconds between posts
        dailyMax: 50,           // max 50 posts per day
        burstMax: 5,            // max 5 posts in burst window
        burstWindowMs: 300000   // 5 minutes burst window
    },
    comment: {
        cooldownMs: 10000,      // 10 seconds between comments
        dailyMax: 200,          // max 200 comments per day
        burstMax: 10,           // max 10 comments in burst window
        burstWindowMs: 300000   // 5 minutes burst window
    },
    like: {
        cooldownMs: 2000,       // 2 seconds between likes
        dailyMax: 500,          // max 500 likes per day
        burstMax: 30,           // max 30 likes in burst window
        burstWindowMs: 60000    // 1 minute burst window
    },
    follow: {
        cooldownMs: 5000,       // 5 seconds between follows
        dailyMax: 100,          // max 100 follows per day
        burstMax: 10,           // max 10 follows in burst window
        burstWindowMs: 300000   // 5 minutes burst window
    },
    retweet: {
        cooldownMs: 10000,      // 10 seconds between retweets
        dailyMax: 100,          // max 100 retweets per day
        burstMax: 5,
        burstWindowMs: 300000
    },
    report: {
        cooldownMs: 60000,      // 1 minute between reports
        dailyMax: 20,           // max 20 reports per day
        burstMax: 3,
        burstWindowMs: 600000   // 10 minutes burst window
    }
};

// In-memory rate limit tracking (faster than DB reads)
const localLimits = {};

/**
 * Initialize rate limiter for a user
 */
function init(userId) {
    if (!localLimits[userId]) {
        localLimits[userId] = {};
    }
}

/**
 * Check if an action is allowed
 * @param {string} userId - User ID
 * @param {string} action - Action type (post, comment, like, follow, retweet, report)
 * @returns {{ allowed: boolean, reason: string, waitMs: number }}
 */
function checkLimit(userId, action) {
    const limit = LIMITS[action];
    if (!limit) return { allowed: true, reason: '', waitMs: 0 };

    init(userId);
    const userLimits = localLimits[userId];

    if (!userLimits[action]) {
        userLimits[action] = {
            lastAction: 0,
            dailyCount: 0,
            dailyResetDate: getTodayKey(),
            burstActions: []
        };
    }

    const state = userLimits[action];
    const now = Date.now();

    // Reset daily count if new day
    const todayKey = getTodayKey();
    if (state.dailyResetDate !== todayKey) {
        state.dailyCount = 0;
        state.dailyResetDate = todayKey;
        state.burstActions = [];
    }

    // Check cooldown
    const timeSinceLast = now - state.lastAction;
    if (timeSinceLast < limit.cooldownMs) {
        const waitMs = limit.cooldownMs - timeSinceLast;
        return {
            allowed: false,
            reason: `انتظر ${Math.ceil(waitMs / 1000)} ثوانٍ`,
            waitMs: waitMs
        };
    }

    // Check daily limit
    if (state.dailyCount >= limit.dailyMax) {
        return {
            allowed: false,
            reason: `وصلت الحد الأقصى اليومي (${limit.dailyMax} ${getActionName(action)})`,
            waitMs: 0
        };
    }

    // Check burst limit
    state.burstActions = state.burstActions.filter(t => now - t < limit.burstWindowMs);
    if (state.burstActions.length >= limit.burstMax) {
        const oldestBurst = state.burstActions[0];
        const waitMs = limit.burstWindowMs - (now - oldestBurst);
        return {
            allowed: false,
            reason: `كثرة ${getActionName(action)} — انتظر ${Math.ceil(waitMs / 1000)} ثانية`,
            waitMs: waitMs
        };
    }

    return { allowed: true, reason: '', waitMs: 0 };
}

/**
 * Record an action (call AFTER successful action)
 */
function recordAction(userId, action) {
    init(userId);
    const userLimits = localLimits[userId];

    if (!userLimits[action]) {
        userLimits[action] = {
            lastAction: 0,
            dailyCount: 0,
            dailyResetDate: getTodayKey(),
            burstActions: []
        };
    }

    const state = userLimits[action];
    const now = Date.now();

    state.lastAction = now;
    state.dailyCount += 1;
    state.burstActions.push(now);

    // Clean old burst entries
    const limit = LIMITS[action];
    state.burstActions = state.burstActions.filter(t => now - t < limit.burstWindowMs);
}

/**
 * Get remaining actions for today
 */
function getRemaining(userId, action) {
    const limit = LIMITS[action];
    if (!limit) return Infinity;

    init(userId);
    const userLimits = localLimits[userId];

    if (!userLimits[action]) return limit.dailyMax;

    const state = userLimits[action];
    const todayKey = getTodayKey();

    if (state.dailyResetDate !== todayKey) return limit.dailyMax;

    return Math.max(0, limit.dailyMax - state.dailyCount);
}

/**
 * Get time until next allowed action
 */
function getCooldownRemaining(userId, action) {
    const limit = LIMITS[action];
    if (!limit) return 0;

    init(userId);
    const userLimits = localLimits[userId];

    if (!userLimits[action]) return 0;

    const state = userLimits[action];
    const elapsed = Date.now() - state.lastAction;

    return Math.max(0, limit.cooldownMs - elapsed);
}

/**
 * Server-side rate limit check (for critical actions)
 * Stores to Firebase to prevent client-side bypass
 */
async function serverCheck(database, userId, action) {
    const limit = LIMITS[action];
    if (!limit) return true;

    try {
        const limitRef = ref(database, `rateLimits/${userId}/${action}`);
        const snapshot = await get(limitRef);

        if (!snapshot.exists()) {
            await set(limitRef, {
                count: 1,
                resetAt: Date.now() + 86400000 // 24 hours
            });
            return true;
        }

        const data = snapshot.val();

        // Reset if expired
        if (Date.now() > data.resetAt) {
            await set(limitRef, {
                count: 1,
                resetAt: Date.now() + 86400000
            });
            return true;
        }

        // Check limit
        if (data.count >= limit.dailyMax) {
            return false;
        }

        // Increment
        await update(limitRef, { count: data.count + 1 });
        return true;
    } catch (error) {
        // If server check fails, allow (client-side limiter is backup)
        console.warn('Server rate limit check failed:', error);
        return true;
    }
}

/**
 * Get Arabic name for action
 */
function getActionName(action) {
    const names = {
        post: 'منشور',
        comment: 'تعليق',
        like: 'إعجاب',
        follow: 'متابعة',
        retweet: 'إعادة نشر',
        report: 'إبلاغ'
    };
    return names[action] || action;
}

/**
 * Get today's date key for daily reset
 */
function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Format cooldown time for display
 */
function formatCooldown(waitMs) {
    if (waitMs <= 0) return '';
    const seconds = Math.ceil(waitMs / 1000);
    if (seconds < 60) return `${seconds} ثانية`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} دقيقة`;
}

/**
 * Show rate limit toast to user
 */
function showRateLimitToast(message) {
    // Use existing toast system if available
    if (window.showToast) {
        window.showToast(message);
    } else {
        // Fallback
        let toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

/**
 * Disable a button temporarily with countdown
 */
function disableWithCooldown(button, waitMs, label) {
    if (!button) return;

    const originalText = button.textContent;
    button.disabled = true;
    let remaining = Math.ceil(waitMs / 1000);

    const interval = setInterval(() => {
        remaining--;
        button.textContent = `${label || ''} ${remaining}ث`;

        if (remaining <= 0) {
            clearInterval(interval);
            button.disabled = false;
            button.textContent = originalText;
        }
    }, 1000);
}

export {
    init,
    checkLimit,
    recordAction,
    getRemaining,
    getCooldownRemaining,
    serverCheck,
    showRateLimitToast,
    disableWithCooldown,
    formatCooldown,
    LIMITS
};
