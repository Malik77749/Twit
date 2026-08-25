// Main Application Entry Point — Upgraded
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, get, update, runTransaction, query, orderByChild, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { firebaseConfig } from './config.js?v=9';
import { showView, showApp, showAuth, showLoading, hideLoading, focusComposer } from './ui.js?v=10';
import { escapeHtml, showToast, parseContent } from './utils.js?v=9';
import * as auth from './auth.js?v=10';
import * as posts from './posts.js?v=20';
import * as comments from './comments.js?v=20';
import * as notifications from './notifications.js?v=18';
import * as profile from './profile.js?v=18';
import * as pagination from './pagination.js?v=10';
import * as rateLimiter from './rate-limiter.js?v=10';
import * as pushNotif from './push-notifications.js?v=12';
import * as dm from './dm.js?v=9';
import * as blockMute from './block-mute.js?v=9';
import * as polls from './polls.js?v=9';
import * as theme from './theme.js?v=9';
import * as drafts from './drafts.js?v=9';
import * as threads from './threads.js?v=9';
import * as analytics from './analytics.js?v=10';
import * as lists from './lists.js?v=9';
import * as shortcuts from './shortcuts.js?v=9';
import * as a11y from './accessibility.js?v=9';
import * as undoTweet from './undo-tweet.js?v=9';
import * as verified from './verified.js?v=9';
import * as trending from './trending.js?v=9';
import * as googleAuth from './google-auth.js?v=9';
import * as communities from './communities.js?v=9';
import * as feedRanking from './feed-ranking.js?v=1';
import * as twoFactor from './two-factor.js?v=4';
import * as verification from './verification.js?v=1';
import * as cloudinary from './cloudinary.js?v=11';
import { getUserData, clearUserCache } from './firebase-helpers.js?v=9';
import './improvements.js?v=2';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

const DETAIL_ICON_PATHS = {
    comment: '<path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.4 8.4 0 0 1-4-.98L4 20l1.15-3.08A7.36 7.36 0 0 1 4.5 12 7.5 7.5 0 0 1 12 4.5a7.5 7.5 0 0 1 8 7z"></path>',
    retweet: '<path d="M7 7h10l-2.5-2.5M17 7l-2.5 2.5M17 17H7l2.5 2.5M7 17l2.5-2.5"></path>',
    heart: '<path d="M20.8 8.9c0 5.2-8.8 10.1-8.8 10.1S3.2 14.1 3.2 8.9A4.4 4.4 0 0 1 12 6.7a4.4 4.4 0 0 1 8.8 2.2z"></path>',
    heartFilled: '<path d="M20.8 8.9c0 5.2-8.8 10.1-8.8 10.1S3.2 14.1 3.2 8.9A4.4 4.4 0 0 1 12 6.7a4.4 4.4 0 0 1 8.8 2.2z" fill="currentColor"></path>',
    bookmark: '<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.5L6 21z"></path>',
    bookmarkFilled: '<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.5L6 21z" fill="currentColor"></path>',
    share: '<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"></path><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"></path>',
    view: '<path d="M5 19V9"></path><path d="M12 19V5"></path><path d="M19 19v-7"></path><path d="M3 19h18"></path>'
};
function detailIcon(name) {
    return `<svg class="ui-icon detail-ui-icon" viewBox="0 0 24 24" aria-hidden="true">${DETAIL_ICON_PATHS[name] || ''}</svg>`;
}
function formatDetailCount(value) {
    const count = Math.max(0, Number(value) || 0);
    try { return new Intl.NumberFormat('ar-EG', { notation: 'compact', maximumFractionDigits: 1 }).format(count); }
    catch { return String(count); }
}
function formatDetailTime(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const diff = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `${Math.floor(diff / 60)}د`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}س`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}ي`;
    return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

// Initialize Firebase
let app, authInstance, database;
try {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    database = getDatabase(app);
    console.log('Firebase initialized OK');
} catch (error) {
    console.error('Firebase initialization error:', error);
    document.body.innerHTML = '<div style="color:white;padding:20px;text-align:center;"><h2>خطأ في تحميل التطبيق</h2><p>' + error.message + '</p></div>';
}

// Initialize all modules
try {
    auth.init(authInstance, database);
    posts.init(authInstance, database);
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
    verification.init(authInstance, database);
    theme.init();
    shortcuts.init();
    a11y.init();
    console.log('Modules initialized OK');
} catch (error) {
    console.error('Module initialization error:', error);
}

// Never let a network-dependent boot step leave the user on a permanent loader.
window.setTimeout(() => {
    const overlay = document.getElementById('loading-overlay');
    const appSection = document.getElementById('app-section');
    if (overlay?.style.display === 'flex' && appSection?.style.display !== 'flex') {
        if (window.mimerAuthStateResolved) {
            hideLoading();
            showAuth();
            const errorEl = document.getElementById('error');
            if (errorEl && !errorEl.textContent) errorEl.textContent = 'تعذر إكمال الاتصال. يمكنك المحاولة مرة أخرى.';
        } else {
            const loadingText = overlay.querySelector('.loading-text, p');
            if (loadingText) loadingText.textContent = 'جاري استعادة جلسة ميمر…';
        }
    }
}, 6000);

// ===== Global Navigation =====

const allViews = [
    'home', 'notifications', 'profile', 'search', 'messages', 'bookmarks',
    'post-detail', 'lists', 'analytics', 'settings', 'drafts', 'communities',
    'dm-chat', 'dm-conversations'
];

function hideAllViews() {
    allViews.forEach(v => {
        const el = document.getElementById(`${v}-view`);
        if (el) el.style.display = 'none';
    });
}

