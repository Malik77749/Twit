// Posts Module
import { ref, push, set, get, update, remove, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { escapeHtml, formatTimestamp, getYouTubeEmbedUrl } from './utils.js';
import { showLoading, hideLoading } from './ui.js';
import { getUserName, getUserProfilePicture, addNotification, } from './firebase-helpers.js';
import { loadComments } from './comments.js';

let auth, database, storage;
let activeListeners = [];

function init(authInstance, databaseInstance, storageInstance) {
    auth = authInstance;
    database = databaseInstance;
    storage = storageInstance;
}

function unsubscribeAll() {
    activeListeners.forEach(unsub => unsub());
    activeListeners = [];
}

/**
 * Create a new post
 */
async function postTweet() {
    showLoading();
    const content = document.getElementById('postContent').value.trim();
    const imageInput = document.getElementById('postImage');
    const imageUrl = document.getElementById('postImageUrl').value.trim();
    const videoUrl = document.getElementById('postVideo').value.trim();

    if (!content && !imageInput.files[0] && !imageUrl && !videoUrl) {
        alert('يرجى إدخال محتوى أو صورة أو رابط صورة أو رابط فيديو');
        hideLoading();
        return;
    }

    const postRef = push(ref(database, 'posts'));
    const postData = {
        userId: auth.currentUser.uid,
        content: escapeHtml(content),
        timestamp: new Date().toISOString(),
        likes: 0,
        retweets: 0,
        comments: 0
    };

    try {
        if (imageInput.files[0]) {
            const imageFile = imageInput.files[0];
            const imgRef = storageRef(storage, `posts/${postRef.key}/${imageFile.name}`);
            const snapshot = await uploadBytes(imgRef, imageFile);
            postData.imageUrl = await getDownloadURL(snapshot.ref);
        } else if (imageUrl) {
            new URL(imageUrl); // validate
            postData.imageUrl = imageUrl;
        } else if (videoUrl) {
            const embedUrl = getYouTubeEmbedUrl(videoUrl);
            if (!embedUrl) {
                alert('رابط فيديو غير صالح');
                hideLoading();
                return;
            }
            postData.videoUrl = embedUrl;
        }

        await set(postRef, postData);
        document.getElementById('postContent').value = '';
        document.getElementById('postImage').value = '';
        document.getElementById('postImageUrl').value = '';
        document.getElementById('postVideo').value = '';
        loadPosts();
    } catch (error) {
        alert('خطأ أثناء النشر: ' + error.message);
        hideLoading();
    }
}

/**
 * Delete a post
 */
async function deletePost(postId, event) {
    showLoading();
    event.preventDefault();
    event.stopPropagation();

    if (!confirm('هل أنت متأكد من حذف هذا المنشور؟')) {
        hideLoading();
        return;
    }

    try {
        await remove(ref(database, 'posts/' + postId));
        await remove(ref(database, 'comments/' + postId));
        await remove(ref(database, 'likes/' + postId));

        const retweetsSnapshot = await get(ref(database, 'retweets'));
        if (retweetsSnapshot.exists()) {
            const retweets = retweetsSnapshot.val();
            for (const retweetId in retweets) {
                if (retweets[retweetId].originalPostId === postId) {
                    await remove(ref(database, 'retweets/' + retweetId));
                }
            }
        }

        document.querySelectorAll(`[data-post-id="${postId}"]`).forEach(el => el.remove());
    } catch (error) {
        alert('خطأ أثناء حذف المنشور: ' + error.message);
    } finally {
        hideLoading();
    }
}

/**
 * Like/unlike a post
 */
async function likePost(postId, event) {
    event.preventDefault();
    event.stopPropagation();
    showLoading();

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

        const likeButton = document.querySelector(`button[data-post-id="${postId}"][data-action="like"]`);
        if (likeButton) {
            likeButton.innerHTML = `<i class="fa-heart ${isLiked ? 'far' : 'fas active'}"></i> ${likes}`;
        }
    } catch (error) {
        alert('خطأ أثناء الإعجاب: ' + error.message);
    } finally {
        hideLoading();
    }
}

