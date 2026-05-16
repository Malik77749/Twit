// Posts Module
import { ref, push, set, get, update, remove, increment } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { escapeHtml, formatTimestamp, getYouTubeEmbedUrl, showToast } from './utils.js';
import { showLoading, hideLoading, showView } from './ui.js';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');
import { getUserName, getUserData, addNotification } from './firebase-helpers.js';
import { loadComments } from './comments.js';

let auth, database, storage;
let selectedFile = null;

function init(authInstance, databaseInstance, storageInstance) {
    auth = authInstance;
    database = databaseInstance;
    storage = storageInstance;
}

// ===== Composer Helpers =====

function handleImageSelect(input) {
    if (input.files && input.files[0]) {
        selectedFile = input.files[0];
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

// ===== Post Actions =====

async function postTweet() {
    const content = document.getElementById('postContent').value.trim();
    const imageUrl = document.getElementById('postImageUrl').value.trim();
    const videoUrl = document.getElementById('postVideo').value.trim();

    if (!content && !selectedFile && !imageUrl && !videoUrl) {
        alert('اكتب شيئاً أو أضف صورة');
        return;
    }

    showLoading();
    const postRef = push(ref(database, 'posts'));
    const postData = {
        userId: auth.currentUser.uid,
        content: escapeHtml(content),
        timestamp: new Date().toISOString(),
        likes: 0,
        retweets: 0,
        views: 0
    };

    try {
        if (selectedFile) {
            const imgRef = storageRef(storage, `posts/${postRef.key}/${selectedFile.name}`);
            const snapshot = await uploadBytes(imgRef, selectedFile);
            postData.imageUrl = await getDownloadURL(snapshot.ref);
        } else if (imageUrl) {
            try {
                new URL(imageUrl);
                postData.imageUrl = imageUrl;
            } catch {
                alert('رابط الصورة غير صالح');
                hideLoading();
                return;
            }
        } else if (videoUrl) {
            const embedUrl = getYouTubeEmbedUrl(videoUrl);
            if (!embedUrl) {
                alert('رابط YouTube غير صالح');
                hideLoading();
                return;
            }
            postData.videoUrl = embedUrl;
        }

        await set(postRef, postData);
        document.getElementById('postContent').value = '';
        document.getElementById('postContent').style.height = 'auto';
        removePreview();
        loadPosts();
        showToast('تم النشر');
    } catch (error) {
        alert('خطأ: ' + error.message);
        hideLoading();
    }
}

async function deletePost(postId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!confirm('حذف المنشور؟')) return;

    showLoading();
    try {
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
        alert('خطأ: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function likePost(postId, event) {
    event?.preventDefault();
    event?.stopPropagation();

    const userId = auth.currentUser.uid;
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
            if (postSnapshot.exists() && postSnapshot.val().userId !== userId) {
                const likerName = await getUserName(database, userId);
                await addNotification(database, postSnapshot.val().userId, `أعجب ${likerName} بمنشورك`, postId);
            }
        }

        await update(postRef, { likes });

        // Update all matching buttons
        document.querySelectorAll(`[data-like-id="${postId}"]`).forEach(btn => {
            btn.className = `tweet-action like ${isLiked ? '' : 'active'}`;
            btn.innerHTML = `<span class="icon-wrap"><i class="${isLiked ? 'far' : 'fas'} fa-heart"></i></span><span>${likes}</span>`;
        });
    } catch (error) {
        alert('خطأ: ' + error.message);
    }
}

async function retweetPost(postId, event) {
    event?.preventDefault();
    event?.stopPropagation();

    const userId = auth.currentUser.uid;
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
            alert('خطأ: ' + error.message);
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

        if (postSnapshot.exists() && postSnapshot.val().userId !== userId) {
            const name = await getUserName(database, userId);
            await addNotification(database, postSnapshot.val().userId, `أعاد ${name} نشر تغريدتك`, postId);
        }

        document.querySelectorAll(`[data-retweet-id="${postId}"]`).forEach(btn => {
            btn.innerHTML = `<span class="icon-wrap"><i class="fas fa-retweet"></i></span><span>${retweets}</span>`;
        });
        showToast('تم إعادة النشر');
    } catch (error) {
        alert('خطأ: ' + error.message);
    }
}

