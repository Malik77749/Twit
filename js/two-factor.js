// Two-Factor Authentication Module (Email-based)
import { ref, get, set, update } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { sendEmailVerification, reload } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

let auth, database;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Check if 2FA is enabled for current user
 */
async function is2FAEnabled(userId) {
    try {
        const snap = await get(ref(database, `users/${userId}/twoFactorEnabled`));
        return snap.exists() && snap.val() === true;
    } catch (error) {
        return false;
    }
}

/**
 * Enable 2FA — requires verified email
 */
async function enable2FA() {
    const user = auth.currentUser;
    if (!user) return { success: false, message: 'غير مسجل الدخول' };

    try {
        // Reload user to get fresh emailVerified status
        await reload(user);

        if (!user.email) {
            return { success: false, message: 'يجب إضافة بريد إلكتروني أولاً' };
        }

        if (!user.emailVerified) {
            // Send verification email
            await sendEmailVerification(user);
            return {
                success: false,
                message: 'تم إرسال رابط التحقق إلى بريدك. تحقق من بريدك ثم أعد المحاولة.',
                needsVerification: true
            };
        }

        // Email is verified, enable 2FA
        await update(ref(database, 'users/' + user.uid), {
            twoFactorEnabled: true,
            twoFactorEnabledAt: new Date().toISOString()
        });

        return { success: true, message: 'تم تفعيل المصادقة الثنائية' };
    } catch (error) {
        return { success: false, message: 'خطأ: ' + error.message };
    }
}

/**
 * Disable 2FA
 */
async function disable2FA() {
    const user = auth.currentUser;
    if (!user) return { success: false };

    try {
        await update(ref(database, 'users/' + user.uid), {
            twoFactorEnabled: false,
            twoFactorDisabledAt: new Date().toISOString()
        });
        return { success: true, message: 'تم إيقاف المصادقة الثنائية' };
    } catch (error) {
        return { success: false, message: 'خطأ: ' + error.message };
    }
}

/**
 * Verify 2FA on login — check if email is verified
 * Always returns an object: { allowed: boolean, message?: string }
 */
async function verify2FAOnLogin(user) {
    try {
        const twoFASnap = await get(ref(database, `users/${user.uid}/twoFactorEnabled`));
        const isEnabled = twoFASnap.exists() && twoFASnap.val() === true;

        if (!isEnabled) {
            return { allowed: true };
        }

        // Reload user to get fresh emailVerified status
        await reload(user);

        if (!user.emailVerified) {
            // Send verification email only for accounts that actually have an email
            if (user.email) {
                await sendEmailVerification(user);
            }
            return {
                allowed: false,
                message: user.email
                    ? 'تم إرسال رابط التحقق إلى بريدك. تحقق من بريدك لتسجيل الدخول.'
                    : 'تعذر إكمال التحقق الإضافي لهذا الحساب.'
            };
        }

        return { allowed: true };
    } catch (error) {
        console.warn('2FA login verification skipped:', error);
        // On error, allow login (don't lock users out)
        return { allowed: true };
    }
}

/**
 * Resend verification email
 */
async function resendVerification() {
    const user = auth.currentUser;
    if (!user) return false;

    try {
        await sendEmailVerification(user);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Get 2FA status for UI
 */
async function get2FAStatus(userId) {
    const enabled = await is2FAEnabled(userId);
    const user = auth.currentUser;
    const emailVerified = user?.emailVerified || false;
    const hasEmail = !!user?.email;

    return {
        enabled,
        emailVerified,
        hasEmail,
        canEnable: hasEmail && emailVerified
    };
}

export { init, is2FAEnabled, enable2FA, disable2FA, verify2FAOnLogin, resendVerification, get2FAStatus };
