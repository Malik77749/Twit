// Comments Module — Upgraded with Fixed Detail Reply Composer
import { ref, push, set, get, remove, update, runTransaction, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js?v=9';
import { getUserName, getUserData, addNotification } from './firebase-helpers.js?v=9';
import * as rateLimiter from './rate-limiter.js?v=10';

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

async function toggleCommentLike(postId, commentId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    const uid = auth?.currentUser?.uid;
    if (!uid) { window.showToast?.('سجّل الدخول أولاً'); return false; }
    const likeRef = ref(database, `commentLikes/${postId}/${commentId}/${uid}`);
    try {
        const tx = await runTransaction(likeRef, current => current ? null : { timestamp: new Date().toISOString() });
        const liked = tx.snapshot.exists();
        const countTx = await runTransaction(ref(database, `comments/${postId}/${commentId}/likeCount`), current => Math.max(0, Number(current) || 0) + (liked ? 1 : -1));
        const count = Number(countTx.snapshot.val() || 0);
        document.querySelectorAll(`[data-comment-like-id="${commentId}"]`).forEach(button => {
            button.classList.toggle('active', liked);
            const countEl = button.querySelector('.comment-like-count');
            if (countEl) countEl.textContent = formatSmartCount(count);
            const icon = button.querySelector('i');
            if (icon) icon.className = `${liked ? 'fas' : 'far'} fa-heart`;
        });
        return liked;
    } catch (error) {
        console.error('Comment like error:', error);
        window.showToast?.('تعذر تحديث الإعجاب');
        return false;
    }
}

function closeCommentOptions() {
    const overlay = document.getElementById('comment-options-backdrop');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.classList.remove('comment-options-open');
    setTimeout(() => overlay.remove(), 180);
}

async function openCommentOptions(postId, commentId, commentOwnerId, canModerate, event) {
    event?.preventDefault();
    event?.stopPropagation();
    closeCommentOptions();
    const uid = auth?.currentUser?.uid;
    if (!uid) { window.showToast?.('سجّل الدخول أولاً'); return; }
    const overlay = document.createElement('div');
    overlay.id = 'comment-options-backdrop';
    overlay.className = 'comment-options-backdrop';
    overlay.innerHTML = `<section class="comment-options-sheet" role="dialog" aria-modal="true" aria-label="خيارات التعليق"><div class="comment-options-header"><span class="comment-options-grabber" aria-hidden="true"></span><strong>خيارات التعليق</strong><button type="button" class="comment-options-close" aria-label="إغلاق">×</button></div><div class="comment-options-body"><div class="comment-options-loading">جاري تحميل الخيارات…</div></div></section>`;
    document.body.appendChild(overlay);
    document.body.classList.add('comment-options-open');
    overlay.querySelector('.comment-options-close')?.addEventListener('click', closeCommentOptions);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeCommentOptions(); });
    requestAnimationFrame(() => overlay.classList.add('open'));
    try {
        const commentSnap = await get(ref(database, `comments/${postId}/${commentId}`));
        if (!commentSnap.exists()) { closeCommentOptions(); window.showToast?.('التعليق غير موجود'); return; }
        const comment = commentSnap.val() || {};
        const isOwner = comment.userId === uid;
        const canDelete = isOwner || Boolean(canModerate);
        const body = overlay.querySelector('.comment-options-body');
        if (!body) return;
        body.innerHTML = `${isOwner ? '<button type="button" class="comment-option-row" data-option="edit"><i class="fas fa-pen"></i><span>تعديل التعليق</span></button>' : ''}${canDelete ? '<button type="button" class="comment-option-row danger" data-option="delete"><i class="fas fa-trash"></i><span>حذف التعليق</span></button>' : ''}<button type="button" class="comment-option-row" data-option="reply"><i class="far fa-comment-dots"></i><span>الرد على التعليق</span></button><button type="button" class="comment-option-row" data-option="copy"><i class="far fa-copy"></i><span>نسخ نص التعليق</span></button><button type="button" class="comment-option-row" data-option="share"><i class="fas fa-share-nodes"></i><span>مشاركة التعليق</span></button>${!isOwner ? '<button type="button" class="comment-option-row" data-option="report"><i class="far fa-flag"></i><span>الإبلاغ عن التعليق</span></button>' : ''}`;
        body.querySelector('[data-option="edit"]')?.addEventListener('click', () => { closeCommentOptions(); editComment(postId, commentId); });
        body.querySelector('[data-option="delete"]')?.addEventListener('click', () => { closeCommentOptions(); deleteComment(postId, commentId); });
        body.querySelector('[data-option="reply"]')?.addEventListener('click', () => { closeCommentOptions(); showCommentReplyInput(postId, commentId); });
        body.querySelector('[data-option="copy"]')?.addEventListener('click', async () => { await navigator.clipboard?.writeText(String(comment.content || '')); closeCommentOptions(); window.showToast?.('تم نسخ نص التعليق'); });
        body.querySelector('[data-option="share"]')?.addEventListener('click', async () => { const url = `${window.location.origin}${window.location.pathname}#post/${postId}?comment=${commentId}`; if (navigator.share) await navigator.share({ title: 'تعليق على ميمر', text: String(comment.content || ''), url }); else await navigator.clipboard?.writeText(url); closeCommentOptions(); window.showToast?.(navigator.share ? 'تمت المشاركة' : 'تم نسخ رابط التعليق'); });
        body.querySelector('[data-option="report"]')?.addEventListener('click', async () => { closeCommentOptions(); await reportComment(postId, commentId); });
    } catch (error) {
        console.error('Comment options error:', error);
        closeCommentOptions();
        window.showToast?.('تعذر تحميل خيارات التعليق');
    }
}