/**
 * Retweet/un-retweet a post
 */
async function retweetPost(postId, event) {
    event.preventDefault();
    event.stopPropagation();
    showLoading();

    const userId = auth.currentUser.uid;
    const retweetsSnapshot = await get(ref(database, 'retweets'));
    let alreadyRetweeted = false;
    let userRetweetId = null;

    if (retweetsSnapshot.exists()) {
        retweetsSnapshot.forEach(child => {
            const retweet = child.val();
            if (retweet.originalPostId === postId && retweet.userId === userId) {
                alreadyRetweeted = true;
                userRetweetId = child.key;
            }
        });
    }

    if (alreadyRetweeted) {
        if (confirm('لقد قمت بإعادة تغريد هذا المنشور. هل تريد إلغاء إعادة التغريد؟')) {
            try {
                await remove(ref(database, 'retweets/' + userRetweetId));
                const postRef = ref(database, `posts/${postId}`);
                const postSnapshot = await get(postRef);
                let retweets = postSnapshot.exists() ? postSnapshot.val().retweets || 0 : 0;
                retweets = Math.max(0, retweets - 1);
                await update(postRef, { retweets });

                const retweetButton = document.querySelector(`button[data-post-id="${postId}"][data-action="retweet"]`);
                if (retweetButton) {
                    retweetButton.innerHTML = `<i class="fas fa-retweet"></i> ${retweets}`;
                }
            } catch (error) {
                alert('خطأ أثناء إلغاء إعادة التغريد: ' + error.message);
            }
        }
        hideLoading();
        return;
    }

    try {
        const retweetRef = push(ref(database, 'retweets'));
        await set(retweetRef, {
            originalPostId: postId,
            userId: userId,
            timestamp: new Date().toISOString()
        });

        const postRef = ref(database, `posts/${postId}`);
        const postSnapshot = await get(postRef);
        let retweets = postSnapshot.exists() ? postSnapshot.val().retweets || 0 : 0;
        retweets += 1;
        await update(postRef, { retweets });

        if (postSnapshot.exists() && postSnapshot.val().userId !== userId) {
            const retweeterName = await getUserName(database, userId);
            await addNotification(database, postSnapshot.val().userId, `قام ${retweeterName} بإعادة نشر تغريدتك`, postId);
        }

        const retweetButton = document.querySelector(`button[data-post-id="${postId}"][data-action="retweet"]`);
        if (retweetButton) {
            retweetButton.innerHTML = `<i class="fas fa-retweet"></i> ${retweets}`;
        }
    } catch (error) {
        alert('خطأ أثناء إعادة التغريد: ' + error.message);
    } finally {
        hideLoading();
    }
}

/**
 * Follow/unfollow a user
 */
async function followUser(userId, event) {
    event.preventDefault();
    event.stopPropagation();
    showLoading();

    const currentUserId = auth.currentUser.uid;
    if (userId === currentUserId) {
        alert('لا يمكنك متابعة نفسك');
        hideLoading();
        return;
    }

    const followRef = ref(database, `followers/${userId}/${currentUserId}`);

    try {
        const snapshot = await get(followRef);
        const isFollowing = snapshot.exists();
        const updates = {};

        if (isFollowing) {
            await remove(followRef);
            updates[`users/${userId}/followers`] = -1;
            updates[`users/${currentUserId}/following`] = -1;
        } else {
            await set(followRef, { timestamp: new Date().toISOString() });
            updates[`users/${userId}/followers`] = 1;
            updates[`users/${currentUserId}/following`] = 1;
            const followerName = await getUserName(database, currentUserId);
            await addNotification(database, userId, `قام ${followerName} بمتابعتك`, null);
        }

        await update(ref(database), updates);

        const userSnapshot = await get(ref(database, `users/${userId}`));
        const currentUserSnapshot = await get(ref(database, `users/${currentUserId}`));
        document.getElementById('profile-followers').textContent = userSnapshot.val()?.followers || 0;
        document.getElementById('profile-following').textContent = currentUserSnapshot.val()?.following || 0;

        document.querySelectorAll(`button.follow-btn[onclick="followUser('${userId}', event)"]`).forEach(button => {
            button.textContent = isFollowing ? 'متابعة' : 'إلغاء المتابعة';
            button.classList.toggle('unfollow', !isFollowing);
        });
    } catch (error) {
        alert('خطأ أثناء المتابعة: ' + error.message);
    } finally {
        hideLoading();
    }
}

