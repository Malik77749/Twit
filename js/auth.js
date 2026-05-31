// Authentication Module — Enhanced with Phone, Email, Google, CAPTCHA, and Persistence
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, sendEmailVerification, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { ref, get, set, query, orderByChild, equalTo } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { showApp, showAuth, showLoading, hideLoading } from './ui.js?v=3';
import { clearUserCache } from './firebase-helpers.js?v=3';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

let auth, database;
let loginMethod = 'phone'; // 'phone' or 'email'
let currentCaptcha = '';

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
    
    // Set persistence to LOCAL for staying logged in
    setPersistence(auth, browserLocalPersistence).catch(err => console.error('Persistence error:', err));
    
    setupHandleValidation();
    setupAuthListeners();
    refreshCaptcha();
}

// ===== CAPTCHA Generation =====
function generateCaptcha() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function refreshCaptcha() {
    currentCaptcha = generateCaptcha();
    const display = document.getElementById('captcha-display');
    if (display) display.textContent = currentCaptcha;
    const input = document.getElementById('captcha-input');
    if (input) input.value = '';
}

window.refreshCaptcha = refreshCaptcha;

// ===== Auth Event Listeners =====
function setupAuthListeners() {
    document.getElementById('login-phone-btn')?.addEventListener('click', loginWithPhone);
    document.getElementById('login-btn')?.addEventListener('click', login);
    document.getElementById('signup-phone-btn')?.addEventListener('click', signupWithPhone);
    document.getElementById('signup-btn')?.addEventListener('click', signup);
    document.getElementById('refresh-captcha')?.addEventListener('click', refreshCaptcha);
    
    document.getElementById('tab-phone')?.addEventListener('click', () => setLoginMethod('phone'));
    document.getElementById('tab-email')?.addEventListener('click', () => setLoginMethod('email'));
    
    document.getElementById('show-signup-btn')?.addEventListener('click', () => {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('signup-section').style.display = 'block';
        document.getElementById('error').innerText = '';
        refreshCaptcha();
    });
    
    document.getElementById('show-login-btn')?.addEventListener('click', () => {
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('signup-section').style.display = 'none';
        document.getElementById('error').innerText = '';
    });
}

// ===== Handle (Username) Validation =====
let handleCheckTimeout = null;
let lastCheckedHandle = '';
let lastCheckedResult = '';

function validateHandleFormat(handle) {
    return /^[a-zA-Z0-9_.]{3,20}$/.test(handle);
}

async function checkHandleAvailability(handle) {
    const lower = handle.toLowerCase();
    try {
        const snap = await get(ref(database, `handles/${lower}`));
        return !snap.exists();
    } catch (e) {
        console.error('Handle check error:', e);
        return false;
    }
}

function updateHandleUI(inputId, feedbackId, status, message) {
    const input = document.getElementById(inputId);
    const feedback = document.getElementById(feedbackId);
    const wrap = input?.closest('.handle-input-wrap');
    if (!wrap || !feedback) return;

    wrap.classList.remove('available', 'taken', 'checking');
    feedback.classList.remove('available', 'taken', 'checking', 'hint');

    if (status === 'available') {
        wrap.classList.add('available');
        feedback.classList.add('available');
        feedback.textContent = message || '✓ الاسم متاح';
    } else if (status === 'taken') {
        wrap.classList.add('taken');
        feedback.classList.add('taken');
        feedback.textContent = message || '✗ هذا الاسم مسجل مسبقاً';
    } else if (status === 'checking') {
        wrap.classList.add('checking');
        feedback.classList.add('checking');
        feedback.textContent = 'جاري التحقق...';
    } else if (status === 'hint') {
        feedback.classList.add('hint');
        feedback.textContent = message || '';
    } else {
        feedback.textContent = '';
    }
}

function setupHandleValidation() {
    const phoneHandle = document.getElementById('signup-handle-phone');
    const emailHandle = document.getElementById('signup-handle-email');

    if (phoneHandle) {
        phoneHandle.addEventListener('input', () => handleInputLive(phoneHandle, 'handle-feedback-phone'));
    }
    if (emailHandle) {
        emailHandle.addEventListener('input', () => handleInputLive(emailHandle, 'handle-feedback-email'));
    }
}