function setActiveNav(navName) {
    document.querySelectorAll('.mobile-nav-item, .sidebar .nav-item').forEach(btn => {
        const isActive = btn.dataset.nav === navName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
}

function closeTransientMenus() {
    document.querySelectorAll('.sidebar-more-dropdown.open, .dropdown-menu.open, .more-menu.open, .drawer.open').forEach(menu => {
        menu.classList.remove('open');
        menu.setAttribute('aria-hidden', 'true');
    });
    document.body.classList.remove('drawer-open', 'modal-open');
}

function resetViewPosition() {
    const main = document.querySelector('.main-feed');
    if (main) main.scrollTo({ top: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, behavior: 'auto' });
}

function safeDisplay(view, display = 'block') {
    const element = document.getElementById(`${view}-view`);
    if (!element) {
        console.warn(`View element not found: ${view}-view`);
        return false;
    }
    element.style.display = display;
    element.classList.remove('view-enter');
    void element.offsetWidth;
    element.classList.add('view-enter');
    return true;
}

window.navigateTo = function(view) {
    closeTransientMenus();
    hideAllViews();
    resetViewPosition();
    setActiveNav(view);

    switch(view) {
        case 'home':
            showView('home');
            posts.loadPosts();
            break;
        case 'search':
            if (!safeDisplay('search')) { return navigateTo('home'); }
            setTimeout(() => document.getElementById('search-input')?.focus(), 100);
            loadSearchTrending();
            break;
        case 'notifications':
            showView('notifications');
            notifications.loadNotifications();
            break;
        case 'messages':
            if (typeof window.showMessages === 'function') window.showMessages();
            else safeDisplay('messages');
            break;
        case 'profile':
            if (typeof window.showProfile === 'function') window.showProfile();
            else safeDisplay('profile');
            break;
        case 'bookmarks':
            if (typeof window.showBookmarks === 'function') window.showBookmarks();
            else safeDisplay('bookmarks');
            break;
        case 'lists':
            if (typeof window.showLists === 'function') window.showLists();
            else safeDisplay('lists');
            break;
        case 'analytics':
            if (typeof window.showAnalytics === 'function') window.showAnalytics();
            else safeDisplay('analytics');
            break;
        case 'settings':
            if (typeof window.showSettings === 'function') window.showSettings();
            else safeDisplay('settings');
            break;
        case 'drafts':
            if (typeof window.showDrafts === 'function') window.showDrafts();
            else safeDisplay('drafts');
            break;
        case 'communities':
            if (typeof window.showCommunities === 'function') window.showCommunities();
            else safeDisplay('communities');
            break;
        default:
            console.warn(`Unknown navigation target: ${view}`);
            showView('home');
            setActiveNav('home');
            posts.loadPosts();
            break;
    }
};

async function refreshComposerCommunities() {
    const select = document.getElementById('post-community');
    if (!select) return;
    const userId = authInstance.currentUser?.uid;
    if (!userId) return;
    try {
        const memberships = await communities.getUserCommunities(userId);
        const previous = select.value;
        select.innerHTML = '<option value="">الجميع</option>' + memberships.map(comm => `<option value="${escapeHtml(comm.id)}">${escapeHtml(comm.name)}</option>`).join('');
        if (memberships.some(comm => comm.id === previous)) select.value = previous;
    } catch (error) {
        console.warn('Composer communities load skipped:', error);
    }
}
window.refreshComposerCommunities = refreshComposerCommunities;

window.showHome = function() {
    window.currentFeedMode = 'foryou';
    document.querySelectorAll('.mobile-feed-tab').forEach((tab, index) => tab.classList.toggle('active', index === 0));
    hideAllViews();
    setActiveNav('home');
    showView('home');
    void refreshComposerCommunities();
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
    setActiveNav('bookmarks');
    document.getElementById('bookmarks-view').style.display = 'block';
    return loadBookmarks();
};

window.openSearch = function() {
    navigateTo('search');
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
        const normalizedQuery = query.trim();
        if (normalizedQuery.length >= 3) feedRanking.rememberSearchTerm(normalizedQuery);
        await performSearch(normalizedQuery);
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

function renderBookmarkFallback(post, container) {
    const name = post.userName || 'مستخدم';
    const handle = post.userHandle || name.replace(/\s/g, '').toLowerCase();
    container.innerHTML = `<article class="tweet bookmark-post-fallback" data-post-id="${escapeHtml(post.id || '')}"><div class="tweet-body"><div class="tweet-header"><strong>${escapeHtml(name)}</strong><span class="tweet-handle">@${escapeHtml(handle)}</span></div>${post.content ? `<div class="tweet-content">${escapeHtml(post.content)}</div>` : ''}<div class="profile-fallback-note">منشور محفوظ</div></div></article>`;
}

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
                try {
                    await posts.renderPost({ id: postId, ...postSnap.val() }, el);
                } catch (renderError) {
                    console.error('Bookmark post render error:', renderError);
                    renderBookmarkFallback({ id: postId, ...postSnap.val() }, el);
                }
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
        console.error('Bookmarks load error:', error);
        container.innerHTML = '<div class="empty-state"><h3>المحفوظات</h3><p>تعذر تحميل المحفوظات الآن. تحقق من الاتصال ثم حاول مرة أخرى.</p><button class="follow-btn" type="button" onclick="showBookmarks()">إعادة المحاولة</button></div>';
    }
}

// ===== Feed Tab Switch =====

window.switchFeedTab = function(btn, tabType) {
    window.currentFeedMode = tabType === 'following' ? 'following' : 'foryou';
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
    window.currentFeedMode = 'following';
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
window.canMessageUser = dm.canMessageUser;
window.handleImageSelect = posts.handleImageSelect;
window.removePreview = posts.removePreview;
window.toggleUrlInput = posts.toggleUrlInput;
window.toggleVideoInput = posts.toggleVideoInput;
window.toggleGifInput = posts.toggleGifInput;
window.toggleLocationInput = posts.toggleLocationInput;
window.toggleBookmark = posts.toggleBookmark;
window.pinPost = posts.pinPost;
window.unpinPost = posts.unpinPost;

window.addComment = comments.addComment;
window.toggleComments = comments.toggleComments;
window.showCommentReplyInput = comments.showCommentReplyInput;
window.deleteComment = comments.deleteComment;
window.editComment = comments.editComment;

window.showProfile = profile.showProfile;
window.updateProfilePicture = profile.updateProfilePicture;
window.editProfile = profile.editProfile;
window.saveProfile = profile.saveProfile;
window.showFollowersList = profile.showFollowersList;
window.showFollowingList = profile.showFollowingList;

window.focusComposer = focusComposer;

// ===== DM Functions =====

let selectedDMFile = null;
window.toggleDMEmoji = function() {
    const picker = document.getElementById('dm-emoji-picker');
    if (!picker) return;
    picker.hidden = !picker.hidden;
};
window.insertDMEmoji = function(emoji) {
    const input = document.getElementById('dm-input');
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    input.focus();
    input.setSelectionRange(start + emoji.length, start + emoji.length);
    document.getElementById('dm-emoji-picker')?.setAttribute('hidden', '');
};
function resetDMComposer() {
    selectedDMFile = null;
    const input = document.getElementById('dm-media-input');
    const preview = document.getElementById('dm-media-preview');
    if (input) input.value = '';
    if (preview) { preview.innerHTML = ''; preview.hidden = true; }
    document.getElementById('dm-emoji-picker')?.setAttribute('hidden', '');
}
function renderDMFilePreview(file) {
    const preview = document.getElementById('dm-media-preview');
    if (!preview || !file) return;
    const url = URL.createObjectURL(file);
    preview.innerHTML = file.type.startsWith('video/')
        ? `<video src="${url}" muted playsinline></video>`
        : `<img src="${url}" alt="معاينة المرفق">`;
    preview.hidden = false;
}

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
    const currentUserId = authInstance.currentUser.uid;
    const conversationSnap = await get(ref(database, `conversations/${conversationId}`));
    const conversation = conversationSnap.exists() ? conversationSnap.val() : {};
    const requestBanner = document.getElementById('dm-request-banner');
    const sendButton = document.getElementById('dm-send-btn');
    const messageInput = document.getElementById('dm-input');
    const mediaInput = document.getElementById('dm-media-input');
    const emojiButton = document.getElementById('dm-emoji-btn');
    if (requestBanner) {
        if (conversation.status === 'pending' && conversation.requestedBy !== currentUserId) {
            requestBanner.style.display = 'block';
            requestBanner.innerHTML = `<div style="padding:12px 16px;background:var(--accent-soft);display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><strong>طلب محادثة</strong><span style="color:var(--text-secondary);">يريد هذا الحساب بدء محادثة معك.</span><button class="follow-btn" onclick="acceptDMRequest('${conversationId}')">قبول</button><button class="follow-btn following" onclick="rejectDMRequest('${conversationId}')">رفض</button></div>`;
        } else if (conversation.status === 'rejected') {
            requestBanner.style.display = 'block';
            requestBanner.innerHTML = '<div style="padding:12px 16px;background:rgba(244,33,46,.10);color:var(--danger);">تم رفض طلب المحادثة. لا يمكن إرسال رسائل جديدة.</div>';
        } else {
            requestBanner.style.display = 'none';
            requestBanner.innerHTML = '';
        }
    }
    if (sendButton) sendButton.disabled = conversation.status === 'rejected' || (conversation.status === 'pending' && conversation.requestedBy !== currentUserId);
    if (messageInput) messageInput.disabled = sendButton?.disabled || false;
    if (mediaInput) mediaInput.disabled = sendButton?.disabled || false;
    if (emojiButton) emojiButton.disabled = sendButton?.disabled || false;
    resetDMComposer();

    window.activeDMConversationId = conversationId;
    // Load messages
    const messagesContainer = document.getElementById('dm-messages-list');
    dm.loadMessages(conversationId, (messages) => {
        dm.renderMessages(messages, authInstance.currentUser.uid, messagesContainer);
    });

    // Setup send button
    const sendBtn = document.getElementById('dm-send-btn');
    const input = document.getElementById('dm-input');
    const attachInput = document.getElementById('dm-media-input');

    attachInput.onchange = () => {
        const file = attachInput.files?.[0];
        if (!file) return;
        try {
            cloudinary.validateMediaFile(file);
            selectedDMFile = file;
            renderDMFilePreview(file);
        } catch (error) {
            selectedDMFile = null;
            attachInput.value = '';
            document.getElementById('dm-media-preview')?.setAttribute('hidden', '');
            showToast(error.message === 'MEDIA_TOO_LARGE' ? 'حجم المرفق يتجاوز 50MB' : 'نوع المرفق غير مدعوم');
        }
    };

    sendBtn.onclick = async () => {
        const text = input.value.trim();
        if (!text && !selectedDMFile) return;
        const mediaFile = selectedDMFile;
        sendBtn.disabled = true;
        try {
            await dm.sendMessage(conversationId, text, null, mediaFile);
            input.value = '';
            resetDMComposer();
        } finally {
            sendBtn.disabled = false;
        }
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

window.acceptDMRequest = async function(conversationId) {
    if (await dm.acceptConversation(conversationId)) { showToast('تم قبول طلب المحادثة'); closeDMChat(); await openDMConversation(conversationId, true); }
};
window.rejectDMRequest = async function(conversationId) {
    if (await dm.rejectConversation(conversationId)) { showToast('تم رفض طلب المحادثة'); closeDMChat(); await openDMConversation(conversationId, true); }
};
window.deleteActiveDMConversation = async function() {
    const name = document.getElementById('dm-chat-name')?.textContent || 'هذه المحادثة';
    if (!confirm(`حذف ${name} من قائمتك؟`)) return;
    const conversationId = window.activeDMConversationId;
    if (conversationId && await dm.deleteConversation(conversationId)) { showToast('تم حذف المحادثة من قائمتك'); closeDMChat(); }
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

// ===== Account onboarding / Google Sign-In =====

function normalizeAccountHandle(value) {
    return String(value || '').trim().replace(/^@+/, '').toLowerCase();
}

function isValidAccountHandle(value) {
    return /^[a-z0-9_.]{3,20}$/.test(normalizeAccountHandle(value));
}

let onboardingCheckTimer;
let onboardingHandleAvailable = false;

async function checkOnboardingHandle(value) {
    const handle = normalizeAccountHandle(value);
    const feedback = document.getElementById('onboarding-handle-feedback');
    const save = document.getElementById('onboarding-save');
    onboardingHandleAvailable = false;
    if (!feedback || !save) return;
    save.disabled = true;
    if (!handle) { feedback.textContent = 'استخدم 3 إلى 20 حرفًا إنجليزيًا أو رقمًا'; feedback.className = 'handle-feedback'; return; }
    if (!isValidAccountHandle(handle)) { feedback.textContent = 'الأحرف المسموحة: a-z و0-9 و _ و .'; feedback.className = 'handle-feedback taken'; return; }
    feedback.textContent = 'جاري التحقق من التوفر...'; feedback.className = 'handle-feedback checking';
    try {
        const snap = await get(ref(database, `handles/${handle}`));
        if (snap.exists()) { feedback.textContent = '✗ الاسم مستخدم وغير متاح'; feedback.className = 'handle-feedback taken'; return; }
        onboardingHandleAvailable = true;
        feedback.textContent = '✓ الاسم متاح ويمكن استخدامه';
        feedback.className = 'handle-feedback available';
        save.disabled = false;
    } catch (error) { feedback.textContent = 'تعذر التحقق، حاول مرة أخرى'; feedback.className = 'handle-feedback taken'; }
}

window.showUsernameOnboarding = function() {
    const modal = document.getElementById('username-onboarding');
    const input = document.getElementById('onboarding-handle');
    if (!modal || !input) return;
    modal.hidden = false;
    input.focus();
};

window.saveUsernameOnboarding = async function() {
    const input = document.getElementById('onboarding-handle');
    const error = document.getElementById('onboarding-handle-error');
    const save = document.getElementById('onboarding-save');
    const uid = authInstance.currentUser?.uid;
    const handle = normalizeAccountHandle(input?.value);
    if (!uid || !isValidAccountHandle(handle)) { if (error) error.textContent = 'أدخل اسم مستخدم صالحًا'; return; }
    save.disabled = true;
    if (error) error.textContent = '';
    try {
        const claim = await runTransaction(ref(database, `handles/${handle}`), current => current === null ? uid : current);
        if (!claim.committed || claim.snapshot.val() !== uid) throw new Error('TAKEN');
        const country = document.getElementById('onboarding-country')?.value || 'OTHER';
        await update(ref(database, `users/${uid}`), { handle, country, needsUsername: false, needsSuggestions: true, usernameUpdatedAt: new Date().toISOString() });
        const refreshedUser = { ...(await get(ref(database, `users/${uid}`))).val(), handle, country };
        updateSidebar(refreshedUser);
        document.getElementById('username-onboarding').hidden = true;
        document.body.classList.remove('mimer-onboarding-required');
        showToast('تم حجز اسم المستخدم بنجاح');
        window.showSuggestedAccountsOnboarding?.();
    } catch (err) {
        if (error) error.textContent = err.message === 'TAKEN' ? 'الاسم حُجز للتو، اختر اسمًا آخر' : 'تعذر حفظ الاسم، حاول مرة أخرى';
        save.disabled = false;
        checkOnboardingHandle(handle);
    }
};

window.signInWithGoogle = async function() {
    const result = await googleAuth.signInWithGoogle();
    if (!result.success) {
        const errorEl = document.getElementById('error');
        if (errorEl) errorEl.innerText = result.message;
        return;
    }
    if (result.needsUsername) window.showUsernameOnboarding();
};

document.getElementById('onboarding-handle')?.addEventListener('input', (event) => {
    clearTimeout(onboardingCheckTimer);
    onboardingCheckTimer = setTimeout(() => checkOnboardingHandle(event.target.value), 220);
});
document.getElementById('onboarding-save')?.addEventListener('click', window.saveUsernameOnboarding);

async function finishSuggestedAccounts() {
    const uid = authInstance.currentUser?.uid;
    const modal = document.getElementById('suggested-accounts-onboarding');
    // Complete onboarding locally first so a slow database write cannot block navigation.
    if (modal) modal.hidden = true;
    showApp();
    showView('home');
    if (uid) {
        update(ref(database, `users/${uid}`), { needsSuggestions: false, suggestionsCompletedAt: new Date().toISOString() }).catch(() => {});
    }
    posts.loadPosts().catch(error => console.warn('Home feed refresh skipped:', error));
}

window.showSuggestedAccountsOnboarding = async function() {
    const uid = authInstance.currentUser?.uid;
    const modal = document.getElementById('suggested-accounts-onboarding');
    const list = document.getElementById('suggested-accounts-list');
    if (!uid || !modal || !list) return finishSuggestedAccounts();
    modal.hidden = false;
    list.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
    try {
        const [usersSnap, currentSnap] = await Promise.all([get(ref(database, 'users')), get(ref(database, `users/${uid}`))]);
        const current = currentSnap.val() || {};
        const candidates = [];
        if (usersSnap.exists()) usersSnap.forEach(child => {
            if (child.key === uid) return;
            const user = { id: child.key, ...child.val() };
            if (['banned', 'suspended', 'deleted'].includes(user.accountStatus)) return;
            if (current.country && user.country && current.country !== user.country) return;
            candidates.push(user);
        });
        candidates.sort((a, b) => Number(b.followers || 0) - Number(a.followers || 0));
        const selected = candidates.slice(0, 8);
        if (!selected.length) { await finishSuggestedAccounts(); return; }
        list.innerHTML = selected.map(user => `<div class="suggested-account-row"><img src="${escapeHtml(user.profilePicture || DEFAULT_AVATAR)}" alt=""><div class="suggested-account-info"><strong>${escapeHtml(user.name || 'مستخدم')}</strong><span>@${escapeHtml(user.handle || 'mimer')}</span><small>${Number(user.followers || 0)} متابع</small></div><button class="follow-btn" data-follow-id="${user.id}" onclick="followUser('${user.id}', event)">متابعة</button></div>`).join('');
    } catch (error) { list.innerHTML = '<div class="empty-state"><p>تعذر تحميل الاقتراحات.</p></div>'; }
};
document.getElementById('suggested-skip')?.addEventListener('click', finishSuggestedAccounts);
document.getElementById('suggested-done')?.addEventListener('click', finishSuggestedAccounts);

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
    hideAllViews();
    const view = document.getElementById('communities-view');
    const container = document.getElementById('communities-content');
    if (view) view.style.display = 'block';
    setActiveNav('communities');
    if (!container) return;
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
    try {
        const commSnap = await get(ref(database, `communities/${commId}`));
        if (!commSnap.exists()) {
            container.innerHTML = '<div class="empty-state"><h3>المجتمع غير موجود</h3><button class="follow-btn" onclick="showCommunities()">العودة إلى المجتمعات</button></div>';
            return;
        }
        const comm = { id: commId, ...commSnap.val() };
        const userId = authInstance.currentUser?.uid;
        const member = await communities.isMember(commId, userId);
        const membershipAction = member
            ? `<button class="follow-btn following" onclick="toggleCommunityMembership('${commId}', true)">عضو · مغادرة</button>`
            : `<button class="follow-btn" onclick="toggleCommunityMembership('${commId}', false)">${comm.isPrivate ? 'طلب الانضمام' : 'انضمام'}</button>`;
        container.innerHTML = `
            <div class="community-detail-header">
                <div class="community-detail-topline"><button class="back-btn" onclick="showCommunities()" aria-label="العودة"><i class="fas fa-arrow-right"></i></button><span class="community-detail-kicker">مجتمع ميمر</span>${membershipAction}</div>
                <h3>${escapeHtml(comm.name)}</h3>
                <p>${escapeHtml(comm.description || 'مساحة عربية للنقاش والمشاركة.')}</p>
                <div class="community-detail-meta"><span>${Number(comm.memberCount || 0)} عضو</span><span>${Number(comm.postCount || 0)} منشور</span><span>${comm.isPrivate ? 'خاص' : 'عام'}</span></div>
            </div>
            <div id="community-posts"></div>`;
        const postIds = await communities.getCommunityFeed(commId);
        const postsDiv = document.getElementById('community-posts');
        if (!postIds.length) {
            postsDiv.innerHTML = '<div class="empty-state"><h3>لا توجد منشورات بعد</h3><p>كن أول من يشارك في هذا المجتمع.</p></div>';
            return;
        }
        for (const postId of postIds.slice(0, 20)) {
            const postSnap = await get(ref(database, `posts/${postId}`));
            if (!postSnap.exists()) continue;
            const el = document.createElement('div');
            el.setAttribute('data-post-id', postId);
            postsDiv.appendChild(el);
            try { await posts.renderPost({ id: postId, ...postSnap.val() }, el); } catch (renderError) { console.error('Community post render error:', renderError); }
        }
    } catch (error) {
        console.error('Community detail error:', error);
        container.innerHTML = '<div class="empty-state"><h3>تعذر تحميل المجتمع</h3><p>تحقق من الاتصال ثم حاول مرة أخرى.</p><button class="follow-btn" onclick="showCommunities()">العودة إلى المجتمعات</button></div>';
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

window.showSettings = async function() {
    hideAllViews();
    document.getElementById('settings-view').style.display = 'block';
    const adminLink = document.getElementById('admin-panel-setting');
    if (adminLink) {
        const userData = await getUserData(database, authInstance.currentUser?.uid);
        adminLink.style.display = userData?.isAdmin === true ? 'flex' : 'none';
        const privacySelect = document.getElementById('message-privacy-select');
        if (privacySelect) privacySelect.value = userData?.messagePrivacy || 'everyone';
    }
    load2FAStatus();
};

window.saveMessagePrivacy = async function(value) {
    const uid = authInstance.currentUser?.uid;
    const allowed = ['everyone', 'following', 'mutual', 'none'];
    if (!uid || !allowed.includes(value)) return;
    try {
        await update(ref(database, `users/${uid}`), { messagePrivacy: value });
        clearUserCache();
        showToast('تم تحديث خصوصية المراسلة');
    } catch (error) { showToast('تعذر حفظ إعداد المراسلة: ' + error.message); }
};

window.showVerificationCenter = function() {
    const container = document.getElementById('settings-content');
    if (container) verification.renderVerificationCenter(container);
};

window.showAccountSecurity = async function() {
    const container = document.getElementById('settings-content');
    const user = authInstance.currentUser;
    if (!container || !user) return;
    const data = await getUserData(database, user.uid);
    const banSnap = await get(ref(database, `bans/${user.uid}`));
    const ban = banSnap.exists() ? banSnap.val() : null;
    const warningSnap = await get(ref(database, `warnings/${user.uid}`));
    const warningCount = warningSnap.exists() ? Object.keys(warningSnap.val()).length : 0;
    container.innerHTML = `
        <div style="padding:16px;">
            <div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;">
                <button class="back-btn" onclick="showSettings()"><i class="fas fa-arrow-right"></i></button>
                <h3>بيانات الحساب والأمان</h3>
            </div>
            <div class="settings-section">
                <div class="settings-item"><i class="fas fa-envelope"></i><span>البريد</span><strong style="margin-right:auto;direction:ltr;">${escapeHtml(user.email || 'مرتبط بـ Google/الهاتف')}</strong></div>
                <div class="settings-item"><i class="fas fa-at"></i><span>اسم المستخدم</span><strong style="margin-right:auto;direction:ltr;">@${escapeHtml(data?.handle || '—')}</strong></div>
                <div class="settings-item"><i class="fas fa-id-card"></i><span>معرّف ميمر</span><strong style="margin-right:auto;direction:ltr;">${escapeHtml(data?.numericId || '—')}</strong></div>
                <div class="settings-item"><i class="fas fa-triangle-exclamation"></i><span>التحذيرات</span><strong style="margin-right:auto;">${warningCount}</strong></div>
                <div class="settings-item"><i class="fas fa-shield"></i><span>حالة الحساب</span><strong style="margin-right:auto;color:${ban?.status === 'banned' ? 'var(--danger)' : ban?.status === 'suspended' ? 'var(--warning)' : 'var(--success)'};">${ban?.status === 'banned' ? 'محظور' : ban?.status === 'suspended' ? 'مجمّد مؤقتاً' : 'نشط'}</strong></div>
            </div>
        </div>`;
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

// ===== Quote composer =====
async function activateQuoteComposer(postId) {
    window.currentQuotePostId = String(postId || '').trim();
    if (!window.currentQuotePostId) return;
    showHome();
    const composer = document.getElementById('postContent');
    const preview = document.getElementById('quote-preview');
    if (!composer || !preview) return;
    composer.focus();
    composer.placeholder = 'أضف تعليقك على الاقتباس...';
    composer.dispatchEvent(new Event('input'));
    preview.hidden = false;
    preview.innerHTML = '<span>جاري تجهيز الاقتباس...</span>';
    try {
        const snapshot = await get(ref(database, `posts/${window.currentQuotePostId}`));
        if (!snapshot.exists()) throw new Error('POST_NOT_FOUND');
        const post = snapshot.val() || {};
        preview.innerHTML = `<div class="quote-preview-label">اقتباس منشور</div><div class="quote-preview-content"><strong>${escapeHtml(post.userName || 'مستخدم')}</strong><span>@${escapeHtml(post.userHandle || '')}</span>${post.content ? `<p>${parseContent(post.content)}</p>` : ''}</div><button type="button" class="quote-preview-remove" aria-label="إلغاء الاقتباس" onclick="clearQuoteTweet()"><i class="fas fa-times"></i></button>`;
    } catch (error) {
        window.clearQuoteTweet();
        showToast('تعذر تحميل المنشور المقتبس');
    }
}
window.clearQuoteTweet = function() {
    window.currentQuotePostId = '';
    const preview = document.getElementById('quote-preview');
    if (preview) { preview.hidden = true; preview.innerHTML = ''; }
};
window.startQuoteTweet = activateQuoteComposer;
window.quoteTweet = activateQuoteComposer;

// ===== Post Dropdown Menu =====

let currentDropdownPostId = null;
let currentDropdownUserId = null;

function setPostMenuVisible(visible) {
    const dropdown = document.getElementById('post-dropdown');
    const backdrop = document.getElementById('post-menu-backdrop');
    if (!dropdown) return;
    dropdown.style.display = visible ? 'block' : 'none';
    dropdown.classList.toggle('open', visible);
    dropdown.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (backdrop) {
        if (visible) backdrop.removeAttribute('hidden');
        else backdrop.setAttribute('hidden', '');
        backdrop.classList.toggle('open', visible);
    }
    document.body.classList.toggle('post-menu-open', visible);
    if (!visible) {
        currentDropdownPostId = null;
        currentDropdownUserId = null;
    }
}

window.closePostMenu = function() { setPostMenuVisible(false); };

window.closePostListsPicker = function() {
    document.getElementById('post-list-picker')?.remove();
    document.body.classList.remove('modal-open');
};

window.openPostListsPicker = async function(postId, userId) {
    const currentUserId = authInstance.currentUser?.uid;
    if (!currentUserId || !userId || userId === currentUserId) return;
    window.closePostListsPicker();
    const overlay = document.createElement('div');
    overlay.id = 'post-list-picker';
    overlay.className = 'post-list-picker-backdrop';
    overlay.innerHTML = `<section class="post-list-picker" role="dialog" aria-modal="true" aria-label="إدارة القوائم"><div class="post-list-picker-header"><strong>إضافة إلى القوائم</strong><button type="button" class="post-menu-close" aria-label="إغلاق">×</button></div><div class="post-list-picker-body"><div class="spinner"></div></div></section>`;
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');
    const closeButton = overlay.querySelector('.post-menu-close');
    closeButton?.addEventListener('click', window.closePostListsPicker);
    overlay.addEventListener('click', event => { if (event.target === overlay) window.closePostListsPicker(); });
    try {
        const userLists = await lists.getUserLists(currentUserId);
        const body = overlay.querySelector('.post-list-picker-body');
        if (!body) return;
        if (!userLists.length) {
            body.innerHTML = `<p class="post-list-picker-empty">أنشئ قائمة لتنظيم الحسابات التي تتابعها.</p><button type="button" class="follow-btn">فتح القوائم</button>`;
            body.querySelector('button')?.addEventListener('click', () => { window.closePostListsPicker(); window.showLists?.(); });
            return;
        }
        const states = await Promise.all(userLists.map(async list => ({
            list,
            active: (await get(ref(database, `listMembers/${currentUserId}/${list.id}/${userId}`))).exists()
        })));
        body.innerHTML = states.map(({list, active}) => `<button type="button" class="post-list-row ${active ? 'active' : ''}" data-list-id="${escapeHtml(list.id)}" aria-pressed="${active}"><span><strong>${escapeHtml(list.name || 'قائمة بلا اسم')}</strong><small>${list.isPrivate ? 'خاصة' : 'عامة'} · ${Number(list.memberCount || 0)} عضو</small></span><i class="fas ${active ? 'fa-check' : 'fa-plus'}" aria-hidden="true"></i></button>`).join('');
        body.querySelectorAll('.post-list-row').forEach(row => row.addEventListener('click', async () => {
            const list = userLists.find(item => item.id === row.dataset.listId);
            if (!list || row.disabled) return;
            const active = row.getAttribute('aria-pressed') === 'true';
            row.disabled = true;
            const ok = active ? await lists.removeMember(currentUserId, list.id, userId) : await lists.addMember(currentUserId, list.id, userId);
            row.disabled = false;
            if (!ok) { showToast('تعذر تحديث القائمة'); return; }
            row.setAttribute('aria-pressed', String(!active));
            row.classList.toggle('active', !active);
            const icon = row.querySelector('i'); if (icon) icon.className = `fas ${!active ? 'fa-check' : 'fa-plus'}`;
            showToast(!active ? 'تمت الإضافة إلى القائمة' : 'تمت الإزالة من القائمة');
        }));
    } catch (error) {
        overlay.querySelector('.post-list-picker-body').innerHTML = '<p class="post-list-picker-empty">تعذر تحميل القوائم.</p>';
    }
};

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
    const listsBtn = document.getElementById('dropdown-lists');
    if (!dropdown || !deleteBtn || !pinBtn || !bookmarkBtn || !quoteBtn || !reportBtn || !followBtn || !muteBtn || !blockBtn || !listsBtn) return;

    deleteBtn.style.display = isOwnPost ? 'flex' : 'none';
    pinBtn.style.display = isOwnPost ? 'flex' : 'none';
    reportBtn.style.display = isOwnPost ? 'none' : 'flex';
    followBtn.style.display = isOwnPost ? 'none' : 'flex';
    listsBtn.style.display = isOwnPost ? 'none' : 'flex';
    muteBtn.style.display = isOwnPost ? 'none' : 'flex';
    blockBtn.style.display = isOwnPost ? 'none' : 'flex';
    followBtn.innerHTML = '<i class="fas fa-user-plus"></i><span>متابعة الحساب</span>';

    setPostMenuVisible(true);
    const rect = event?.currentTarget?.getBoundingClientRect();
    if (window.matchMedia('(max-width: 760px)').matches) {
        dropdown.style.top = 'auto';
        dropdown.style.left = '0';
        dropdown.style.right = '0';
        dropdown.style.bottom = '0';
    } else if (rect) {
        dropdown.style.bottom = 'auto';
        dropdown.style.top = `${rect.bottom + 4}px`;
        const dropdownWidth = 240;
        dropdown.style.left = `${rect.left > dropdownWidth ? rect.left - dropdownWidth + rect.width : rect.left}px`;
        dropdown.style.right = 'auto';
    }

    const close = action => () => { setPostMenuVisible(false); action?.(); };
    deleteBtn.onclick = close(() => posts.deletePost(postId));
    pinBtn.onclick = close(() => posts.pinPost(postId));
    bookmarkBtn.onclick = close(() => posts.toggleBookmark(postId));
    quoteBtn.onclick = close(() => window.startQuoteTweet?.(postId));
    reportBtn.onclick = close(() => posts.reportPost(postId, userId));
    followBtn.onclick = close(() => posts.followUser(userId, { preventDefault:()=>{}, stopPropagation:()=>{} }));
    muteBtn.onclick = close(() => blockMute.muteUser(userId));
    blockBtn.onclick = close(() => blockMute.blockUser(userId).then(() => posts.loadPosts()));
    listsBtn.onclick = close(() => window.openPostListsPicker(postId, userId));
    if (!isOwnPost) {
        void (async () => {
            try {
                const [followSnap, userData] = await Promise.all([
                    get(ref(database, `followers/${userId}/${authInstance.currentUser?.uid}`)),
                    getUserData(database, userId)
                ]);
                const handle = String(userData?.handle || '').replace(/^@/, '').trim();
                const label = handle ? `@${handle}` : 'الحساب';
                followBtn.innerHTML = `<i class="fas fa-user-${followSnap.exists() ? 'minus' : 'plus'}"></i><span>${followSnap.exists() ? 'إلغاء متابعة' : 'متابعة'} ${escapeHtml(label)}</span>`;
            } catch (error) { console.warn('Post menu follow state skipped:', error); }
        })();
    }
};

// Quote post: preserve the original post reference and show a compact preview.
async function renderQuotePreview(postId) {
    const preview = document.getElementById('quote-preview');
    if (!preview) return;
    preview.hidden = false;
    preview.innerHTML = '<span>جاري تجهيز الاقتباس...</span>';
    try {
        const snapshot = await get(ref(database, `posts/${postId}`));
        if (!snapshot.exists()) throw new Error('POST_NOT_FOUND');
        const post = snapshot.val() || {};
        preview.innerHTML = `<div class="quote-preview-label">اقتباس منشور</div><div class="quote-preview-content"><strong>${escapeHtml(post.userName || 'مستخدم')}</strong><span>@${escapeHtml(post.userHandle || '')}</span>${post.content ? `<p>${parseContent(post.content)}</p>` : ''}</div><button type="button" class="quote-preview-remove" aria-label="إلغاء الاقتباس" onclick="clearQuoteTweet()"><i class="fas fa-times"></i></button>`;
    } catch (error) {
        window.clearQuoteTweet?.();
        showToast('تعذر تحميل المنشور المقتبس');
    }
}
window.clearQuoteTweet = function() {
    window.currentQuotePostId = '';
    const preview = document.getElementById('quote-preview');
    if (preview) { preview.hidden = true; preview.innerHTML = ''; }
};
window.startQuoteTweet = function startQuoteTweet(postId) {
    window.currentQuotePostId = postId;
    showHome();
    const composer = document.getElementById('postContent');
    if (!composer) return;
    composer.focus();
    composer.placeholder = 'أضف تعليقك على الاقتباس...';
    composer.dispatchEvent(new Event('input'));
    void renderQuotePreview(postId);
}

// Close post options on outside click or Escape.
document.getElementById('post-menu-backdrop')?.addEventListener('click', () => window.closePostMenu?.());
document.getElementById('post-menu-close')?.addEventListener('click', () => window.closePostMenu?.());
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('post-dropdown');
    if (dropdown && dropdown.classList.contains('open') && !dropdown.contains(e.target) && !e.target.closest('.tweet-more') && !e.target.closest('#post-menu-backdrop')) {
        window.closePostMenu?.();
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
        window.closePostMenu?.();
    }
});

// ===== Post Detail View =====

function renderDetailMedia(post) {
    const mediaItems = Array.isArray(post.media) && post.media.length
        ? post.media
        : post.imageUrl
            ? [{ type: 'image', url: post.imageUrl }]
            : post.videoUrl
                ? [{ type: 'embed', url: post.videoUrl }]
                : [];
    return mediaItems.map((media, index) => {
        const url = String(media?.url || '').trim();
        if (!url) return '';
        const safeUrl = escapeHtml(url);
        if (media.type === 'video') {
            const poster = cloudinary.getVideoPosterUrl(url, { width: 720 });
            const safePoster = poster ? ` poster="${escapeHtml(poster)}"` : '';
            return `<div class="post-detail-media"><video class="post-detail-video" controls playsinline preload="metadata"${safePoster}><source src="${safeUrl}">متصفحك لا يدعم تشغيل الفيديو.</video></div>`;
        }
        if (media.type === 'embed') {
            return `<div class="post-detail-media"><iframe src="${safeUrl}" title="فيديو المنشور" allowfullscreen loading="lazy"></iframe></div>`;
        }
        return `<div class="post-detail-media detail-image-trigger" data-detail-image-url="${safeUrl}" role="button" tabindex="0" aria-label="فتح الصورة ${index + 1}"><img src="${safeUrl}" alt="صورة المنشور" loading="lazy"></div>`;
    }).join('');
}

window.openPostDetail = async function(postId) {
    comments.unmountDetailReplyDock?.();
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
        const userHandle = userData.handle || post.userHandle || '';
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
        const commentCount = Number(post.commentCount || 0);
        const mediaHtml = renderDetailMedia(post);
        let quotedHtml = '';
        if (post.quotedPostId && post.quotedPostId !== postId) {
            try {
                const quotedSnap = await get(ref(database, `posts/${post.quotedPostId}`));
                if (quotedSnap.exists()) {
                    const quoted = quotedSnap.val() || {};
                    const quotedText = quoted.content ? `<div class="quoted-post-text">${parseContent(quoted.content)}</div>` : '';
                    const quotedAvatar = escapeHtml(String(quoted.userAvatar || DEFAULT_AVATAR));
                    const quotedHandle = escapeHtml(String(quoted.userHandle || '').replace(/^@/, ''));
                    const quotedMedia = Array.isArray(quoted.media) && quoted.media.length
                        ? quoted.media[0]
                        : quoted.imageUrl ? { type: 'image', url: quoted.imageUrl }
                            : quoted.videoUrl ? { type: 'video', url: quoted.videoUrl } : null;
                    const quotedMediaHtml = quotedMedia?.url
                        ? quotedMedia.type === 'video'
                            ? `<video class="quoted-post-video" controls playsinline preload="metadata"><source src="${escapeHtml(String(quotedMedia.url))}">متصفحك لا يدعم تشغيل الفيديو.</video>`
                            : `<img src="${escapeHtml(String(quotedMedia.url))}" alt="وسائط المنشور المقتبس" loading="lazy">`
                        : '<div class="quoted-video-placeholder"><span>وسائط غير متاحة</span></div>';
                    quotedHtml = `<div class="quoted-post-card" onclick="event.stopPropagation(); openPostDetail('${escapeHtml(post.quotedPostId)}')"><div class="quoted-post-meta"><img class="quoted-post-avatar" src="${quotedAvatar}" alt=""><div class="quoted-post-author"><strong>${escapeHtml(quoted.userName || 'مستخدم')}</strong><span>@${quotedHandle}</span></div><span class="quoted-post-time">${formatDetailTime(quoted.timestamp)}</span></div>${quotedText}${quotedMediaHtml ? `<div class="quoted-post-media">${quotedMediaHtml}</div>` : ''}</div>`;
                }
            } catch (quoteError) {
                console.warn('Quoted post unavailable:', quoteError?.message || quoteError);
            }
        }

        const editedHtml = post.edited ? '<span class="post-detail-edited">معدّل</span>' : '';
        const safeAvatar = escapeHtml(String(avatar));
        const safeUserId = escapeHtml(String(post.userId || ''));
        const safePostId = escapeHtml(String(postId));
        const safeHandle = escapeHtml(String(userHandle).replace(/^@/, ''));

        container.innerHTML = `
            <article class="post-detail" data-post-detail-id="${safePostId}">
                <div class="post-detail-header">
                    <img class="post-detail-avatar" src="${safeAvatar}" alt="" onclick="showProfile('${safeUserId}')">
                    <div class="post-detail-info">
                        <div class="post-detail-name" onclick="showProfile('${safeUserId}')">${escapeHtml(userName)}</div>
                        <div class="post-detail-handle">@${safeHandle || escapeHtml(userName).replace(/\s/g, '').toLowerCase()}</div>
                    </div>
                    ${!isOwnPost ? `<button class="follow-btn" data-follow-id="${safeUserId}" onclick="followUser('${safeUserId}', event)">متابعة</button>` : ''}
                </div>
                ${post.content ? `<div class="post-detail-content">${parseContent(post.content)}${editedHtml}</div>` : ''}
                ${quotedHtml}
                ${mediaHtml}
                <div class="post-detail-timestamp">
                    <span>${timeStr}</span><span>·</span><span>${dateStr}</span>
                    <span class="post-detail-view-label">${detailIcon('view')} ${formatDetailCount(views)} مشاهدة</span>
                </div>
                <div class="post-detail-stats" aria-label="إحصاءات المنشور">
                    ${retweets > 0 ? `<span><strong>${formatDetailCount(retweets)}</strong> إعادة نشر</span>` : ''}
                    ${likes > 0 ? `<span><strong>${formatDetailCount(likes)}</strong> إعجاب</span>` : ''}
                </div>
                <div class="post-detail-actions" aria-label="تفاعلات المنشور">
                    <button class="post-detail-action" data-comment-count-id="${safePostId}" onclick="toggleComments('${safePostId}', event)" aria-label="التعليقات">
                        ${detailIcon('comment')}<span class="detail-count comment-count">${formatDetailCount(commentCount)}</span>
                    </button>
                    <button class="post-detail-action retweet" data-retweet-id="${safePostId}" onclick="retweetPost('${safePostId}', event)" aria-label="إعادة النشر">
                        ${detailIcon('retweet')}<span class="detail-count">${formatDetailCount(retweets)}</span>
                    </button>
                    <button class="post-detail-action like ${isLiked ? 'active' : ''}" data-like-id="${safePostId}" onclick="likePost('${safePostId}', event)" aria-label="الإعجاب">
                        ${detailIcon(isLiked ? 'heartFilled' : 'heart')}<span class="detail-count">${formatDetailCount(likes)}</span>
                    </button>
                    <span class="post-detail-action post-detail-view-action" aria-label="المشاهدات">
                        ${detailIcon('view')}<span class="detail-count">${formatDetailCount(views)}</span>
                    </span>
                    <button class="post-detail-action bookmark ${isBookmarked ? 'active' : ''}" data-bookmark-id="${safePostId}" onclick="toggleBookmark('${safePostId}', event)" aria-label="الحفظ">
                        ${detailIcon(isBookmarked ? 'bookmarkFilled' : 'bookmark')}
                    </button>
                    <button class="post-detail-action share" onclick="window.openShareSheet?.('${safePostId}', event)" aria-label="مشاركة المنشور">
                        ${detailIcon('share')}
                    </button>
                </div>
            </article>
            <div id="comments-${safePostId}" class="comment-section" style="display:block;"></div>
        `;

        container.querySelectorAll('.detail-image-trigger').forEach((mediaEl) => {
            const open = () => window.openLightbox?.(mediaEl.dataset.detailImageUrl || '');
            mediaEl.addEventListener('click', open);
            mediaEl.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
            });
        });
        comments.loadComments(postId);
        comments.mountDetailReplyDock?.(postId, safeAvatar);

        if (!isOwnPost) {
            void runTransaction(ref(database, `posts/${postId}/views`), current => {
                if (typeof current !== 'number' || !Number.isFinite(current)) return;
                return current + 1;
            }).catch(() => {});
        }
    } catch (error) {
        container.innerHTML = '<div class="empty-state"><p>خطأ في التحميل</p></div>';
    }
};

