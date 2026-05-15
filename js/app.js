// Main Application Entry Point
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, get } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

import { firebaseConfig } from './config.js';
import { toggleSections, showLoading, hideLoading } from './ui.js';
import * as auth from './auth.js';
import * as posts from './posts.js';
import * as comments from './comments.js';
import * as notifications from './notifications.js';
import * as profile from './profile.js';

// Initialize Firebase
let app, authInstance, database, storage;
try {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    database = getDatabase(app);
    storage = getStorage(app);
} catch (error) {
    console.error('Firebase initialization error:', error);
    document.getElementById('error').innerText = 'خطأ في تهيئة Firebase. تحقق من إعدادات المشروع.';
    hideLoading();
}

// Initialize all modules
auth.init(authInstance, database);
posts.init(authInstance, database, storage);
comments.init(authInstance, database);
notifications.init(authInstance, database);
profile.init(authInstance, database);

// Expose functions to global scope for HTML onclick handlers
window.login = auth.login;
window.signup = auth.signup;
window.logout = auth.logout;
window.showLogin = auth.showLogin;
window.showSignup = auth.showSignup;

window.postTweet = posts.postTweet;
window.deletePost = posts.deletePost;
window.likePost = posts.likePost;
window.retweetPost = posts.retweetPost;
window.followUser = posts.followUser;
window.reportPost = posts.reportPost;

window.addComment = comments.addComment;
window.toggleComments = comments.toggleComments;
window.toggleReplyInput = comments.toggleReplyInput;

window.showProfile = profile.showProfile;
window.updateProfilePicture = profile.updateProfilePicture;

window.showNotifications = function() {
    toggleSections('notifications');
    notifications.loadNotifications();
};

window.showMenu = function() {
    toggleSections('menu');
};

window.showHome = function() {
    showLoading();
    toggleSections('home');
    posts.loadPosts();
};

/**
 * Check user role and redirect admin to admin panel
 */
async function checkUserRole() {
    const userId = authInstance.currentUser?.uid;
    if (!userId) {
        toggleSections('auth');
        return;
    }

    try {
        const snapshot = await get(ref(database, 'users/' + userId));
        const userData = snapshot.val();

        if (userData?.isAdmin) {
            window.location.href = 'admin.html';
        } else {
            toggleSections('home');
            document.getElementById('profile-name').textContent = userData?.name || 'مستخدم';
            document.getElementById('profile-picture').src = userData?.profilePicture || 'https://via.placeholder.com/80';
            posts.loadPosts();
            notifications.loadNotifications();
        }
    } catch (error) {
        toggleSections('auth');
    }
}

// Setup auth state listener
auth.setupAuthStateListener(checkUserRole);

// Show login on load
showLoading();
auth.showLogin();

// Bootstrap dropdown fix
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.dropdown').forEach(dropdown => {
        const button = dropdown.querySelector('[data-bs-toggle="dropdown"]');
        const menu = dropdown.querySelector('.dropdown-menu');
        if (button && menu) {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                menu.classList.toggle('show');
            });
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                menu.classList.remove('show');
            });
        }
    });
});
