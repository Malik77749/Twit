// Posts Module — Upgraded with Pagination, Rate Limiting, Denormalization
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
let selectedFile = null;

function init(authInstance, databaseInstance, storageInstance) {
    auth = authInstance;
    database = databaseInstance;
    storage = storageInstance;
    rateLimiter.init(authInstance.currentUser?.uid);
}

// ===== Composer Helpers =====

function handleImageSelect(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('حجم الصورة كبير جداً (الحد الأقصى 5MB)');
            input.value = '';
            return;
        }

        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'];
        if (!validTypes.includes(file.type)) {
            alert('نوع الملف غير مدعوم');
            input.value = '';
            return;
        }

        selectedFile = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('preview-img').src = e.target.result;
            document.getElementById('composer-preview').style.display = 'block';
        };
        reader.readAsDataURL(selectedFile);
    }
}

function removePreview() {
    selectedFile = null;
    document.getElementById('postImage').value = '';
    document.getElementById('postImageUrl').value = '';
    document.getElementById('postVideo').value = '';
    document.getElementById('preview-img').src = '';
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

// ===== Post Actions =====

async function postTweet() {
    const content = document.getElementById('postContent').value.trim();
    const imageUrl = document.getElementById('postImageUrl').value.trim();
    const videoUrl = document.getElementById('postVideo').value.trim();

    if (!content && !selectedFile && !imageUrl && !videoUrl) {
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

    // Denormalize: store user data with post for faster loading
    const currentUser = auth.currentUser;
    const userData = await getUserData(database, userId);

    const postData = {
        userId: userId,
        userName: userData.name || 'مستخدم',
        userAvatar: userData.profilePicture || DEFAULT_AVATAR,
        content: escapeHtml(content),
        timestamp: new Date().toISOString(),
        likes: 0,
        retweets: 0,
        views: 0,
        commentCount: 0,
        edited: false
    };

    try {
        if (selectedFile) {
            // Compress image before upload (CDN module)
            const compressedFile = await imageCdn.compressImageFile(selectedFile, 1200, 0.8);
            const imgRef = storageRef(storage, `posts/${postRef.key}/${compressedFile.name}`);
            const snapshot = await uploadBytes(imgRef, compressedFile);
            postData.imageUrl = await getDownloadURL(snapshot.ref);
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
            const replySettingIdx = window.currentReplySetting || 0;
            const replySetting = ['everyone', 'following', 'mentioned'][replySettingIdx];
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

        // Clear composer
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

    // Rate limit check
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
                const likerName = await getUserName(database, userId);
                await addNotification(database, postSnapshot.val().userId, `أعجب ${likerName} بمنشورك`, postId);
            }
        }

        await update(postRef, { likes });

        // Update all matching buttons with animation
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

async function retweetPost(postId, event) {
    event?.preventDefault();
    event?.stopPropagation();

    const userId = auth.currentUser.uid;

    // Rate limit check
    const limitCheck = rateLimiter.checkLimit(userId, 'retweet');
    if (!limitCheck.allowed) {
        rateLimiter.showRateLimitToast(limitCheck.reason);
        return;
    }

    const retweetsSnapshot = await get(ref(database, 'retweets'));
    let existingKey = null;

    if (retweetsSnapshot.exists()) {
        for (const [key, val] of Object.entries(retweetsSnapshot.val())) {
            if (val.originalPostId === postId && val.userId === userId) {
                existingKey = key;
                break;
            }
        }
    }

    if (existingKey) {
        if (!confirm('إلغاء إعادة التغريد؟')) return;
        try {
            await remove(ref(database, 'retweets/' + existingKey));
            const postRef = ref(database, `posts/${postId}`);
            const postSnapshot = await get(postRef);
            let retweets = postSnapshot.exists() ? postSnapshot.val().retweets || 0 : 0;
            retweets = Math.max(0, retweets - 1);
            await update(postRef, { retweets });
            document.querySelectorAll(`[data-retweet-id="${postId}"]`).forEach(btn => {
                btn.innerHTML = `<span class="icon-wrap"><i class="fas fa-retweet"></i></span><span>${retweets}</span>`;
            });
        } catch (error) {
            showToast('خطأ: ' + error.message);
        }
        return;
    }

    try {
        const retweetRef = push(ref(database, 'retweets'));
        await set(retweetRef, { originalPostId: postId, userId, timestamp: new Date().toISOString() });
        const postRef = ref(database, `posts/${postId}`);
        const postSnapshot = await get(postRef);
        let retweets = postSnapshot.exists() ? postSnapshot.val().retweets || 0 : 0;
        retweets += 1;
        await update(postRef, { retweets });

        rateLimiter.recordAction(userId, 'retweet');

        if (postSnapshot.exists() && postSnapshot.val().userId !== userId) {
            const name = await getUserName(database, userId);
            await addNotification(database, postSnapshot.val().userId, `أعاد ${name} نشر تغريدتك`, postId);
        }

        document.querySelectorAll(`[data-retweet-id="${postId}"]`).forEach(btn => {
            btn.innerHTML = `<span class="icon-wrap"><i class="fas fa-retweet"></i></span><span>${retweets}</span>`;
        });
        showToast('تم إعادة النشر');
    } catch (error) {
        showToast('خطأ: ' + error.message);
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
        const snapshot = await get(followRef);
        const isFollowing = snapshot.exists();
        const updates = {};

        if (isFollowing) {
            await remove(followRef);
            updates[`users/${userId}/followers`] = increment(-1);
            updates[`users/${currentUserId}/following`] = increment(-1);
        } else {
            await set(followRef, { timestamp: new Date().toISOString() });
            updates[`users/${userId}/followers`] = increment(1);
            updates[`users/${currentUserId}/following`] = increment(1);
            rateLimiter.recordAction(currentUserId, 'follow');

            const name = await getUserName(database, currentUserId);
            await addNotification(database, userId, `بدأ ${name} بمتابعتك`, null);
        }

        await update(ref(database), updates);

        document.querySelectorAll(`[data-follow-id="${userId}"]`).forEach(btn => {
            if (isFollowing) {
                btn.className = 'follow-btn';
                btn.textContent = 'متابعة';
            } else {
                btn.className = 'follow-btn following';
                btn.textContent = 'متابَع';
            }
        });

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

    const currentUserId = auth.currentUser.uid;

    // Rate limit check
    const limitCheck = rateLimiter.checkLimit(currentUserId, 'report');
    if (!limitCheck.allowed) {
        rateLimiter.showRateLimitToast(limitCheck.reason);
        return;
    }

    const reason = prompt('سبب الإبلاغ:');
    if (!reason) return;

    try {
        await set(push(ref(database, 'reports')), {
            postId, userId, reporterId: currentUserId, reason, timestamp: new Date().toISOString()
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
        if (snapshot.exists()) {
            await remove(bookmarkRef);
            showToast('تم إزالة المنشور من المحفوظات');
        } else {
            await set(bookmarkRef, { timestamp: new Date().toISOString() });
            showToast('تم حفظ المنشور');
        }

        document.querySelectorAll(`[data-bookmark-id="${postId}"]`).forEach(btn => {
            btn.classList.toggle('active', !snapshot.exists());
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

async function loadPosts() {
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
            postsDiv.innerHTML = '<div class="empty-state"><h3>لا توجد منشورات</h3><p>كن أول من ينشر!</p></div>';
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
        postsDiv.innerHTML = '<div class="empty-state"><p>خطأ في التحميل</p></div>';
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

    // Fallback: fetch user data if not denormalized
    if (!post.userName) {
        const userData = await getUserData(database, post.userId);
        userName = userData.name || 'مستخدم';
        avatar = userData.profilePicture || DEFAULT_AVATAR;
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

    // Protected tweets: only visible to followers
    if (isProtected && !isOwnPost) {
        const followCheck = await get(ref(database, `followers/${post.userId}/${userId}`));
        if (!followCheck.exists()) {
            container.innerHTML = `
                <div class="tweet" style="opacity:0.6;cursor:default;">
                    <img class="tweet-avatar" src="${avatar}" alt="">
                    <div class="tweet-body">
                        <div class="tweet-header">
                            <span class="tweet-name">${escapeHtml(userName)}</span>
                            <span class="protected-lock-icon"><i class="fas fa-lock"></i></span>
                            <span class="tweet-handle">@${escapeHtml(userName).replace(/\s/g, '').toLowerCase()}</span>
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

    // Protected tweet check
    const authorData = post.userName ? null : await getUserData(database, post.userId);
    const isProtected = authorData?.isProtected || false;
    const protectedBadge = isProtected ? '<span class="tweet-protected-badge"><i class="fas fa-lock"></i></span>' : '';

    // Media (optimized)
    let mediaHtml = '';
    if (post.imageUrl) {
        mediaHtml = `<div class="tweet-media">${imageCdn.createResponsiveImage(post.imageUrl, 'صورة')}</div>`;
    } else if (post.videoUrl) {
        mediaHtml = `<div class="tweet-media"><iframe src="${post.videoUrl}" allowfullscreen loading="lazy"></iframe></div>`;
    }

    // Poll
    let pollHtml = '';
    try {
        const pollData = await pollsModule.getPoll(postId);
        if (pollData) {
            const userVote = await pollsModule.getUserVote(postId);
            pollHtml = pollsModule.renderPollHTML(pollData, userVote);
        }
    } catch (e) { /* no poll */ }

    const viewsHtml = views > 0 ? `<span class="view-count"><i class="far fa-eye"></i> ${formatViews(views)}</span>` : '';
    const editedHtml = post.edited ? '<span style="color:var(--text-secondary);font-size:12px;"> (معدّل)</span>' : '';
    const pinnedHtml = post.isPinned ? '<div style="display:flex;align-items:center;gap:8px;color:var(--text-secondary);font-size:13px;margin-bottom:4px;padding-right:52px;"><i class="fas fa-thumbtack" style="font-size:12px;"></i> منشور مثبت</div>' : '';

    container.innerHTML = `
        <div class="tweet" onclick="openPostDetail('${postId}')" style="cursor:pointer;">
            <img class="tweet-avatar" src="${avatar}" alt="" onclick="event.stopPropagation(); showProfile('${post.userId}')">
            <div class="tweet-body">
                ${pinnedHtml}
                <div class="tweet-header">
                    <span class="tweet-name" onclick="event.stopPropagation(); showProfile('${post.userId}')">${escapeHtml(userName)}</span>${protectedBadge}
                    <span class="tweet-handle">@${escapeHtml(userName).replace(/\s/g, '').toLowerCase()}</span>
                    <span class="tweet-dot">·</span>
                    <span class="tweet-time">${formatTime(post.timestamp)}</span>
                    ${editedHtml}
                    ${!isOwnPost ? `<button class="follow-btn ${isFollowing ? 'following' : ''}" data-follow-id="${post.userId}" onclick="event.stopPropagation(); followUser('${post.userId}', event)">${isFollowing ? 'متابَع' : 'متابعة'}</button>` : ''}
                    <button class="tweet-more" onclick="event.stopPropagation(); openPostMenu('${postId}', '${post.userId}', ${isOwnPost}, event)">
                        <i class="fas fa-ellipsis"></i>
                    </button>
                </div>
                ${post.content ? `<div class="tweet-content">${parseContent(post.content)}</div>` : ''}
                ${mediaHtml ? `<div onclick="event.stopPropagation(); ${post.imageUrl ? `openLightbox('${post.imageUrl}')` : ''}" style="cursor:${post.imageUrl ? 'zoom-in' : 'default'};">${mediaHtml}</div>` : ''}
                ${pollHtml}
                <div class="tweet-actions" onclick="event.stopPropagation();">
                    <button class="tweet-action reply" onclick="toggleComments('${postId}', event)">
                        <span class="icon-wrap"><i class="far fa-comment"></i></span>
                        <span>${commentCount}</span>
                    </button>
                    <button class="tweet-action retweet" data-retweet-id="${postId}" onclick="retweetPost('${postId}', event)">
                        <span class="icon-wrap"><i class="fas fa-retweet"></i></span>
                        <span>${post.retweets || 0}</span>
                    </button>
                    <button class="tweet-action like ${isLiked ? 'active' : ''}" data-like-id="${postId}" onclick="likePost('${postId}', event)">
                        <span class="icon-wrap"><i class="${isLiked ? 'fas' : 'far'} fa-heart"></i></span>
                        <span>${post.likes || 0}</span>
                    </button>
                    ${viewsHtml}
                    <button class="tweet-action bookmark ${isBookmarked ? 'active' : ''}" data-bookmark-id="${postId}" onclick="toggleBookmark('${postId}', event)">
                        <span class="icon-wrap"><i class="${isBookmarked ? 'fas' : 'far'} fa-bookmark"></i></span>
                    </button>
                </div>
            </div>
        </div>
        <div id="comments-${postId}" class="comment-section" style="display:none;"></div>
    `;

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

    let mediaHtml = '';
    if (originalPost.imageUrl) {
        mediaHtml = `<div class="tweet-media" onclick="event.stopPropagation(); openLightbox('${originalPost.imageUrl}')" style="cursor:zoom-in;"><img src="${originalPost.imageUrl}" alt="صورة" loading="lazy"></div>`;
    } else if (originalPost.videoUrl) {
        mediaHtml = `<div class="tweet-media"><iframe src="${originalPost.videoUrl}" allowfullscreen loading="lazy"></iframe></div>`;
    }

    const viewsHtml = views > 0 ? `<span class="view-count"><i class="far fa-eye"></i> ${formatViews(views)}</span>` : '';

    container.innerHTML = `
        <div class="tweet" onclick="openPostDetail('${postId}')" style="cursor:pointer;">
            <img class="tweet-avatar" src="${retweetUser.profilePicture || DEFAULT_AVATAR}" alt="" onclick="event.stopPropagation(); showProfile('${retweet.userId}')">
            <div class="tweet-body">
                <div class="tweet-header">
                    <span class="tweet-name" onclick="event.stopPropagation(); showProfile('${retweet.userId}')">${escapeHtml(retweetUser.name || 'مستخدم')}</span>
                    <span class="tweet-handle">@${escapeHtml(retweetUser.name || '').replace(/\s/g, '').toLowerCase()}</span>
                    <span class="tweet-dot">·</span>
                    <span class="tweet-time">${formatTime(retweet.timestamp)}</span>
                </div>
                <div class="retweet-label">
                    <i class="fas fa-retweet"></i> أعاد نشر
                </div>
                <div style="border:1px solid var(--border-color);border-radius:16px;padding:12px;" onclick="event.stopPropagation();">
                    <div class="tweet-header">
                        <img class="tweet-avatar" src="${originalUser.profilePicture || DEFAULT_AVATAR}" style="width:32px;height:32px;" alt="" onclick="showProfile('${originalPost.userId}')">
                        <span class="tweet-name" onclick="showProfile('${originalPost.userId}')">${escapeHtml(originalUser.name || 'مستخدم')}</span>
                        <span class="tweet-handle">@${escapeHtml(originalUser.name || '').replace(/\s/g, '').toLowerCase()}</span>
                        <span class="tweet-dot">·</span>
                        <span class="tweet-time">${formatTime(originalPost.timestamp)}</span>
                    </div>
                    ${originalPost.content ? `<div class="tweet-content">${parseContent(originalPost.content)}</div>` : ''}
                    ${mediaHtml}
                </div>
                <div class="tweet-actions" onclick="event.stopPropagation();">
                    <button class="tweet-action reply" onclick="toggleComments('${postId}', event)">
                        <span class="icon-wrap"><i class="far fa-comment"></i></span>
                        <span>${commentCount}</span>
                    </button>
                    <button class="tweet-action retweet" data-retweet-id="${postId}" onclick="retweetPost('${postId}', event)">
                        <span class="icon-wrap"><i class="fas fa-retweet"></i></span>
                        <span>${originalPost.retweets || 0}</span>
                    </button>
                    <button class="tweet-action like ${isLiked ? 'active' : ''}" data-like-id="${postId}" onclick="likePost('${postId}', event)">
                        <span class="icon-wrap"><i class="${isLiked ? 'fas' : 'far'} fa-heart"></i></span>
                        <span>${originalPost.likes || 0}</span>
                    </button>
                    ${viewsHtml}
                    <button class="tweet-action bookmark ${isBookmarked ? 'active' : ''}" data-bookmark-id="${postId}" onclick="toggleBookmark('${postId}', event)">
                        <span class="icon-wrap"><i class="${isBookmarked ? 'fas' : 'far'} fa-bookmark"></i></span>
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
    handleImageSelect, removePreview, toggleUrlInput, toggleVideoInput, toggleBookmark,
    pinPost, unpinPost, subscribeToFeed, unsubscribeFeed
};