function handleInputLive(input, feedbackId) {
    const raw = input.value.trim();
    const inputId = input.id;

    if (handleCheckTimeout) clearTimeout(handleCheckTimeout);

    if (!raw) {
        updateHandleUI(inputId, feedbackId, 'hint', 'اختر اسماً مستخدم فريداً');
        lastCheckedHandle = '';
        lastCheckedResult = '';
        return;
    }

    if (!validateHandleFormat(raw)) {
        updateHandleUI(inputId, feedbackId, 'taken', '✗ الأحرف المسموحة: إنجليزية، أرقام، _ و . (3-20 حرف)');
        lastCheckedHandle = '';
        lastCheckedResult = '';
        return;
    }

    updateHandleUI(inputId, feedbackId, 'checking');

    handleCheckTimeout = setTimeout(async () => {
        const lower = raw.toLowerCase();

        if (lower === lastCheckedHandle) {
            updateHandleUI(inputId, feedbackId, lastCheckedResult);
            return;
        }

        const available = await checkHandleAvailability(raw);
        lastCheckedHandle = lower;
        lastCheckedResult = available ? 'available' : 'taken';

        if (input.value.trim().toLowerCase() === lower) {
            updateHandleUI(inputId, feedbackId, lastCheckedResult);
        }
    }, 500);
}

function getActiveHandle() {
    const phoneForm = document.getElementById('signup-phone-form');
    if (phoneForm && phoneForm.style.display !== 'none') {
        return document.getElementById('signup-handle-phone')?.value?.trim() || '';
    }
    return document.getElementById('signup-handle-email')?.value?.trim() || '';
}

async function validateHandleForSignup(handle) {
    if (!handle) {
        return { valid: false, error: 'أدخل اسم المستخدم' };
    }
    if (!validateHandleFormat(handle)) {
        return { valid: false, error: 'اسم المستخدم: إنجليزية، أرقام، _ و . (3-20 حرف)' };
    }
    const available = await checkHandleAvailability(handle);
    if (!available) {
        return { valid: false, error: 'هذا الاسم مسجل مسبقاً، اختر اسماً آخر' };
    }
    return { valid: true, handle: handle.toLowerCase() };
}

// ===== Phone Number Utilities =====
function phoneToEmail(phone, countryCode) {
    let cleaned = phone.replace(/[\s\-+]/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }
    const fullNumber = countryCode + cleaned;
    return `${fullNumber}@twit.internal`;
}

function isValidPhone(phone) {
    const cleaned = phone.replace(/[\s\-+]/g, '');
    return /^\d{6,15}$/.test(cleaned);
}

function formatPhoneDisplay(phone, countryCode) {
    const cleaned = phone.replace(/[\s\-+]/g, '').replace(/^0+/, '');
    return `+${countryCode} ${cleaned}`;
}

// ===== Login/Signup Methods =====
function setLoginMethod(method) {
    loginMethod = method;
    const phoneSection = document.getElementById('phone-login-section');
    const emailSection = document.getElementById('email-login-section');
    const phoneTab = document.getElementById('tab-phone');
    const emailTab = document.getElementById('tab-email');

    if (method === 'phone') {
        phoneSection.style.display = 'block';
        emailSection.style.display = 'none';
        phoneTab.classList.add('active');
        emailTab.classList.remove('active');
    } else {
        phoneSection.style.display = 'none';
        emailSection.style.display = 'block';
        phoneTab.classList.remove('active');
        emailTab.classList.add('active');
    }

    document.getElementById('error').innerText = '';
}

// Prevent multiple login attempts
let isLoggingIn = false;

async function loginWithPhone() {
    if (isLoggingIn) return;
    isLoggingIn = true;
    showLoading();
    const phone = document.getElementById('login-phone').value.trim();
    const password = document.getElementById('login-password-phone').value.trim();
    const countryCode = document.getElementById('login-country-code').value;
    const errorEl = document.getElementById('error');

    if (!phone || !password) {
        errorEl.innerText = 'يرجى إدخال رقم الهاتف وكلمة المرور';
        hideLoading();
        return;
    }

    if (!isValidPhone(phone)) {
        errorEl.innerText = 'رقم الهاتف غير صالح';
        hideLoading();
        return;
    }

    const fakeEmail = phoneToEmail(phone, countryCode);

    try {
        await signInWithEmailAndPassword(auth, fakeEmail, password);
        errorEl.innerText = '';
    } catch (error) {
        const messages = {
            'auth/user-not-found': 'رقم الهاتف غير مسجل',
            'auth/wrong-password': 'كلمة المرور غير صحيحة',
            'auth/invalid-credential': 'بيانات الدخول غير صحيحة',
            'auth/too-many-requests': 'محاولات كثيرة، حاول لاحقاً',
            'auth/network-request-failed': 'تحقق من اتصال الإنترنت',
            'auth/user-disabled': 'هذا الحساب معطل'
        };
        errorEl.innerText = messages[error.code] || error.message;
        hideLoading();
        isLoggingIn = false;
    }
}

