// Authentication Module
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { ref, get, set } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { toggleSections, showLoading, hideLoading } from './ui.js';

let auth, database;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Login with email and password
 */
async function login() {
    showLoading();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errorElement = document.getElementById('error');

    if (!email || !password) {
        errorElement.innerText = 'يرجى إدخال البريد الإلكتروني وكلمة المرور';
        hideLoading();
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const userId = userCredential.user.uid;
        const banSnapshot = await get(ref(database, 'bans/' + userId));

        if (banSnapshot.exists()) {
            const banData = banSnapshot.val();
            if (banData.status === 'banned') {
                await signOut(auth);
                errorElement.innerText = 'حسابك محظور نهائيًا';
                hideLoading();
                return;
            } else if (banData.status === 'suspended') {
                await signOut(auth);
                errorElement.innerText = 'حسابك معلق مؤقتًا';
                hideLoading();
                return;
            }
        }

        errorElement.innerText = '';
        return userId;
    } catch (error) {
        const messages = {
            'auth/user-not-found': 'البريد الإلكتروني غير موجود',
            'auth/wrong-password': 'كلمة المرور غير صحيحة',
            'auth/invalid-email': 'البريد الإلكتروني غير صالح',
            'auth/invalid-credential': 'بيانات الاعتماد غير صحيحة',
            'auth/too-many-requests': 'تم حظر تسجيل الدخول مؤقتًا بسبب محاولات متكررة. حاول لاحقًا',
            'auth/network-request-failed': 'فشل الاتصال بالشبكة. تحقق من اتصالك بالإنترنت',
            'auth/user-disabled': 'هذا الحساب تم تعطيله'
        };
        errorElement.innerText = messages[error.code] || `خطأ غير معروف: ${error.message}`;
        hideLoading();
        throw error;
    }
}

/**
 * Create new account
 */
async function signup() {
    showLoading();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value.trim();
    const errorElement = document.getElementById('error');

    if (!name) {
        errorElement.innerText = 'يرجى إدخال الاسم الحقيقي';
        hideLoading();
        return;
    }
    if (!email || !password) {
        errorElement.innerText = 'يرجى إدخال البريد الإلكتروني وكلمة المرور';
        hideLoading();
        return;
    }
    if (password.length < 6) {
        errorElement.innerText = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
        hideLoading();
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const userId = userCredential.user.uid;
        await set(ref(database, 'users/' + userId), {
            name: name,
            isAdmin: false,
            joinDate: new Date().toISOString(),
            followers: 0,
            following: 0,
            profilePicture: 'https://via.placeholder.com/80'
        });
        errorElement.innerText = '';
        return userId;
    } catch (error) {
        const messages = {
            'auth/email-already-in-use': 'البريد الإلكتروني مستخدم بالفعل',
            'auth/invalid-email': 'البريد الإلكتروني غير صالح',
            'auth/weak-password': 'كلمة المرور ضعيفة جدًا'
        };
        errorElement.innerText = messages[error.code] || `خطأ: ${error.message}`;
        hideLoading();
        throw error;
    }
}

/**
 * Logout current user
 */
async function logout() {
    showLoading();
    try {
        await signOut(auth);
        toggleSections('auth');
    } catch (error) {
        alert('خطأ أثناء تسجيل الخروج');
        hideLoading();
    }
}

/**
 * Setup auth state listener
 */
function setupAuthStateListener(callback) {
    onAuthStateChanged(auth, async user => {
        showLoading();
        if (user) {
            try {
                const snapshot = await get(ref(database, 'bans/' + user.uid));
                const banData = snapshot.val();
                if (banData?.status === 'banned') {
                    alert('تم حظرك نهائيًا');
                    await signOut(auth);
                    toggleSections('auth');
                } else if (banData?.status === 'suspended') {
                    alert('حسابك معلق مؤقتًا');
                    toggleSections('auth');
                } else {
                    await callback(user);
                }
            } catch (error) {
                toggleSections('auth');
            }
        } else {
            toggleSections('auth');
        }
    });
}

/**
 * Switch between login and signup forms
 */
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
