// Comments Module
import { ref, push, set, get, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js';
import { getUserName, getUserData, addNotification } from './firebase-helpers.js';

let auth, database;
const commentCooldowns = new Map();
const commentListeners = new Map();

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

async function addComment(postId, parentCommentId, event) {
    event?.preventDefault();
    event?.stopPropagation();

    const input = document.getElementById(`comment-input-${postId}${parentCommentId ? '-' + parentCommentId : ''}`);
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    const cooldownKey = `${postId}-${parentCommentId || 'root'}-${auth.currentUser.uid}`;
    const now = Date.now();
    if (commentCooldowns.has(cooldownKey) && now - commentCooldowns.get(cooldownKey) < 5000) {
        return;
    }

    try {
        await set(push(ref(database, 'comments/' + postId)), {
            userId: auth.currentUser.uid,
            content: escapeHtml(text),
            timestamp: new Date().toISOString(),
            parentCommentId: parentCommentId
        });
        input.value = '';

        const postSnapshot = await get(ref(database, 'posts/' + postId));
        if (postSnapshot.exists() && postSnapshot.val().userId !== auth.currentUser.uid) {
            const name = await getUserName(database, auth.currentUser.uid);
            await addNotification(database, postSnapshot.val().userId, `رد ${name} على منشورك`, postId);
        }

        commentCooldowns.set(cooldownKey, now);
        loadComments(postId);
    } catch (error) {
        alert('خطأ: ' + error.message);
    }
}

function loadComments(postId) {
    const commentSection = document.getElementById(`comments-${postId}`);
    if (!commentSection) return;

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
                    <img src="https://via.placeholder.com/32" alt="">
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
                <img src="https://via.placeholder.com/32" alt="">
                <input type="text" id="comment-input-${postId}" placeholder="أضف تعليقاً..." onkeydown="if(event.key==='Enter')addComment('${postId}',null,event)">
            </div>
        `;

        for (const comment of topLevel) {
            const userData = await getUserData(database, comment.userId);
            const name = userData.name || 'مستخدم';
            const avatar = userData.profilePicture || 'https://via.placeholder.com/32';

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
                const replyUser = await getUserData(database, reply.userId);
                commentsHtml += `
                    <div class="comment reply">
                        <img src="${replyUser.profilePicture || 'https://via.placeholder.com/32'}" alt="">
                        <div class="comment-body">
                            <div class="comment-meta">
                                <span class="name">${escapeHtml(replyUser.name || 'مستخدم')}</span>
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