async function login() {
    if (isLoggingIn) return;
    isLoggingIn = true;
    showLoading();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errorEl = document.getElementById('error');

    if (!email || !password) {
        errorEl.innerText = 'يرجى إدخال البريد الإلكتروني وكلمة المرور';
        hideLoading();
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        errorEl.innerText = '';
    } catch (error) {
        const messages = {
            'auth/user-not-found': 'البريد الإلكتروني غير مسجل',
            'auth/wrong-password': 'كلمة المرور غير صحيحة',
            'auth/invalid-credential': 'بيانات الدخول غير صحيحة',
            'auth/too-many-requests': 'محاولات كثيرة، حاول لاحقاً',
            'auth/network-request-failed': 'تحقق من اتصال الإنترنت',
            'auth/user-disabled': 'هذا الحساب معطل'
        };
        errorEl.innerText = messages[error.code] || error.message;
        hideLoading();
        isLoggingIn = false;
    }
}

// Prevent multiple signup attempts
let isSigningUp = false;

async function signupWithPhone() {
    if (isSigningUp) return;
    isSigningUp = true;
    showLoading();
    const name = document.getElementById('signup-name-phone').value.trim();
    const phone = document.getElementById('signup-phone').value.trim();
    const password = document.getElementById('signup-password-phone').value.trim();
    const countryCode = document.getElementById('signup-country-code').value;
    const handleInput = document.getElementById('signup-handle-phone');
    const handle = handleInput?.value?.trim() || '';
    const captchaInput = document.getElementById('captcha-input').value.trim().toUpperCase();
    const termsChecked = document.getElementById('terms-checkbox').checked;
    const errorEl = document.getElementById('error');

    if (!name) { errorEl.innerText = 'أدخل اسمك'; hideLoading(); return; }
    if (!handle) { errorEl.innerText = 'أدخل اسم المستخدم (المعرف)'; hideLoading(); return; }
    if (!password) { errorEl.innerText = 'أدخل كلمة المرور'; hideLoading(); return; }
    if (!phone) { errorEl.innerText = 'أدخل رقم الهاتف'; hideLoading(); return; }

    if (captchaInput !== currentCaptcha) {
        errorEl.innerText = 'رمز التحقق غير صحيح';
        refreshCaptcha();
        hideLoading();
        return;
    }

    if (!termsChecked) {
        errorEl.innerText = 'يجب الموافقة على الشروط والسياسة';
        hideLoading();
        return;
    }

    const handleResult = await validateHandleForSignup(handle);
    if (!handleResult.valid) {
        errorEl.innerText = handleResult.error;
        hideLoading();
        return;
    }

    if (!isValidPhone(phone)) {
        errorEl.innerText = 'رقم الهاتف غير صالح';
        hideLoading();
        return;
    }

    if (password.length < 6) {
        errorEl.innerText = 'كلمة المرور 6 أحرف على الأقل';
        hideLoading();
        return;
    }

    const fakeEmail = phoneToEmail(phone, countryCode);
    const cleanedPhone = phone.replace(/[\s\-+]/g, '').replace(/^0+/, '');
    const fullPhone = countryCode + cleanedPhone;

    try {
        let phoneExists = false;
        try {
            const phoneQuery = query(ref(database, 'users'), orderByChild('phone'), equalTo(fullPhone));
            const existingSnap = await get(phoneQuery);
            if (existingSnap.exists()) phoneExists = true;
        } catch (indexErr) {
            const allUsersSnap = await get(ref(database, 'users'));
            if (allUsersSnap.exists()) {
                allUsersSnap.forEach(child => {
                    if (child.val().phone === fullPhone) phoneExists = true;
                });
            }
        }

        if (phoneExists) {
            errorEl.innerText = 'رقم الهاتف مسجل بالفعل لمستخدم آخر';
            hideLoading();
            return;
        }

        const cred = await createUserWithEmailAndPassword(auth, fakeEmail, password);

        const userData = {
            uid: cred.user.uid,
            name: name,
            handle: handleResult.handle,
            phone: fullPhone,
            phoneDisplay: formatPhoneDisplay(phone, countryCode),
            email: fakeEmail,
            joinDate: new Date().toISOString(),
            followers: 0,
            following: 0,
            profilePicture: DEFAULT_AVATAR,
            provider: 'phone',
            emailVerified: false
        };

        await set(ref(database, `users/${cred.user.uid}`), userData);
        await set(ref(database, `handles/${handleResult.handle}`), cred.user.uid);

        errorEl.innerText = '';
        hideLoading();
        isSigningUp = false;
    } catch (error) {
        const messages = {
            'auth/email-already-in-use': 'رقم الهاتف مسجل بالفعل',
            'auth/invalid-email': 'البريد غير صالح',
            'auth/weak-password': 'كلمة المرور ضعيفة'
        };
        errorEl.innerText = messages[error.code] || error.message;
        hideLoading();
        isSigningUp = false;
    }
}

