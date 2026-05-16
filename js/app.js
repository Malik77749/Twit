// Main Application Entry Point — Upgraded
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
import * as pagination from './pagination.js';
import * as rateLimiter from './rate-limiter.js';
import * as pushNotif from './push-notifications.js';
import * as dm from './dm.js';
import * as blockMute from './block-mute.js';
import * as polls from './polls.js';
import * as theme from './theme.js';
import * as drafts from './drafts.js';
import * as threads from './threads.js';
import * as analytics from './analytics.js';
import * as lists from './lists.js';
import * as shortcuts from './shortcuts.js';
import * as a11y from './accessibility.js';
import * as undoTweet from './undo-tweet.js';
import * as verified from './verified.js';
import * as trending from './trending.js';
import * as googleAuth from './google-auth.js';
import * as communities from './communities.js';
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
    dm.init(authInstance, database);
    blockMute.init(authInstance, database);
    polls.init(authInstance, database);
    drafts.init(authInstance, database);
    threads.init(authInstance, database);
    analytics.init(authInstance, database);
    lists.init(authInstance, database);
    verified.init(database);
    trending.init(database);
    googleAuth.init(authInstance, database);
    communities.init(authInstance, database);
    theme.init();
    shortcuts.init();
    a11y.init();
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
    pagination.resetPagination();
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
    loadConversationsList();
};

window.showBookmarks = function() {
    hideAllViews();
    document.getElementById('bookmarks-view').style.display = 'block';
    loadBookmarks();
};

window.openSearch = function() {
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

        // Search posts (limited to recent 200 for performance)
        const postsSnap = await get(query(ref(database, 'posts'), orderByChild('timestamp'), limitToLast(200)));
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
            for (const user of users.slice(0, 10)) {
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

        for (const postId of bookmarks.slice(0, 30)) { // Limit bookmarks display
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
        loadFollowingFeed();
    } else {
        pagination.resetPagination();
        posts.loadPosts();
    }
};

async function loadFollowingFeed() {
    const postsDiv = document.getElementById('posts');
    postsDiv.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    const userId = authInstance.currentUser?.uid;
    if (!userId) return;

    try {
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

        const postsSnap = await get(query(ref(database, 'posts'), orderByChild('timestamp'), limitToLast(100)));
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

        for (const item of allItems.slice(0, 30)) {
            const container = document.createElement('div');
            container.setAttribute('data-post-id', item.id);
            postsDiv.appendChild(container);
            await posts.renderFeedItem(item, container);
        }
    } catch (error) {
        postsDiv.innerHTML = '<div class="empty-state"><p>خطأ</p></div>';
    }
}

// ===== Expose functions to global scope =====

window.login = auth.login;
window.loginWithPhone = auth.loginWithPhone;
window.signup = auth.signup;
window.signupWithPhone = auth.signupWithPhone;
window.logout = auth.logout;
window.showLogin = auth.showLogin;
window.showSignup = auth.showSignup;
window.setLoginMethod = auth.setLoginMethod;

window.postTweet = posts.postTweet;
window.deletePost = posts.deletePost;
window.editPost = posts.editPost;
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

// ===== DM Functions =====

function loadConversationsList() {
    const container = document.getElementById('dm-conversations-list');
    if (!container) return;
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    dm.loadConversations((conversations) => {
        dm.renderConversationsList(conversations, container);
    });
}

window.openDMConversation = async function(otherUserId) {
    const conversationId = await dm.openConversation(otherUserId);
    if (!conversationId) return;

    // Show chat view
    document.getElementById('dm-conversations-view').style.display = 'none';
    document.getElementById('dm-chat-view').style.display = 'flex';

    // Load other user info
    const otherUser = await getUserData(database, otherUserId);
    document.getElementById('dm-chat-name').textContent = otherUser.name || 'مستخدم';
    document.getElementById('dm-chat-avatar').src = otherUser.profilePicture || DEFAULT_AVATAR;

    // Load messages
    const messagesContainer = document.getElementById('dm-messages-list');
    dm.loadMessages(conversationId, (messages) => {
        dm.renderMessages(messages, authInstance.currentUser.uid, messagesContainer);
    });

    // Setup send button
    const sendBtn = document.getElementById('dm-send-btn');
    const input = document.getElementById('dm-input');

    sendBtn.onclick = async () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        await dm.sendMessage(conversationId, text);
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    };
};

