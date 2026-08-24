// Google Sign-In Module
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { ref, get, set, update, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

let auth, database;
let googleProvider;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
    googleProvider = new GoogleAuthProvider();
    googleProvider.addScope('profile');
    googleProvider.addScope('email');
}

/**
 * Sign in with Google (popup)
 */
async function reserveNumericId(uid) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const numericId = String(Math.floor(100000000 + Math.random() * 900000000));
        const result = await runTransaction(ref(database, `numericIds/${numericId}`), current => current === null ? uid : current);
        if (result.committed && result.snapshot.val() === uid) return numericId;
    }
    throw new Error('تعذر إنشاء المعرّف الرقمي');
}

async function signInWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        // Check if new user
        const userSnap = await get(ref(database, 'users/' + user.uid));
        if (!userSnap.exists()) {
            const numericId = await reserveNumericId(user.uid);
            await set(ref(database, 'users/' + user.uid), {
                uid: user.uid,
                numericId,
                name: user.displayName || 'مستخدم',
                email: user.email,
                profilePicture: user.photoURL || DEFAULT_AVATAR,
                isAdmin: false,
                joinDate: new Date().toISOString(),
                followers: 0,
                following: 0,
                bio: '',
                provider: 'google',
                needsUsername: true
            });
            return { success: true, user, needsUsername: true };
        }

        await update(ref(database, 'users/' + user.uid), { lastLogin: new Date().toISOString() });
        return { success: true, user, needsUsername: !userSnap.val()?.handle };
    } catch (error) {
        console.error('Google sign-in error:', error);

        const messages = {
            'auth/popup-closed-by-user': 'تم إغلاق نافذة الدخول',
            'auth/popup-blocked': 'تم حظر النافذة المنبثقة — فعّلها في المتصفح',
            'auth/cancelled-popup-request': 'تم إلغاء العملية',
            'auth/network-request-failed': 'تحقق من اتصال الإنترنت',
            'auth/too-many-requests': 'محاولات كثيرة، حاول لاحقاً'
        };

        return {
            success: false,
            message: messages[error.code] || error.message
        };
    }
}

/**
 * Handle redirect result (for mobile)
 */
async function handleRedirectResult() {
    try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
            const user = result.user;
            const userSnap = await get(ref(database, 'users/' + user.uid));
            if (!userSnap.exists()) {
                const numericId = await reserveNumericId(user.uid);
                await set(ref(database, 'users/' + user.uid), {
                    uid: user.uid,
                    numericId,
                    name: user.displayName || 'مستخدم',
                    email: user.email,
                    profilePicture: user.photoURL || DEFAULT_AVATAR,
                    isAdmin: false,
                    joinDate: new Date().toISOString(),
                    followers: 0,
                    following: 0,
                    bio: '',
                    provider: 'google',
                    needsUsername: true
                });
                return { success: true, user, needsUsername: true };
            }
            return { success: true, user, needsUsername: !userSnap.val()?.handle };
        }
        return { success: false };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

export {
    init,
    signInWithGoogle,
    handleRedirectResult
};
