// Main Application Entry Point
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, get, update, query, orderByChild, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

import { firebaseConfig } from './config.js';
import { showView, showApp, showAuth, showLoading, hideLoading, focusComposer } from './ui.js';
import { escapeHtml, showToast } from './utils.js';
import * as auth from './auth.js';
import * as posts from './posts.js';
import * as comments from './comments.js';
import * as notifications from './notifications.js';
import * as profile from './profile.js';
import { getUserData } from './firebase-helpers.js';

// Initialize Firebase
let app, authInstance, database, storage;
try {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    database = getDatabase(app);
    storage = getStorage(app);
    console.log('Firebase initialized OK');
} catch (error) {
    console.error('Firebase initialization error:', error);
    document.body.innerHTML = '<div style="color:white;padding:20px;text-align:center;"><h2>خطأ في تحميل التطبيق</h2><p>' + error.message + '</p></div>';
}

// Initialize all modules
try {
    auth.init(authInstance, database);
    posts.init(authInstance, database, storage);
    comments.init(authInstance, database);
    notifications.init(authInstance, database);
    profile.init(authInstance, database);
    console.log('Modules initialized OK');
} catch (error) {
    console.error('Module initialization error:', error);
}

// ===== Global Navigation =====

const allViews = ['home', 'notifications', 'profile', 'search', 'messages', 'bookmarks', 'post-detail'];

function hideAllViews() {
    allViews.forEach(v => {
        const el = document.getElementById(`${v}-view`);
        if (el) el.style.display = 'none';
    });
}

function setActiveNav(navName) {
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.nav === navName);
    });
}

window.navigateTo = function(view) {
    hideAllViews();
    setActiveNav(view);

    switch(view) {
        case 'home':
            showView('home');
            posts.loadPosts();
            break;
        case 'search':
            document.getElementById('search-view').style.display = 'block';
            setTimeout(() => document.getElementById('search-input')?.focus(), 100);
            break;
        case 'notifications':
            showView('notifications');
            notifications.loadNotifications();
            break;
        case 'messages':
            document.getElementById('messages-view').style.display = 'block';
            break;
    }
};

window.showHome = function() {
    hideAllViews();
    setActiveNav('home');
    showView('home');
    posts.loadPosts();
};

window.showNotifications = function() {
    hideAllViews();
    setActiveNav('notifications');
    showView('notifications');
    notifications.loadNotifications();
};

window.showMessages = function() {
    hideAllViews();
    setActiveNav('messages');
    document.getElementById('messages-view').style.display = 'block';
};

window.showBookmarks = function() {
    hideAllViews();
    document.getElementById('bookmarks-view').style.display = 'block';
    loadBookmarks();
};

window.openSearch = function() {
    // Desktop: could open a modal or navigate
    if (window.innerWidth <= 700) {
        navigateTo('search');
    }
};

// ===== Search =====

let searchTimeout = null;

window.handleSearch = function(query) {
    const clearBtn = document.getElementById('search-clear');
    clearBtn.style.display = query ? 'flex' : 'none';

    if (searchTimeout) clearTimeout(searchTimeout);

    if (!query.trim()) {
        document.getElementById('search-results').innerHTML = `
            <div class="empty-state">
                <h3>استكشاف</h3>
                <p>ابحث عن أشخاص ومنشورات</p>
            </div>
        `;
        return;
    }

    searchTimeout = setTimeout(async () => {
        await performSearch(query.trim());
    }, 300);
};

window.clearSearch = function() {
    document.getElementById('search-input').value = '';
    document.getElementById('search-clear').style.display = 'none';
    document.getElementById('search-results').innerHTML = `
        <div class="empty-state">
            <h3>استكشاف</h3>
            <p>ابحث عن أشخاص ومنشورات</p>
        </div>
    `;
};