window.goBackFromPost = function() {
    comments.unmountDetailReplyDock?.();
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
        // Push permission is requested only from the explicit settings toggle.

        const requiresUsername = !userData?.handle || userData.needsUsername === true;
        const requiresSuggestions = !requiresUsername && userData.needsSuggestions === true;

        hideLoading();
        showApp();
        updateSidebar(userData || {});

        // Required onboarding is a hard gate: do not render the home feed before
        // the new Google account chooses and reserves its unique @handle.
        if (requiresUsername) {
            hideAllViews();
            document.body.classList.add('mimer-onboarding-required');
            window.showUsernameOnboarding?.();
            return;
        }

        document.body.classList.remove('mimer-onboarding-required');
        showView('home');
        posts.loadPosts();
        notifications.loadNotifications();
        loadWhoToFollow();
        updateDMBadge();
        updateTrending();
        if (requiresSuggestions) {
            window.showSuggestedAccountsOnboarding?.();
        }
    } catch (error) {
        console.error('User bootstrap error (session retained):', error);
        hideLoading();
        if (authInstance.currentUser) {
            showApp();
            showToast('تعذر تحميل بعض البيانات، حاول تحديث الصفحة لاحقًا');
        } else if (window.mimerAuthStateResolved) {
            showAuth();
        }
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
    // The auth state listener is the single source of truth. Do not show the login
    // screen before Firebase has finished restoring browserLocalPersistence.
    if (window.mimerAuthStateResolved) showAuth();
    console.log('Auth boot waiting for resolved state');
} catch (error) {
    console.error('Auth boot fallback failed:', error);
    document.getElementById('auth-section').style.display = 'flex';
}


