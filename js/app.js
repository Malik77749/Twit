// Main Application Entry Point — Upgraded
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, get, update, query, orderByChild, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

import { firebaseConfig } from './config.js?v=3';
import { showView, showApp, showAuth, showLoading, hideLoading, focusComposer } from './ui.js?v=3';
import { escapeHtml, showToast, parseContent } from './utils.js?v=3';
import * as auth from './auth.js?v=3';
import * as posts from './posts.js?v=3';
import * as comments from './comments.js?v=3';
import * as notifications from './notifications.js?v=3';
import * as profile from './profile.js?v=3';
import * as pagination from './pagination.js?v=7';
import * as rateLimiter from './rate-limiter.js?v=3';
import * as pushNotif from './push-notifications.js?v=3';
import * as dm from './dm.js?v=3';
import * as blockMute from './block-mute.js?v=3';
import * as polls from './polls.js?v=3';
import * as theme from './theme.js?v=3';
import * as drafts from './drafts.js?v=3';
import * as threads from './threads.js?v=3';
import * as analytics from './analytics.js?v=3';
import * as lists from './lists.js?v=3';
import * as shortcuts from './shortcuts.js?v=3';
import * as a11y from './accessibility.js?v=3';
import * as undoTweet from './undo-tweet.js?v=3';
import * as verified from './verified.js?v=3';
import * as trending from './trending.js?v=3';
import * as googleAuth from './google-auth.js?v=3';
import * as communities from './communities.js?v=3';
import * as twoFactor from './two-factor.js?v=4';
import { getUserData } from './firebase-helpers.js?v=3';
import './improvements.js?v=1';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

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
    twoFactor.init(authInstance, database);
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
            loadSearchTrending();
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

// Search filter state
let currentSearchFilter = 'all';