async function performSearch(queryStr) {
    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    try {
        const lowerQuery = queryStr.toLowerCase();

        // Search users
        const usersSnap = await get(ref(database, 'users'));
        const users = [];
        if (usersSnap.exists()) {
            usersSnap.forEach(child => {
                const userData = child.val();
                const name = (userData.name || '').toLowerCase();
                if (name.includes(lowerQuery)) {
                    users.push({ id: child.key, ...userData });
                }
            });
        }

        // Search posts
        const postsSnap = await get(ref(database, 'posts'));
        const foundPosts = [];
        if (postsSnap.exists()) {
            postsSnap.forEach(child => {
                const postData = child.val();
                const content = (postData.content || '').toLowerCase();
                if (content.includes(lowerQuery)) {
                    foundPosts.push({ id: child.key, ...postData });
                }
            });
        }

        let html = '';

        if (users.length > 0) {
            html += '<div style="padding:12px 16px;"><h3 style="font-size:18px;font-weight:800;">أشخاص</h3></div>';
            for (const user of users) {
                html += `
                    <div class="search-result-item" onclick="showProfile('${user.id}')">
                        <img src="${user.profilePicture || DEFAULT_AVATAR}" alt="">
                        <div class="search-result-info">
                            <div class="search-result-name">${escapeHtml(user.name || 'مستخدم')}</div>
                            <div class="search-result-handle">@${escapeHtml((user.name || '').replace(/\s/g, '').toLowerCase())}</div>
                        </div>
                    </div>
                `;
            }
        }

        if (foundPosts.length > 0) {
            html += '<div style="padding:12px 16px;border-top:1px solid var(--border-color);"><h3 style="font-size:18px;font-weight:800;">منشورات</h3></div>';
            foundPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            for (const post of foundPosts.slice(0, 10)) {
                html += `
                    <div class="search-result-item" onclick="showHome()">
                        <div style="flex:1;">
                            <div style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(post.content || '').substring(0, 80)}</div>
                            <div style="color:var(--text-secondary);font-size:13px;">${formatSearchTime(post.timestamp)}</div>
                        </div>
                    </div>
                `;
            }
        }

        if (!users.length && !foundPosts.length) {
            html = '<div class="empty-state"><p>لا توجد نتائج</p></div>';
        }

        resultsDiv.innerHTML = html;
    } catch (error) {
        resultsDiv.innerHTML = '<div class="empty-state"><p>خطأ في البحث</p></div>';
    }
}

function formatSearchTime(timestamp) {
    const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `${Math.floor(diff / 60)}د`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}س`;
    return `${Math.floor(diff / 86400)}ي`;
}

// ===== Bookmarks =====

async function loadBookmarks() {
    const container = document.getElementById('bookmarks-list');
    const userId = authInstance.currentUser?.uid;
    if (!userId) return;

    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    try {
        const bookmarksSnap = await get(ref(database, `bookmarks/${userId}`));
        if (!bookmarksSnap.exists()) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>المحفوظات</h3>
                    <p>احفظ المنشورات للرجوع إليها لاحقاً</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        const bookmarks = [];
        bookmarksSnap.forEach(child => {
            bookmarks.push(child.key);
        });

        for (const postId of bookmarks) {
            const postSnap = await get(ref(database, `posts/${postId}`));
            if (postSnap.exists()) {
                const el = document.createElement('div');
                el.setAttribute('data-post-id', postId);
                container.appendChild(el);
                await posts.renderPost({ id: postId, ...postSnap.val() }, el);
            }
        }

        if (!container.children.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>المحفوظات</h3>
                    <p>احفظ المنشورات للرجوع إليها لاحقاً</p>
                </div>
            `;
        }
    } catch (error) {
        container.innerHTML = '<div class="empty-state"><p>خطأ</p></div>';
    }
}

// ===== Feed Tab Switch =====

window.switchFeedTab = function(btn, tabType) {
    document.querySelectorAll('.mobile-feed-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    if (tabType === 'following') {
        // Load only followed users' posts
        loadFollowingFeed();
    } else {
        posts.loadPosts();
    }
};