/**
 * Report a post
 */
async function reportPost(postId, userId, event) {
    event.preventDefault();
    event.stopPropagation();
    showLoading();

    const reason = prompt('يرجى إدخال سبب الإبلاغ:');
    if (!reason) {
        hideLoading();
        return;
    }

    try {
        const reportRef = push(ref(database, 'reports'));
        await set(reportRef, {
            postId,
            userId,
            reporterId: auth.currentUser.uid,
            reason,
            timestamp: new Date().toISOString()
        });
        alert('تم إرسال الإبلاغ بنجاح');
    } catch (error) {
        alert('خطأ أثناء الإبلاغ: ' + error.message);
    } finally {
        hideLoading();
    }
}

/**
 * Load all posts and retweets
 */
function loadPosts() {
    showLoading();
    const postsDiv = document.getElementById('posts');
    postsDiv.innerHTML = '<p class="loading">جارٍ تحميل التغريدات...</p>';

    get(ref(database, 'posts')).then(postsSnapshot => {
        get(ref(database, 'retweets')).then(retweetsSnapshot => {
            postsDiv.innerHTML = '';
            const posts = [];
            const retweets = [];

            if (postsSnapshot.exists()) {
                postsSnapshot.forEach(child => {
                    posts.push({ id: child.key, ...child.val(), type: 'post' });
                });
            }
            if (retweetsSnapshot.exists()) {
                retweetsSnapshot.forEach(child => {
                    retweets.push({ id: child.key, ...child.val(), type: 'retweet' });
                });
            }

            if (!posts.length && !retweets.length) {
                postsDiv.innerHTML = '<p class="loading">لا توجد تغريدات بعد.</p>';
                hideLoading();
                return;
            }

            const allItems = [...posts, ...retweets].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            allItems.forEach(item => {
                let container = postsDiv.querySelector(`[data-post-id="${item.id}"]`);
                if (!container) {
                    container = document.createElement('div');
                    container.setAttribute('data-post-id', item.id);
                    postsDiv.appendChild(container);
                }
                renderFeedItem(item, container);
            });

            hideLoading();
        }).catch(() => {
            postsDiv.innerHTML = '<p class="error-message">حدث خطأ أثناء تحميل التغريدات.</p>';
            hideLoading();
        });
    }).catch(() => {
        postsDiv.innerHTML = '<p class="error-message">حدث خطأ أثناء تحميل التغريدات.</p>';
        hideLoading();
    });
}

/**
 * Render a feed item (post or retweet)
 */
async function renderFeedItem(item, container) {
    if (item.type === 'post') {
        await renderPost(item, container);
    } else if (item.type === 'retweet') {
        const snapshot = await get(ref(database, 'posts/' + item.originalPostId));
        if (snapshot.exists()) {
            const originalPost = { id: snapshot.key, ...snapshot.val() };
            await renderRetweet(item, originalPost, container);
        }
    }
}

/**
 * Render a single post
 */