async function followUser(userId, event) {
    event?.preventDefault();
    event?.stopPropagation();

    const currentUserId = auth.currentUser.uid;
    if (userId === currentUserId) return;

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
        alert('خطأ: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function reportPost(postId, userId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    const reason = prompt('سبب الإبلاغ:');
    if (!reason) return;

    try {
        await set(push(ref(database, 'reports')), {
            postId, userId, reporterId: auth.currentUser.uid, reason, timestamp: new Date().toISOString()
        });
        showToast('تم الإبلاغ');
    } catch (error) {
        alert('خطأ: ' + error.message);
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

        // Update bookmark icons
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

// ===== Feed Loading =====

async function loadPosts() {
    const postsDiv = document.getElementById('posts');
    postsDiv.innerHTML = `
        <div class="skeleton-post"><div class="skeleton-avatar skeleton"></div><div class="skeleton-post-body"><div class="skeleton-line short skeleton"></div><div class="skeleton-line long skeleton"></div><div class="skeleton-line medium skeleton"></div></div></div>
        <div class="skeleton-post"><div class="skeleton-avatar skeleton"></div><div class="skeleton-post-body"><div class="skeleton-line short skeleton"></div><div class="skeleton-line long skeleton"></div><div class="skeleton-media skeleton"></div></div></div>
        <div class="skeleton-post"><div class="skeleton-avatar skeleton"></div><div class="skeleton-post-body"><div class="skeleton-line short skeleton"></div><div class="skeleton-line medium skeleton"></div></div></div>
    `;

    try {
        const [postsSnapshot, retweetsSnapshot] = await Promise.all([
            get(ref(database, 'posts')),
            get(ref(database, 'retweets'))
        ]);

        postsDiv.innerHTML = '';
        const allItems = [];

        if (postsSnapshot.exists()) {
            postsSnapshot.forEach(child => {
                allItems.push({ id: child.key, ...child.val(), type: 'post' });
            });
        }
        if (retweetsSnapshot.exists()) {
            retweetsSnapshot.forEach(child => {
                allItems.push({ id: child.key, ...child.val(), type: 'retweet' });
            });
        }

        if (!allItems.length) {
            postsDiv.innerHTML = '<div class="empty-state"><h3>لا توجد منشورات</h3><p>كن أول من ينشر!</p></div>';
            hideLoading();
            return;
        }

        allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        for (const item of allItems) {
            const container = document.createElement('div');
            container.setAttribute('data-post-id', item.id);
            postsDiv.appendChild(container);
            await renderFeedItem(item, container);
        }

        hideLoading();
    } catch (error) {
        postsDiv.innerHTML = '<div class="empty-state"><p>خطأ في التحميل</p></div>';
        hideLoading();
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
    const userData = await getUserData(database, post.userId);
    const userName = userData.name || 'مستخدم';
    const avatar = userData.profilePicture || DEFAULT_AVATAR;
    const isOwnPost = post.userId === userId;

    // Check like status
    const likeSnapshot = await get(ref(database, `likes/${postId}/${userId}`));
    const isLiked = likeSnapshot.exists();

    // Check follow status
    let isFollowing = false;
    if (!isOwnPost) {
        const followSnap = await get(ref(database, `followers/${post.userId}/${userId}`));
        isFollowing = followSnap.exists();
    }

    // Check bookmark status
    const bookmarkSnap = await get(ref(database, `bookmarks/${userId}/${postId}`));
    const isBookmarked = bookmarkSnap.exists();

    // Comment count
    const commentsSnap = await get(ref(database, 'comments/' + postId));
    const commentCount = commentsSnap.exists() ? Object.keys(commentsSnap.val()).length : 0;

    // Views
    const views = post.views || 0;

    // Increment view count (only if not own post)
    if (!isOwnPost) {
        incrementViewCount(postId);
    }

    // Media
    let mediaHtml = '';
    if (post.imageUrl) {
        mediaHtml = `<div class="tweet-media"><img src="${post.imageUrl}" alt="صورة"></div>`;
    } else if (post.videoUrl) {
        mediaHtml = `<div class="tweet-media"><iframe src="${post.videoUrl}" allowfullscreen></iframe></div>`;
    }

    const viewsHtml = views > 0 ? `<span class="view-count"><i class="far fa-eye"></i> ${formatViews(views)}</span>` : '';

    container.innerHTML = `
        <div class="tweet" onclick="openPostDetail('${postId}')" style="cursor:pointer;">
            <img class="tweet-avatar" src="${avatar}" alt="" onclick="event.stopPropagation(); showProfile('${post.userId}')">
            <div class="tweet-body">
                <div class="tweet-header">
                    <span class="tweet-name" onclick="event.stopPropagation(); showProfile('${post.userId}')">${escapeHtml(userName)}</span>
                    <span class="tweet-handle">@${escapeHtml(userName).replace(/\s/g, '').toLowerCase()}</span>
                    <span class="tweet-dot">·</span>
                    <span class="tweet-time">${formatTime(post.timestamp)}</span>
                    ${!isOwnPost ? `<button class="follow-btn ${isFollowing ? 'following' : ''}" data-follow-id="${post.userId}" onclick="event.stopPropagation(); followUser('${post.userId}', event)">${isFollowing ? 'متابَع' : 'متابعة'}</button>` : ''}
                    <button class="tweet-more" onclick="event.stopPropagation(); openPostMenu('${postId}', '${post.userId}', ${isOwnPost}, event)">
                        <i class="fas fa-ellipsis"></i>
                    </button>
                </div>
                ${post.content ? `<div class="tweet-content">${post.content}</div>` : ''}
                ${mediaHtml ? `<div onclick="event.stopPropagation(); ${post.imageUrl ? `openLightbox('${post.imageUrl}')` : ''}" style="cursor:${post.imageUrl ? 'zoom-in' : 'default'};">${mediaHtml}</div>` : ''}
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

    const commentsSnap = await get(ref(database, 'comments/' + postId));
    const commentCount = commentsSnap.exists() ? Object.keys(commentsSnap.val()).length : 0;

    const views = originalPost.views || 0;

    let mediaHtml = '';
    if (originalPost.imageUrl) {
        mediaHtml = `<div class="tweet-media" onclick="event.stopPropagation(); openLightbox('${originalPost.imageUrl}')" style="cursor:zoom-in;"><img src="${originalPost.imageUrl}" alt="صورة"></div>`;
    } else if (originalPost.videoUrl) {
        mediaHtml = `<div class="tweet-media"><iframe src="${originalPost.videoUrl}" allowfullscreen></iframe></div>`;
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
                    ${originalPost.content ? `<div class="tweet-content">${originalPost.content}</div>` : ''}
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

export {
    init, postTweet, deletePost, likePost, retweetPost, followUser,
    reportPost, loadPosts, renderPost, renderFeedItem, renderRetweet, handleImageSelect, removePreview,
    toggleUrlInput, toggleVideoInput, toggleBookmark
};
