// Comments Module — Upgraded with Rate Limiting + Denormalization
import { ref, push, set, get, remove, update, runTransaction, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js?v=9';
import { getUserName, getUserData, addNotification } from './firebase-helpers.js?v=9';
import * as rateLimiter from './rate-limiter.js?v=9';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

let auth, database;
const commentListeners = new Map();

function getVisibleCommentSection(postId) {
    const sections = [...document.querySelectorAll(`[id="comments-${postId}"]`)];
    return sections.find(section => {
        let node = section;
        while (node) {
            if (getComputedStyle(node).display === 'none' || getComputedStyle(node).visibility === 'hidden') return false;
            node = node.parentElement;
        }
        return true;
    }) || sections[0] || null;
}

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

async function incrementCommentCount(postId) {
    const counterRef = ref(database, `posts/${postId}/commentCount`);
    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
            await runTransaction(counterRef, current => Math.max(0, Number(current) || 0) + 1);
            return true;
        } catch (error) {
            lastError = error;
            if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
        }
    }
    throw lastError || new Error('comment counter update failed');
}

async function decrementCommentCount(postId, amount = 1) {
    const counterRef = ref(database, `posts/${postId}/commentCount`);
    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
            await runTransaction(counterRef, current => Math.max(0, (Number(current) || 0) - amount));
            return true;
        } catch (error) {
            lastError = error;
            if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
        }
    }
    throw lastError || new Error('comment counter update failed');
}

function formatSmartCount(value) {
    const count = Math.max(0, Number(value) || 0);
    try { return new Intl.NumberFormat('ar-EG', { notation: 'compact', maximumFractionDigits: 1 }).format(count); }
    catch { return String(count); }
}

function updateCommentCounters(postId, count) {
    const formatted = formatSmartCount(count);
    document.querySelectorAll(`[data-post-id="${postId}"] .tweet-action.reply > span:last-child, [data-comment-count-id="${postId}"] .comment-count`).forEach(el => {
        el.textContent = formatted;
    });
}

async function addComment(postId, parentCommentId, event) {
    event?.preventDefault();
    event?.stopPropagation();

    const visibleSection = getVisibleCommentSection(postId);
    const inputId = `comment-input-${postId}${parentCommentId ? '-' + parentCommentId : ''}`;
    let input = visibleSection?.querySelector(`[id="${inputId}"]`);
    if (!input && !parentCommentId) {
        input = document.querySelector(`#post-detail-content [id="detail-comment-input-${postId}"]`);
    }
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;
    if (!auth.currentUser?.uid) {
        if (window.showToast) window.showToast('سجّل الدخول أولاً للتعليق');
        return;
    }

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
        try {
            await incrementCommentCount(postId);
        } catch (counterError) {
            console.warn('Comment count update delayed:', counterError);
        }

        input.value = '';

        // Record rate limit
        rateLimiter.recordAction(userId, 'comment');

        // Refresh comments immediately; notification creation must never block the interaction.
        const latestPost = await get(ref(database, `posts/${postId}`)).catch(() => null);
        updateCommentCounters(postId, latestPost?.exists() ? latestPost.val()?.commentCount : 0);
        loadComments(postId);
        void Promise.all([
            get(ref(database, `posts/${postId}`)),
            parentCommentId ? get(ref(database, `comments/${postId}/${parentCommentId}`)) : Promise.resolve(null)
        ]).then(async ([postSnap, parentSnap]) => {
            const postOwnerId = postSnap?.exists() ? postSnap.val().userId : null;
            const parentOwnerId = parentSnap?.exists() ? parentSnap.val().userId : null;
            const targetUserId = parentOwnerId && parentOwnerId !== userId ? parentOwnerId : postOwnerId;
            if (targetUserId && targetUserId !== userId) {
                const actorData = userData || await getUserData(database, userId);
                const name = actorData.name || await getUserName(database, userId);
                const text = parentOwnerId ? `رد ${name} على تعليقك` : `علّق ${name} على منشورك`;
                void addNotification(database, targetUserId, text, postId, { actorId: userId, actorName: name, actorAvatar: actorData.profilePicture || DEFAULT_AVATAR, type: parentCommentId ? 'replies' : 'comments' });
            }
        }).catch(() => {});
    } catch (error) {
        if (window.showToast) window.showToast('خطأ: ' + error.message);
    }
}

