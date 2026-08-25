// Posts Module — Upgraded with Pagination, Rate Limiting, Denormalization
import { ref, push, set, get, update, remove, increment, runTransaction, query, orderByChild, equalTo, limitToLast, onValue, off } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml, formatTimestamp, getYouTubeEmbedUrl, showToast, parseContent } from './utils.js?v=9';
import { showLoading, hideLoading, showView } from './ui.js?v=10';
import { getUserName, getUserData, addNotification } from './firebase-helpers.js?v=9';
import { loadComments } from './comments.js?v=9';
import * as rateLimiter from './rate-limiter.js?v=9';
import * as pagination from './pagination.js?v=9';
import * as blockMute from './block-mute.js?v=9';
import * as pollsModule from './polls.js?v=9';
import * as communitiesModule from './communities.js?v=9';
import * as imageCompress from './image-compress.js?v=9';
import * as undoTweetModule from './undo-tweet.js?v=9';
import * as imageCdn from './image-cdn.js?v=9';
import * as cloudinary from './cloudinary.js?v=10';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

function safeImageSource(value) {
    const raw = String(value || '').trim();
    return escapeHtml(/^(https?:\/\/|data:image\/)/i.test(raw) ? raw : DEFAULT_AVATAR);
}

const UI_ICON_PATHS = {
    comment: '<path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.4 8.4 0 0 1-4-.98L4 20l1.15-3.08A7.36 7.36 0 0 1 4.5 12 7.5 7.5 0 0 1 12 4.5a7.5 7.5 0 0 1 8 7z"></path>',
    retweet: '<path d="M7 7h10l-2.5-2.5M17 7l-2.5 2.5M17 17H7l2.5 2.5M7 17l2.5-2.5"></path>',
    heart: '<path d="M20.8 8.9c0 5.2-8.8 10.1-8.8 10.1S3.2 14.1 3.2 8.9A4.4 4.4 0 0 1 12 6.7a4.4 4.4 0 0 1 8.8 2.2z"></path>',
    heartFilled: '<path d="M20.8 8.9c0 5.2-8.8 10.1-8.8 10.1S3.2 14.1 3.2 8.9A4.4 4.4 0 0 1 12 6.7a4.4 4.4 0 0 1 8.8 2.2z" fill="currentColor"></path>',
    bookmark: '<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.5L6 21z"></path>',
    bookmarkFilled: '<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.5L6 21z" fill="currentColor"></path>',
    eye: '<path d="M2.5 12s3.2-5 9.5-5 9.5 5 9.5 5-3.2 5-9.5 5-9.5-5-9.5-5z"></path><circle cx="12" cy="12" r="2.2"></circle>',
    more: '<circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle>',
    pin: '<path d="m15 4 5 5-3 1-3 5-2 2-2-2 2-2 5-3zM9 15l-5 5"></path>',
    share: '<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"></path><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"></path>'
};
function uiIcon(name, className = 'ui-icon') {
    return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${UI_ICON_PATHS[name] || ''}</svg>`;
}

let auth, database;
let selectedFiles = []; // Support multiple files

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
    rateLimiter.init(authInstance.currentUser?.uid);
}

// ===== Composer Helpers =====

function handleImageSelect(input) {
    if (input.files) {
        const files = Array.from(input.files);
        
        // Max 4 images/videos
        if (files.length > 4) {
            showToast('يمكنك رفع حد أقصى 4 وسائط');
            input.value = '';
            return;
        }

        selectedFiles = [];
        const previewContainer = document.getElementById('composer-preview');
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'block';

        for (const file of files) {
            // Validate file size (max 50MB per file)
            if (file.size > 50 * 1024 * 1024) {
                showToast(`حجم الملف ${file.name} كبير جداً (الحد الأقصى 50MB)`);
                continue;
            }

            // Validate file type
            const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
            if (!validTypes.includes(file.type)) {
                showToast(`نوع الملف ${file.name} غير مدعوم`);
                continue;
            }

            selectedFiles.push(file);
            const reader = new FileReader();
            reader.onload = function(e) {
                const previewItem = document.createElement('div');
                previewItem.className = 'preview-item';
                previewItem.style.position = 'relative';
                previewItem.style.display = 'inline-block';
                previewItem.style.margin = '8px';
                previewItem.style.borderRadius = '8px';
                previewItem.style.overflow = 'hidden';

                if (file.type.startsWith('image/')) {
                    previewItem.innerHTML = `<img src="${e.target.result}" style="width:120px;height:120px;object-fit:cover;">`;
                } else {
                    previewItem.innerHTML = `<div style="width:120px;height:120px;background:#333;display:flex;align-items:center;justify-content:center;"><i class="fas fa-video" style="font-size:32px;color:#888;"></i></div>`;
                }

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                removeBtn.style.position = 'absolute';
                removeBtn.style.top = '4px';
                removeBtn.style.right = '4px';
                removeBtn.style.background = 'rgba(0,0,0,0.7)';
                removeBtn.style.color = 'white';
                removeBtn.style.border = 'none';
                removeBtn.style.borderRadius = '50%';
                removeBtn.style.width = '24px';
                removeBtn.style.height = '24px';
                removeBtn.style.cursor = 'pointer';
                removeBtn.onclick = () => {
                    selectedFiles = selectedFiles.filter(f => f !== file);
                    previewItem.remove();
                    if (selectedFiles.length === 0) {
                        previewContainer.style.display = 'none';
                    }
                };

                previewItem.appendChild(removeBtn);
                previewContainer.appendChild(previewItem);
            };
            reader.readAsDataURL(file);
        }
    }
}

function removePreview() {
    selectedFiles = [];
    document.getElementById('postImage').value = '';
    document.getElementById('postStudio').value = '';
    document.getElementById('postImageUrl').value = '';
    document.getElementById('postVideo').value = '';
    document.getElementById('composer-preview').innerHTML = '';
    document.getElementById('composer-preview').style.display = 'none';
    document.getElementById('url-input-row').style.display = 'none';
    document.getElementById('video-input-row').style.display = 'none';
}

function toggleUrlInput() {
    const row = document.getElementById('url-input-row');
    row.style.display = row.style.display === 'none' ? 'block' : 'none';
    document.getElementById('video-input-row').style.display = 'none';
}

function toggleVideoInput() {
    const row = document.getElementById('video-input-row');
    row.style.display = row.style.display === 'none' ? 'block' : 'none';
    document.getElementById('url-input-row').style.display = 'none';
    document.getElementById('gif-input-row')?.style.setProperty('display', 'none');
}

function toggleGifInput() {
    const row = document.getElementById('gif-input-row');
    if (!row) return;
    row.style.display = row.style.display === 'none' ? 'block' : 'none';
    document.getElementById('video-input-row').style.display = 'none';
    document.getElementById('url-input-row').style.display = 'none';
    if (row.style.display !== 'none') document.getElementById('postGif')?.focus();
}

function toggleLocationInput() {
    const row = document.getElementById('location-input-row');
    if (!row) return;
    row.style.display = row.style.display === 'none' ? 'block' : 'none';
    if (row.style.display !== 'none') document.getElementById('postLocation')?.focus();
}

// ===== Character Count =====

function getContentLength(content) {
    return content ? content.trim().length : 0;
}

// ===== Post Actions =====

async function postTweet() {
    const content = document.getElementById('postContent').value.trim();
    const imageUrl = document.getElementById('postImageUrl').value.trim();
    const videoUrl = document.getElementById('postVideo').value.trim();
    const gifUrl = document.getElementById('postGif')?.value.trim() || '';
    const location = document.getElementById('postLocation')?.value.trim() || '';
    const communityId = document.getElementById('post-community')?.value || '';

    const quotedPostId = String(window.currentQuotePostId || '').trim();
    if (!content && selectedFiles.length === 0 && !imageUrl && !videoUrl && !gifUrl && !quotedPostId) {
        showToast('اكتب شيئاً أو أضف وسائط');
        return;
    }

    // Character limit (500 chars like X)
    if (content.length > 500) {
        showToast(`الحد الأقصى 500 حرف (لديك ${content.length})`);
        return;
    }

    // Rate limit check
    const userId = auth.currentUser.uid;
    const limitCheck = rateLimiter.checkLimit(userId, 'post');
    if (!limitCheck.allowed) {
        rateLimiter.showRateLimitToast(limitCheck.reason);
        const postBtn = document.querySelector('.composer-submit');
        rateLimiter.disableWithCooldown(postBtn, limitCheck.waitMs, 'نشر');
        return;
    }

    const postBtn = document.querySelector('.composer-submit');
    if (postBtn) { postBtn.disabled = true; postBtn.textContent = 'جاري النشر...'; }

    const postRef = push(ref(database, 'posts'));

    // Denormalize: store user data with post for faster loading
    const currentUser = auth.currentUser;
    const userData = await getUserData(database, userId);

    const postData = {
        userId: userId,
        userName: userData.name || 'مستخدم',
        userAvatar: userData.profilePicture || DEFAULT_AVATAR,
        userHandle: userData.handle || '',
        content: escapeHtml(content),
        timestamp: new Date().toISOString(),
        likes: 0,
        retweets: 0,
        views: 0,
        commentCount: 0,
        edited: false
    };
    if (quotedPostId && quotedPostId !== postRef.key) postData.quotedPostId = quotedPostId;

    try {
        // Handle multiple media files
        const mediaUrls = [];
        if (selectedFiles.length > 0) {
            const uploadedMedia = await Promise.all(selectedFiles.map(async file => {
                try {
                    const uploadFile = file.type.startsWith('image/') && file.type !== 'image/gif'
                        ? await imageCdn.compressImageFile(file, 1600, 0.82)
                        : file;
                    const uploaded = await cloudinary.uploadMedia(uploadFile, { folder: `mimer/posts/${postRef.key}` });
                    return {
                        type: uploaded.type,
                        url: uploaded.secureUrl,
                        publicId: uploaded.publicId,
                        width: uploaded.width,
                        height: uploaded.height,
                        duration: uploaded.duration,
                        format: uploaded.format
                    };
                } catch (err) {
                    const message = String(err?.message || '');
                    if (message.includes('MEDIA_TOO_LARGE')) showToast(`حجم الملف ${file.name} أكبر من 50MB`);
                    else if (message.includes('MEDIA_TYPE_UNSUPPORTED')) showToast(`نوع الملف ${file.name} غير مدعوم`);
                    else showToast(`تعذر رفع ${file.name} إلى Cloudinary`);
                    return null;
                }
            }));
            mediaUrls.push(...uploadedMedia.filter(Boolean));
            if (mediaUrls.length > 0) {
                postData.media = mediaUrls;
                // Use first image as preview
                const firstImage = mediaUrls.find(m => m.type === 'image');
                if (firstImage) postData.imageUrl = firstImage.url;
            }
        } else if (imageUrl) {
            try {
                new URL(imageUrl);
                postData.imageUrl = imageUrl;
            } catch {
                showToast('رابط الصورة غير صالح');
                if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'نشر'; }
                return;
            }
        } else if (videoUrl) {
            const embedUrl = getYouTubeEmbedUrl(videoUrl);
            if (!embedUrl) {
                showToast('رابط YouTube غير صالح');
                if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'نشر'; }
                return;
            }
            postData.videoUrl = embedUrl;
        } else if (gifUrl) {
            try {
                const parsedGif = new URL(gifUrl);
                if (!/^https?:$/i.test(parsedGif.protocol)) throw new Error('invalid protocol');
                postData.media = [{ type: 'image', url: gifUrl, format: 'gif' }];
                postData.imageUrl = gifUrl;
            } catch {
                showToast('رابط GIF غير صالح');
                if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'نشر'; }
                return;
            }
        }

        if (location) postData.location = location.substring(0, 80);
        if (communityId) postData.communityId = communityId;

        // Handle poll
        const isPollActive = document.getElementById('poll-composer')?.style.display !== 'none';
        if (isPollActive) {
            const question = document.getElementById('poll-question')?.value.trim();
            const opt1 = document.getElementById('poll-opt1')?.value.trim();
            const opt2 = document.getElementById('poll-opt2')?.value.trim();
            const opt3 = document.getElementById('poll-opt3')?.value.trim();
            const opt4 = document.getElementById('poll-opt4')?.value.trim();
            const duration = parseInt(document.getElementById('poll-duration')?.value || 24);

            if (!question || !opt1 || !opt2) {
                showToast('أكمل بيانات الاستطلاع');
                if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'نشر'; }
                return;
            }

            const options = [opt1, opt2];
            if (opt3) options.push(opt3);
            if (opt4) options.push(opt4);

            await set(postRef, postData);
            await pollsModule.createPoll(postRef.key, question, options, duration);
        } else {
            // Handle reply setting
            const replySettingIdx = Number(window.currentReplySetting || 0);
            const replySetting = window.replySettings?.[replySettingIdx]?.value || 'everyone';
            if (replySetting !== 'everyone') {
                postData.replySetting = replySetting;
            }

            await set(postRef, postData);
        }
        if (communityId) {
            const communityPosted = await communitiesModule.postToCommunity(communityId, postRef.key);
            if (communityPosted === false) {
                await update(ref(database, `posts/${postRef.key}`), { communityId: null });
                showToast('تعذر النشر في المجتمع؛ تم نشره للجميع');
            }
        }

        // Record rate limit
        rateLimiter.recordAction(userId, 'post');

        // Index hashtags without blocking the visible post publish completion.
        if (content) {
            const hashtags = content.match(/#[\u0600-\u06FFa-zA-Z0-9_]+/g) || [];
            const hashtagWrites = hashtags.map(tag => {
                const tagKey = tag.substring(1).toLowerCase().replace(/[^\u0600-\u06FFa-zA-Z0-9_]/g, '');
                return tagKey ? set(ref(database, `hashtags/${tagKey}/${postRef.key}`), true).catch(() => {}) : Promise.resolve();
            });
            void Promise.all(hashtagWrites);
        }

        // Clear composer
        document.getElementById('postContent').value = '';
        document.getElementById('postContent').style.height = 'auto';
        window.clearQuoteTweet?.();
        if (document.getElementById('postGif')) document.getElementById('postGif').value = '';
        if (document.getElementById('postLocation')) document.getElementById('postLocation').value = '';
        if (document.getElementById('post-community')) document.getElementById('post-community').value = '';
        removePreview();
        const gifRow = document.getElementById('gif-input-row');
        const locationRow = document.getElementById('location-input-row');
        if (gifRow) gifRow.style.display = 'none';
        if (locationRow) locationRow.style.display = 'none';

        // Prepend new post to feed with animation
        const postsDiv = document.getElementById('posts');
        const container = document.createElement('div');
        container.setAttribute('data-post-id', postRef.key);
        container.classList.add('new-post');
        if (postsDiv.firstChild) {
            postsDiv.insertBefore(container, postsDiv.firstChild);
        } else {
            postsDiv.appendChild(container);
        }
        container.innerHTML = `<article class="tweet new-post-pending"><div class="tweet-body"><div class="tweet-header"><strong>${escapeHtml(postData.userName)}</strong><span class="tweet-handle">@${escapeHtml(postData.userHandle || '')}</span></div><div class="tweet-content">${postData.content || ''}</div><small style="color:var(--text-secondary);">يتم تجهيز العرض…</small></div></article>`;
        showToast('تم النشر بنجاح');
        if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'نشر'; }
        void renderPost({ id: postRef.key, ...postData }, container).catch(error => {
            console.error('Post render error:', error);
            container.classList.remove('new-post-pending');
        });
        // Remove undo timer - post is instant
        // undoTweetModule.startUndo(postRef.key, (deletedId) => {
        //     showToast('تم إلغاء المنشور');
        // });
    } catch (error) {
        showToast('خطأ: ' + error.message);
        if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'نشر'; }
    }
}

async function deletePost(postId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!confirm('حذف المنشور؟')) return;

    showLoading();
    try {
        // Archive before delete (for admin review)
        const postSnap = await get(ref(database, `posts/${postId}`));
        if (postSnap.exists()) {
            await set(ref(database, `deletedPosts/${postId}`), {
                ...postSnap.val(),
                deletedBy: auth.currentUser.uid,
                deletedAt: new Date().toISOString()
            });
        }

        await remove(ref(database, 'posts/' + postId));
        await remove(ref(database, 'comments/' + postId));
        await remove(ref(database, 'likes/' + postId));

        const retweetsSnapshot = await get(ref(database, 'retweets'));
        if (retweetsSnapshot.exists()) {
            for (const [key, val] of Object.entries(retweetsSnapshot.val())) {
                if (val.originalPostId === postId) {
                    await remove(ref(database, 'retweets/' + key));
                }
            }
        }
        document.querySelectorAll(`[data-post-id="${postId}"]`).forEach(el => el.remove());
        showToast('تم حذف المنشور');
    } catch (error) {
        showToast('خطأ: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function editPost(postId, currentContent) {
    const newContent = prompt('تعديل المنشور:', currentContent);
    if (newContent === null || newContent.trim() === currentContent) return;

    if (newContent.length > 500) {
        showToast(`الحد الأقصى 500 حرف (لديك ${newContent.length})`);
        return;
    }

    try {
        await update(ref(database, `posts/${postId}`), {
            content: escapeHtml(newContent.trim()),
            edited: true,
            editedAt: new Date().toISOString()
        });

        // Update UI
        document.querySelectorAll(`[data-post-id="${postId}"] .tweet-content`).forEach(el => {
            el.textContent = newContent.trim();
        });
        showToast('تم التعديل');
    } catch (error) {
        showToast('خطأ: ' + error.message);
    }
}

async function likePost(postId, event) {
    event?.preventDefault();
    event?.stopPropagation();

    const userId = auth.currentUser.uid;

    const likeRef = ref(database, `likes/${postId}/${userId}`);
    const existingLike = await get(likeRef);
    if (!existingLike.exists()) {
        const limitCheck = rateLimiter.checkLimit(userId, 'like');
        if (!limitCheck.allowed) {
            rateLimiter.showRateLimitToast(limitCheck.reason);
            return;
        }
    }
    const likeButtons = [...document.querySelectorAll(`[data-like-id="${postId}"]`)];
    if (likeButtons.some(btn => btn.dataset.busy === 'true')) return;
    likeButtons.forEach(btn => { btn.dataset.busy = 'true'; btn.setAttribute('aria-busy', 'true'); });

    try {
        const likeTx = await runTransaction(likeRef, current => current ? null : { timestamp: new Date().toISOString() });
        const isLiked = likeTx.snapshot.exists();
        const postRef = ref(database, `posts/${postId}`);
        const likesTx = await runTransaction(ref(database, `posts/${postId}/likes`), current => Math.max(0, Number(current || 0) + (isLiked ? 1 : -1)));
        const likes = Number(likesTx.snapshot.val() || 0);
        if (isLiked) {
            rateLimiter.recordAction(userId, 'like');
            void get(ref(database, `posts/${postId}`)).then(async postSnapshot => {
                if (postSnapshot.exists() && postSnapshot.val().userId !== userId) {
                    const likerData = await getUserData(database, userId);
                    const likerName = likerData.name || await getUserName(database, userId);
                    void addNotification(database, postSnapshot.val().userId, `أعجب ${likerName} بمنشورك`, postId, { actorId: userId, actorName: likerName, actorAvatar: likerData.profilePicture || DEFAULT_AVATAR, type: 'likes' });
                }
            }).catch(() => {});
        }

        // Update all matching buttons with animation
        document.querySelectorAll(`[data-like-id="${postId}"]`).forEach(btn => {
            const isDetailAction = btn.classList.contains('post-detail-action');
            btn.classList.toggle('active', isLiked);
            btn.innerHTML = isDetailAction
                ? `${uiIcon(isLiked ? 'heartFilled' : 'heart')}<span class="detail-count">${likes}</span>`
                : `<span class="icon-wrap">${uiIcon(isLiked ? 'heartFilled' : 'heart')}</span><span>${likes}</span>`;
            if (isLiked) {
                const icon = btn.querySelector('.ui-icon');
                if (icon) {
                    icon.style.animation = 'none';
                    icon.offsetHeight;
                    icon.style.animation = '';
                }
            }
        });
    } catch (error) {
        showToast('خطأ: ' + error.message);
    } finally {
        likeButtons.forEach(btn => { delete btn.dataset.busy; btn.removeAttribute('aria-busy'); });
    }
}

async function retweetPost(postId, event) {
    event?.preventDefault();
    event?.stopPropagation();

    const userId = auth.currentUser.uid;
    const retweetButtons = [...document.querySelectorAll(`[data-retweet-id="${postId}"]`)];
    if (retweetButtons.some(btn => btn.dataset.busy === 'true')) return;

        retweetButtons.forEach(btn => { btn.dataset.busy = 'true'; btn.setAttribute('aria-busy', 'true'); });
    const retweetsSnapshot = await get(query(ref(database, 'retweets'), orderByChild('originalPostId'), equalTo(postId)));
    let existingKey = null;
        if (retweetsSnapshot.exists()) retweetsSnapshot.forEach(child => { if (child.val()?.userId === userId) existingKey = child.key; });
    if (!existingKey) {
        const limitCheck = rateLimiter.checkLimit(userId, 'retweet');
        if (!limitCheck.allowed) {
            rateLimiter.showRateLimitToast(limitCheck.reason);
            retweetButtons.forEach(btn => { delete btn.dataset.busy; btn.removeAttribute('aria-busy'); });
            return;
        }
    }
    if (existingKey) {
        if (!confirm('إلغاء إعادة التغريد؟')) { retweetButtons.forEach(btn => { delete btn.dataset.busy; btn.removeAttribute('aria-busy'); }); return; }
        try {
            await remove(ref(database, 'retweets/' + existingKey));
            const retweetsTx = await runTransaction(ref(database, `posts/${postId}/retweets`), current => Math.max(0, Number(current || 0) - 1));
            const retweets = Number(retweetsTx.snapshot.val() || 0);
            document.querySelectorAll(`[data-retweet-id="${postId}"]`).forEach(btn => {
                btn.classList.remove('active');
                btn.innerHTML = btn.classList.contains('post-detail-action')
                    ? `${uiIcon('retweet')}<span class="detail-count">${retweets}</span>`
                    : `<span class="icon-wrap">${uiIcon('retweet')}</span><span>${retweets}</span>`;
            });
        } catch (error) {
            showToast('خطأ: ' + error.message);
        } finally {
            retweetButtons.forEach(btn => { delete btn.dataset.busy; btn.removeAttribute('aria-busy'); });
        }
        return;
    }

    try {
        const retweetRef = push(ref(database, 'retweets'));
        await set(retweetRef, { originalPostId: postId, userId, timestamp: new Date().toISOString() });
        const retweetsTx = await runTransaction(ref(database, `posts/${postId}/retweets`), current => Number(current || 0) + 1);
        const retweets = Number(retweetsTx.snapshot.val() || 0);
        rateLimiter.recordAction(userId, 'retweet');
        void get(ref(database, `posts/${postId}`)).then(async postSnapshot => {
            if (postSnapshot.exists() && postSnapshot.val().userId !== userId) {
                const actorData = await getUserData(database, userId);
                const name = actorData.name || await getUserName(database, userId);
                void addNotification(database, postSnapshot.val().userId, `أعاد ${name} نشر تغريدتك`, postId, { actorId: userId, actorName: name, actorAvatar: actorData.profilePicture || DEFAULT_AVATAR, type: 'retweets' });
            }
        }).catch(() => {});

        document.querySelectorAll(`[data-retweet-id="${postId}"]`).forEach(btn => {
            btn.classList.add('active');
            btn.innerHTML = btn.classList.contains('post-detail-action')
                ? `${uiIcon('retweet')}<span class="detail-count">${retweets}</span>`
                : `<span class="icon-wrap">${uiIcon('retweet')}</span><span>${retweets}</span>`;
        });
        showToast('تم إعادة النشر');
    } catch (error) {
        showToast('خطأ: ' + error.message);
    } finally {
        retweetButtons.forEach(btn => { delete btn.dataset.busy; btn.removeAttribute('aria-busy'); });
    }
}

async function followUser(userId, event) {
    event?.preventDefault();
    event?.stopPropagation();

    const currentUserId = auth.currentUser.uid;
    if (userId === currentUserId) return;

    // Rate limit check
    const limitCheck = rateLimiter.checkLimit(currentUserId, 'follow');
    if (!limitCheck.allowed) {
        rateLimiter.showRateLimitToast(limitCheck.reason);
        return;
    }

    showLoading();
    const followRef = ref(database, `followers/${userId}/${currentUserId}`);

    try {
        const transaction = await runTransaction(followRef, current => current ? null : { timestamp: new Date().toISOString() });
        const isFollowing = transaction.snapshot.exists();
        if (!isFollowing) {
            rateLimiter.recordAction(currentUserId, 'follow');
            const actorData = await getUserData(database, currentUserId);
            const name = actorData.name || await getUserName(database, currentUserId);
            await addNotification(database, userId, `بدأ ${name} بمتابعتك`, null, {
                actorId: currentUserId,
                actorName: name,
                actorAvatar: actorData.profilePicture || DEFAULT_AVATAR,
                type: 'follows'
            });
        }

        document.querySelectorAll(`[data-follow-id="${userId}"]`).forEach(btn => {
            if (isFollowing) {
                btn.className = 'follow-btn';
                btn.textContent = 'متابعة';
            } else {
                btn.className = 'follow-btn following';
                btn.textContent = 'متابَع';
            }
        });
        const liveTargetFollowers = await get(ref(database, `followers/${userId}`));
        const liveAllFollowers = await get(ref(database, 'followers'));
        const liveFollowing = liveAllFollowers.exists() ? Object.values(liveAllFollowers.val() || {}).filter(record => record && Object.prototype.hasOwnProperty.call(record, currentUserId)).length : 0;
        if (window.currentProfileUserId === userId) document.getElementById('profile-followers')?.replaceChildren(document.createTextNode(String(liveTargetFollowers.exists() ? Object.keys(liveTargetFollowers.val() || {}).length : 0)));
        if (window.currentProfileUserId === currentUserId) document.getElementById('profile-following')?.replaceChildren(document.createTextNode(String(liveFollowing)));
        document.getElementById('drawer-following')?.replaceChildren(document.createTextNode(String(liveFollowing)));
        showToast(isFollowing ? 'تم إلغاء المتابعة' : 'تمت المتابعة');
    } catch (error) {
        showToast('خطأ: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function reportPost(postId, userId, event) {
    event?.preventDefault();
    event?.stopPropagation();

    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) {
        showToast('سجّل الدخول أولاً للإبلاغ');
        return;
    }

    // Rate limit check
    const limitCheck = rateLimiter.checkLimit(currentUserId, 'report');
    if (!limitCheck.allowed) {
        rateLimiter.showRateLimitToast(limitCheck.reason);
        return;
    }

    const reason = prompt('سبب الإبلاغ (محتوى مخالف، إزعاج، احتيال، أو غير ذلك):');
    if (!reason?.trim()) return;

    try {
        const reportRef = push(ref(database, 'reports'));
        await set(reportRef, {
            postId: postId || null,
            reportedUserId: userId || null,
            reporterId: currentUserId,
            type: postId ? 'content' : 'user',
            reason: reason.trim().slice(0, 500),
            status: 'pending',
            timestamp: new Date().toISOString()
        });
        rateLimiter.recordAction(currentUserId, 'report');
        showToast('تم الإبلاغ');
    } catch (error) {
        showToast('خطأ: ' + error.message);
    }
}

// ===== Bookmarks =====

async function toggleBookmark(postId, event) {
    event?.preventDefault();
    event?.stopPropagation();

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const bookmarkRef = ref(database, `bookmarks/${userId}/${postId}`);

        try {
        const snapshot = await get(bookmarkRef);
        const nextState = !snapshot.exists();
        if (snapshot.exists()) {
            await remove(bookmarkRef);
            showToast('تم إزالة المنشور من المحفوظات');
        } else {
            await set(bookmarkRef, { timestamp: new Date().toISOString() });
            showToast('تم حفظ المنشور');
        }
        document.querySelectorAll(`[data-bookmark-id="${postId}"]`).forEach(btn => {
            btn.classList.toggle('active', nextState);
            if (btn.classList.contains('post-detail-action')) {
                btn.innerHTML = uiIcon(nextState ? 'bookmarkFilled' : 'bookmark');
            } else {
                btn.innerHTML = `<span class="icon-wrap">${uiIcon(nextState ? 'bookmarkFilled' : 'bookmark')}</span>`;
            }
        });
    } catch (error) {
        console.error('Bookmark error:', error);
    }
}

// ===== Views =====

async function incrementViewCount(postId) {
    try {
        const postRef = ref(database, `posts/${postId}`);
        const snapshot = await get(postRef);
        if (snapshot.exists()) {
            const views = (snapshot.val().views || 0) + 1;
            await update(postRef, { views });
        }
    } catch (error) {
        // Silent fail
    }
}

// ===== Feed Loading with Pagination =====
let feedLoadToken = 0;

async function loadPosts() {
    const loadToken = ++feedLoadToken;
    const postsDiv = document.getElementById('posts');

    // Show skeleton loading
    postsDiv.innerHTML = `
        <div class="skeleton-post"><div class="skeleton-avatar skeleton"></div><div class="skeleton-post-body"><div class="skeleton-line short skeleton"></div><div class="skeleton-line long skeleton"></div><div class="skeleton-line medium skeleton"></div></div></div>
        <div class="skeleton-post"><div class="skeleton-avatar skeleton"></div><div class="skeleton-post-body"><div class="skeleton-line short skeleton"></div><div class="skeleton-line long skeleton"></div><div class="skeleton-media skeleton"></div></div></div>
        <div class="skeleton-post"><div class="skeleton-avatar skeleton"></div><div class="skeleton-post-body"><div class="skeleton-line short skeleton"></div><div class="skeleton-line medium skeleton"></div></div></div>
    `;

    try {
        // Reset pagination state
        pagination.resetPagination();

        // Load first page only
        let posts = await pagination.loadFirstPage(database);

        // Filter blocked/muted users
        posts = await blockMute.filterPosts(posts);

        if (!posts.length) {
            if (loadToken === feedLoadToken) {
                postsDiv.innerHTML = '<div class="empty-state"><h3>لا توجد منشورات بعد</h3><p>ابدأ أول منشور في ميمر وسيظهر هنا.</p></div>';
            }
            return;
        }

        // Also load retweets for first page
        const retweetsSnapshot = await get(ref(database, 'retweets'));
        const allItems = [];

        for (const post of posts) {
            allItems.push({ ...post, type: 'post' });
        }

        if (retweetsSnapshot.exists()) {
            const postIds = new Set(posts.map(p => p.id));
            retweetsSnapshot.forEach(child => {
                const rt = child.val();
                // Only include retweets of posts we have, or retweets by users in our feed
                allItems.push({ id: child.key, ...rt, type: 'retweet' });
            });
        }

        allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Build containers
        const containers = [];
        const fragment = document.createDocumentFragment();
        for (const item of allItems) {
            const container = document.createElement('div');
            container.setAttribute('data-post-id', item.id);
            fragment.appendChild(container);
            containers.push({ item, container });
        }
        if (loadToken !== feedLoadToken) return;
        postsDiv.innerHTML = '';
        postsDiv.appendChild(fragment);

        // Render all posts
        for (const { item, container } of containers) {
            await renderFeedItem(item, container);
        }

        // Initialize infinite scroll with callback
        pagination.initInfiniteScroll('.main-feed', database, loadMorePostsCallback);

        // Start real-time subscription for new posts
        if (posts.length > 0) {
            lastKnownPostId = posts[0].id;
        }
        subscribeToFeed();

    } catch (error) {
        console.error('Load posts error:', error);
        if (loadToken !== feedLoadToken) return;
        // Keep any already-rendered content; otherwise show a helpful, non-alarming state.
        const hasRenderedContent = postsDiv.querySelector('[data-post-id], .tweet, .post-card');
        if (!hasRenderedContent) {
            postsDiv.innerHTML = '<div class="empty-state"><h3>لا توجد منشورات بعد</h3><p>ابدأ أول منشور في ميمر، أو تحقق من الاتصال ثم حاول مرة أخرى.</p></div>';
        }
    }
}

// ===== Real-time Feed Subscription =====
let feedListener = null;
let lastKnownPostId = null;

/**
 * Subscribe to real-time feed updates (new posts appear instantly)
 */
function subscribeToFeed() {
    if (feedListener) {
        feedListener();
        feedListener = null;
    }

    const postsRef = ref(database, 'posts');
    const postsQuery = query(postsRef, orderByChild('timestamp'), limitToLast(1));

    feedListener = onValue(postsQuery, async (snapshot) => {
        if (!snapshot.exists()) return;

        let newestPost = null;
        snapshot.forEach(child => {
            newestPost = { id: child.key, ...child.val() };
        });

        if (!newestPost) return;

        // If this is a new post we haven't seen
        if (lastKnownPostId && newestPost.id !== lastKnownPostId) {
            const postsDiv = document.getElementById('posts');
            // Only prepend if we're on the home view and near the top
            const homeView = document.getElementById('home-view');
            if (homeView && homeView.style.display !== 'none' && postsDiv) {
                const container = document.createElement('div');
                container.setAttribute('data-post-id', newestPost.id);
                container.classList.add('new-post-realtime');
                postsDiv.insertBefore(container, postsDiv.firstChild);

                // Check if blocked/muted
                const filtered = await blockMute.filterPosts([newestPost]);
                if (filtered.length > 0) {
                    await renderFeedItem({ ...newestPost, type: 'post' }, container);
                } else {
                    container.remove();
                }
            }
        }

        if (newestPost) {
            lastKnownPostId = newestPost.id;
        }
    });
}

/**
 * Unsubscribe from feed updates
 */
function unsubscribeFeed() {
    if (feedListener) {
        feedListener();
        feedListener = null;
    }
}

/**
 * Load more posts (called by infinite scroll)
 */
async function loadMorePostsCallback(newPosts) {
    const postsDiv = document.getElementById('posts');

    for (const post of newPosts) {
        const container = document.createElement('div');
        container.setAttribute('data-post-id', post.id);
        postsDiv.appendChild(container);
        await renderPost(post, container);
    }
}

async function renderFeedItem(item, container) {
    if (item.type === 'post') {
        await renderPost(item, container);
    } else if (item.type === 'retweet') {
        const snapshot = await get(ref(database, 'posts/' + item.originalPostId));
        if (snapshot.exists()) {
            await renderRetweet(item, { id: snapshot.key, ...snapshot.val() }, container);
        }
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'الآن';
    if (diffMin < 60) return `${diffMin}د`;
    if (diffHr < 24) return `${diffHr}س`;
    if (diffDay < 7) return `${diffDay}ي`;
    return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

function formatViews(views) {
    if (!views || views === 0) return '';
    if (views < 1000) return views.toString();
    if (views < 1000000) return (views / 1000).toFixed(1).replace('.0', '') + 'K';
    return (views / 1000000).toFixed(1).replace('.0', '') + 'M';
}

async function renderPost(post, container) {
    const postId = post.id;
    const userId = auth.currentUser?.uid;

    // Use denormalized data if available (faster — no extra DB read)
    let userName = post.userName || 'مستخدم';
    let avatar = post.userAvatar || DEFAULT_AVATAR;
    let userHandle = post.userHandle || '';

    // Fallback: fetch user data if not denormalized
    if (!post.userName) {
        const userData = await getUserData(database, post.userId);
        userName = userData.name || 'مستخدم';
        avatar = userData.profilePicture || DEFAULT_AVATAR;
        userHandle = userData.handle || '';
    }

    const isOwnPost = post.userId === userId;

    // Check like status
    const likeSnapshot = await get(ref(database, `likes/${postId}/${userId}`));
    const isLiked = likeSnapshot.exists();

    // Check follow status (only for non-own posts)
    let isFollowing = false;
    if (!isOwnPost) {
        const followSnap = await get(ref(database, `followers/${post.userId}/${userId}`));
        isFollowing = followSnap.exists();
    }

    // Check bookmark status
    const bookmarkSnap = await get(ref(database, `bookmarks/${userId}/${postId}`));
    const isBookmarked = bookmarkSnap.exists();

    // Comment count (use denormalized if available)
    const commentCount = post.commentCount || 0;

    // Views
    const views = post.views || 0;

    // Protected tweet check
    const authorData = post.userName ? null : await getUserData(database, post.userId);
    const isProtected = authorData?.isProtected || false;
    const protectedBadge = isProtected ? '<span class="tweet-protected-badge"><i class="fas fa-lock"></i></span>' : '';

    // Protected tweets: only visible to followers
    if (isProtected && !isOwnPost) {
        const followCheck = await get(ref(database, `followers/${post.userId}/${userId}`));
        if (!followCheck.exists()) {
            container.innerHTML = `
                <div class="tweet" style="opacity:0.6;cursor:default;">
                    <img class="tweet-avatar" src="${safeImageSource(avatar)}" alt="">
                    <div class="tweet-body">
                        <div class="tweet-header">
                            <span class="tweet-name">${escapeHtml(userName)}</span>
                            <span class="protected-lock-icon"><i class="fas fa-lock"></i></span>
                            <span class="tweet-handle">@${escapeHtml(userHandle || userName).replace(/\s/g, '').toLowerCase()}</span>
                        </div>
                        <div class="tweet-content" style="color:var(--text-secondary);">هذا الحساب خاص. تابعه لرؤية منشوراته.</div>
                    </div>
                </div>
            `;
            return;
        }
    }

    // Increment view count (only if not own post)
    if (!isOwnPost) {
        incrementViewCount(postId);
    }

    // Media: support Cloudinary image/video arrays and legacy single-media fields.
    const mediaItems = Array.isArray(post.media) && post.media.length
        ? post.media
        : post.imageUrl
            ? [{ type: 'image', url: post.imageUrl }]
            : post.videoUrl
                ? [{ type: 'embed', url: post.videoUrl }]
                : [];
    const mediaHtml = mediaItems.map((media, index) => {
        const url = String(media?.url || '').trim();
        if (!url) return '';
        const safeUrl = escapeHtml(url);
        if (media.type === 'embed') {
            return `<div class="tweet-media-item"><iframe src="${safeUrl}" title="فيديو المنشور" allowfullscreen loading="lazy"></iframe></div>`;
        }
        if (media.type === 'video') {
            return `<div class="tweet-media-item"><video class="tweet-video" controls preload="metadata" playsinline><source src="${safeUrl}">متصفحك لا يدعم تشغيل الفيديو.</video></div>`;
        }
        return `<div class="tweet-media-item media-lightbox-trigger" data-media-url="${safeUrl}" role="button" tabindex="0" aria-label="فتح الصورة ${index + 1}">${imageCdn.createResponsiveImage(url, 'صورة المنشور')}</div>`;
    }).join('');

    // Poll
    let pollHtml = '';
    let quotedHtml = '';
    if (post.quotedPostId && post.quotedPostId !== postId) {
        try {
            const quotedSnap = await get(ref(database, `posts/${post.quotedPostId}`));
            if (quotedSnap.exists()) {
                const quoted = quotedSnap.val() || {};
                const quotedMedia = quoted.imageUrl ? `<img src="${safeImageSource(quoted.imageUrl)}" alt="" loading="lazy">` : quoted.videoUrl ? '<div class="quoted-video-placeholder"><span>فيديو</span></div>' : '';
                quotedHtml = `<div class="quoted-post-card" onclick="event.stopPropagation(); openPostDetail('${post.quotedPostId}')"><div class="quoted-post-meta"><strong>${escapeHtml(quoted.userName || 'مستخدم')}</strong><span>@${escapeHtml(quoted.userHandle || '')}</span></div>${quoted.content ? `<div class="quoted-post-text">${parseContent(quoted.content)}</div>` : ''}${quotedMedia ? `<div class="quoted-post-media">${quotedMedia}</div>` : ''}</div>`;
            }
        } catch (error) { console.warn('Quoted post unavailable:', error?.message || error); }
    }
    try {
        const pollData = await pollsModule.getPoll(postId);
        if (pollData) {
            const userVote = await pollsModule.getUserVote(postId);
            pollHtml = pollsModule.renderPollHTML(pollData, userVote);
        }
    } catch (e) { /* no poll */ }

    const viewsHtml = `<span class="tweet-action view-count" aria-label="المشاهدات">${uiIcon('eye')}<span>${views > 0 ? formatViews(views) : ''}</span></span>`;
    const editedHtml = post.edited ? '<span style="color:var(--text-secondary);font-size:12px;"> (معدّل)</span>' : '';
    const pinnedHtml = post.isPinned ? `<div class="pinned-label">${uiIcon('pin')} منشور مثبت</div>` : '';

    container.innerHTML = `
        <div class="tweet" onclick="openPostDetail('${postId}')" style="cursor:pointer;">
            <img class="tweet-avatar" src="${safeImageSource(avatar)}" alt="" onclick="event.stopPropagation(); showProfile('${post.userId}')">
            <div class="tweet-body">
                ${pinnedHtml}
                <div class="tweet-header">
                    <span class="tweet-name" onclick="event.stopPropagation(); showProfile('${post.userId}')">${escapeHtml(userName)}</span>${protectedBadge}
                    <span class="tweet-handle">@${escapeHtml(userHandle || userName).replace(/\s/g, '').toLowerCase()}</span>
                    <span class="tweet-dot">·</span>
                    <span class="tweet-time">${formatTime(post.timestamp)}</span>
                    ${post.location ? `<span class="tweet-location" title="موقع المنشور">· ${escapeHtml(post.location)}</span>` : ''}
                    ${editedHtml}
                    ${!isOwnPost ? `<button class="follow-btn ${isFollowing ? 'following' : ''}" data-follow-id="${post.userId}" onclick="event.stopPropagation(); followUser('${post.userId}', event)">${isFollowing ? 'متابَع' : 'متابعة'}</button>` : ''}
                    <button class="tweet-more" onclick="event.stopPropagation(); openPostMenu('${postId}', '${post.userId}', ${isOwnPost}, event)">
                        ${uiIcon('more')}
                    </button>
                </div>
                ${post.content ? `<div class="tweet-content">${parseContent(post.content)}</div>` : ''}
                ${quotedHtml}
                ${mediaHtml ? `<div class="tweet-media-grid" onclick="event.stopPropagation();">${mediaHtml}</div>` : ''}
                ${pollHtml}
                <div class="tweet-actions" onclick="event.stopPropagation();">
                    <button class="tweet-action reply" onclick="toggleComments('${postId}', event)">
                        <span class="icon-wrap">${uiIcon('comment')}</span>
                        <span>${commentCount}</span>
                    </button>
                    <button class="tweet-action retweet" data-retweet-id="${postId}" onclick="retweetPost('${postId}', event)">
                        <span class="icon-wrap">${uiIcon('retweet')}</span>
                        <span>${post.retweets || 0}</span>
                    </button>
                    <button class="tweet-action like ${isLiked ? 'active' : ''}" data-like-id="${postId}" onclick="likePost('${postId}', event)">
                        <span class="icon-wrap">${uiIcon(isLiked ? 'heartFilled' : 'heart')}</span>
                        <span>${post.likes || 0}</span>
                    </button>
                    ${viewsHtml}
                    <button class="tweet-action bookmark ${isBookmarked ? 'active' : ''}" data-bookmark-id="${postId}" onclick="toggleBookmark('${postId}', event)">
                        <span class="icon-wrap">${uiIcon(isBookmarked ? 'bookmarkFilled' : 'bookmark')}</span>
                    </button>
                    <button class="tweet-action share" onclick="window.openShareSheet?.('${postId}', event)" aria-label="مشاركة المنشور">
                        <span class="icon-wrap">${uiIcon('share')}</span>
                    </button>
                </div>
            </div>
        </div>
        <div id="comments-${postId}" class="comment-section" style="display:none;"></div>
    `;

    container.querySelectorAll('.media-lightbox-trigger').forEach((mediaEl) => {
        const open = () => { if (typeof window.openLightbox === 'function') window.openLightbox(mediaEl.dataset.mediaUrl || ''); };
        mediaEl.addEventListener('click', open);
        mediaEl.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    });

    loadComments(postId);
}

async function renderRetweet(retweet, originalPost, container) {
    const postId = originalPost.id;
    const userId = auth.currentUser?.uid;
    const retweetUser = await getUserData(database, retweet.userId);
    const originalUser = await getUserData(database, originalPost.userId);

    const likeSnapshot = await get(ref(database, `likes/${postId}/${userId}`));
    const isLiked = likeSnapshot.exists();

    const bookmarkSnap = await get(ref(database, `bookmarks/${userId}/${postId}`));
    const isBookmarked = bookmarkSnap.exists();

    const commentCount = originalPost.commentCount || 0;
    const views = originalPost.views || 0;

    const retweetMediaItems = Array.isArray(originalPost.media) && originalPost.media.length
        ? originalPost.media
        : originalPost.imageUrl
            ? [{ type: 'image', url: originalPost.imageUrl }]
            : originalPost.videoUrl
                ? [{ type: 'embed', url: originalPost.videoUrl }]
                : [];
    const mediaHtml = retweetMediaItems.map((media, index) => {
        const url = String(media?.url || '').trim();
        if (!url) return '';
        const safeUrl = escapeHtml(url);
        if (media.type === 'embed') return `<div class="tweet-media-item"><iframe src="${safeUrl}" title="فيديو المنشور" allowfullscreen loading="lazy"></iframe></div>`;
        if (media.type === 'video') return `<div class="tweet-media-item"><video class="tweet-video" controls preload="metadata" playsinline><source src="${safeUrl}">متصفحك لا يدعم تشغيل الفيديو.</video></div>`;
        return `<div class="tweet-media-item media-lightbox-trigger" data-media-url="${safeUrl}" role="button" tabindex="0" aria-label="فتح الصورة ${index + 1}">${imageCdn.createResponsiveImage(url, 'صورة المنشور')}</div>`;
    }).join('');

    const viewsHtml = `<span class="tweet-action view-count" aria-label="المشاهدات">${uiIcon('eye')}<span>${views > 0 ? formatViews(views) : ''}</span></span>`;

    container.innerHTML = `
        <div class="tweet" onclick="openPostDetail('${postId}')" style="cursor:pointer;">
            <img class="tweet-avatar" src="${safeImageSource(retweetUser.profilePicture)}" alt="" onclick="event.stopPropagation(); showProfile('${retweet.userId}')">
            <div class="tweet-body">
                <div class="tweet-header">
                    <span class="tweet-name" onclick="event.stopPropagation(); showProfile('${retweet.userId}')">${escapeHtml(retweetUser.name || 'مستخدم')}</span>
                    <span class="tweet-handle">@${escapeHtml(retweetUser.handle || retweetUser.name || '').replace(/\s/g, '').toLowerCase()}</span>
                    <span class="tweet-dot">·</span>
                    <span class="tweet-time">${formatTime(retweet.timestamp)}</span>
                </div>
                <div class="retweet-label">
                    ${uiIcon('retweet')} أعاد نشر
                </div>
                <div style="border:1px solid var(--border-color);border-radius:16px;padding:12px;" onclick="event.stopPropagation();">
                    <div class="tweet-header">
                        <img class="tweet-avatar" src="${safeImageSource(originalUser.profilePicture)}" style="width:32px;height:32px;" alt="" onclick="showProfile('${originalPost.userId}')">
                        <span class="tweet-name" onclick="showProfile('${originalPost.userId}')">${escapeHtml(originalUser.name || 'مستخدم')}</span>
                        <span class="tweet-handle">@${escapeHtml(originalUser.handle || originalUser.name || '').replace(/\s/g, '').toLowerCase()}</span>
                        <span class="tweet-dot">·</span>
                        <span class="tweet-time">${formatTime(originalPost.timestamp)}</span>
                    </div>
                    ${originalPost.content ? `<div class="tweet-content">${parseContent(originalPost.content)}</div>` : ''}
                    ${mediaHtml}
                </div>
                <div class="tweet-actions" onclick="event.stopPropagation();">
                    <button class="tweet-action reply" onclick="toggleComments('${postId}', event)">
                        <span class="icon-wrap">${uiIcon('comment')}</span>
                        <span>${commentCount}</span>
                    </button>
                    <button class="tweet-action retweet" data-retweet-id="${postId}" onclick="retweetPost('${postId}', event)">
                        <span class="icon-wrap">${uiIcon('retweet')}</span>
                        <span>${originalPost.retweets || 0}</span>
                    </button>
                    <button class="tweet-action like ${isLiked ? 'active' : ''}" data-like-id="${postId}" onclick="likePost('${postId}', event)">
                        <span class="icon-wrap">${uiIcon(isLiked ? 'heartFilled' : 'heart')}</span>
                        <span>${originalPost.likes || 0}</span>
                    </button>
                    ${viewsHtml}
                    <button class="tweet-action bookmark ${isBookmarked ? 'active' : ''}" data-bookmark-id="${postId}" onclick="toggleBookmark('${postId}', event)">
                        <span class="icon-wrap">${uiIcon(isBookmarked ? 'bookmarkFilled' : 'bookmark')}</span>
                    </button>
                    <button class="tweet-action share" onclick="window.openShareSheet?.('${postId}', event)" aria-label="مشاركة المنشور">
                        <span class="icon-wrap">${uiIcon('share')}</span>
                    </button>
                </div>
            </div>
        </div>
        <div id="comments-${postId}" class="comment-section" style="display:none;"></div>
    `;

    loadComments(postId);
}

/**
 * Pin a post to profile
 */
async function pinPost(postId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
        await update(ref(database, 'users/' + userId), { pinnedPost: postId });
        showToast('تم تثبيت المنشور');
    } catch (error) {
        showToast('خطأ في التثبيت');
    }
}

/**
 * Unpin post from profile
 */
async function unpinPost() {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
        await update(ref(database, 'users/' + userId), { pinnedPost: null });
        showToast('تم إلغاء التثبيت');
    } catch (error) {
        showToast('خطأ');
    }
}

export {
    init, postTweet, deletePost, editPost, likePost, retweetPost, followUser,
    reportPost, loadPosts, loadMorePostsCallback, renderPost, renderFeedItem, renderRetweet,
    handleImageSelect, removePreview, toggleUrlInput, toggleVideoInput, toggleGifInput, toggleLocationInput, toggleBookmark,
    pinPost, unpinPost, subscribeToFeed, unsubscribeFeed
};


// ===== MIMER_POST_ENHANCEMENTS_V2 =====
(function () {
    function enhanceRenderedTweet(container, post) {
        if (!container) return;

        // Fix protected tweet badge / follows visibility card only after author data resolved by old render
        const tweet = container.querySelector('.tweet');
        const avatar = container.querySelector('.tweet-avatar');
        if (tweet && avatar && !container.querySelector('.tweet-thread-wrap')) {
            const wrap = document.createElement('div');
            wrap.className = 'tweet-thread-wrap';
            avatar.parentNode.insertBefore(wrap, avatar);
            wrap.appendChild(avatar);
            if ((post.commentCount || 0) > 0 || post.replyTo) {
                const line = document.createElement('div');
                line.className = 'tweet-thread-line';
                wrap.appendChild(line);
            }
        }

        const contentEl = container.querySelector('.tweet-content');
        if (contentEl) {
            const rawText = contentEl.textContent || '';
            const shouldCollapse = rawText.length > 240 || rawText.split('\n').length > 4;
            if (shouldCollapse && !container.querySelector('.tweet-show-more')) {
                contentEl.classList.add('tweet-content-collapsed');
                const btn = document.createElement('button');
                btn.className = 'tweet-show-more';
                btn.textContent = 'عرض المزيد';
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const expanded = !contentEl.classList.contains('tweet-content-collapsed');
                    contentEl.classList.toggle('tweet-content-collapsed', expanded);
                    btn.textContent = expanded ? 'عرض المزيد' : 'عرض أقل';
                };
                contentEl.insertAdjacentElement('afterend', btn);
            }
        }

        const actions = container.querySelector('.tweet-actions');
        if (actions && !actions.querySelector('.tweet-action.share')) {
            const postId = post.id;
            const shareBtn = document.createElement('button');
            shareBtn.className = 'tweet-action share';
            shareBtn.innerHTML = `<span class="icon-wrap">${uiIcon('share')}</span>`;
            shareBtn.onclick = (e) => window.openShareSheet?.(postId, e);
            actions.appendChild(shareBtn);
        }
    }

    const __originalRenderPost = renderPost;
    renderPost = async function(post, container) {
        await __originalRenderPost(post, container);
        enhanceRenderedTweet(container, post);
    };

    const __originalRenderRetweet = renderRetweet;
    renderRetweet = async function(retweet, originalPost, container) {
        await __originalRenderRetweet(retweet, originalPost, container);
        enhanceRenderedTweet(container, { ...originalPost, id: originalPost.id || retweet.originalPostId, commentCount: originalPost.commentCount || 0 });
    };

    const __originalLikePost = likePost;
    likePost = async function(postId, event) {
        await __originalLikePost(postId, event);
        document.querySelectorAll(`[data-like-id="${postId}"]`).forEach(btn => {
            const icon = btn.querySelector('.ui-icon');
            if (btn.classList.contains('active') && icon) {
                icon.style.animation = 'none';
                void icon.offsetWidth;
                icon.style.animation = 'likePopIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275)';
            }
        });
    };
})();