window.closeDMChat = function() {
    document.getElementById('dm-chat-view').style.display = 'none';
    document.getElementById('dm-conversations-view').style.display = 'block';
    dm.cleanup();
    loadConversationsList();
};

window.openDMWithUser = async function(userId) {
    showMessages();
    await openDMConversation(userId);
};

function updateDMBadge() {
    if (!authInstance.currentUser) return;
    dm.getUnreadCount((count) => {
        const badge = document.getElementById('dm-badge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline' : 'none';
        }
    });
}

// ===== Poll Functions =====

window.undoPost = undoTweet.undoPost;

// ===== Google Sign-In =====

window.signInWithGoogle = async function() {
    const result = await googleAuth.signInWithGoogle();
    if (!result.success) {
        const errorEl = document.getElementById('error');
        if (errorEl) errorEl.innerText = result.message;
    }
    // Auth state listener handles the rest
};

// ===== Communities =====

window.showCommunities = async function() {
    hideAllViews();
    document.getElementById('communities-view').style.display = 'block';

    const container = document.getElementById('communities-content');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    const allComms = await communities.getAllCommunities();
    const userId = authInstance.currentUser?.uid;
    const userComms = await communities.getUserCommunities(userId);
    container.innerHTML = communities.renderCommunities(allComms, userComms);
};

window.createCommunityAction = async function() {
    const name = prompt('اسم المجتمع:');
    if (!name) return;
    const desc = prompt('وصف (اختياري):');
    const category = prompt('الفئة (تقنية/رياضة/فن/علوم/أعمال/عام):') || 'عام';
    const isPrivate = confirm('هل تريد مجتمع خاص؟');

    const commId = await communities.createCommunity(name, desc, category, isPrivate);
    if (commId) {
        showToast('تم إنشاء المجتمع');
        showCommunities();
    }
};

window.toggleCommunityMembership = async function(commId, isMember) {
    if (isMember) {
        if (!confirm('مغادرة المجتمع؟')) return;
        await communities.leaveCommunity(commId);
        showToast('تمت المغادرة');
    } else {
        await communities.joinCommunity(commId);
        showToast('تم الانضمام');
    }
    showCommunities();
};

window.showCommunityDetail = async function(commId) {
    // For now just show community feed
    hideAllViews();
    const commSnap = await get(ref(database, `communities/${commId}`));
    if (!commSnap.exists()) return;

    const comm = commSnap.val();
    const container = document.getElementById('communities-content');

    let html = `
        <div class="community-detail-header">
            <h3>${escapeHtml(comm.name)}</h3>
            <p style="color:var(--text-secondary);font-size:14px;">${escapeHtml(comm.description || '')}</p>
            <div style="display:flex;gap:16px;color:var(--text-secondary);font-size:13px;margin-top:8px;">
                <span>${comm.memberCount || 0} عضو</span>
                <span>${comm.postCount || 0} منشور</span>
                <span>${comm.isPrivate ? 'خاص' : 'عام'}</span>
            </div>
        </div>
        <div id="community-posts"></div>
    `;
    container.innerHTML = html;

    // Load community posts
    const postIds = await communities.getCommunityFeed(commId);
    const postsDiv = document.getElementById('community-posts');

    if (!postIds.length) {
        postsDiv.innerHTML = '<div class="empty-state"><p>لا توجد منشورات بعد</p></div>';
        return;
    }

    for (const postId of postIds.slice(0, 20)) {
        const postSnap = await get(ref(database, `posts/${postId}`));
        if (postSnap.exists()) {
            const el = document.createElement('div');
            el.setAttribute('data-post-id', postId);
            postsDiv.appendChild(el);
            await posts.renderPost({ id: postId, ...postSnap.val() }, el);
        }
    }
};

let pollOptionCount = 2;
let isPollActive = false;

window.togglePoll = function() {
    const composer = document.getElementById('poll-composer');
    isPollActive = !isPollActive;
    composer.style.display = isPollActive ? 'block' : 'none';
};

window.removePoll = function() {
    isPollActive = false;
    document.getElementById('poll-composer').style.display = 'none';
    document.getElementById('poll-question').value = '';
    document.getElementById('poll-opt1').value = '';
    document.getElementById('poll-opt2').value = '';
    document.getElementById('poll-extra-options').innerHTML = '';
    pollOptionCount = 2;
};