window.setSearchFilter = function(filter, btn) {
    currentSearchFilter = filter;
    document.querySelectorAll('.search-filter-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    // Re-trigger search with current query
    const query = document.getElementById('search-input')?.value.trim();
    if (query) performSearch(query);
};

window.handleSearch = function(query) {
    const clearBtn = document.getElementById('search-clear');
    const filtersEl = document.getElementById('search-filters');
    const trendingEl = document.getElementById('search-trending');
    clearBtn.style.display = query ? 'flex' : 'none';
    filtersEl.style.display = query ? 'flex' : 'none';
    trendingEl.style.display = query ? 'none' : 'block';

    if (searchTimeout) clearTimeout(searchTimeout);

    if (!query.trim()) {
        document.getElementById('search-results').innerHTML = '';
        filtersEl.style.display = 'none';
        trendingEl.style.display = 'block';
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
        const isHashtagSearch = queryStr.startsWith('#');
        const searchTerm = isHashtagSearch ? queryStr.substring(1).toLowerCase() : lowerQuery;

        let html = '';

        // Search users (unless filter is posts/hashtags/media)
        if (currentSearchFilter === 'all' || currentSearchFilter === 'people') {
            const usersSnap = await get(ref(database, 'users'));
            const users = [];
            const exactHandleMatches = [];
            const handleMatches = [];
            const nameMatches = [];

            // Determine if searching by @handle
            const isHandleSearch = searchTerm.startsWith('@');
            const handleTerm = isHandleSearch ? searchTerm.substring(1) : searchTerm;

            if (usersSnap.exists()) {
                usersSnap.forEach(child => {
                    const userData = child.val();
                    const name = (userData.name || '').toLowerCase();
                    const handle = (userData.handle || '').toLowerCase();

                    // Exact handle match (highest priority)
                    if (handle && handle === handleTerm) {
                        exactHandleMatches.push({ id: child.key, ...userData });
                    }
                    // Handle contains search term
                    else if (handle && handle.includes(handleTerm) && isHandleSearch) {
                        handleMatches.push({ id: child.key, ...userData });
                    }
                    // Name contains search term
                    else if (name.includes(searchTerm) || name.includes(handleTerm)) {
                        nameMatches.push({ id: child.key, ...userData });
                    }
                    // Handle contains search term (non-@ search)
                    else if (!isHandleSearch && handle && handle.includes(searchTerm)) {
                        handleMatches.push({ id: child.key, ...userData });
                    }
                });
            }

            // Merge: exact handle first, then handle matches, then name matches
            const allUsers = [...exactHandleMatches, ...handleMatches, ...nameMatches];

            if (allUsers.length > 0) {
                html += '<div style="padding:12px 16px;"><h3 style="font-size:18px;font-weight:800;">أشخاص</h3></div>';
                for (const user of allUsers.slice(0, 10)) {
                    const protectedIcon = user.isProtected ? '<i class="fas fa-lock" style="font-size:12px;color:var(--text-secondary);margin-right:4px;"></i>' : '';
                    html += `
                        <div class="search-result-item" onclick="showProfile('${user.id}')">
                            <img src="${user.profilePicture || DEFAULT_AVATAR}" alt="">
                            <div class="search-result-info">
                                <div class="search-result-name">${escapeHtml(user.name || 'مستخدم')}${protectedIcon}</div>
                                <div class="search-result-handle">@${escapeHtml(user.handle || (user.name || '').replace(/\s/g, '').toLowerCase())}</div>
                            </div>
                        </div>
                    `;
                }
            }
        }

        // Search posts
        if (currentSearchFilter === 'all' || currentSearchFilter === 'posts' || currentSearchFilter === 'hashtags' || currentSearchFilter === 'media') {
            const postsSnap = await get(query(ref(database, 'posts'), orderByChild('timestamp'), limitToLast(500)));
            let foundPosts = [];
            if (postsSnap.exists()) {
                postsSnap.forEach(child => {
                    const postData = child.val();
                    const content = (postData.content || '').toLowerCase();

                    let matches = false;
                    if (isHashtagSearch) {
                        // Hashtag search: match #tag in content
                        matches = content.includes(searchTerm);
                    } else if (currentSearchFilter === 'hashtags') {
                        matches = content.includes('#') && content.includes(searchTerm);
                    } else if (currentSearchFilter === 'media') {
                        matches = (postData.imageUrl || postData.videoUrl) && content.includes(searchTerm);
                    } else {
                        matches = content.includes(searchTerm);
                    }

                    if (matches) {
                        foundPosts.push({ id: child.key, ...postData });
                    }
                });
            }

            // Also search hashtags collection
            if (isHashtagSearch || currentSearchFilter === 'hashtags') {
                const hashtagsSnap = await get(ref(database, 'hashtags'));
                if (hashtagsSnap.exists()) {
                    hashtagsSnap.forEach(child => {
                        const tag = child.key.toLowerCase();
                        if (tag.includes(searchTerm) || searchTerm.includes(tag)) {
                            const postIds = Object.keys(child.val() || {});
                            // Add matching posts
                            for (const pid of postIds.slice(0, 5)) {
                                if (!foundPosts.find(p => p.id === pid)) {
                                    foundPosts.push({ id: pid, _fromHashtag: true, _tag: child.key });
                                }
                            }
                        }
                    });
                }
            }

            foundPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            if (foundPosts.length > 0) {
                const sectionTitle = isHashtagSearch ? 'هاشتاق' : currentSearchFilter === 'media' ? 'وسائط' : 'منشورات';
                html += `<div style="padding:12px 16px;border-top:1px solid var(--border-color);"><h3 style="font-size:18px;font-weight:800;">${sectionTitle}</h3></div>`;
                for (const post of foundPosts.slice(0, 15)) {
                    if (post._fromHashtag) {
                        // Load actual post data
                        const postSnap = await get(ref(database, `posts/${post.id}`));
                        if (!postSnap.exists()) continue;
                        Object.assign(post, postSnap.val());
                    }
                    const postContent = escapeHtml(post.content || '').substring(0, 100);
                    const postTime = post.timestamp ? formatSearchTime(post.timestamp) : '';
                    html += `
                        <div class="search-result-item" onclick="openPostDetail('${post.id}')">
                            <div style="flex:1;">
                                <div style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${parseContent(postContent)}</div>
                                <div style="color:var(--text-secondary);font-size:13px;">${postTime} · ${post.likes || 0} إعجاب</div>
                            </div>
                            ${post.imageUrl ? '<i class="far fa-image" style="color:var(--text-secondary);"></i>' : ''}
                        </div>
                    `;
                }
            }
        }

        if (!html) {
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
window.pinPost = posts.pinPost;
window.unpinPost = posts.unpinPost;

window.addComment = comments.addComment;
window.toggleComments = comments.toggleComments;

window.showProfile = profile.showProfile;
window.updateProfilePicture = profile.updateProfilePicture;
window.editProfile = profile.editProfile;
window.saveProfile = profile.saveProfile;
window.showFollowersList = profile.showFollowersList;
window.showFollowingList = profile.showFollowingList;

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

window.openDMConversation = async function(targetId, isGroup) {
    let conversationId;

    if (isGroup) {
        conversationId = targetId;
        const convSnap = await get(ref(database, `conversations/${conversationId}`));
        if (convSnap.exists()) {
            document.getElementById('dm-chat-name').textContent = convSnap.val().groupName || 'مجموعة';
            document.getElementById('dm-chat-avatar').src = DEFAULT_AVATAR;
        }
    } else {
        conversationId = await dm.openConversation(targetId);
        if (!conversationId) return;

        // Load other user info
        const otherUser = await getUserData(database, targetId);
        document.getElementById('dm-chat-name').textContent = otherUser.name || 'مستخدم';
        document.getElementById('dm-chat-avatar').src = otherUser.profilePicture || DEFAULT_AVATAR;
    }

    // Show chat view
    document.getElementById('dm-conversations-view').style.display = 'none';
    document.getElementById('dm-chat-view').style.display = 'flex';

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

window.showCreateGroupUI = async function() {
    const name = prompt('اسم المجموعة:');
    if (!name) return;

    // Get all users for selection
    const usersSnap = await get(ref(database, 'users'));
    const currentUserId = authInstance.currentUser.uid;
    const users = [];

    if (usersSnap.exists()) {
        usersSnap.forEach(child => {
            if (child.key !== currentUserId) {
                users.push({ id: child.key, ...child.val() });
            }
        });
    }

    if (users.length === 0) {
        showToast('لا يوجد مستخدمون للإضافة');
        return;
    }

    // Simple selection via prompt (can be improved with UI later)
    const userList = users.map((u, i) => `${i + 1}. ${u.name}`).join('\n');
    const selection = prompt(`اختر أعضاء المجموعة (أرقام مفصولة بفاصلة):\n${userList}`);
    if (!selection) return;

    const indices = selection.split(',').map(s => parseInt(s.trim()) - 1).filter(i => i >= 0 && i < users.length);
    if (indices.length === 0) {
        showToast('لم تختر أي عضو');
        return;
    }

    const memberIds = indices.map(i => users[i].id);
    const groupId = await dm.createGroupConversation(name, memberIds);
    if (groupId) {
        showToast('تم إنشاء المجموعة');
        showMessages();
    }
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
    { icon: 'fa-user-check', text: 'الأشخاص الذين تتابعهم يمكنهم الرد', value: 'following' }
];
let currentReplySetting = 0;
window.currentReplySetting = currentReplySetting;
window.replySettings = replySettings;

window.cycleReplySetting = function() {
    currentReplySetting = (currentReplySetting + 1) % replySettings.length;
    window.currentReplySetting = currentReplySetting;
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

async function loadSearchTrending() {
    const trends = await trending.getTrendingTopics(8);
    const container = document.getElementById('search-trending-list');
    if (!container) return;

    if (trends.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>لا توجد ترندات</p></div>';
        return;
    }

    container.innerHTML = trends.map((t, i) => {
        const countStr = t.count >= 1000 ? (t.count / 1000).toFixed(1).replace('.0', '') + 'K' : t.count;
        return `
            <div class="trending-item" onclick="searchTrend('${t.topic}')">
                <div style="color:var(--text-secondary);font-size:13px;">${i + 1} · ترند</div>
                <div class="topic" style="font-weight:700;font-size:15px;">${t.topic}</div>
                <div class="count" style="color:var(--text-secondary);font-size:13px;">${countStr} منشور</div>
            </div>
        `;
    }).join('');
}

async function updateTrending() {
    const trends = await trending.getTrendingTopics(5);
    const container = document.getElementById('trending-list');
    if (container) {
        if (trends.length === 0) {
            container.innerHTML = '<div class="trending-item"><div class="category">لا توجد ترندات بعد</div></div>';
            return;
        }
        container.innerHTML = trends.map(t => {
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
    load2FAStatus();
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

// ===== 2FA Functions =====
window.toggle2FA = async function() {
    const toggle = document.getElementById('twofa-toggle');
    const statusMsg = document.getElementById('twofa-status-msg');

    if (toggle.checked) {
        const result = await twoFactor.enable2FA();
        if (!result.success) {
            toggle.checked = false;
            statusMsg.textContent = result.message;
            statusMsg.style.display = 'block';
            statusMsg.style.color = 'var(--danger)';
            if (result.needsVerification) {
                setTimeout(() => {
                    statusMsg.style.display = 'none';
                }, 8000);
            }
        } else {
            statusMsg.textContent = result.message;
            statusMsg.style.display = 'block';
            statusMsg.style.color = 'var(--success)';
        }
    } else {
        const result = await twoFactor.disable2FA();
        statusMsg.textContent = result.message || 'تم إيقاف المصادقة الثنائية';
        statusMsg.style.display = 'block';
        statusMsg.style.color = 'var(--text-secondary)';
    }
};

async function load2FAStatus() {
    const userId = authInstance.currentUser?.uid;
    if (!userId) return;

    const status = await twoFactor.get2FAStatus(userId);
    const toggle = document.getElementById('twofa-toggle');
    const statusMsg = document.getElementById('twofa-status-msg');

    if (toggle) {
        toggle.checked = status.enabled;
    }

    if (!status.hasEmail) {
        statusMsg.textContent = 'أضف بريد إلكتروني لتفعيل المصادقة الثنائية';
        statusMsg.style.display = 'block';
        statusMsg.style.color = 'var(--text-secondary)';
    } else if (!status.emailVerified && !status.enabled) {
        statusMsg.textContent = 'تحقق من بريدك الإلكتروني أولاً';
        statusMsg.style.display = 'block';
        statusMsg.style.color = 'var(--text-secondary)';
    }
}

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

window.unblockUserAction = async function(userId) {
    await blockMute.unblockUser(userId);
};

window.muteUserAction = async function(userId) {
    await blockMute.muteUser(userId);
};

window.unmuteUserAction = async function(userId) {
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
    pinBtn.onclick = () => { dropdown.style.display = 'none'; posts.pinPost(postId); };
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
        const userHandle = userData.handle || '';
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
                        <div class="post-detail-handle">@${userHandle || escapeHtml(userName).replace(/\s/g, '').toLowerCase()}</div>
                    </div>
                    ${!isOwnPost ? `<button class="follow-btn" data-follow-id="${post.userId}" onclick="followUser('${post.userId}', event)">متابعة</button>` : ''}
                </div>
                ${post.content ? `<div class="post-detail-content">${parseContent(post.content)}${editedHtml}</div>` : ''}
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
    const handle = '@' + (userData?.handle || name.replace(/\s/g, '').toLowerCase());

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
                    <div class="who-to-follow-handle">@${escapeHtml(user.handle || (user.name || '').replace(/\s/g, '').toLowerCase())}</div>
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
        // 2FA verification
        const twoFA = await twoFactor.verify2FAOnLogin(user);
        const isAllowed = typeof twoFA === 'object' ? twoFA.allowed !== false : twoFA !== false;
        if (!isAllowed) {
            alert(twoFA?.message || 'تعذر إكمال التحقق من تسجيل الدخول');
            const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
            await signOut(authInstance);
            showAuth();
            hideLoading();
            return;
        }

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

// ===== Auth Button Binding (bulletproof) =====

function bindAuthButtons() {
    const bindings = [
        ['login-phone-btn', () => auth.loginWithPhone()],
        ['login-btn', () => auth.login()],
        ['signup-phone-btn', () => auth.signupWithPhone()],
        ['signup-btn', () => auth.signup()],
        ['show-signup-btn', () => auth.showSignup()],
        ['show-login-btn', () => auth.showLogin()],
        ['forgot-password-btn', () => auth.forgotPassword()],
        ['forgot-password-email-btn', () => auth.forgotPassword()],
    ];
    bindings.forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (el && !el.dataset.bound) {
            el.addEventListener('click', fn);
            el.dataset.bound = 'true';
        }
    });

    // Enter key on auth inputs
    [
        ['login-phone', auth.loginWithPhone],
        ['login-password-phone', auth.loginWithPhone],
        ['login-email', auth.login],
        ['login-password', auth.login],
        ['signup-name-phone', auth.signupWithPhone],
        ['signup-phone', auth.signupWithPhone],
        ['signup-password-phone', auth.signupWithPhone],
        ['signup-name', auth.signup],
        ['signup-email', auth.signup],
        ['signup-password', auth.signup],
    ].forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (el && !el.dataset.enterBound) {
            el.addEventListener('keydown', e => { if (e.key === 'Enter') fn(); });
            el.dataset.enterBound = 'true';
        }
    });
}

// Bind NOW + on DOMContentLoaded + on load (covers all timing scenarios)
bindAuthButtons();
document.addEventListener('DOMContentLoaded', bindAuthButtons);
window.addEventListener('load', bindAuthButtons);

// ===== Composer Textarea Setup =====

function setupComposerTextarea() {
    const textarea = document.getElementById('postContent');
    if (!textarea || textarea.dataset.setup) return;
    textarea.dataset.setup = 'true';

    textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';

        const len = this.value.length;
        const maxLen = 500;
        const counter = document.getElementById('char-counter');
        const ringFill = document.getElementById('char-ring-fill');
        const countText = document.getElementById('char-count-text');
        const submitBtn = document.querySelector('.composer-submit');

        if (len > 0) {
            counter.style.display = 'flex';
        } else {
            counter.style.display = 'none';
        }

        const circumference = 2 * Math.PI * 8;
        const progress = Math.min(len / maxLen, 1);
        const offset = circumference - (progress * circumference);
        ringFill.style.strokeDashoffset = offset;

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

setupComposerTextarea();
document.addEventListener('DOMContentLoaded', setupComposerTextarea);

// ===== Touch Gestures (Swipe + Pull-to-Refresh) =====

(function initTouchGestures() {
    // Swipe for drawer
    let touchStartX = 0, touchStartY = 0, isSwiping = false;

    document.addEventListener('touchstart', (e) => {
        const x = e.touches[0].clientX;
        if (x > window.innerWidth - 30) {
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

    document.addEventListener('touchend', () => { isSwiping = false; }, { passive: true });

    // Pull-to-refresh
    let ptrStartY = 0, isPulling = false;
    const mainFeed = document.querySelector('.main-feed');
    if (!mainFeed) return;

    mainFeed.addEventListener('touchstart', (e) => {
        if (mainFeed.scrollTop === 0) {
            ptrStartY = e.touches[0].clientY;
            isPulling = true;
        }
    }, { passive: true });

    mainFeed.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        if (e.touches[0].clientY - ptrStartY > 60) {
            const ptr = document.getElementById('pull-to-refresh');
            if (ptr) { ptr.style.display = 'flex'; ptr.classList.add('active'); }
        }
    }, { passive: true });

    mainFeed.addEventListener('touchend', () => {
        if (!isPulling) return;
        const ptr = document.getElementById('pull-to-refresh');
        if (ptr?.classList.contains('active')) {
            pagination.resetPagination();
            posts.loadPosts();
            setTimeout(() => {
                ptr.classList.remove('active');
                setTimeout(() => ptr.style.display = 'none', 300);
            }, 1000);
        }
        isPulling = false;
    }, { passive: true });
})();

try {
    showAuth();
    console.log('showAuth() called OK');
} catch (error) {
    console.error('showAuth() failed:', error);
    document.getElementById('auth-section').style.display = 'flex';
}


// ===== TWIT_UI_ENHANCEMENTS_V2 =====
(function () {
    const originalNavigateTo = window.navigateTo;
    const originalShowHome = window.showHome;
    const originalShowNotifications = window.showNotifications;
    const originalShowMessages = window.showMessages;
    const originalShowProfile = window.showProfile;
    const originalShowLists = window.showLists;
    const originalShowAnalytics = window.showAnalytics;
    const originalShowSettings = window.showSettings;
    const originalShowDrafts = window.showDrafts;
    const originalShowCommunities = window.showCommunities;

    function animateVisibleView() {
        const current = document.querySelector('#app-section > * .page-enter-active');
        if (current) current.classList.remove('page-enter-active');
        const visible = [...document.querySelectorAll('#app-section [id$="-view"]')].find(el => el.style.display !== 'none');
        if (visible) {
            visible.classList.remove('page-enter', 'page-enter-active');
            void visible.offsetWidth;
            visible.classList.add('page-enter-active');
        }
    }

    function setDesktopActive(nav) {
        document.querySelectorAll('.sidebar .nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.nav === nav);
        });
    }

    function updateIndicator(container) {
        if (!container) return;
        const active = container.querySelector('.feed-tab.active, .mobile-feed-tab.active, .profile-tab.active, .notif-tab.active, .explore-tab.active');
        const indicator = container.querySelector('.tab-indicator');
        if (!active || !indicator) return;
        const left = active.offsetLeft;
        indicator.style.width = `${active.offsetWidth > 56 ? 56 : active.offsetWidth * 0.6}px`;
        indicator.style.left = `${left + (active.offsetWidth - parseFloat(indicator.style.width || 56)) / 2}px`;
    }

    function initTabIndicators() {
        document.querySelectorAll('.feed-tabs, .mobile-feed-tabs, .profile-tabs, .notif-tabs, .explore-tabs').forEach(updateIndicator);
    }

    window.addEventListener('resize', initTabIndicators);
    document.addEventListener('click', (e) => {
        const container = e.target.closest('.feed-tabs, .mobile-feed-tabs, .profile-tabs, .notif-tabs, .explore-tabs');
        if (container) setTimeout(() => updateIndicator(container), 10);
    });
    setTimeout(initTabIndicators, 50);
    document.addEventListener('DOMContentLoaded', () => setTimeout(initTabIndicators, 50));

    function updateHeaderBlur() {
        document.querySelectorAll('.feed-header').forEach(header => {
            header.classList.toggle('scrolled', window.scrollY > 12);
        });
    }
    window.addEventListener('scroll', updateHeaderBlur, { passive: true });
    updateHeaderBlur();

    window.openSearch = function() {
        hideAllViews();
        setActiveNav('search');
        setDesktopActive('search');
        document.getElementById('search-view').style.display = 'block';
        document.getElementById('search-input')?.focus();
        loadSearchTrending();
        loadExploreSections(window.currentExploreSection || 'foryou');
        animateVisibleView();
        initTabIndicators();
    };

    window.navigateTo = function(view) {
        originalNavigateTo(view);
        setDesktopActive(view);
        if (view === 'search') loadExploreSections(window.currentExploreSection || 'foryou');
        animateVisibleView();
        initTabIndicators();
    };

    window.showHome = function() {
        originalShowHome();
        setDesktopActive('home');
        animateVisibleView();
        initTabIndicators();
    };

    window.showNotifications = function() {
        originalShowNotifications();
        setDesktopActive('notifications');
        animateVisibleView();
        initTabIndicators();
    };

    window.showMessages = function() {
        originalShowMessages();
        setDesktopActive('messages');
        animateVisibleView();
        initTabIndicators();
    };

    window.showProfile = function(...args) {
        const result = originalShowProfile(...args);
        setDesktopActive('profile');
        animateVisibleView();
        initTabIndicators();
        return result;
    };

    window.showLists = async function(...args) {
        const result = await originalShowLists(...args);
        setDesktopActive('lists');
        animateVisibleView();
        return result;
    };

    window.showAnalytics = async function(...args) {
        const result = await originalShowAnalytics(...args);
        setDesktopActive('analytics');
        animateVisibleView();
        return result;
    };

    window.showSettings = function(...args) {
        const result = originalShowSettings(...args);
        setDesktopActive('settings');
        animateVisibleView();
        return result;
    };

    window.showDrafts = async function(...args) {
        const result = await originalShowDrafts(...args);
        setDesktopActive('drafts');
        animateVisibleView();
        return result;
    };

    window.showCommunities = async function(...args) {
        const result = await originalShowCommunities(...args);
        setDesktopActive('communities');
        animateVisibleView();
        return result;
    };

    window.toggleSidebarMore = function(event) {
        event?.stopPropagation();
        document.getElementById('sidebar-more-dropdown')?.classList.toggle('open');
    };
    window.closeSidebarMore = function() {
        document.getElementById('sidebar-more-dropdown')?.classList.remove('open');
    };
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#sidebar-more-btn') && !e.target.closest('#sidebar-more-dropdown')) {
            window.closeSidebarMore?.();
        }
    });
    window.showKeyboardShortcuts = function() { shortcuts.showShortcutsHelp(); };
    window.showHelpCenter = function() { showToast('مركز المساعدة قريباً'); };

    window.currentExploreSection = 'foryou';
    window.switchExploreTab = function(section, btn) {
        window.currentExploreSection = section;
        document.querySelectorAll('.explore-tab').forEach(el => el.classList.remove('active'));
        btn?.classList.add('active');
        loadExploreSections(section);
        initTabIndicators();
    };

    async function renderWhoToFollow(limit = 3) {
        const usersSnap = await get(ref(database, 'users'));
        const currentUserId = authInstance.currentUser?.uid;
        if (!usersSnap.exists()) return '';
        const users = [];
        usersSnap.forEach(child => {
            if (child.key !== currentUserId) users.push({ id: child.key, ...child.val() });
        });
        return users.slice(0, limit).map(user => `
            <div class="wtf-item" onclick="showProfile('${user.id}')">
                <img class="wtf-avatar" src="${user.profilePicture || DEFAULT_AVATAR}" alt="">
                <div class="wtf-info">
                    <div class="wtf-name">${escapeHtml(user.name || 'مستخدم')}</div>
                    <div class="wtf-handle">@${escapeHtml(user.handle || (user.name || 'user').replace(/\s/g, '').toLowerCase())}</div>
                </div>
                <button class="follow-btn" onclick="event.stopPropagation(); followUser('${user.id}', event)">متابعة</button>
            </div>
        `).join('');
    }

    function buildNewsCards(trends) {
        return trends.slice(0, 6).map((t, i) => `
            <div class="news-card" onclick="searchTrend('${t.topic}')">
                <div class="news-card-img"></div>
                <div class="news-card-body">
                    <div class="news-card-label">عاجل · ${['سياسة','تقنية','رياضة','ترفيه','أخبار','مجتمع'][i % 6]}</div>
                    <div class="news-card-title">${t.topic} يتصدر النقاش الآن</div>
                </div>
            </div>
        `).join('');
    }

    function buildTrendRows(trends, categoryLabel) {
        return trends.slice(0, 8).map(t => {
            const countStr = t.count >= 1000 ? (t.count / 1000).toFixed(1).replace('.0', '') + 'K' : t.count;
            return `
                <div class="trend-row" onclick="searchTrend('${t.topic}')">
                    <div class="trend-row-left">
                        <div class="trend-category">${categoryLabel}</div>
                        <div class="trend-topic">${t.topic}</div>
                        <div class="trend-count">${countStr} منشور</div>
                    </div>
                    <div class="trend-row-right"><i class="fas fa-ellipsis"></i></div>
                </div>
            `;
        }).join('');
    }

    async function loadExploreSections(section = 'foryou') {
        const container = document.getElementById('explore-dynamic-sections');
        const carousel = document.getElementById('breaking-news-carousel');
        if (!container || !carousel) return;

        const trends = await trending.getTrendingTopics(12);
        carousel.innerHTML = buildNewsCards(trends);

        const categoryMap = {
            foryou: 'لك',
            trending: 'الأكثر تداولاً',
            news: 'الأخبار',
            sports: 'الرياضة',
            entertainment: 'الترفيه'
        };

        const whoToFollowHtml = await renderWhoToFollow(4);
        container.innerHTML = `
            <div class="trending-card">
                <h3>${categoryMap[section] || 'لك'}</h3>
                ${buildTrendRows(trends, categoryMap[section] || 'لك')}
            </div>
            <div class="trending-card" style="margin-top:16px;">
                <h3>من تتابع</h3>
                ${whoToFollowHtml || '<div class="empty-state"><p>لا توجد اقتراحات حالياً</p></div>'}
            </div>
        `;
    }
    window.loadExploreSections = loadExploreSections;

    const originalClearSearch = window.clearSearch;
    window.clearSearch = function() {
        originalClearSearch();
        document.getElementById('search-filters').style.display = 'none';
        document.getElementById('explore-discovery').style.display = 'block';
        loadExploreSections(window.currentExploreSection || 'foryou');
    };

    const originalHandleSearch = window.handleSearch;
    window.handleSearch = function(query) {
        originalHandleSearch(query);
        const discovery = document.getElementById('explore-discovery');
        if (discovery) discovery.style.display = query?.trim() ? 'none' : 'block';
    };

    window.scrollToTopAction = function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const scrollTopBtn = document.getElementById('scroll-top-btn');
    function handleScrollTopBtn() {
        if (!scrollTopBtn) return;
        scrollTopBtn.classList.toggle('visible', window.scrollY > 350);
    }
    window.addEventListener('scroll', handleScrollTopBtn, { passive: true });
    handleScrollTopBtn();

    // Share sheet: copy link / quote / DM
    window.quoteTweet = function(postId) {
        showHome();
        const composer = document.getElementById('postContent');
        if (!composer) return;
        composer.focus();
        composer.value = `\n\nاقتباس منشور: ${window.location.origin}${window.location.pathname}#post/${postId}`;
        composer.dispatchEvent(new Event('input'));
    };

    window.sendPostByDM = async function(postId) {
        const handle = prompt('اسم المستخدم لإرسال الرابط في الرسائل الخاصة (بدون @):');
        if (!handle) return;
        const usersSnap = await get(ref(database, 'users'));
        let targetUserId = null;
        if (usersSnap.exists()) {
            usersSnap.forEach(child => {
                const val = child.val();
                if (!targetUserId && (val.handle || '').toLowerCase() === handle.toLowerCase()) {
                    targetUserId = child.key;
                }
            });
        }
        if (!targetUserId) {
            showToast('لم يتم العثور على المستخدم');
            return;
        }
        const conversationId = await dm.getOrCreateConversation(targetUserId);
        if (!conversationId) return;
        const url = `${window.location.origin}${window.location.pathname}#post/${postId}`;
        await dm.sendMessage(conversationId, `رابط منشور: ${url}`);
        showToast('تم إرسال الرابط في الرسائل');
    };

    window.openShareSheet = function(postId, event) {
        event?.preventDefault();
        event?.stopPropagation();
        const dropdown = document.getElementById('post-dropdown');
        if (!dropdown) return;
        dropdown.innerHTML = `
            <button class="dropdown-item" onclick="copyPostLink('${postId}')"><i class="fas fa-link"></i><span>نسخ الرابط</span></button>
            <button class="dropdown-item" onclick="sendPostByDM('${postId}')"><i class="far fa-envelope"></i><span>إرسال برسالة خاصة</span></button>
            <button class="dropdown-item" onclick="quoteTweet('${postId}')"><i class="fas fa-quote-right"></i><span>اقتباس</span></button>
        `;
        const rect = event.currentTarget.getBoundingClientRect();
        dropdown.style.display = 'block';
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${Math.max(16, rect.left - 180 + rect.width)}px`;
        dropdown.style.right = 'auto';
    };

    document.addEventListener('DOMContentLoaded', () => {
        initTabIndicators();
        setTimeout(() => loadExploreSections('foryou'), 150);
    });
})();


// ===== MOBILE BOTTOM NAVIGATION BAR =====
(function initMobileNav() {
    const mobileNav = document.querySelector('.mobile-nav');
    if (!mobileNav) return;

    // Create mobile nav items if they don't exist
    if (mobileNav.children.length === 0) {
        mobileNav.innerHTML = `
            <button class="mobile-nav-item active" data-nav="home" onclick="showHome()">
                <i class="fas fa-home"></i>
                <span>الرئيسية</span>
            </button>
            <button class="mobile-nav-item" data-nav="search" onclick="openSearch()">
                <i class="fas fa-magnifying-glass"></i>
                <span>استكشاف</span>
            </button>
            <button class="mobile-nav-item" data-nav="notifications" onclick="showNotifications()" style="position:relative;">
                <i class="fas fa-bell"></i>
                <span>إشعارات</span>
                <span id="notif-badge-mobile" class="notif-badge" style="display:none;position:absolute;top:2px;right:2px;"></span>
            </button>
            <button class="mobile-nav-item" data-nav="messages" onclick="showMessages()" style="position:relative;">
                <i class="far fa-envelope"></i>
                <span>رسائل</span>
                <span id="dm-badge-mobile" class="notif-badge" style="display:none;position:absolute;top:2px;right:2px;"></span>
            </button>
            <button class="mobile-nav-item" data-nav="profile" onclick="showProfile()">
                <i class="fas fa-user"></i>
                <span>ملفي</span>
            </button>
        `;
    }

    // Update active nav item
    window.setActiveMobileNav = function(nav) {
        document.querySelectorAll('.mobile-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.nav === nav);
        });
    };

    // Intercept navigation functions to update mobile nav
    const originalShowHome = window.showHome;
    window.showHome = function() {
        originalShowHome();
        setActiveMobileNav('home');
    };

    const originalShowNotifications = window.showNotifications;
    window.showNotifications = function() {
        originalShowNotifications();
        setActiveMobileNav('notifications');
    };

    const originalShowMessages = window.showMessages;
    window.showMessages = function() {
        originalShowMessages();
        setActiveMobileNav('messages');
    };

    const originalShowProfile = window.showProfile;
    window.showProfile = function(...args) {
        originalShowProfile(...args);
        setActiveMobileNav('profile');
    };

    const originalOpenSearch = window.openSearch;
    window.openSearch = function() {
        originalOpenSearch();
        setActiveMobileNav('search');
    };
})();

// ===== INSTANT POST PUBLISHING (NO TIMER) =====
window.postTweet = async function() {
    // This is already handled in posts.js with instant publishing
    // Just ensure the button feedback is immediate
    const postBtn = document.querySelector('.composer-submit');
    if (postBtn && !postBtn.disabled) {
        postBtn.textContent = '...';
        postBtn.style.opacity = '0.7';
        setTimeout(() => {
            postBtn.textContent = 'نشر';
            postBtn.style.opacity = '1';
        }, 300);
    }
};

// Pull-to-refresh is now handled by improvements.js with professional threshold

// ===== MOBILE DRAWER SWIPE GESTURE =====
(function improveDrawerGesture() {
    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false;

    document.addEventListener('touchstart', (e) => {
        const x = e.touches[0].clientX;
        // Detect swipe from right edge
        if (x > window.innerWidth - 20) {
            touchStartX = x;
            touchStartY = e.touches[0].clientY;
            isSwiping = true;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isSwiping || !window.innerWidth <= 768) return;
        const dx = touchStartX - e.touches[0].clientX;
        const dy = Math.abs(touchStartY - e.touches[0].clientY);
        
        if (dx > 40 && dy < 100) {
            window.openDrawer?.();
            isSwiping = false;
        }
    }, { passive: true });

    document.addEventListener('touchend', () => {
        isSwiping = false;
    }, { passive: true });
})();

// ===== RESPONSIVE MOBILE ADJUSTMENTS =====
(function initResponsiveAdjustments() {
    function updateLayout() {
        const isMobile = window.innerWidth <= 768;
        const mobileNav = document.querySelector('.mobile-nav');
        const sidebar = document.querySelector('.sidebar');
        const rightPanel = document.querySelector('.right-panel');

        if (isMobile) {
            if (mobileNav) mobileNav.style.display = 'flex';
            if (sidebar) sidebar.style.display = 'none';
            if (rightPanel) rightPanel.style.display = 'none';
        } else {
            if (mobileNav) mobileNav.style.display = 'none';
            if (sidebar) sidebar.style.display = 'flex';
            if (rightPanel) rightPanel.style.display = 'block';
        }
    }

    window.addEventListener('resize', updateLayout);
    updateLayout();
})();
