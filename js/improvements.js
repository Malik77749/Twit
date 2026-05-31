// ===== PROFESSIONAL PULL-TO-REFRESH IMPLEMENTATION =====
// Inspired by X/Twitter - Professional threshold-based refresh

(function initProfessionalPullToRefresh() {
    const mainFeed = document.querySelector('.main-feed');
    if (!mainFeed) return;

    // Configuration
    const PTR_THRESHOLD = 120; // Professional threshold - requires clear pull
    const PTR_RELEASE_THRESHOLD = 100; // Release point
    const MAX_PULL_DISTANCE = 150; // Max visual pull distance
    const ANIMATION_DURATION = 300; // Smooth animation duration

    // State management
    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    let isRefreshing = false;
    let lastRefreshTime = 0;
    const MIN_REFRESH_INTERVAL = 2000; // Prevent rapid refreshes

    const ptr = document.getElementById('pull-to-refresh');
    if (!ptr) return;

    // Prevent browser's native pull-to-refresh
    mainFeed.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';

    // ===== Touch Start =====
    mainFeed.addEventListener('touchstart', (e) => {
        // Only start pulling if at the very top of the feed
        if (mainFeed.scrollTop === 0 && !isRefreshing) {
            startY = e.touches[0].clientY;
            currentY = startY;
            isPulling = true;
        }
    }, { passive: true });

    // ===== Touch Move - Smooth Animation =====
    mainFeed.addEventListener('touchmove', (e) => {
        if (!isPulling || isRefreshing) return;

        currentY = e.touches[0].clientY;
        const pullDistance = Math.max(0, currentY - startY);

        // Only show PTR when actually pulling down
        if (pullDistance > 0 && mainFeed.scrollTop === 0) {
            // Smooth visual feedback with easing
            const visualDistance = Math.min(pullDistance, MAX_PULL_DISTANCE);
            const easeDistance = easeOutCubic(visualDistance / MAX_PULL_DISTANCE) * MAX_PULL_DISTANCE;

            // Update PTR indicator
            ptr.style.display = 'flex';
            ptr.style.transform = `translateY(${easeDistance}px)`;
            ptr.style.opacity = Math.min(1, pullDistance / PTR_THRESHOLD);

            // Update spinner rotation based on pull distance
            const spinner = ptr.querySelector('.ptr-spinner');
            if (spinner) {
                const rotation = (pullDistance / PTR_THRESHOLD) * 360;
                spinner.style.transform = `rotate(${rotation}deg)`;
            }

            // Activate when threshold is reached
            if (pullDistance >= PTR_THRESHOLD) {
                ptr.classList.add('active');
                ptr.style.opacity = 1;
            } else {
                ptr.classList.remove('active');
            }
        }
    }, { passive: true });

    // ===== Touch End - Trigger Refresh =====
    mainFeed.addEventListener('touchend', async () => {
        if (!isPulling) return;

        const pullDistance = currentY - startY;
        const shouldRefresh = pullDistance >= PTR_RELEASE_THRESHOLD && !isRefreshing;

        if (shouldRefresh) {
            // Prevent rapid successive refreshes
            const now = Date.now();
            if (now - lastRefreshTime < MIN_REFRESH_INTERVAL) {
                resetPTR();
                isPulling = false;
                return;
            }

            isRefreshing = true;
            ptr.classList.add('refreshing');
            ptr.style.opacity = 1;

            try {
                // Import required modules
                const { pagination } = window;
                const { posts } = window;

                if (pagination && posts) {
                    // Reset pagination and load fresh posts
                    pagination.resetPagination();
                    await posts.loadPosts();
                    
                    // Show success feedback
                    const toast = document.createElement('div');
                    toast.className = 'refresh-toast';
                    toast.textContent = '✓ تم تحديث المنشورات';
                    document.body.appendChild(toast);
                    
                    setTimeout(() => toast.remove(), 2000);
                }
            } catch (error) {
                console.error('Refresh error:', error);
            } finally {
                lastRefreshTime = Date.now();
                isRefreshing = false;
                resetPTR();
            }
        } else {
            // Not enough pull - just reset
            resetPTR();
        }

        isPulling = false;
    }, { passive: true });

    // ===== Helper Functions =====
    function resetPTR() {
        ptr.classList.remove('active', 'refreshing');
        ptr.style.transform = 'translateY(0)';
        ptr.style.opacity = 0;
        
        setTimeout(() => {
            ptr.style.display = 'none';
        }, ANIMATION_DURATION);
    }

    // Easing function for smooth animation
    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    // Expose reset function globally for debugging
    window.resetPTR = resetPTR;
})();

