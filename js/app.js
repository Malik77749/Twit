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
window.toggleReplyInput = comments.toggleReplyInput;

window.showProfile = profile.showProfile;
window.updateProfilePicture = profile.updateProfilePicture;

window.showNotifications = function() {
    showView('notifications');
    notifications.loadNotifications();
};

window.showHome = function() {
    showView('home');
    posts.loadPosts();
};

window.focusComposer = focusComposer;

/**
 * Update sidebar with user info
 */
function updateSidebar(userData) {
    const name = userData?.name || 'مستخدم';
    const pic = userData?.profilePicture || 'https://via.placeholder.com/40';
    document.getElementById('sidebar-name').textContent = name;
    document.getElementById('sidebar-handle').textContent = '@' + name.replace(/\s/g, '').toLowerCase();
    document.getElementById('sidebar-avatar').src = pic;
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

// Auto-resize textarea
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('postContent');
    if (textarea) {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });
    }
});

showAuth();