window.addPollOption = function() {
    if (pollOptionCount >= 4) {
        showToast('الحد الأقصى 4 خيارات');
        return;
    }
    pollOptionCount++;
    const container = document.getElementById('poll-extra-options');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'poll-input';
    input.id = `poll-opt${pollOptionCount}`;
    input.placeholder = `الخيار ${pollOptionCount}`;
    input.maxLength = 100;
    container.appendChild(input);
};

window.votePoll = async function(postId, optionKey) {
    const success = await polls.vote(postId, optionKey);
    if (success) {
        // Reload the post to show results
        showToast('تم التصويت');
    }
};

// ===== Reply Setting =====

const replySettings = [
    { icon: 'fa-earth-americas', text: 'الجميع يمكنه الرد', value: 'everyone' },
    { icon: 'fa-user-check', text: 'المتابَعون يمكنهم الرد', value: 'following' },
    { icon: 'fa-at', text: 'المذكورون فقط يمكنهم الرد', value: 'mentioned' }
];
let currentReplySetting = 0;

window.cycleReplySetting = function() {
    currentReplySetting = (currentReplySetting + 1) % replySettings.length;
    const setting = replySettings[currentReplySetting];
    document.getElementById('reply-setting-text').textContent = setting.text;
    document.querySelector('.reply-selector-btn i').className = `fas ${setting.icon}`;
};

window.toggleReplySelector = function() {
    const selector = document.getElementById('reply-selector');
    selector.style.display = selector.style.display === 'none' ? 'flex' : 'none';
};

// ===== Theme Functions =====

window.setThemeAction = function(themeName) {
    theme.setTheme(themeName);
    // Update active states
    document.querySelectorAll('.theme-btn, .settings-theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === themeName);
    });
};

window.cycleTheme = function() {
    const next = theme.cycleTheme();
    document.querySelectorAll('.theme-btn, .settings-theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === next);
    });
};

// ===== Analytics =====

window.showAnalytics = async function() {
    hideAllViews();
    document.getElementById('analytics-view').style.display = 'block';

    const container = document.getElementById('analytics-content');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    const userId = authInstance.currentUser?.uid;
    const userData = await getUserData(database, userId);
    const data = await analytics.getUserAnalytics(userId);
    container.innerHTML = analytics.renderDashboard(data, userData.name);
};

// ===== Lists =====

window.showLists = async function() {
    hideAllViews();
    document.getElementById('lists-view').style.display = 'block';

    const container = document.getElementById('lists-content');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    const userId = authInstance.currentUser?.uid;
    const userLists = await lists.getUserLists(userId);
    container.innerHTML = lists.renderLists(userLists, true);
};

window.createListAction = async function() {
    const name = prompt('اسم القائمة:');
    if (!name) return;
    const desc = prompt('وصف (اختياري):');
    const isPrivate = confirm('هل تريد قائمة خاصة؟');
    await lists.createList(name, desc, isPrivate);
    showLists();
    showToast('تم إنشاء القائمة');
};

window.deleteListAction = async function(listId) {
    if (!confirm('حذف هذه القائمة؟')) return;
    const userId = authInstance.currentUser?.uid;
    await lists.deleteList(userId, listId);
    showLists();
    showToast('تم حذف القائمة');
};

// ===== Trending (update right panel) =====

async function updateTrending() {
    const trends = await trending.getTrendingTopics(5);
    const container = document.querySelector('.trending-card:nth-child(3)');
    if (container) {
        container.innerHTML = `<h3>الأكثر تداولاً</h3>` + trends.map(t => {
            const countStr = t.count >= 1000 ? (t.count / 1000).toFixed(1).replace('.0', '') + 'K' : t.count;
            return `
                <div class="trending-item" onclick="searchTrend('${t.topic}')">
                    <div class="category">${t.category}</div>
                    <div class="topic">${t.topic}</div>
                    <div class="count">${countStr} منشور</div>
                </div>
            `;
        }).join('');
    }
}

window.searchTrend = function(topic) {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = topic;
        handleSearch(topic);
    }
    navigateTo('search');
};

// ===== Draft Functions =====