async function loadFollowingFeed() {
    const postsDiv = document.getElementById('posts');
    postsDiv.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    const userId = authInstance.currentUser?.uid;
    if (!userId) return;

    try {
        // Get followed users
        const followersSnap = await get(ref(database, `followers`));
        const followingUserIds = new Set();

        if (followersSnap.exists()) {
            followersSnap.forEach(userFollowersSnap => {
                if (userFollowersSnap.hasChild(userId)) {
                    followingUserIds.add(userFollowersSnap.key);
                }
            });
        }

        if (followingUserIds.size === 0) {
            postsDiv.innerHTML = '<div class="empty-state"><h3>متابَعون</h3><p>تابِع أشخاصاً لرؤية منشوراتهم هنا</p></div>';
            return;
        }

        const postsSnap = await get(ref(database, 'posts'));
        const allItems = [];

        if (postsSnap.exists()) {
            postsSnap.forEach(child => {
                const postData = child.val();
                if (followingUserIds.has(postData.userId)) {
                    allItems.push({ id: child.key, ...postData, type: 'post' });
                }
            });
        }

        allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        postsDiv.innerHTML = '';
        if (!allItems.length) {
            postsDiv.innerHTML = '<div class="empty-state"><h3>متابَعون</h3><p>لا توجد منشورات جديدة</p></div>';
            return;
        }

        for (const item of allItems) {
            const container = document.createElement('div');
            container.setAttribute('data-post-id', item.id);
            postsDiv.appendChild(container);
            await posts.renderFeedItem(item, container);
        }
    } catch (error) {
        postsDiv.innerHTML = '<div class="empty-state"><p>خطأ</p></div>';
    }
}

// ===== Expose functions to global scope for HTML onclick handlers =====

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
window.toggleBookmark = posts.toggleBookmark;

window.addComment = comments.addComment;
window.toggleComments = comments.toggleComments;

window.showProfile = profile.showProfile;
window.updateProfilePicture = profile.updateProfilePicture;
window.editProfile = profile.editProfile;
window.saveProfile = profile.saveProfile;

window.focusComposer = focusComposer;

// ===== Drawer =====

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

// ===== Emoji Picker =====

window.toggleEmojiPicker = function() {
    let picker = document.querySelector('.emoji-picker');
    if (picker) {
        picker.classList.toggle('show');
        return;
    }

    const emojis = ['😀','😂','😍','🥰','😎','🤔','😢','😡','👍','❤️','🔥','🎉','💪','🙏','👏','✨','🌟','💯','🎵','📸','🚀','💡','⭐','🌈','🎯','💎','🏆','🌍','☮️','🤝'];
    const composerBody = document.querySelector('.composer-body');
    picker = document.createElement('div');
    picker.className = 'emoji-picker show';
    emojis.forEach(emoji => {
        const span = document.createElement('span');
        span.textContent = emoji;
        span.onclick = () => {
            const input = document.getElementById('postContent');
            input.value += emoji;
            input.focus();
        };
        picker.appendChild(span);
    });
    composerBody.appendChild(picker);
};

// ===== Post Dropdown Menu =====

let currentDropdownPostId = null;
let currentDropdownUserId = null;

