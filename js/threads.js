// Threads Module — Tweet Threads (like X)
import { ref, push, set, get, update } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js?v=3';
import { getUserData } from './firebase-helpers.js?v=3';

let auth, database;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Create a thread (multiple connected posts)
 */
async function createThread(postsArray) {
    const userId = auth.currentUser?.uid;
    if (!userId || !postsArray.length) return null;

    const userData = await getUserData(database, userId);
    const threadId = push(ref(database, 'threads')).key;
    const postIds = [];

    try {
        for (let i = 0; i < postsArray.length; i++) {
            const postRef = push(ref(database, 'posts'));
            const postData = {
                userId: userId,
                userName: userData.name || 'مستخدم',
                userAvatar: userData.profilePicture || '',
                content: escapeHtml(postsArray[i]),
                timestamp: new Date(Date.now() + i * 1000).toISOString(), // Slight offset for ordering
                likes: 0,
                retweets: 0,
                views: 0,
                commentCount: 0,
                edited: false,
                threadId: threadId,
                threadIndex: i,
                threadTotal: postsArray.length
            };

            await set(postRef, postData);
            postIds.push(postRef.key);
        }

        // Store thread metadata
        await set(ref(database, `threads/${threadId}`), {
            userId: userId,
            postIds: postIds,
            createdAt: new Date().toISOString(),
            totalPosts: postsArray.length
        });

        return { threadId, postIds };
    } catch (error) {
        console.error('Create thread error:', error);
        return null;
    }
}

/**
 * Get thread posts
 */
async function getThreadPosts(threadId) {
    try {
        const snapshot = await get(ref(database, `threads/${threadId}`));
        if (!snapshot.exists()) return [];

        const threadData = snapshot.val();
        const posts = [];

        for (const postId of threadData.postIds) {
            const postSnap = await get(ref(database, `posts/${postId}`));
            if (postSnap.exists()) {
                posts.push({ id: postId, ...postSnap.val() });
            }
        }

        return posts;
    } catch (error) {
        return [];
    }
}

/**
 * Render thread indicator
 */
function renderThreadIndicator(post) {
    if (!post.threadId) return '';

    const isStart = post.threadIndex === 0;
    const isEnd = post.threadIndex === post.threadTotal - 1;

    return `
        <div class="thread-indicator">
            ${!isStart ? '<div class="thread-line thread-line-top"></div>' : ''}
            <div class="thread-dot"></div>
            ${!isEnd ? '<div class="thread-line thread-line-bottom"></div>' : ''}
        </div>
    `;
}

/**
 * Render thread "Show this thread" link
 */
function renderThreadLink(threadId, totalPosts) {
    return `
        <div class="thread-link" onclick="showThread('${threadId}')">
            <span>عرض السلسلة (${totalPosts} منشورات)</span>
        </div>
    `;
}

export {
    init,
    createThread,
    getThreadPosts,
    renderThreadIndicator,
    renderThreadLink
};