async function editComment(postId, commentId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    const uid = auth?.currentUser?.uid;
    if (!uid) { window.showToast?.('سجّل الدخول أولاً'); return false; }
    try {
        const commentSnap = await get(ref(database, `comments/${postId}/${commentId}`));
        const comment = commentSnap.exists() ? commentSnap.val() : null;
        if (!comment) { window.showToast?.('التعليق غير موجود'); return false; }
        if (comment.userId !== uid) {
            window.showToast?.('يمكنك تعديل تعليقاتك فقط');
            return false;
        }
        const currentText = String(comment.content || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        const nextText = window.prompt('تعديل التعليق:', currentText);
        if (nextText === null) return false;
        const trimmed = nextText.trim();
        if (!trimmed || trimmed === currentText.trim()) return false;
        if (trimmed.length > 500) { window.showToast?.('الحد الأقصى 500 حرف'); return false; }
        await update(ref(database, `comments/${postId}/${commentId}`), { content: escapeHtml(trimmed), edited: true, editedAt: new Date().toISOString() });
        loadComments(postId);
        window.showToast?.('تم تعديل التعليق');
        return true;
    } catch (error) {
        console.error('Edit comment error:', error);
        window.showToast?.('تعذر تعديل التعليق');
        return false;
    }
}

async function deleteComment(postId, commentId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    const uid = auth?.currentUser?.uid;
    if (!uid) { window.showToast?.('سجّل الدخول أولاً'); return false; }
    try {
        const [postSnap, commentsSnap, actorData] = await Promise.all([
            get(ref(database, `posts/${postId}`)),
            get(ref(database, `comments/${postId}`)),
            getUserData(database, uid).catch(() => ({}))
        ]);
        const post = postSnap.exists() ? postSnap.val() : null;
        const allComments = commentsSnap.exists() ? commentsSnap.val() : {};
        const target = allComments?.[commentId];
        if (!target) { window.showToast?.('التعليق غير موجود'); return false; }
        const allowed = target.userId === uid || post?.userId === uid || actorData?.isAdmin === true;
        if (!allowed) {
            window.showToast?.('لا يمكنك حذف هذا التعليق');
            return false;
        }
        const idsToDelete = [commentId, ...Object.entries(allComments).filter(([, value]) => value?.parentCommentId === commentId).map(([id]) => id)];
        await Promise.all(idsToDelete.map(id => remove(ref(database, `comments/${postId}/${id}`))));
        await decrementCommentCount(postId, idsToDelete.length);
        const latestPost = await get(ref(database, `posts/${postId}`)).catch(() => null);
        updateCommentCounters(postId, latestPost?.exists() ? latestPost.val()?.commentCount : 0);
        loadComments(postId);
        window.showToast?.('تم حذف التعليق');
        return true;
    } catch (error) {
        window.showToast?.('تعذر حذف التعليق');
        return false;
    }
}

function loadComments(postId) {
    const commentSection = getVisibleCommentSection(postId);
    if (!commentSection) return;

    // Cleanup old listener
    if (commentListeners.has(postId)) {
        commentListeners.get(postId)();
    }

    const unsub = onValue(ref(database, 'comments/' + postId), async snapshot => {
        const commentCount = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        updateCommentCounters(postId, commentCount);
        const viewerId = auth?.currentUser?.uid;
        const viewerData = viewerId ? (await getUserData(database, viewerId).catch(() => ({}))) : {};
        const postSnapshot = await get(ref(database, `posts/${postId}`)).catch(() => null);
        const postOwnerId = postSnapshot?.exists() ? postSnapshot.val()?.userId : null;
        const canModerate = Boolean(viewerId && (viewerId === postOwnerId || viewerData?.isAdmin === true));
        const viewerAvatar = escapeHtml(String(viewerData?.profilePicture || DEFAULT_AVATAR));
        const composerHtml = `<div class="comment-input-row"><img src="${viewerAvatar}" alt=""><input type="text" id="comment-input-${postId}" placeholder="أضف ردًا إلى المحادثة..." onkeydown="if(event.key==='Enter')addComment('${postId}',null,event)"><button type="button" onclick="addComment('${postId}',null,event)" aria-label="إرسال الرد">إرسال</button></div>`;

        // Keep the card and detail counters synchronized with the live comments snapshot.
        updateCommentCounters(postId, commentCount);

        if (!snapshot.exists()) {
            commentSection.innerHTML = `<div class="comment-section-header"><strong>الردود</strong><span>لا توجد ردود بعد</span></div>${composerHtml}<div class="comments-empty">كن أول من يشارك في المحادثة.</div>`;
            return;
        }

        const comments = [];
        snapshot.forEach(child => {
            comments.push({ id: child.key, ...child.val() });
        });

        const topLevel = comments.filter(c => !c.parentCommentId).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        let commentsHtml = `<div class="comment-section-header"><strong>الردود</strong><span>${formatSmartCount(commentCount)} ${commentCount === 1 ? 'رد' : 'ردود'}</span></div>${composerHtml}`;

        for (const comment of topLevel) {
            // Use denormalized data if available
            const name = comment.userName || 'مستخدم';
            const avatar = escapeHtml(String(comment.userAvatar || DEFAULT_AVATAR));
            const safeCommentId = escapeHtml(String(comment.id));
            const replies = comments.filter(c => c.parentCommentId === comment.id).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            commentsHtml += `
                <article class="comment" data-comment-id="${safeCommentId}">
                    <img class="comment-avatar" src="${avatar}" alt="">
                    <div class="comment-body">
                        <div class="comment-meta"><span class="name">${escapeHtml(name)}</span><span class="time">${formatCommentTime(comment.timestamp)}</span></div>
                        <div class="comment-text">${escapeHtml(comment.content)}${comment.edited ? ' <span class="comment-edited">(معدّل)</span>' : ''}</div>
                        <div class="comment-actions"><button type="button" class="comment-reply-btn" onclick="showCommentReplyInput('${postId}','${safeCommentId}',event)">رد</button>${comment.userId === viewerId ? `<button type="button" class="comment-edit-btn" onclick="editComment('${postId}','${safeCommentId}',event)">تعديل</button>` : ''}${(canModerate || comment.userId === viewerId) ? `<button type="button" class="comment-delete-btn" onclick="deleteComment('${postId}','${safeCommentId}',event)">حذف</button>` : ''}${replies.length ? `<span class="comment-replies-count">${formatSmartCount(replies.length)} ${replies.length === 1 ? 'رد' : 'ردود'}</span>` : ''}</div>
                        <div class="comment-reply-input" id="comment-reply-${postId}-${safeCommentId}" hidden>
                            <input type="text" id="comment-input-${postId}-${safeCommentId}" placeholder="اكتب ردًا..." onkeydown="if(event.key==='Enter')addComment('${postId}','${safeCommentId}',event)">
                            <button type="button" class="follow-btn" onclick="addComment('${postId}','${safeCommentId}',event)">إرسال</button>
                        </div>
                    </div>
                </article>
            `;

            for (const reply of replies) {
                const replyName = reply.userName || 'مستخدم';
                const replyAvatar = escapeHtml(String(reply.userAvatar || DEFAULT_AVATAR));
                commentsHtml += `
                    <article class="comment reply" data-comment-id="${escapeHtml(String(reply.id))}">
                        <img class="comment-avatar" src="${replyAvatar}" alt="">
                        <div class="comment-body">
                            <div class="comment-meta"><span class="name">${escapeHtml(replyName)}</span><span class="time">${formatCommentTime(reply.timestamp)}</span></div>
                            <div class="comment-text">${escapeHtml(reply.content)}${reply.edited ? ' <span class="comment-edited">(معدّل)</span>' : ''}</div>
                            ${(reply.userId === viewerId || canModerate) ? `<div class="comment-actions">${reply.userId === viewerId ? `<button type="button" class="comment-edit-btn" onclick="editComment('${postId}','${escapeHtml(String(reply.id))}',event)">تعديل</button>` : ''}<button type="button" class="comment-delete-btn" onclick="deleteComment('${postId}','${escapeHtml(String(reply.id))}',event)">حذف</button></div>` : ''}
                        </div>
                    </article>
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

function showCommentReplyInput(postId, commentId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    const section = getVisibleCommentSection(postId);
    if (!section) return;
    section.querySelectorAll('.comment-reply-input').forEach(input => { input.hidden = true; });
    const replyBox = section.querySelector(`[id="comment-reply-${postId}-${commentId}"]`);
    if (replyBox) {
        replyBox.hidden = false;
        replyBox.querySelector('input')?.focus();
    }
}

function toggleComments(postId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    const section = getVisibleCommentSection(postId);
    if (section) {
        const isHidden = section.style.display === 'none';
        section.style.display = isHidden ? 'block' : 'none';
        if (isHidden) loadComments(postId);
    }
}

export { init, addComment, editComment, deleteComment, loadComments, toggleComments, showCommentReplyInput };