window.openPostMenu = function(postId, userId, isOwnPost, event) {
    event?.preventDefault();
    event?.stopPropagation();

    currentDropdownPostId = postId;
    currentDropdownUserId = userId;

    const dropdown = document.getElementById('post-dropdown');
    const deleteBtn = document.getElementById('dropdown-delete');
    const pinBtn = document.getElementById('dropdown-pin');
    const bookmarkBtn = document.getElementById('dropdown-bookmark');
    const reportBtn = document.getElementById('dropdown-report');
    const followBtn = document.getElementById('dropdown-follow');

    deleteBtn.style.display = isOwnPost ? 'flex' : 'none';
    pinBtn.style.display = isOwnPost ? 'flex' : 'none';
    reportBtn.style.display = isOwnPost ? 'none' : 'flex';
    followBtn.style.display = isOwnPost ? 'none' : 'flex';

    // Position dropdown
    const rect = event.currentTarget.getBoundingClientRect();
    dropdown.style.display = 'block';
    dropdown.style.top = `${rect.bottom + 4}px`;

    // RTL: show to the left of the button
    const dropdownWidth = 240;
    if (rect.left > dropdownWidth) {
        dropdown.style.left = `${rect.left - dropdownWidth + rect.width}px`;
    } else {
        dropdown.style.left = `${rect.left}px`;
    }
    dropdown.style.right = 'auto';

    // Bind actions
    deleteBtn.onclick = () => { dropdown.style.display = 'none'; posts.deletePost(postId); };
    bookmarkBtn.onclick = () => { dropdown.style.display = 'none'; posts.toggleBookmark(postId); };
    reportBtn.onclick = () => { dropdown.style.display = 'none'; posts.reportPost(postId, userId); };
    followBtn.onclick = () => { dropdown.style.display = 'none'; posts.followUser(userId, { preventDefault:()=>{}, stopPropagation:()=>{} }); };
};

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('post-dropdown');
    if (dropdown && !dropdown.contains(e.target) && !e.target.closest('.tweet-more')) {
        dropdown.style.display = 'none';
    }
});

// ===== Toast (imported from utils, exposed globally) =====
window.showToast = showToast;

// ===== Image Lightbox =====

window.openLightbox = function(imageSrc) {
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    img.src = imageSrc;
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
};

window.closeLightbox = function() {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
};

// Close lightbox on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeLightbox();
        const dropdown = document.getElementById('post-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }
});

// ===== Post Detail View =====

