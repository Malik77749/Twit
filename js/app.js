// Main Application Entry Point
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, get } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

import { firebaseConfig } from './config.js';
import { showView, showApp, showAuth, showLoading, hideLoading, focusComposer } from './ui.js';
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
window.handleImageSelect = posts.handleImageSelect;
window.removePreview = posts.removePreview;
window.toggleUrlInput = posts.toggleUrlInput;
window.toggleVideoInput = posts.toggleVideoInput;

window.addComment = comments.addComment;
window.toggleComments = comments.toggleComments;

window.showProfile = profile.showProfile;
window.updateProfilePicture = profile.updateProfilePicture;
window.editProfile = profile.editProfile;

window.showNotifications = function() {
    showView('notifications');
    notifications.loadNotifications();
};

window.showHome = function() {
    showView('home');
    posts.loadPosts();
};

window.focusComposer = focusComposer;

// Drawer functions
window.openDrawer = function() {
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
};

window.closeDrawer = function() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('open');
    document.body.style.overflow = '';
};

/**
 * Update sidebar with user info
 */
function updateSidebar(userData) {
    const name = userData?.name || 'مستخدم';
    const pic = userData?.profilePicture || 'https://via.placeholder.com/40';
    const handle = '@' + name.replace(/\s/g, '').toLowerCase();

    // Desktop sidebar
    document.getElementById('sidebar-name').textContent = name;
    document.getElementById('sidebar-handle').textContent = handle;
    document.getElementById('sidebar-avatar').src = pic;

    // Mobile drawer
    document.getElementById('drawer-name').textContent = name;
    document.getElementById('drawer-handle').textContent = handle;
    document.getElementById('drawer-avatar').src = pic;
    document.getElementById('drawer-followers').textContent = userData?.followers || 0;
    document.getElementById('drawer-following').textContent = userData?.following || 0;

    // Mobile header & composer
    document.getElementById('mobile-avatar').src = pic;
    document.getElementById('composer-avatar').src = pic;
}

/**
 * Check user role and load app
 */
async function checkUserRole(user) {
    try {
        const snapshot = await get(ref(database, 'users/' + user.uid));
        const userData = snapshot.val();

        if (userData?.isAdmin) {
            window.location.href = 'admin.html';
            return;
        }

        showApp();
        updateSidebar(userData);
        showView('home');
        posts.loadPosts();
        notifications.loadNotifications();
    } catch (error) {
        showAuth();
    }
}

// Setup auth state listener
auth.setupAuthStateListener(checkUserRole);

// Auto-resize textarea + Swipe gesture for drawer
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('postContent');
    if (textarea) {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });
    }

    // Swipe gesture for drawer (RTL: swipe left from right edge to open)
    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false;

    document.addEventListener('touchstart', (e) => {
        const x = e.touches[0].clientX;
        const screenW = window.innerWidth;
        // Only detect swipe from right edge (within 30px)
        if (x > screenW - 30) {
            touchStartX = x;
            touchStartY = e.touches[0].clientY;
            isSwiping = true;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        const dx = touchStartX - e.touches[0].clientX;
        const dy = Math.abs(touchStartY - e.touches[0].clientY);
        // Must swipe left (in RTL = open drawer) and mostly horizontal
        if (dx > 50 && dy < 80) {
            window.openDrawer();
            isSwiping = false;
        }
    }, { passive: true });

    document.addEventListener('touchend', () => {
        isSwiping = false;
    }, { passive: true });
});

showAuth();
