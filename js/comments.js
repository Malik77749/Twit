// Comments Module
import { ref, push, set, get, update, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml, formatTimestamp } from './utils.js';
import { getUserName, getUserData, addNotification } from './firebase-helpers.js';

let auth, database;
const commentCooldowns = new Map();
const commentListeners = new Map();

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Add a comment or reply to a post
 */
async function addComment(postId, parentCommentId, event) {
    event.preventDefault();
    event.stopPropagation();

    const commentInput = document.getElementById(`comment-input-${postId}${parentCommentId ? '-' + parentCommentId : ''}`);
    const commentButton = commentInput?.nextElementSibling;

    if (!commentInput) {
        alert('خطأ: حقل التعليق غير موجود');
        return;
    }

    const commentText = commentInput.value.trim();
    if (!commentText) {
        alert('يرجى كتابة تعليق');
        return;
    }

    // Cooldown check (5 seconds)
    const cooldownKey = `${postId}-${parentCommentId || 'root'}-${auth.currentUser.uid}`;
    const now = Date.now();
    if (commentCooldowns.has(cooldownKey) && now - commentCooldowns.get(cooldownKey) < 5000) {
        alert('يرجى الانتظار قليلاً قبل إضافة تعليق آخر');
        return;
    }

    if (commentButton) commentButton.disabled = true;

    try {
        const commentData = {
            userId: auth.currentUser.uid,
            content: escapeHtml(commentText),
            timestamp: new Date().toISOString(),
            parentCommentId: parentCommentId
        };

        const commentRef = push(ref(database, 'comments/' + postId));
        await set(commentRef, commentData);
        commentInput.value = '';

        // Notify post owner
        const postSnapshot = await get(ref(database, 'posts/' + postId));
        if (postSnapshot.exists() && postSnapshot.val().userId !== auth.currentUser.uid) {
            const commenterName = await getUserName(database, auth.currentUser.uid);
            await addNotification(database, postSnapshot.val().userId, `قام ${commenterName} بالرد على منشورك`, postId);
        }

        commentCooldowns.set(cooldownKey, now);
        loadComments(postId);
    } catch (error) {
        alert('خطأ أثناء إضافة التعليق: ' + error.message);
    } finally {
        if (commentButton) commentButton.disabled = false;
    }
}

/**
 * Load all comments for a post (with real-time updates)
 */
function loadComments(postId) {
    const commentList = document.getElementById(`comment-list-${postId}`);
    if (!commentList) return;

    // Unsubscribe previous listener for this post to prevent memory leak
    if (commentListeners.has(postId)) {
        commentListeners.get(postId)();
    }

    const unsub = onValue(ref(database, 'comments/' + postId), async snapshot => {
        commentList.innerHTML = '';

        // Update comment count on buttons
        const commentCount = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        document.querySelectorAll(`button[onclick="toggleComments('${postId}', event)"]`).forEach(button => {
            button.innerHTML = `<i class="far fa-comment"></i> ${commentCount}`;
        });

        if (!snapshot.exists()) return;

        const comments = [];
        snapshot.forEach(child => {
            comments.push({ id: child.key, ...child.val() });
        });

        const topLevelComments = comments
            .filter(c => !c.parentCommentId)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        for (const comment of topLevelComments) {
            const userData = await getUserData(database, comment.userId);
            const userName = userData.name || `مستخدم ${comment.userId.slice(0, 8)}`;
            const profilePicture = userData.profilePicture || 'https://via.placeholder.com/48';
            const commentElement = document.createElement('div');
            commentElement.className = 'comment';
            commentElement.innerHTML = `
                <div class="post-header">
                    <img src="${profilePicture}" alt="Avatar" style="width: 32px; height: 32px;" onclick="showProfile('${comment.userId}')">
                    <span>${escapeHtml(userName)}</span>
                    <span class="timestamp">${formatTimestamp(comment.timestamp)}</span>
                </div>
                <p>${escapeHtml(comment.content)}</p>
                <button class="btn btn-link btn-sm" onclick="toggleReplyInput('${postId}', '${comment.id}', event)">رد</button>
                <div id="reply-input-${postId}-${comment.id}" style="display: none;">
                    <textarea id="comment-input-${postId}-${comment.id}" class="form-control mb-2" placeholder="أضف ردًا"></textarea>
                    <button class="btn btn-primary btn-sm" onclick="addComment('${postId}', '${comment.id}', event)">إرسال</button>
                </div>
                <div id="replies-${postId}-${comment.id}"></div>
            `;
            commentList.appendChild(commentElement);
            await loadReplies(postId, comment.id, comments);
        }
    });
    commentListeners.set(postId, unsub);
}

/**
 * Load replies for a specific comment
 */
async function loadReplies(postId, parentCommentId, allComments) {
    const repliesContainer = document.getElementById(`replies-${postId}-${parentCommentId}`);
    if (!repliesContainer) return;

    const replies = allComments
        .filter(c => c.parentCommentId === parentCommentId)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    for (const reply of replies) {
        const userData = await getUserData(database, reply.userId);
        const userName = userData.name || `مستخدم ${reply.userId.slice(0, 8)}`;
        const profilePicture = userData.profilePicture || 'https://via.placeholder.com/48';
        const replyElement = document.createElement('div');
        replyElement.className = 'comment reply';
        replyElement.innerHTML = `
            <div class="post-header">
                <img src="${profilePicture}" alt="Avatar" style="width: 32px; height: 32px;" onclick="showProfile('${reply.userId}')">
                <span>${escapeHtml(userName)}</span>
                <span class="timestamp">${formatTimestamp(reply.timestamp)}</span>
            </div>
            <p>${escapeHtml(reply.content)}</p>
            <button class="btn btn-link btn-sm" onclick="toggleReplyInput('${postId}', '${reply.id}', event)">رد</button>
            <div id="reply-input-${postId}-${reply.id}" style="display: none;">
                <textarea id="comment-input-${postId}-${reply.id}" class="form-control mb-2" placeholder="أضف ردًا"></textarea>
                <button class="btn btn-primary btn-sm" onclick="addComment('${postId}', '${reply.id}', event)">إرسال</button>
            </div>
            <div id="replies-${postId}-${reply.id}"></div>
        `;
        repliesContainer.appendChild(replyElement);
        await loadReplies(postId, reply.id, allComments);
    }
}

/**
 * Toggle reply input visibility
 */
function toggleReplyInput(postId, commentId, event) {
    event.preventDefault();
    event.stopPropagation();
    const replyInput = document.getElementById(`reply-input-${postId}-${commentId}`);
    if (replyInput) {
        replyInput.style.display = replyInput.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * Toggle comment section visibility
 */
function toggleComments(postId, event) {
    event.preventDefault();
    event.stopPropagation();
    const commentSection = document.getElementById(`comments-${postId}`);
    if (commentSection) {
        commentSection.style.display = commentSection.style.display === 'none' ? 'block' : 'none';
    }
}

export { init, addComment, loadComments, toggleReplyInput, toggleComments };