// ===== ENHANCED PULL-TO-REFRESH STYLING =====
// Add this to style.css or inject dynamically
const ptrStyles = `
.pull-to-refresh {
    display: none;
    justify-content: center;
    align-items: center;
    padding: 16px;
    opacity: 0;
    transition: opacity 0.3s ease-out;
    z-index: 100;
    position: relative;
}

.pull-to-refresh.active {
    opacity: 1;
}

.pull-to-refresh.refreshing {
    opacity: 1;
}

.ptr-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border-color);
    border-top: 3px solid var(--accent);
    border-radius: 50%;
    animation: ptr-spin 0.8s linear infinite;
    transition: transform 0.2s ease-out;
}

@keyframes ptr-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.refresh-toast {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    color: #00ba7c;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    z-index: 1000;
    animation: toast-fade 0.3s ease-out;
}

@keyframes toast-fade {
    from {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.8);
    }
    to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
    }
}
`;

// Inject styles if not already present
if (!document.querySelector('style[data-ptr-styles]')) {
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-ptr-styles', 'true');
    styleEl.textContent = ptrStyles;
    document.head.appendChild(styleEl);
}

// ===== AUTH FLOW STABILIZATION =====
// Prevent multiple redirects and ensure smooth signup/login flow

(function stabilizeAuthFlow() {
    let isAuthTransitioning = false;
    let lastAuthAction = 0;
    const AUTH_ACTION_DEBOUNCE = 500; // Prevent rapid auth actions

    // Override showApp to prevent multiple calls
    const originalShowApp = window.showApp;
    window.showApp = function() {
        if (isAuthTransitioning) return;
        
        const now = Date.now();
        if (now - lastAuthAction < AUTH_ACTION_DEBOUNCE) return;
        
        isAuthTransitioning = true;
        lastAuthAction = now;

        try {
            // Hide loading
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) loadingOverlay.style.display = 'none';

            // Hide auth section
            const authSection = document.getElementById('auth-section');
            if (authSection) authSection.style.display = 'none';

            // Show app section
            const appSection = document.getElementById('app-section');
            if (appSection) appSection.style.display = 'flex';

            // Reset auth forms
            resetAuthForms();

            // Navigate to home
            if (window.navigateTo) {
                window.navigateTo('home');
            }
        } finally {
            setTimeout(() => {
                isAuthTransitioning = false;
            }, AUTH_ACTION_DEBOUNCE);
        }
    };

    // Override showAuth to prevent multiple calls
    const originalShowAuth = window.showAuth;
    window.showAuth = function() {
        if (isAuthTransitioning) return;
        
        const now = Date.now();
        if (now - lastAuthAction < AUTH_ACTION_DEBOUNCE) return;
        
        isAuthTransitioning = true;
        lastAuthAction = now;

        try {
            // Hide loading
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) loadingOverlay.style.display = 'none';

            // Show auth section
            const authSection = document.getElementById('auth-section');
            if (authSection) authSection.style.display = 'flex';

            // Hide app section
            const appSection = document.getElementById('app-section');
            if (appSection) appSection.style.display = 'none';

            // Reset forms
            resetAuthForms();
        } finally {
            setTimeout(() => {
                isAuthTransitioning = false;
            }, AUTH_ACTION_DEBOUNCE);
        }
    };

    function resetAuthForms() {
        // Clear all auth form inputs
        const inputs = document.querySelectorAll(
            '#login-phone, #login-password-phone, #login-email, #login-password, ' +
            '#signup-name-phone, #signup-phone, #signup-password-phone, ' +
            '#signup-name, #signup-email, #signup-password, ' +
            '#signup-handle-phone, #signup-handle-email, #captcha-input'
        );
        inputs.forEach(input => input.value = '');

        // Clear error messages
        const errorEl = document.getElementById('error');
        if (errorEl) errorEl.innerText = '';

        // Reset to login view
        const loginSection = document.getElementById('login-section');
        const signupSection = document.getElementById('signup-section');
        if (loginSection) loginSection.style.display = 'block';
        if (signupSection) signupSection.style.display = 'none';
    }

    // Expose for debugging
    window.resetAuthForms = resetAuthForms;
})();

// ===== CARD DESIGN ENHANCEMENTS =====
// Improve post card spacing and visual hierarchy