window.saveDraftAction = async function() {
    const content = document.getElementById('postContent').value.trim();
    const imageUrl = document.getElementById('postImageUrl').value.trim();
    const videoUrl = document.getElementById('postVideo').value.trim();

    if (!content && !imageUrl && !videoUrl) {
        showToast('لا شيء لحفظه');
        return;
    }

    const draftId = await drafts.saveDraft(content, imageUrl, videoUrl);
    if (draftId) {
        showToast('تم حفظ المسودة');
        // Clear composer
        document.getElementById('postContent').value = '';
        document.getElementById('postContent').style.height = 'auto';
        removePreview();
    }
};

window.showDrafts = async function() {
    hideAllViews();
    document.getElementById('drafts-view').style.display = 'block';

    const container = document.getElementById('drafts-list');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    const draftList = await drafts.getDrafts();
    container.innerHTML = drafts.renderDraftsList(draftList);
};

window.loadDraft = function(draftId) {
    // Load draft content back to composer
    showHome();
    showToast('تم تحميل المسودة');
};

window.deleteDraftAction = async function(draftId) {
    if (!confirm('حذف هذه المسودة؟')) return;
    await drafts.deleteDraft(draftId);
    showDrafts(); // Refresh list
    showToast('تم حذف المسودة');
};

// ===== Settings =====

window.showSettings = function() {
    hideAllViews();
    document.getElementById('settings-view').style.display = 'block';
};

window.showMutedWords = async function() {
    const words = await blockMute.getMutedWords();
    const container = document.getElementById('settings-content');

    let html = `
        <div style="padding:16px;">
            <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
                <button class="back-btn" onclick="showSettings()"><i class="fas fa-arrow-right"></i></button>
                <h3>الكلمات المكتومة</h3>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:16px;">
                <input type="text" class="auth-input" id="new-muted-word" placeholder="أضف كلمة..." style="margin-bottom:0;font-size:14px;padding:10px;flex:1;">
                <button class="follow-btn" onclick="addMutedWordAction()" style="background:var(--accent);color:white;padding:8px 16px;">إضافة</button>
            </div>
    `;

    if (words.length) {
        for (const word of words) {
            html += `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-color);">
                    <span>${escapeHtml(word)}</span>
                    <button class="follow-btn following" onclick="removeMutedWordAction('${escapeHtml(word)}')" style="font-size:12px;padding:4px 8px;">إزالة</button>
                </div>
            `;
        }
    } else {
        html += '<div class="empty-state"><p>لا توجد كلمات مكتومة</p></div>';
    }

    html += '</div>';
    container.innerHTML = html;
};

window.addMutedWordAction = async function() {
    const input = document.getElementById('new-muted-word');
    const word = input.value.trim();
    if (!word) return;
    await blockMute.addMutedWord(word);
    input.value = '';
    showMutedWords();
};

window.removeMutedWordAction = async function(word) {
    await blockMute.removeMutedWord(word);
    showMutedWords();
};

window.togglePushNotif = async function() {
    const toggle = document.getElementById('push-notif-toggle');
    if (toggle.checked) {
        const token = await pushNotif.requestPermission(authInstance.currentUser.uid);
        if (!token) {
            toggle.checked = false;
            showToast('لم يتم منح إذن الإشعارات');
        }
    } else {
        await pushNotif.removeToken(authInstance.currentUser.uid);
    }
};

// ===== Block/Mute Functions =====

window.blockUserAction = async function(userId) {
    if (!confirm('حظر هذا المستخدم؟ لن ترى منشوراته ولن يرى منشوراتك.')) return;
    await blockMute.blockUser(userId);
    // Refresh feed
    posts.loadPosts();
};

window.unblockUserAction = async function(userId) => {
    await blockMute.unblockUser(userId);
};

window.muteUserAction = async function(userId) {
    await blockMute.muteUser(userId);
};

window.unmuteUserAction = async function(userId) => {
    await blockMute.unmuteUser(userId);
};

window.showBlockedUsers = async function() {
    const blocked = await blockMute.getBlockedUsers();
    const container = document.getElementById('settings-content');
    if (!container) return;

    if (!blocked.length) {
        container.innerHTML = '<div class="empty-state"><p>لا يوجد مستخدمون محظورون</p></div>';
        return;
    }

    let html = '<div style="padding:16px;"><h3 style="margin-bottom:16px;">المستخدمون المحظورون</h3>';
    for (const uid of blocked) {
        const userData = await getUserData(database, uid);
        html += `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-color);">
                <img src="${userData.profilePicture || DEFAULT_AVATAR}" style="width:40px;height:40px;border-radius:50%;" alt="">
                <div style="flex:1;">
                    <div style="font-weight:700;">${escapeHtml(userData.name || 'مستخدم')}</div>
                </div>
                <button class="follow-btn" onclick="unblockUserAction('${uid}')" style="font-size:13px;padding:4px 12px;">إلغاء الحظر</button>
            </div>
        `;
    }
    html += '</div>';
    container.innerHTML = html;
};