async function signup() {
    if (isSigningUp) return;
    isSigningUp = true;
    showLoading();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value.trim();
    const handleInput = document.getElementById('signup-handle-email');
    const handle = handleInput?.value?.trim() || '';
    const captchaInput = document.getElementById('captcha-input').value.trim().toUpperCase();
    const termsChecked = document.getElementById('terms-checkbox').checked;
    const errorEl = document.getElementById('error');

    if (!name) { errorEl.innerText = 'أدخل اسمك'; hideLoading(); return; }
    if (!email) { errorEl.innerText = 'أدخل بريدك الإلكتروني'; hideLoading(); return; }
    if (!handle) { errorEl.innerText = 'أدخل اسم المستخدم (المعرف)'; hideLoading(); return; }
    if (!password) { errorEl.innerText = 'أدخل كلمة المرور'; hideLoading(); return; }

    if (captchaInput !== currentCaptcha) {
        errorEl.innerText = 'رمز التحقق غير صحيح';
        refreshCaptcha();
        hideLoading();
        return;
    }

    if (!termsChecked) {
        errorEl.innerText = 'يجب الموافقة على الشروط والسياسة';
        hideLoading();
        return;
    }

    const handleResult = await validateHandleForSignup(handle);
    if (!handleResult.valid) {
        errorEl.innerText = handleResult.error;
        hideLoading();
        return;
    }

    if (password.length < 6) {
        errorEl.innerText = 'كلمة المرور 6 أحرف على الأقل';
        hideLoading();
        return;
    }

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);

        const userData = {
            uid: cred.user.uid,
            name: name,
            handle: handleResult.handle,
            email: email,
            joinDate: new Date().toISOString(),
            followers: 0,
            following: 0,
            profilePicture: DEFAULT_AVATAR,
            provider: 'email',
            emailVerified: false
        };

        await set(ref(database, `users/${cred.user.uid}`), userData);
        await set(ref(database, `handles/${handleResult.handle}`), cred.user.uid);

        errorEl.innerText = '';
        hideLoading();
        isSigningUp = false;
    } catch (error) {
        const messages = {
            'auth/email-already-in-use': 'البريد مستخدم بالفعل',
            'auth/invalid-email': 'البريد غير صالح',
            'auth/weak-password': 'كلمة المرور ضعيفة'
        };
        errorEl.innerText = messages[error.code] || error.message;
        hideLoading();
        isSigningUp = false;
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
                console.error('Auth state check error:', error);
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

async function forgotPassword() {
    const errorEl = document.getElementById('error');

    if (loginMethod === 'phone') {
        const phone = document.getElementById('login-phone').value.trim();
        const countryCode = document.getElementById('login-country-code').value;

        if (!phone) {
            errorEl.innerText = 'أدخل رقم الهاتف أولاً';
            return;
        }

        if (!isValidPhone(phone)) {
            errorEl.innerText = 'رقم الهاتف غير صالح';
            return;
        }

        const fakeEmail = phoneToEmail(phone, countryCode);
        try {
            await sendPasswordResetEmail(auth, fakeEmail);
            errorEl.style.color = '#00ba7c';
            errorEl.innerText = 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك';
            setTimeout(() => { errorEl.style.color = ''; }, 5000);
        } catch (error) {
            errorEl.innerText = error.code === 'auth/user-not-found'
                ? 'رقم الهاتف غير مسجل'
                : 'خطأ: ' + error.message;
        }
    } else {
        const email = document.getElementById('login-email').value.trim();

        if (!email) {
            errorEl.innerText = 'أدخل البريد الإلكتروني أولاً';
            return;
        }

        try {
            await sendPasswordResetEmail(auth, email);
            errorEl.style.color = '#00ba7c';
            errorEl.innerText = 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك';
            setTimeout(() => { errorEl.style.color = ''; }, 5000);
        } catch (error) {
            errorEl.innerText = error.code === 'auth/user-not-found'
                ? 'البريد الإلكتروني غير مسجل'
                : 'خطأ: ' + error.message;
        }
    }
}

export { init, login, loginWithPhone, signup, signupWithPhone, logout, setupAuthStateListener, showLogin, showSignup, setLoginMethod, forgotPassword };