async function renderPost(post, container) {
    const postId = post.id;
    const userId = auth.currentUser?.uid;
    const postUserId = post.userId;
    const userName = await getUserName(database, postUserId);
    const profilePicture = await getUserProfilePicture(database, postUserId);

    container.className = 'card post-card';
    container.setAttribute('data-post-id', postId);

    let mediaContent = '';
    if (post.imageUrl) {
        mediaContent = `<img src="${post.imageUrl}" class="post-media" alt="Post image">`;
    } else if (post.videoUrl) {
        mediaContent = `<iframe src="${post.videoUrl}" class="post-video" frameborder="0" allowfullscreen></iframe>`;
    }

    const postContent = post.content ? `<p class="post-content">${post.content}</p>` : '';
    const likeRef = ref(database, `likes/${postId}/${userId}`);
    const likeSnapshot = await get(likeRef);
    const isLiked = likeSnapshot.exists();
    const commentsSnapshot = await get(ref(database, 'comments/' + postId));
    const commentCount = commentsSnapshot.exists() ? Object.keys(commentsSnapshot.val()).length : 0;
    const isOwnPost = postUserId === userId;
    const followRef = ref(database, `followers/${postUserId}/${userId}`);
    const followSnapshot = await get(followRef);
    const isFollowing = followSnapshot.exists();

    container.innerHTML = `
        ${!isOwnPost ? `<button class="follow-btn ${isFollowing ? 'unfollow' : ''}" onclick="followUser('${postUserId}', event)">${isFollowing ? 'إلغاء المتابعة' : 'متابعة'}</button>` : ''}
        <div class="post-header">
            <img src="${profilePicture}" alt="Avatar" onclick="showProfile('${postUserId}')">
            <span>${escapeHtml(userName)}</span>
            <span class="timestamp">${formatTimestamp(post.timestamp)}</span>
        </div>
        ${postContent}
        ${mediaContent}
        <div class="post-actions">
            <button data-post-id="${postId}" data-action="retweet" onclick="retweetPost('${postId}', event)"><i class="fas fa-retweet"></i> ${post.retweets || 0}</button>
            <button data-post-id="${postId}" data-action="like" onclick="likePost('${postId}', event)"><i class="fa-heart ${isLiked ? 'fas active' : 'far'}"></i> ${post.likes || 0}</button>
            <button onclick="toggleComments('${postId}', event)"><i class="far fa-comment"></i> ${commentCount}</button>
        </div>
        <div class="dropdown mt-2">
            <button class="btn btn-link p-0" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="fas fa-ellipsis-h"></i></button>
            <ul class="dropdown-menu">
                <li><a class="dropdown-item" href="#" onclick="reportPost('${postId}', '${postUserId}', event)"><i class="fas fa-flag"></i> إبلاغ</a></li>
                ${isOwnPost ? `<li><a class="dropdown-item" href="#" onclick="deletePost('${postId}', event)"><i class="fas fa-trash"></i> حذف</a></li>` : ''}
            </ul>
        </div>
        <div id="comments-${postId}" class="comment-section" style="display: none;">
            <textarea id="comment-input-${postId}" class="form-control mb-2" placeholder="أضف تعليقًا"></textarea>
            <button class="btn btn-primary btn-sm" onclick="addComment('${postId}', null, event)">إرسال</button>
            <div id="comment-list-${postId}"></div>
        </div>
    `;

    loadComments(postId);
}

/**
 * Render a retweet with original post
 */
