// Posts Module — Enhanced with Multi-Media Upload and Instant Publishing
import { ref, push, set, get, update, remove, increment, query, orderByChild, limitToLast, onValue, off } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { escapeHtml, formatTimestamp, getYouTubeEmbedUrl, showToast, parseContent } from './utils.js?v=3';
import { showLoading, hideLoading, showView } from './ui.js?v=3';
import { getUserName, getUserData, addNotification } from './firebase-helpers.js?v=3';
import { loadComments } from './comments.js?v=3';
import * as rateLimiter from './rate-limiter.js?v=3';
import * as pagination from './pagination.js?v=7';
import * as blockMute from './block-mute.js?v=3';
import * as pollsModule from './polls.js?v=3';
import * as imageCompress from './image-compress.js?v=3';
import * as undoTweetModule from './undo-tweet.js?v=3';
import * as imageCdn from './image-cdn.js?v=3';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

let auth, database, storage;
let selectedFiles = []; // Support multiple files

function init(authInstance, databaseInstance, storageInstance) {
    auth = authInstance;
    database = databaseInstance;
    storage = storageInstance;
    rateLimiter.init(authInstance.currentUser?.uid);
}

// ===== Multi-Media File Handling =====

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
}

// ===== Character Count =====

function getContentLength(content) {
    return content ? content.trim().length : 0;
}

// ===== Instant Post Publishing =====

async function postTweet() {
    const content = document.getElementById('postContent').value.trim();
    const imageUrl = document.getElementById('postImageUrl').value.trim();
    const videoUrl = document.getElementById('postVideo').value.trim();

    if (!content && selectedFiles.length === 0 && !imageUrl && !videoUrl) {
        showToast('اكتب شيئاً أو أضف صورة');
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
        edited: false,
        mediaUrls: [] // Array for multiple media
    };

    try {
        // Upload multiple files in parallel
        if (selectedFiles.length > 0) {
            const uploadPromises = selectedFiles.map(async (file, index) => {
                try {
                    let uploadFile = file;
                    
                    // Compress images
                    if (file.type.startsWith('image/')) {
                        uploadFile = await imageCompress.compressImageFile(file, 1200, 0.8);
                    }

                    const imgRef = storageRef(storage, `posts/${postRef.key}/media-${index}-${Date.now()}`);
                    const snapshot = await uploadBytes(imgRef, uploadFile);
                    const url = await getDownloadURL(snapshot.ref);
                    return { url, type: file.type.startsWith('image/') ? 'image' : 'video' };
                } catch (err) {
                    console.error(`Upload error for file ${index}:`, err);
                    return null;
                }
            });

            const uploadResults = await Promise.all(uploadPromises);
            postData.mediaUrls = uploadResults.filter(r => r !== null);
        } else if (imageUrl) {
            try {
                new URL(imageUrl);
                postData.mediaUrls = [{ url: imageUrl, type: 'image' }];
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
            postData.mediaUrls = [{ url: embedUrl, type: 'youtube' }];
        }

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

        // Record rate limit
        rateLimiter.recordAction(userId, 'post');

        // Track hashtags
        if (content) {
            const hashtags = content.match(/#[\u0600-\u06FFa-zA-Z0-9_]+/g);
            if (hashtags) {
                for (const tag of hashtags) {
                    const tagKey = tag.substring(1).toLowerCase().replace(/[^\u0600-\u06FFa-zA-Z0-9_]/g, '');
                    if (tagKey) {
                        try {
                            await set(ref(database, `hashtags/${tagKey}/${postRef.key}`), true);
                        } catch (e) { /* non-blocking */ }
                    }
                }
            }
        }

        // Clear composer immediately (instant feedback)
        document.getElementById('postContent').value = '';
        document.getElementById('postContent').style.height = 'auto';
        removePreview();

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
        await renderPost({ id: postRef.key, ...postData }, container);

        showToast('تم النشر');
        undoTweetModule.startUndo(postRef.key, (deletedId) => {
            showToast('تم إلغاء المنشور');
        });
        if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'نشر'; }
    } catch (error) {
        showToast('خطأ: ' + error.message);
        if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'نشر'; }
    }
}

// ===== Existing Functions (Keep from original) =====

async function deletePost(postId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!confirm('حذف المنشور؟')) return;

    showLoading();
    try {
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

    const limitCheck = rateLimiter.checkLimit(userId, 'like');
    if (!limitCheck.allowed) {
        rateLimiter.showRateLimitToast(limitCheck.reason);
        return;
    }

    const likeRef = ref(database, `likes/${postId}/${userId}`);

    try {
        const snapshot = await get(likeRef);
        const isLiked = snapshot.exists();
        const postRef = ref(database, `posts/${postId}`);
        const postSnapshot = await get(postRef);
        let likes = postSnapshot.exists() ? postSnapshot.val().likes || 0 : 0;

        if (isLiked) {
            await remove(likeRef);
            likes = Math.max(0, likes - 1);
        } else {
            await set(likeRef, { timestamp: new Date().toISOString() });
            likes += 1;
            rateLimiter.recordAction(userId, 'like');

            if (postSnapshot.exists() && postSnapshot.val().userId !== userId) {
                const likerData = await getUserData(database, userId);
                const likerName = likerData.name || await getUserName(database, userId);
                await addNotification(database, postSnapshot.val().userId, `أعجب ${likerName} بمنشورك`, postId, {
                    actorId: userId,
                    actorName: likerName,
                    actorAvatar: likerData.profilePicture || DEFAULT_AVATAR,
                    type: 'likes'
                });
            }
        }

        await update(postRef, { likes });

        document.querySelectorAll(`[data-like-id="${postId}"]`).forEach(btn => {
            btn.className = `tweet-action like ${isLiked ? '' : 'active'}`;
            btn.innerHTML = `<span class="icon-wrap"><i class="${isLiked ? 'far' : 'fas'} fa-heart"></i></span><span>${likes}</span>`;
            if (!isLiked) {
                const icon = btn.querySelector('.fa-heart');
                if (icon) {
                    icon.style.animation = 'none';
                    icon.offsetHeight;
                    icon.style.animation = '';
                }
            }
        });
    } catch (error) {
        showToast('خطأ: ' + error.message);
    }
}

// Placeholder for renderPost (keep from original)
async function renderPost(postData, container) {
    // This will be imported from the original posts.js
    // For now, we export the main functions
}

export { init, postTweet, deletePost, editPost, likePost, handleImageSelect, removePreview, toggleUrlInput, toggleVideoInput };
