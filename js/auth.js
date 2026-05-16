// Authentication Module
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { ref, get, set } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { showApp, showAuth, showLoading, hideLoading } from './ui.js';
import { clearUserCache } from './firebase-helpers.js';

let auth, database;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

async function login() {
    showLoading();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errorEl = document.getElementById('error');

    if (!email || !password) {
        errorEl.innerText = 'يرجى إدخال البريد وكلمة المرور';
        hideLoading();
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        errorEl.innerText = '';
        // Auth state listener handles the rest
    } catch (error) {
        const messages = {
            'auth/user-not-found': 'البريد الإلكتروني غير مسجل',
            'auth/wrong-password': 'كلمة المرور غير صحيحة',
            'auth/invalid-email': 'البريد الإلكتروني غير صالح',
            'auth/invalid-credential': 'بيانات الدخول غير صحيحة',
            'auth/too-many-requests': 'محاولات كثيرة، حاول لاحقاً',
            'auth/network-request-failed': 'تحقق من اتصال الإنترنت',
            'auth/user-disabled': 'هذا الحساب معطل'
        };
        errorEl.innerText = messages[error.code] || error.message;
        hideLoading();
    }
}

async function signup() {
    showLoading();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value.trim();
    const errorEl = document.getElementById('error');

    if (!name) { errorEl.innerText = 'أدخل اسمك'; hideLoading(); return; }
    if (!email || !password) { errorEl.innerText = 'أدخل البريد وكلمة المرور'; hideLoading(); return; }
    if (password.length < 6) { errorEl.innerText = 'كلمة المرور 6 أحرف على الأقل'; hideLoading(); return; }

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await set(ref(database, 'users/' + cred.user.uid), {
            name: name,
            isAdmin: false,
            joinDate: new Date().toISOString(),
            followers: 0,
            following: 0,
            profilePicture: DEFAULT_AVATAR
        });
        errorEl.innerText = '';
        // Auth state listener handles the rest
    } catch (error) {
        const messages = {
            'auth/email-already-in-use': 'البريد مستخدم بالفعل',
            'auth/invalid-email': 'البريد غير صالح',
            'auth/weak-password': 'كلمة المرور ضعيفة'
        };
        errorEl.innerText = messages[error.code] || error.message;
        hideLoading();
    }
}

async function logout() {
    showLoading();
    try {
        await signOut(auth);
        clearUserCache();
        showAuth();
        hideLoading();
    } catch (error) {
        alert('خطأ أثناء تسجيل الخروج');
        hideLoading();
    }
}

function setupAuthStateListener(callback) {
    onAuthStateChanged(auth, async user => {
        if (user) {
            try {
                const snapshot = await get(ref(database, 'bans/' + user.uid));
                const banData = snapshot.val();
                if (banData?.status === 'banned') {
                    alert('حسابك محظور');
                    await signOut(auth);
                    showAuth();
                    hideLoading();
                } else if (banData?.status === 'suspended') {
                    alert('حسابك معلق');
                    showAuth();
                    hideLoading();
                } else {
                    await callback(user);
                }
            } catch (error) {
                showAuth();
                hideLoading();
            }
        } else {
            showAuth();
            hideLoading();
        }
    });
}

function showLogin() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('signup-section').style.display = 'none';
    document.getElementById('error').innerText = '';
}

function showSignup() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('signup-section').style.display = 'block';
    document.getElementById('error').innerText = '';
}

export { init, login, signup, logout, setupAuthStateListener, showLogin, showSignup };