window.openPostDetail = async function(postId) {
    hideAllViews();
    document.getElementById('post-detail-view').style.display = 'block';
    document.getElementById('post-detail-view').classList.add('view-enter');

    const container = document.getElementById('post-detail-content');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    try {
        const snapshot = await get(ref(database, `posts/${postId}`));

        if (!snapshot.exists()) {
            container.innerHTML = '<div class="empty-state"><p>المنشور غير موجود</p></div>';
            return;
        }

        const post = { id: postId, ...snapshot.val() };
        const userId = authInstance.currentUser?.uid;
        const userData = await getUserData(database, post.userId);
        const userName = userData.name || 'مستخدم';
        const avatar = userData.profilePicture || DEFAULT_AVATAR;
        const isOwnPost = post.userId === userId;

        // Like status
        const likeSnap = await dbGet(ref(database, `likes/${postId}/${userId}`));
        const isLiked = likeSnap.exists();

        // Bookmark status
        const bookmarkSnap = await dbGet(ref(database, `bookmarks/${userId}/${postId}`));
        const isBookmarked = bookmarkSnap.exists();

        // Full timestamp
        const date = new Date(post.timestamp);
        const timeStr = date.toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

        // Views
        const views = post.views || 0;
        const likes = post.likes || 0;
        const retweets = post.retweets || 0;

        let mediaHtml = '';
        if (post.imageUrl) {
            mediaHtml = `<div class="post-detail-media" onclick="openLightbox('${post.imageUrl}')"><img src="${post.imageUrl}" alt=""></div>`;
        } else if (post.videoUrl) {
            mediaHtml = `<div class="post-detail-media"><iframe src="${post.videoUrl}" style="width:100%;height:350px;border:none;" allowfullscreen></iframe></div>`;
        }

        container.innerHTML = `
            <div class="post-detail">
                <div class="post-detail-header">
                    <img class="post-detail-avatar" src="${avatar}" alt="" onclick="showProfile('${post.userId}')">
                    <div class="post-detail-info">
                        <div class="post-detail-name" onclick="showProfile('${post.userId}')">${escapeHtml(userName)}</div>
                        <div class="post-detail-handle">@${escapeHtml(userName).replace(/\s/g, '').toLowerCase()}</div>
                    </div>
                    ${!isOwnPost ? `<button class="follow-btn" data-follow-id="${post.userId}" onclick="followUser('${post.userId}', event)">متابعة</button>` : ''}
                </div>
                ${post.content ? `<div class="post-detail-content">${post.content}</div>` : ''}
                ${mediaHtml}
                <div class="post-detail-timestamp">
                    <span>${timeStr}</span>
                    <span>·</span>
                    <span>${dateStr}</span>
                </div>
                <div class="post-detail-stats">
                    ${retweets > 0 ? `<span><strong>${retweets}</strong> إعادة نشر</span>` : ''}
                    ${likes > 0 ? `<span><strong>${likes}</strong> إعجاب</span>` : ''}
                    ${views > 0 ? `<span><strong>${views}</strong> مشاهدة</span>` : ''}
                </div>
                <div class="post-detail-actions">
                    <button class="post-detail-action" onclick="toggleComments('${postId}', event)">
                        <i class="far fa-comment"></i>
                    </button>
                    <button class="post-detail-action" onclick="retweetPost('${postId}', event)">
                        <i class="fas fa-retweet"></i>
                    </button>
                    <button class="post-detail-action like ${isLiked ? 'active' : ''}" data-like-id="${postId}" onclick="likePost('${postId}', event)">
                        <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                    </button>
                    <button class="post-detail-action bookmark ${isBookmarked ? 'active' : ''}" data-bookmark-id="${postId}" onclick="toggleBookmark('${postId}', event)">
                        <i class="${isBookmarked ? 'fas' : 'far'} fa-bookmark"></i>
                    </button>
                    <button class="post-detail-action" onclick="copyPostLink('${postId}')">
                        <i class="fas fa-arrow-up-from-bracket"></i>
                    </button>
                </div>
                <div class="post-detail-comment-input">
                    <img src="${avatar}" alt="">
                    <input type="text" id="detail-comment-input-${postId}" placeholder="أضف تعليقاً..." onkeydown="if(event.key==='Enter')addComment('${postId}',null,event)">
                    <button onclick="addComment('${postId}', null, event)">رد</button>
                </div>
            </div>
            <div id="comments-${postId}" class="comment-section" style="display:block;"></div>
        `;

        // Load comments
        comments.loadComments(postId);

        // Increment view
        if (!isOwnPost) {
            await update(ref(database, `posts/${postId}`), { views: (views || 0) + 1 });
        }
    } catch (error) {
        container.innerHTML = '<div class="empty-state"><p>خطأ في التحميل</p></div>';
    }
};

window.goBackFromPost = function() {
    hideAllViews();
    setActiveNav('home');
    showView('home');
};

window.copyPostLink = function(postId) {
    const url = window.location.origin + window.location.pathname + '#post/' + postId;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('تم نسخ الرابط');
        });
    } else {
        // Fallback
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('تم نسخ الرابط');
    }
};

// ===== Update sidebar with user info =====