async function reportComment(postId, commentId) {
    const uid = auth?.currentUser?.uid;
    if (!uid) return false;
    try {
        await set(push(ref(database, 'reports')), { postId, commentId, reporterId: uid, type: 'comment', reason: 'إبلاغ عن تعليق', status: 'pending', timestamp: new Date().toISOString() });
        window.showToast?.('تم إرسال البلاغ إلى الإدارة');
        return true;
    } catch (error) {
        window.showToast?.('تعذر إرسال البلاغ');
        return false;
    }
}

function formatSmartCount(value) {
    const count = Math.max(0, Number(value) || 0);
    try { return new Intl.NumberFormat('ar-EG', { notation: 'compact', maximumFractionDigits: 1 }).format(count); }
    catch { return String(count); }
}

function unmountDetailReplyDock() {
    const dock = document.getElementById('detail-reply-dock');
    dock?.remove();
    document.body.classList.remove('detail-reply-open');
}

function mountDetailReplyDock(postId, avatar) {
    unmountDetailReplyDock();
    const host = document.body;
    if (!host) return;
    const dock = document.createElement('div');
    dock.id = 'detail-reply-dock';
    dock.className = 'detail-reply-dock';
    dock.dataset.postId = postId;
    dock.innerHTML = `<div class="detail-reply-context" hidden><span class="detail-reply-context-text">الرد على التعليق</span><button type="button" class="detail-reply-cancel" aria-label="إلغاء الرد">×</button></div><div class="detail-reply-row"><img class="detail-reply-avatar" src="${escapeHtml(String(avatar || DEFAULT_AVATAR))}" alt=""><button type="button" class="detail-reply-tool" data-tool="expand" aria-label="توسيع مربع الرد"><i class="fas fa-expand"></i></button><textarea class="detail-reply-input" rows="1" maxlength="500" placeholder="أنشر ردك…" aria-label="اكتب ردك"></textarea><button type="button" class="detail-reply-tool detail-reply-gif" data-tool="gif" aria-label="إضافة GIF">GIF</button><button type="button" class="detail-reply-tool" data-tool="media" aria-label="إضافة صورة"><i class="far fa-image"></i></button><button type="button" class="detail-reply-send" aria-label="إرسال الرد"><i class="fas fa-paper-plane"></i></button></div>`;
    host.appendChild(dock);
    document.body.classList.add('detail-reply-open');
    const input = dock.querySelector('.detail-reply-input');
    const context = dock.querySelector('.detail-reply-context');
    const contextText = dock.querySelector('.detail-reply-context-text');
    dock.querySelector('.detail-reply-send')?.addEventListener('click', event => addComment(postId, dock.dataset.replyTo || null, event));
    input?.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); addComment(postId, dock.dataset.replyTo || null, event); } });
    input?.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 130)}px`; });
    dock.querySelector('[data-tool="expand"]')?.addEventListener('click', () => { dock.classList.toggle('expanded'); input?.focus(); });
    dock.querySelector('[data-tool="gif"]')?.addEventListener('click', () => window.showToast?.('إضافة GIF للتعليق ستكون متاحة قريبًا'));
    dock.querySelector('[data-tool="media"]')?.addEventListener('click', () => window.showToast?.('الوسائط في التعليقات ستكون متاحة قريبًا'));
    dock.querySelector('.detail-reply-cancel')?.addEventListener('click', () => { delete dock.dataset.replyTo; context.hidden = true; input.placeholder = 'أنشر ردك…'; input.focus(); });
    dock.setReplyTarget = (commentId, label) => { dock.dataset.replyTo = commentId; context.hidden = false; contextText.textContent = label ? `الرد على ${label}` : 'الرد على التعليق'; input.placeholder = 'اكتب ردًا…'; input.focus(); };
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

    const dock = document.getElementById('detail-reply-dock');
    if (!parentCommentId && dock?.dataset.postId === postId && dock.dataset.replyTo) parentCommentId = dock.dataset.replyTo;
    const visibleSection = getVisibleCommentSection(postId);
    const inputId = `comment-input-${postId}${parentCommentId ? '-' + parentCommentId : ''}`;
    const dockIsSource = dock?.dataset.postId === postId;
    let input = dockIsSource ? dock.querySelector('.detail-reply-input') : visibleSection?.querySelector(`[id="${inputId}"]`);
    if (!input && !parentCommentId) {
        input = document.querySelector(`#post-detail-content [id="detail-comment-input-${postId}"]`);
    }
    if (!input && dock?.dataset.postId === postId) input = dock.querySelector('.detail-reply-input');
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
        if (dock?.dataset.postId === postId) {
            delete dock.dataset.replyTo;
            const context = dock.querySelector('.detail-reply-context');
            if (context) context.hidden = true;
            input.placeholder = 'أنشر ردك…';
            input.style.height = 'auto';
        }

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
        const viewerLikesSnapshot = viewerId ? await get(ref(database, `commentLikes/${postId}`)).catch(() => null) : null;
        const viewerLikes = viewerLikesSnapshot?.exists() ? viewerLikesSnapshot.val() || {} : {};
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
                        <div class="comment-actions comment-engagement-bar"><button type="button" class="comment-engagement-btn comment-reply-btn" onclick="showCommentReplyInput('${postId}','${safeCommentId}',event)" aria-label="الرد على التعليق"><i class="far fa-comment-dots"></i><span class="comment-reply-count">${formatSmartCount(replies.length)}</span></button><button type="button" class="comment-engagement-btn comment-like-btn ${viewerLikes?.[comment.id]?.[viewerId] ? 'active' : ''}" data-comment-like-id="${safeCommentId}" onclick="toggleCommentLike('${postId}','${safeCommentId}',event)" aria-label="الإعجاب بالتعليق"><i class="${viewerLikes?.[comment.id]?.[viewerId] ? 'fas' : 'far'} fa-heart"></i><span class="comment-like-count">${formatSmartCount(comment.likeCount || 0)}</span></button><button type="button" class="comment-engagement-btn" onclick="copyCommentLink('${postId}','${safeCommentId}',event)" aria-label="مشاركة التعليق"><i class="fas fa-share-nodes"></i></button><button type="button" class="comment-more-btn" onclick="openCommentOptions('${postId}','${safeCommentId}','${escapeHtml(String(comment.userId || ''))}',${canModerate},event)" aria-label="خيارات التعليق"><i class="fas fa-ellipsis"></i></button></div>
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
                            <div class="comment-actions comment-engagement-bar"><button type="button" class="comment-engagement-btn" onclick="showCommentReplyInput('${postId}','${escapeHtml(String(reply.id))}',event)" aria-label="الرد على الرد"><i class="far fa-comment-dots"></i><span class="comment-reply-count">0</span></button><button type="button" class="comment-engagement-btn comment-like-btn ${viewerLikes?.[reply.id]?.[viewerId] ? 'active' : ''}" data-comment-like-id="${escapeHtml(String(reply.id))}" onclick="toggleCommentLike('${postId}','${escapeHtml(String(reply.id))}',event)" aria-label="الإعجاب بالرد"><i class="${viewerLikes?.[reply.id]?.[viewerId] ? 'fas' : 'far'} fa-heart"></i><span class="comment-like-count">${formatSmartCount(reply.likeCount || 0)}</span></button><button type="button" class="comment-engagement-btn" onclick="copyCommentLink('${postId}','${escapeHtml(String(reply.id))}',event)" aria-label="مشاركة الرد"><i class="fas fa-share-nodes"></i></button><button type="button" class="comment-more-btn" onclick="openCommentOptions('${postId}','${escapeHtml(String(reply.id))}','${escapeHtml(String(reply.userId || ''))}',${canModerate},event)" aria-label="خيارات الرد"><i class="fas fa-ellipsis"></i></button></div>
                        </div>
                    </article>
                `;
            }
        }

        commentSection.innerHTML = commentsHtml;
    });

    commentListeners.set(postId, unsub);
}

async function copyCommentLink(postId, commentId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    const url = `${window.location.origin}${window.location.pathname}#post/${postId}?comment=${commentId}`;
    try {
        if (navigator.share) await navigator.share({ title: 'تعليق على ميمر', url });
        else { await navigator.clipboard?.writeText(url); window.showToast?.('تم نسخ رابط التعليق'); }
    } catch (error) {
        if (error?.name !== 'AbortError') window.showToast?.('تعذرت مشاركة التعليق');
    }
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
    const dock = document.getElementById('detail-reply-dock');
    if (dock?.dataset.postId === postId && typeof dock.setReplyTarget === 'function') {
        const source = event?.currentTarget?.closest('.comment')?.querySelector('.name')?.textContent || '';
        dock.setReplyTarget(commentId, source);
        return;
    }
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

export { init, addComment, editComment, deleteComment, loadComments, toggleComments, showCommentReplyInput, toggleCommentLike, openCommentOptions, closeCommentOptions, copyCommentLink, reportComment, mountDetailReplyDock, unmountDetailReplyDock };