async function renderRetweet(retweet, originalPost, container) {
    const postId = originalPost.id;
    const retweetUserId = retweet.userId;
    const originalUserId = originalPost.userId;
    const retweetUserName = await getUserName(database, retweetUserId);
    const originalUserName = await getUserName(database, originalUserId);
    const retweetProfilePicture = await getUserProfilePicture(database, retweetUserId);
    const originalProfilePicture = await getUserProfilePicture(database, originalUserId);
    const userId = auth.currentUser?.uid;

    container.className = 'card post-card';
    container.setAttribute('data-post-id', retweet.id);

    let mediaContent = '';
    if (originalPost.imageUrl) {
        mediaContent = `<img src="${originalPost.imageUrl}" class="post-media" alt="Post image">`;
    } else if (originalPost.videoUrl) {
        mediaContent = `<iframe src="${originalPost.videoUrl}" class="post-video" frameborder="0" allowfullscreen></iframe>`;
    }

    const postContent = originalPost.content ? `<p class="post-content">${originalPost.content}</p>` : '';
    const likeRef = ref(database, `likes/${postId}/${userId}`);
    const likeSnapshot = await get(likeRef);
    const isLiked = likeSnapshot.exists();
    const commentsSnapshot = await get(ref(database, 'comments/' + postId));
    const commentCount = commentsSnapshot.exists() ? Object.keys(commentsSnapshot.val()).length : 0;
    const isOwnPost = originalUserId === userId;
    const followRef = ref(database, `followers/${originalUserId}/${userId}`);
    const followSnapshot = await get(followRef);
    const isFollowing = followSnapshot.exists();

    container.innerHTML = `
        ${!isOwnPost ? `<button class="follow-btn ${isFollowing ? 'unfollow' : ''}" onclick="followUser('${originalUserId}', event)">${isFollowing ? 'إلغاء المتابعة' : 'متابعة'}</button>` : ''}
        <div class="post-header">
            <img src="${retweetProfilePicture}" alt="Avatar" onclick="showProfile('${retweetUserId}')">
            <span>${escapeHtml(retweetUserName)}</span>
            <span class="timestamp">${formatTimestamp(retweet.timestamp)}</span>
        </div>
        <p style="color: var(--action-color); font-size: 0.9rem; margin: 5px 0;">
            قام ${escapeHtml(retweetUserName)} بإعادة نشر تغريدة
        </p>
        <div style="border: 1px solid var(--border-color); border-radius: 12px; padding: 10px;">
            <div class="post-header">
                <img src="${originalProfilePicture}" alt="Avatar" onclick="showProfile('${originalUserId}')">
                <span>${escapeHtml(originalUserName)}</span>
                <span class="timestamp">${formatTimestamp(originalPost.timestamp)}</span>
            </div>
            ${postContent}
            ${mediaContent}
        </div>
        <div class="post-actions">
            <button data-post-id="${postId}" data-action="retweet" onclick="retweetPost('${postId}', event)"><i class="fas fa-retweet"></i> ${originalPost.retweets || 0}</button>
            <button data-post-id="${postId}" data-action="like" onclick="likePost('${postId}', event)"><i class="fa-heart ${isLiked ? 'fas active' : 'far'}"></i> ${originalPost.likes || 0}</button>
            <button onclick="toggleComments('${postId}', event)"><i class="far fa-comment"></i> ${commentCount}</button>
        </div>
        <div class="dropdown mt-2">
            <button class="btn btn-link p-0" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="fas fa-ellipsis-h"></i></button>
            <ul class="dropdown-menu">
                <li><a class="dropdown-item" href="#" onclick="reportPost('${postId}', '${originalUserId}', event)"><i class="fas fa-flag"></i> إبلاغ</a></li>
                ${isOwnPost ? `<li><a class="dropdown-item" href="#" onclick="deletePost('${postId}', event)"><i class="fas fa-trash"></i> حذف</a></li>` : ''}
            </ul>
        </div>
        <div id="comments-${postId}" class="comment-section" style="display: none;">
            <textarea id="comment-input-${postId}" class="form-control mb-2" placeholder="أضف تعليقًا"></textarea>
            <button class="btn btn-primary btn-sm" onclick="addComment('${postId}', null, event)">إرسال</button>
            <div id="comment-list-${postId}"></div>
        </div>
    `;

    loadComments(postId);
}

export {
    init, postTweet, deletePost, likePost, retweetPost, followUser,
    reportPost, loadPosts, renderPost, renderRetweet, renderFeedItem,
    unsubscribeAll
};