// ===== MIMER_UI_ENHANCEMENTS_V2 =====
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
        comments.unmountDetailReplyDock?.();
        originalShowHome();
        document.querySelector('.main-feed')?.scrollTo({ top: 0, behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
    window.showHelpCenter = function() {
        const modal = document.getElementById('help-center-modal');
        if (!modal) return;
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        window.setTimeout(() => document.getElementById('help-center-search')?.focus(), 80);
    };
    window.closeHelpCenter = function() {
        const modal = document.getElementById('help-center-modal');
        if (!modal) return;
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
    };
    window.filterHelpCenter = function(value = '') {
        const query = String(value).trim().toLocaleLowerCase('ar');
        document.querySelectorAll('#help-center-topics [data-help-topic]').forEach(topic => {
            const matches = !query || topic.textContent.toLocaleLowerCase('ar').includes(query);
            topic.hidden = !matches;
            if (matches && query) topic.open = true;
        });
    };
    document.getElementById('help-center-modal')?.addEventListener('click', event => {
        if (event.target.id === 'help-center-modal') window.closeHelpCenter?.();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') window.closeHelpCenter?.();
    });

    window.currentExploreSection = 'foryou';
    window.switchExploreTab = function(section, btn) {
        window.currentExploreSection = section;
        document.querySelectorAll('.explore-tab').forEach(el => el.classList.remove('active'));
        btn?.classList.add('active');
        loadExploreSections(section);
        initTabIndicators();
    };

    async function renderWhoToFollow(limit = 3) {
        try {
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
        } catch (error) {
            console.warn('Follow suggestions unavailable:', error?.message || error);
            return '';
        }
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
    window.quoteTweet = activateQuoteComposer;

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
            <div class="post-menu-sheet-header"><span class="post-menu-grabber" aria-hidden="true"></span><strong>مشاركة المنشور</strong><button type="button" class="post-menu-close" aria-label="إغلاق" onclick="closePostMenu()">×</button></div>
            <button class="dropdown-item" onclick="closePostMenu(); copyPostLink('${postId}')">${detailIcon('share')}<span>نسخ الرابط</span></button>
            <button class="dropdown-item" onclick="closePostMenu(); sendPostByDM('${postId}')">${detailIcon('comment')}<span>إرسال برسالة خاصة</span></button>
            <button class="dropdown-item" onclick="closePostMenu(); quoteTweet('${postId}')">${detailIcon('comment')}<span>اقتباس المنشور</span></button>
        `;
        setPostMenuVisible(true);
        const rect = event?.currentTarget?.getBoundingClientRect();
        if (window.matchMedia('(max-width: 760px)').matches) {
            dropdown.style.top = 'auto'; dropdown.style.left = '0'; dropdown.style.right = '0'; dropdown.style.bottom = '0';
        } else if (rect) {
            dropdown.style.bottom = 'auto'; dropdown.style.top = `${rect.bottom + 4}px`; dropdown.style.left = `${Math.max(16, rect.left - 180 + rect.width)}px`; dropdown.style.right = 'auto';
        }
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
        const result = originalShowHome();
        setActiveMobileNav('home');
        return result;
    };

    const originalShowNotifications = window.showNotifications;
    window.showNotifications = function() {
        const result = originalShowNotifications();
        setActiveMobileNav('notifications');
        return result;
    };

    const originalShowMessages = window.showMessages;
    window.showMessages = function() {
        const result = originalShowMessages();
        setActiveMobileNav('messages');
        return result;
    };

    const originalShowProfile = window.showProfile;
    window.showProfile = function(...args) {
        const result = originalShowProfile(...args);
        setActiveMobileNav('profile');
        return result;
    };

    const originalOpenSearch = window.openSearch;
    window.openSearch = function() {
        originalOpenSearch();
        setActiveMobileNav('search');
    };
})();

// ===== INSTANT POST PUBLISHING (NO TIMER) =====
// Keep the public handler connected to the real publishing flow.
// Do not replace posts.postTweet with a visual-only stub.
window.postTweet = (...args) => posts.postTweet(...args);

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
        if (!isSwiping || window.innerWidth > 768) return;
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
        const isAuthenticated = document.body.classList.contains('mimer-authenticated');
        const mobileNav = document.querySelector('.mobile-nav');
        const sidebar = document.querySelector('.sidebar');
        const rightPanel = document.querySelector('.right-panel');

        if (isMobile && isAuthenticated) {
            if (mobileNav) mobileNav.style.removeProperty('display');
            if (sidebar) sidebar.style.display = 'none';
            if (rightPanel) rightPanel.style.display = 'none';
        } else {
            if (mobileNav) mobileNav.style.setProperty('display', 'none', 'important');
            if (sidebar) sidebar.style.display = isAuthenticated ? 'flex' : 'none';
            if (rightPanel) rightPanel.style.display = 'block';
        }
    }

    window.addEventListener('resize', updateLayout);
    if (typeof MutationObserver !== 'undefined') {
        const layoutObserver = new MutationObserver(updateLayout);
        layoutObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    window.updateMimerLayout = updateLayout;
    updateLayout();
})();
