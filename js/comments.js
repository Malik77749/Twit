// Comments Module — Upgraded with Rate Limiting + Denormalization
import { ref, push, set, get, update, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js?v=3';
import { getUserName, getUserData, addNotification } from './firebase-helpers.js?v=3';
import * as rateLimiter from './rate-limiter.js?v=3';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

let auth, database;
const commentListeners = new Map();

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

async function addComment(postId, parentCommentId, event) {
    event?.preventDefault();
    event?.stopPropagation();

    const inputId = `comment-input-${postId}${parentCommentId ? '-' + parentCommentId : ''}`;
    const input = document.getElementById(inputId);
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    // Character limit
    if (text.length > 500) {
        if (window.showToast) window.showToast('الحد الأقصى 500 حرف');
        return;
    }

    // Rate limit check
    const userId = auth.currentUser.uid;
    const limitCheck = rateLimiter.checkLimit(userId, 'comment');
    if (!limitCheck.allowed) {
        rateLimiter.showRateLimitToast(limitCheck.reason);
        rateLimiter.disableWithCooldown(input.parentElement?.querySelector('button'), limitCheck.waitMs);
        return;
    }

    try {
        // Denormalize: store user data with comment
        const userData = await getUserData(database, userId);

        await set(push(ref(database, 'comments/' + postId)), {
            userId: userId,
            userName: userData.name || 'مستخدم',
            userAvatar: userData.profilePicture || DEFAULT_AVATAR,
            content: escapeHtml(text),
            timestamp: new Date().toISOString(),
            parentCommentId: parentCommentId
        });

        input.value = '';

        // Record rate limit
        rateLimiter.recordAction(userId, 'comment');

        // Update comment count on post
        const postRef = ref(database, `posts/${postId}`);
        const postSnap = await get(postRef);
        if (postSnap.exists()) {
            const currentCount = postSnap.val().commentCount || 0;
            await update(postRef, { commentCount: currentCount + 1 });

            // Send notification
            if (postSnap.val().userId !== userId) {
                const name = userData.name || await getUserName(database, userId);
                await addNotification(database, postSnap.val().userId, `رد ${name} على منشورك`, postId);
            }
        }

        loadComments(postId);
    } catch (error) {
        if (window.showToast) window.showToast('خطأ: ' + error.message);
    }
}

function loadComments(postId) {
    const commentSection = document.getElementById(`comments-${postId}`);
    if (!commentSection) return;

    // Cleanup old listener
    if (commentListeners.has(postId)) {
        commentListeners.get(postId)();
    }

    const unsub = onValue(ref(database, 'comments/' + postId), async snapshot => {
        const commentCount = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;

        // Update comment count in tweet actions
        document.querySelectorAll(`[data-post-id="${postId}"] .tweet-action.reply span:last-child`).forEach(el => {
            el.textContent = commentCount;
        });

        if (!snapshot.exists()) {
            commentSection.innerHTML = `
                <div class="comment-input-row">
                    <img src="${DEFAULT_AVATAR}" alt="">
                    <input type="text" id="comment-input-${postId}" placeholder="أضف تعليقاً..." onkeydown="if(event.key==='Enter')addComment('${postId}',null,event)">
                </div>
            `;
            return;
        }

        const comments = [];
        snapshot.forEach(child => {
            comments.push({ id: child.key, ...child.val() });
        });

        const topLevel = comments.filter(c => !c.parentCommentId).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        let commentsHtml = `
            <div class="comment-input-row">
                <img src="${DEFAULT_AVATAR}" alt="">
                <input type="text" id="comment-input-${postId}" placeholder="أضف تعليقاً..." onkeydown="if(event.key==='Enter')addComment('${postId}',null,event)">
            </div>
        `;

        for (const comment of topLevel) {
            // Use denormalized data if available
            const name = comment.userName || 'مستخدم';
            const avatar = comment.userAvatar || DEFAULT_AVATAR;

            commentsHtml += `
                <div class="comment">
                    <img src="${avatar}" alt="">
                    <div class="comment-body">
                        <div class="comment-meta">
                            <span class="name">${escapeHtml(name)}</span>
                            <span class="time">${formatCommentTime(comment.timestamp)}</span>
                        </div>
                        <div class="comment-text">${escapeHtml(comment.content)}</div>
                    </div>
                </div>
            `;

            // Replies
            const replies = comments.filter(c => c.parentCommentId === comment.id).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            for (const reply of replies) {
                const replyName = reply.userName || 'مستخدم';
                const replyAvatar = reply.userAvatar || DEFAULT_AVATAR;

                commentsHtml += `
                    <div class="comment reply">
                        <img src="${replyAvatar}" alt="">
                        <div class="comment-body">
                            <div class="comment-meta">
                                <span class="name">${escapeHtml(replyName)}</span>
                                <span class="time">${formatCommentTime(reply.timestamp)}</span>
                            </div>
                            <div class="comment-text">${escapeHtml(reply.content)}</div>
                        </div>
                    </div>
                `;
            }
        }

        commentSection.innerHTML = commentsHtml;
    });

    commentListeners.set(postId, unsub);
}

function formatCommentTime(timestamp) {
    const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `${Math.floor(diff / 60)}د`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}س`;
    return `${Math.floor(diff / 86400)}ي`;
}

function toggleComments(postId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    const section = document.getElementById(`comments-${postId}`);
    if (section) {
        const isHidden = section.style.display === 'none';
        section.style.display = isHidden ? 'block' : 'none';
        if (isHidden) loadComments(postId);
    }
}

export { init, addComment, loadComments, toggleComments };