const cardStyles = `
/* Enhanced Post Card Styling */
.tweet {
    display: flex;
    padding: 16px;
    border-bottom: 1px solid var(--border-color);
    gap: 12px;
    transition: background-color 0.2s ease;
    cursor: pointer;
    position: relative;
}

.tweet:hover {
    background-color: rgba(255, 255, 255, 0.05);
}

.tweet-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    flex-shrink: 0;
    cursor: pointer;
    transition: opacity 0.2s;
}

.tweet-avatar:hover {
    opacity: 0.8;
}

.tweet-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.tweet-header {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

.tweet-name {
    font-weight: 700;
    font-size: 15px;
    color: var(--text-primary);
    line-height: 1.2;
}

.tweet-name:hover {
    text-decoration: underline;
}

.tweet-handle {
    color: var(--text-secondary);
    font-size: 14px;
}

.tweet-dot {
    color: var(--text-secondary);
    font-size: 14px;
}

.tweet-time {
    color: var(--text-secondary);
    font-size: 14px;
    margin-left: auto;
}

.tweet-time:hover {
    text-decoration: underline;
}

.tweet-more {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    transition: all 0.2s;
    border: none;
    background: none;
    cursor: pointer;
    flex-shrink: 0;
}

.tweet-more:hover {
    background-color: rgba(29, 155, 240, 0.1);
    color: var(--accent);
}

.tweet-content {
    font-size: 15px;
    line-height: 1.5;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 4px 0;
}

.tweet-media {
    margin-top: 12px;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
}

.tweet-media img {
    width: 100%;
    display: block;
    max-height: 510px;
    object-fit: cover;
    transition: transform 0.2s;
}

.tweet-media img:hover {
    transform: scale(1.02);
}

.tweet-media iframe {
    width: 100%;
    height: 350px;
    border: none;
}

.tweet-actions {
    display: flex;
    justify-content: space-between;
    max-width: 425px;
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.tweet-action {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 4px 0;
    font-size: 13px;
    transition: color 0.2s;
    flex: 1;
    justify-content: flex-start;
}

.tweet-action .icon-wrap {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    font-size: 16px;
}

.tweet-action:hover .icon-wrap {
    background-color: rgba(29, 155, 240, 0.1);
}

.tweet-action.reply:hover {
    color: var(--reply-color);
}

.tweet-action.reply:hover .icon-wrap {
    background-color: rgba(29, 155, 240, 0.15);
}

.tweet-action.retweet:hover {
    color: var(--retweet-color);
}

.tweet-action.retweet:hover .icon-wrap {
    background-color: rgba(0, 186, 124, 0.1);
}

.tweet-action.like:hover {
    color: var(--like-color);
}

.tweet-action.like:hover .icon-wrap {
    background-color: rgba(249, 24, 128, 0.1);
}

.tweet-action.like.active {
    color: var(--like-color);
}

.tweet-action.like.active .icon-wrap {
    background-color: rgba(249, 24, 128, 0.15);
}

.tweet-action.like.active .fa-heart {
    animation: likeAnim 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.tweet-action.bookmark:hover {
    color: var(--accent);
}

.tweet-action.bookmark:hover .icon-wrap {
    background-color: rgba(29, 155, 240, 0.1);
}

.tweet-action.bookmark.active {
    color: var(--accent);
}

.tweet-action.bookmark.active .icon-wrap {
    background-color: rgba(29, 155, 240, 0.15);
}

/* Composer Enhancement */
.composer {
    display: flex;
    padding: 16px;
    border-bottom: 1px solid var(--border-color);
    gap: 12px;
    background: var(--bg-primary);
}

.composer-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    flex-shrink: 0;
}

.composer-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.composer-input {
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: 20px;
    padding: 8px 0;
    resize: none;
    outline: none;
    min-height: 52px;
    font-family: inherit;
    line-height: 1.5;
}

.composer-input::placeholder {
    color: var(--text-secondary);
}

.composer-divider {
    height: 1px;
    background-color: var(--border-color);
    margin: 8px 0;
}

.composer-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.composer-tools {
    display: flex;
    gap: 4px;
}

.composer-tool {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
    cursor: pointer;
    transition: background-color 0.2s;
    border: none;
    background: none;
    font-size: 18px;
}

.composer-tool:hover {
    background-color: rgba(29, 155, 240, 0.1);
}

.composer-submit {
    background-color: var(--accent);
    color: white;
    border: none;
    border-radius: 9999px;
    padding: 10px 24px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: background-color 0.2s;
    min-width: 80px;
}

.composer-submit:hover {
    background-color: var(--accent-hover);
}

.composer-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
`;

// Inject card styles
if (!document.querySelector('style[data-card-styles]')) {
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-card-styles', 'true');
    styleEl.textContent = cardStyles;
    document.head.appendChild(styleEl);
}

// Export for use in other modules
window.improvementsLoaded = true;