window.showMutedUsers = async function() {
    const muted = await blockMute.getMutedUsers();
    const container = document.getElementById('settings-content');
    if (!container) return;

    if (!muted.length) {
        container.innerHTML = '<div class="empty-state"><p>لا يوجد مستخدمون مكتومون</p></div>';
        return;
    }

    let html = '<div style="padding:16px;"><h3 style="margin-bottom:16px;">المستخدمون المكتومون</h3>';
    for (const uid of muted) {
        const userData = await getUserData(database, uid);
        html += `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-color);">
                <img src="${userData.profilePicture || DEFAULT_AVATAR}" style="width:40px;height:40px;border-radius:50%;" alt="">
                <div style="flex:1;">
                    <div style="font-weight:700;">${escapeHtml(userData.name || 'مستخدم')}</div>
                </div>
                <button class="follow-btn following" onclick="unmuteUserAction('${uid}')" style="font-size:13px;padding:4px 12px;">إلغاء الكتم</button>
            </div>
        `;
    }
    html += '</div>';
    container.innerHTML = html;
};

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
    const quoteBtn = document.getElementById('dropdown-quote');
    const reportBtn = document.getElementById('dropdown-report');
    const followBtn = document.getElementById('dropdown-follow');
    const muteBtn = document.getElementById('dropdown-mute');
    const blockBtn = document.getElementById('dropdown-block');

    deleteBtn.style.display = isOwnPost ? 'flex' : 'none';
    pinBtn.style.display = isOwnPost ? 'flex' : 'none';
    reportBtn.style.display = isOwnPost ? 'none' : 'flex';
    followBtn.style.display = isOwnPost ? 'none' : 'flex';
    muteBtn.style.display = isOwnPost ? 'none' : 'flex';
    blockBtn.style.display = isOwnPost ? 'none' : 'flex';

    // Position dropdown
    const rect = event.currentTarget.getBoundingClientRect();
    dropdown.style.display = 'block';
    dropdown.style.top = `${rect.bottom + 4}px`;

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
    quoteBtn.onclick = () => { dropdown.style.display = 'none'; quoteTweet(postId); };
    reportBtn.onclick = () => { dropdown.style.display = 'none'; posts.reportPost(postId, userId); };
    followBtn.onclick = () => { dropdown.style.display = 'none'; posts.followUser(userId, { preventDefault:()=>{}, stopPropagation:()=>{} }); };
    muteBtn.onclick = () => { dropdown.style.display = 'none'; blockMute.muteUser(userId); };
    blockBtn.onclick = () => { dropdown.style.display = 'none'; blockMute.blockUser(userId).then(() => posts.loadPosts()); };

// Quote Tweet
function quoteTweet(postId) {
    showHome();
    const composer = document.getElementById('postContent');
    composer.focus();
    composer.value = `\n\nاقتباس منشور: ${window.location.origin}${window.location.pathname}#post/${postId}`;
    composer.style.height = 'auto';
    composer.style.height = composer.scrollHeight + 'px';
}
};

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('post-dropdown');
    if (dropdown && !dropdown.contains(e.target) && !e.target.closest('.tweet-more')) {
        dropdown.style.display = 'none';
    }
});