function updateSidebar(userData) {
    const name = userData?.name || 'مستخدم';
    const pic = userData?.profilePicture || DEFAULT_AVATAR;
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

// ===== Load Who To Follow (real users) =====

async function loadWhoToFollow() {
    const userId = authInstance.currentUser?.uid;
    if (!userId) return;

    try {
        const usersSnap = await get(ref(database, 'users'));
        if (!usersSnap.exists()) return;

        const users = [];
        usersSnap.forEach(child => {
            if (child.key !== userId) {
                users.push({ id: child.key, ...child.val() });
            }
        });

        if (users.length === 0) return;

        // Shuffle and pick 3
        const shuffled = users.sort(() => 0.5 - Math.random());
        const suggestions = shuffled.slice(0, 3);

        const container = document.getElementById('who-to-follow-list');
        container.innerHTML = '';

        for (const user of suggestions) {
            const followSnap = await get(ref(database, `followers/${user.id}/${userId}`));
            const isFollowing = followSnap.exists();

            const item = document.createElement('div');
            item.className = 'who-to-follow-item';
            item.innerHTML = `
                <img src="${user.profilePicture || DEFAULT_AVATAR}" alt="" onclick="showProfile('${user.id}')">
                <div class="who-to-follow-info" onclick="showProfile('${user.id}')">
                    <div class="who-to-follow-name">${escapeHtml(user.name || 'مستخدم')}</div>
                    <div class="who-to-follow-handle">@${escapeHtml((user.name || '').replace(/\s/g, '').toLowerCase())}</div>
                </div>
                <button class="follow-btn ${isFollowing ? 'following' : ''}" data-follow-id="${user.id}" onclick="followUser('${user.id}', event)">${isFollowing ? 'متابَع' : 'متابعة'}</button>
            `;
            container.appendChild(item);
        }
    } catch (error) {
        console.error('Error loading suggestions:', error);
    }
}

// ===== Check user role and load app =====

async function checkUserRole(user) {
    try {
        const snapshot = await get(ref(database, 'users/' + user.uid));
        const userData = snapshot.val();

        if (userData?.isAdmin) {
            window.location.href = 'admin.html';
            return;
        }

        hideLoading();
        showApp();
        updateSidebar(userData);
        showView('home');
        posts.loadPosts();
        notifications.loadNotifications();
        loadWhoToFollow();
    } catch (error) {
        showAuth();
    }
}

// Setup auth state listener
auth.setupAuthStateListener(checkUserRole);

// ===== DOM Ready =====

document.addEventListener('DOMContentLoaded', () => {
    // Auth button event listeners (avoid inline onclick which fails before module loads)
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.addEventListener('click', () => login());
    
    const signupBtn = document.getElementById('signup-btn');
    if (signupBtn) signupBtn.addEventListener('click', () => signup());
    
    const showSignupBtn = document.getElementById('show-signup-btn');
    if (showSignupBtn) showSignupBtn.addEventListener('click', () => showSignup());
    
    const showLoginBtn = document.getElementById('show-login-btn');
    if (showLoginBtn) showLoginBtn.addEventListener('click', () => showLogin());

    // Auto-resize textarea
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
        if (dx > 50 && dy < 80) {
            window.openDrawer();
            isSwiping = false;
        }
    }, { passive: true });

    document.addEventListener('touchend', () => {
        isSwiping = false;
    }, { passive: true });

    // Pull-to-refresh
    let ptrStartY = 0;
    let isPulling = false;
    const mainFeed = document.querySelector('.main-feed');

    if (mainFeed) {
        mainFeed.addEventListener('touchstart', (e) => {
            if (mainFeed.scrollTop === 0) {
                ptrStartY = e.touches[0].clientY;
                isPulling = true;
            }
        }, { passive: true });

        mainFeed.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            const dy = e.touches[0].clientY - ptrStartY;
            if (dy > 60) {
                const ptr = document.getElementById('pull-to-refresh');
                if (ptr) {
                    ptr.style.display = 'flex';
                    ptr.classList.add('active');
                }
            }
        }, { passive: true });

        mainFeed.addEventListener('touchend', () => {
            if (isPulling) {
                const ptr = document.getElementById('pull-to-refresh');
                if (ptr && ptr.classList.contains('active')) {
                    posts.loadPosts();
                    setTimeout(() => {
                        ptr.classList.remove('active');
                        setTimeout(() => ptr.style.display = 'none', 300);
                    }, 1000);
                }
                isPulling = false;
            }
        }, { passive: true });
    }
});

try {
    showAuth();
    console.log('showAuth() called OK');
} catch (error) {
    console.error('showAuth() failed:', error);
    document.getElementById('auth-section').style.display = 'flex';
}
