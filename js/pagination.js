// Pagination Module — Infinite Scroll
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const PAGE_SIZE = 15;
let isLoadingMore = false;
let hasMorePosts = true;
let oldestTimestamp = null;
let allLoadedPosts = new Set();
let scrollHandler = null;
let renderMoreCallback = null;
let databaseRef = null;

/**
 * Initialize infinite scroll on the main feed
 */
function initInfiniteScroll(containerSelector, database, renderCallback) {
    const container = document.querySelector(containerSelector || '.main-feed');
    if (!container) return;

    // Store references for scroll handler
    databaseRef = database;
    renderMoreCallback = renderCallback;

    // Remove old handler if exists
    if (scrollHandler) {
        container.removeEventListener('scroll', scrollHandler);
    }

    scrollHandler = async () => {
        if (isLoadingMore || !hasMorePosts) return;

        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;

        // Trigger when user is within 300px of bottom
        if (scrollHeight - scrollTop - clientHeight < 300) {
            await loadMorePosts();
        }
    };

    container.addEventListener('scroll', scrollHandler, { passive: true });

    // Also handle window scroll for desktop
    const windowScrollHandler = async () => {
        if (isLoadingMore || !hasMorePosts) return;

        const scrollY = window.scrollY || window.pageYOffset;
        const windowHeight = window.innerHeight;
        const docHeight = document.documentElement.scrollHeight;

        if (docHeight - scrollY - windowHeight < 400) {
            await loadMorePosts();
        }
    };

    window.addEventListener('scroll', windowScrollHandler, { passive: true });
}

/**
 * Reset pagination state (call when switching feeds)
 */
function resetPagination() {
    isLoadingMore = false;
    hasMorePosts = true;
    oldestTimestamp = null;
    allLoadedPosts.clear();
}

/**
 * Load first page of posts (used by loadPosts)
 */
async function loadFirstPage(database, renderCallback) {
    resetPagination();

    const postsDiv = document.getElementById('posts');
    if (!postsDiv) return [];

    try {
        // Fetch all posts (no index needed) and sort client-side
        const snapshot = await get(ref(database, 'posts'));
        const posts = [];

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const post = { id: child.key, ...child.val() };
                posts.push(post);
                allLoadedPosts.add(child.key);
            });
        }

        // Sort newest first
        posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Take first page only
        const page = posts.slice(0, PAGE_SIZE);

        if (page.length > 0) {
            oldestTimestamp = page[page.length - 1].timestamp;
        }

        // Check if there might be more
        if (posts.length <= PAGE_SIZE) {
            hasMorePosts = false;
        }

        return page;
    } catch (error) {
        console.error('Pagination error (first page):', error);
        // Non-blocking: return empty but don't break the feed
        return [];
    }
}

/**
 * Load next page of posts (triggered by scroll)
 */
async function loadMorePosts() {
    if (isLoadingMore || !hasMorePosts || !oldestTimestamp || !databaseRef || !renderMoreCallback) return;

    isLoadingMore = true;
    showLoadMoreIndicator();

    try {
        // Fetch all posts and filter out already loaded ones
        const snapshot = await get(ref(database, 'posts'));
        const posts = [];

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                if (!allLoadedPosts.has(child.key)) {
                    const post = { id: child.key, ...child.val() };
                    posts.push(post);
                    allLoadedPosts.add(child.key);
                }
            });
        }

        // Sort newest first
        posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Take next page
        const page = posts.slice(0, PAGE_SIZE);

        if (page.length > 0) {
            oldestTimestamp = page[page.length - 1].timestamp;
            await renderMoreCallback(page);
        }

        if (posts.length <= PAGE_SIZE) {
            hasMorePosts = false;
            showEndOfFeed();
        }
    } catch (error) {
        console.error('Pagination error (load more):', error);
    } finally {
        isLoadingMore = false;
        hideLoadMoreIndicator();
    }
}

/**
 * Show loading indicator at bottom of feed
 */
function showLoadMoreIndicator() {
    let indicator = document.getElementById('load-more-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'load-more-indicator';
        indicator.className = 'load-more-indicator';
        indicator.innerHTML = '<div class="spinner"></div>';
        const postsDiv = document.getElementById('posts');
        if (postsDiv) postsDiv.appendChild(indicator);
    }
    indicator.style.display = 'flex';
}

function hideLoadMoreIndicator() {
    const indicator = document.getElementById('load-more-indicator');
    if (indicator) indicator.style.display = 'none';
}

function showEndOfFeed() {
    let indicator = document.getElementById('load-more-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'load-more-indicator';
        const postsDiv = document.getElementById('posts');
        if (postsDiv) postsDiv.appendChild(indicator);
    }
    indicator.innerHTML = '<div class="end-of-feed">وصلت لنهاية الـ Feed</div>';
    indicator.style.display = 'flex';
}

/**
 * Check if currently loading
 */
function isLoading() {
    return isLoadingMore;
}

/**
 * Check if there are more posts
 */
function hasMore() {
    return hasMorePosts;
}

export {
    initInfiniteScroll,
    resetPagination,
    loadFirstPage,
    loadMorePosts,
    isLoading,
    hasMore,
    PAGE_SIZE
};