// ===== Toast =====
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
        const userName = post.userName || userData.name || 'مستخدم';
        const avatar = post.userAvatar || userData.profilePicture || DEFAULT_AVATAR;
        const isOwnPost = post.userId === userId;

        const likeSnap = await get(ref(database, `likes/${postId}/${userId}`));
        const isLiked = likeSnap.exists();

        const bookmarkSnap = await get(ref(database, `bookmarks/${userId}/${postId}`));
        const isBookmarked = bookmarkSnap.exists();

        const date = new Date(post.timestamp);
        const timeStr = date.toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

        const views = post.views || 0;
        const likes = post.likes || 0;
        const retweets = post.retweets || 0;

        let mediaHtml = '';
        if (post.imageUrl) {
            mediaHtml = `<div class="post-detail-media" onclick="openLightbox('${post.imageUrl}')"><img src="${post.imageUrl}" alt=""></div>`;
        } else if (post.videoUrl) {
            mediaHtml = `<div class="post-detail-media"><iframe src="${post.videoUrl}" style="width:100%;height:350px;border:none;" allowfullscreen></iframe></div>`;
        }

        const editedHtml = post.edited ? '<span style="color:var(--text-secondary);font-size:12px;"> (معدّل)</span>' : '';

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
                ${post.content ? `<div class="post-detail-content">${post.content}${editedHtml}</div>` : ''}
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

        comments.loadComments(postId);

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

    document.getElementById('sidebar-name').textContent = name;
    document.getElementById('sidebar-handle').textContent = handle;
    document.getElementById('sidebar-avatar').src = pic;

    document.getElementById('drawer-name').textContent = name;
    document.getElementById('drawer-handle').textContent = handle;
    document.getElementById('drawer-avatar').src = pic;
    document.getElementById('drawer-followers').textContent = userData?.followers || 0;
    document.getElementById('drawer-following').textContent = userData?.following || 0;

    document.getElementById('mobile-avatar').src = pic;
    document.getElementById('composer-avatar').src = pic;
}

// ===== Load Who To Follow =====

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

        // Initialize rate limiter for this user
        rateLimiter.init(user.uid);

        // Initialize push notifications
        pushNotif.init(app, database, (payload) => {
            // Refresh notifications on foreground message
            notifications.loadNotifications();
            updateDMBadge();
        });
        pushNotif.requestPermission(user.uid);

        hideLoading();
        showApp();
        updateSidebar(userData);
        showView('home');
        posts.loadPosts();
        notifications.loadNotifications();
        loadWhoToFollow();
        updateDMBadge();
        updateTrending();
    } catch (error) {
        showAuth();
    }
}

// Setup auth state listener
auth.setupAuthStateListener(checkUserRole);

// ===== DOM Ready =====

document.addEventListener('DOMContentLoaded', () => {
    // Auth button event listeners
    const loginPhoneBtn = document.getElementById('login-phone-btn');
    if (loginPhoneBtn) loginPhoneBtn.addEventListener('click', () => auth.loginWithPhone());

    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.addEventListener('click', () => auth.login());

    const signupPhoneBtn = document.getElementById('signup-phone-btn');
    if (signupPhoneBtn) signupPhoneBtn.addEventListener('click', () => auth.signupWithPhone());

    const signupBtn = document.getElementById('signup-btn');
    if (signupBtn) signupBtn.addEventListener('click', () => auth.signup());

    const showSignupBtn = document.getElementById('show-signup-btn');
    if (showSignupBtn) showSignupBtn.addEventListener('click', () => auth.showSignup());

    const showLoginBtn = document.getElementById('show-login-btn');
    if (showLoginBtn) showLoginBtn.addEventListener('click', () => auth.showLogin());

    // Auto-resize textarea + character counter (X-style circular)
    const textarea = document.getElementById('postContent');
    if (textarea) {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';

            const len = this.value.length;
            const maxLen = 500;
            const counter = document.getElementById('char-counter');
            const ringFill = document.getElementById('char-ring-fill');
            const countText = document.getElementById('char-count-text');
            const submitBtn = document.querySelector('.composer-submit');

            // Show counter when typing
            if (len > 0) {
                counter.style.display = 'flex';
            } else {
                counter.style.display = 'none';
            }

            // Update circular progress
            const circumference = 2 * Math.PI * 8; // r=8
            const progress = Math.min(len / maxLen, 1);
            const offset = circumference - (progress * circumference);
            ringFill.style.strokeDashoffset = offset;

            // Color changes
            ringFill.classList.remove('warning', 'danger');
            countText.classList.remove('danger');

            if (len > maxLen) {
                ringFill.classList.add('danger');
                countText.classList.add('danger');
                countText.textContent = maxLen - len;
                submitBtn.disabled = true;
                submitBtn.style.opacity = '0.5';
            } else if (len > maxLen * 0.9) {
                ringFill.classList.add('warning');
                countText.textContent = maxLen - len;
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
            } else {
                countText.textContent = '';
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
            }
        });
    }

    // Swipe gesture for drawer
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
                    pagination.resetPagination();
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
