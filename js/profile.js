// Profile Module
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { showLoading, hideLoading, showView } from './ui.js';
import { getUserData } from './firebase-helpers.js';
import { renderPost, renderRetweet } from './posts.js';
import { escapeHtml } from './utils.js';

let auth, database;
let currentProfileUserId = null;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

async function showProfile(userId) {
    showLoading();
    userId = userId || auth.currentUser?.uid;
    if (!userId) { hideLoading(); return; }

    currentProfileUserId = userId;

    try {
        const userData = await getUserData(database, userId);
        const isOwnProfile = userId === auth.currentUser?.uid;

        document.getElementById('profile-name').textContent = userData.name || 'مستخدم';
        document.getElementById('profile-view-name').textContent = userData.name || 'مستخدم';
        document.getElementById('profile-handle').textContent = '@' + (userData.name || 'user').replace(/\s/g, '').toLowerCase();
        document.getElementById('profile-followers').textContent = userData.followers || 0;
        document.getElementById('profile-following').textContent = userData.following || 0;
        document.getElementById('profile-picture').src = userData.profilePicture || 'https://via.placeholder.com/134';

        // Join date
        if (userData.joinDate) {
            const d = new Date(userData.joinDate);
            const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
            document.getElementById('profile-join-date').innerHTML = `<i class="far fa-calendar"></i> انضم في ${months[d.getMonth()]} ${d.getFullYear()}`;
        }

        // Bio (if exists)
        const bioEl = document.getElementById('profile-bio');
        if (bioEl) {
            bioEl.textContent = userData.bio || '';
            bioEl.style.display = userData.bio ? 'block' : 'none';
        }

        // Profile actions
        const actionsDiv = document.getElementById('profile-actions');
        if (isOwnProfile) {
            actionsDiv.innerHTML = `
                <button class="profile-edit-btn" onclick="editProfile()">تعديل الملف الشخصي</button>
                <div id="profile-edit-form" style="display:none;margin-top:12px;">
                    <input type="text" class="auth-input" id="profile-name-input" placeholder="الاسم الجديد" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;" value="${escapeHtml(userData.name || '')}">
                    <input type="text" class="auth-input" id="profile-picture-url" placeholder="رابط صورة جديدة" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;">
                    <input type="text" class="auth-input" id="profile-bio-input" placeholder="نبذة عنك" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;" value="${escapeHtml(userData.bio || '')}">
                    <button class="follow-btn" onclick="saveProfile()" style="font-size:13px;padding:4px 12px;background:var(--accent);color:white;">حفظ</button>
                </div>
            `;
        } else {
            const followSnap = await get(ref(database, `followers/${userId}/${auth.currentUser.uid}`));
            const isFollowing = followSnap.exists();
            actionsDiv.innerHTML = `<button class="follow-btn ${isFollowing ? 'following' : ''}" data-follow-id="${userId}" onclick="followUser('${userId}', event)">${isFollowing ? 'متابَع' : 'متابعة'}</button>`;
        }

        // Profile tabs — make them functional
        const tabs = document.querySelectorAll('.profile-tab');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const tabType = tab.dataset.tab;
                loadProfileTab(userId, tabType);
            };
        });

        // Reset to "posts" tab
        tabs.forEach(t => t.classList.remove('active'));
        tabs[0]?.classList.add('active');

        showView('profile');
        loadProfilePosts(userId);
    } catch (error) {
        alert('خطأ: ' + error.message);
        hideLoading();
    }
}

function editProfile() {
    const form = document.getElementById('profile-edit-form');
    if (form) {
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }
}

async function saveProfile() {
    const nameInput = document.getElementById('profile-name-input');
    const picInput = document.getElementById('profile-picture-url');
    const bioInput = document.getElementById('profile-bio-input');

    const name = nameInput?.value.trim();
    const picUrl = picInput?.value.trim();
    const bio = bioInput?.value.trim();

    if (!name) { alert('أدخل اسمك'); return; }

    showLoading();
    try {
        const updates = { name };
        if (bio) updates.bio = bio;

        if (picUrl) {
            new URL(picUrl); // validate
            updates.profilePicture = picUrl;
        }

        await update(ref(database, 'users/' + auth.currentUser.uid), updates);

        // Update UI
        document.getElementById('profile-name').textContent = name;
        document.getElementById('profile-view-name').textContent = name;
        document.getElementById('profile-handle').textContent = '@' + name.replace(/\s/g, '').toLowerCase();

        if (picUrl) {
            document.getElementById('profile-picture').src = picUrl;
            document.getElementById('sidebar-avatar').src = picUrl;
            document.getElementById('composer-avatar').src = picUrl;
        }

        if (bio) {
            const bioEl = document.getElementById('profile-bio');
            if (bioEl) {
                bioEl.textContent = bio;
                bioEl.style.display = 'block';
            }
        }

        // Update sidebar name
        document.getElementById('sidebar-name').textContent = name;
        document.getElementById('drawer-name').textContent = name;

        document.getElementById('profile-edit-form').style.display = 'none';
        alert('تم التحديث');
    } catch (error) {
        alert('رابط غير صالح أو خطأ');
    } finally {
        hideLoading();
    }
}

// ===== Profile Tab Loading =====

async function loadProfileTab(userId, tabType) {
    const container = document.getElementById('profile-posts');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    switch (tabType) {
        case 'posts':
            await loadProfilePosts(userId);
            break;
        case 'replies':
            await loadProfileReplies(userId, container);
            break;
        case 'media':
            await loadProfileMedia(userId, container);
            break;
        case 'likes':
            await loadProfileLikes(userId, container);
            break;
        default:
            await loadProfilePosts(userId);
    }
}

async function loadProfilePosts(userId) {
    const container = document.getElementById('profile-posts');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    try {
        const [postsSnap, retweetsSnap] = await Promise.all([
            get(ref(database, 'posts')),
            get(ref(database, 'retweets'))
        ]);

        container.innerHTML = '';
        const allItems = [];

        if (postsSnap.exists()) {
            postsSnap.forEach(child => {
                if (child.val().userId === userId) {
                    allItems.push({ id: child.key, ...child.val(), type: 'post' });
                }
            });
        }
        if (retweetsSnap.exists()) {
            retweetsSnap.forEach(child => {
                if (child.val().userId === userId) {
                    allItems.push({ id: child.key, ...child.val(), type: 'retweet' });
                }
            });
        }

        document.getElementById('profile-view-count').textContent = `${allItems.length} منشورات`;

        if (!allItems.length) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد منشورات</p></div>';
            hideLoading();
            return;
        }

        allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        for (const item of allItems) {
            const el = document.createElement('div');
            el.setAttribute('data-post-id', item.id);
            container.appendChild(el);
            if (item.type === 'post') {
                await renderPost(item, el);
            } else {
                const snap = await get(ref(database, 'posts/' + item.originalPostId));
                if (snap.exists()) {
                    await renderRetweet(item, { id: snap.key, ...snap.val() }, el);
                }
            }
        }

        hideLoading();
    } catch (error) {
        container.innerHTML = '<div class="empty-state"><p>خطأ</p></div>';
        hideLoading();
    }
}

async function loadProfileReplies(userId, container) {
    try {
        const commentsSnap = await get(ref(database, 'comments'));
        if (!commentsSnap.exists()) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد ردود</p></div>';
            hideLoading();
            return;
        }

        const userComments = [];
        commentsSnap.forEach(postCommentsSnap => {
            const postId = postCommentsSnap.key;
            postCommentsSnap.forEach(commentSnap => {
                const comment = commentSnap.val();
                if (comment.userId === userId) {
                    userComments.push({ postId, ...comment });
                }
            });
        });

        if (!userComments.length) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد ردود</p></div>';
            hideLoading();
            return;
        }

        userComments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        container.innerHTML = '';
        for (const comment of userComments.slice(0, 20)) {
            const postSnap = await get(ref(database, `posts/${comment.postId}`));
            if (!postSnap.exists()) continue;

            const post = postSnap.val();
            const postUser = await getUserData(database, post.userId);

            const el = document.createElement('div');
            el.className = 'comment-section';
            el.style.display = 'block';
            el.style.padding = '12px 16px';
            el.innerHTML = `
                <div style="color:var(--text-secondary);font-size:13px;margin-bottom:8px;">
                    الرد على <span style="color:var(--accent);cursor:pointer;" onclick="showProfile('${post.userId}')">@${escapeHtml(postUser.name || 'مستخدم')}</span>
                </div>
                <div style="font-size:15px;margin-bottom:8px;">${escapeHtml(comment.content)}</div>
                <div style="color:var(--text-secondary);font-size:13px;cursor:pointer;" onclick="openPostDetail('${comment.postId}')">
                    عرض المنشور الأصلي ←
                </div>
            `;
            container.appendChild(el);
        }

        hideLoading();
    } catch (error) {
        container.innerHTML = '<div class="empty-state"><p>خطأ</p></div>';
        hideLoading();
    }
}

async function loadProfileMedia(userId, container) {
    try {
        const postsSnap = await get(ref(database, 'posts'));
        if (!postsSnap.exists()) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد وسائط</p></div>';
            hideLoading();
            return;
        }

        const mediaPosts = [];
        postsSnap.forEach(child => {
            const post = child.val();
            if (post.userId === userId && (post.imageUrl || post.videoUrl)) {
                mediaPosts.push({ id: child.key, ...post });
            }
        });

        if (!mediaPosts.length) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد وسائط</p></div>';
            hideLoading();
            return;
        }

        mediaPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        container.innerHTML = '';
        // Show as a grid of media
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:2px;';
        for (const post of mediaPosts) {
            const mediaUrl = post.imageUrl || '';
            const el = document.createElement('div');
            el.style.cssText = 'aspect-ratio:1;overflow:hidden;cursor:pointer;';
            el.onclick = () => {
                if (post.imageUrl) {
                    openLightbox(post.imageUrl);
                } else {
                    openPostDetail(post.id);
                }
            };
            if (post.imageUrl) {
                el.innerHTML = `<img src="${post.imageUrl}" style="width:100%;height:100%;object-fit:cover;" alt="">`;
            } else {
                el.innerHTML = `<div style="width:100%;height:100%;background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;"><i class="fas fa-play" style="font-size:32px;color:var(--text-secondary);"></i></div>`;
            }
            grid.appendChild(el);
        }
        container.appendChild(grid);

        hideLoading();
    } catch (error) {
        container.innerHTML = '<div class="empty-state"><p>خطأ</p></div>';
        hideLoading();
    }
}

async function loadProfileLikes(userId, container) {
    try {
        const likesSnap = await get(ref(database, 'likes'));
        if (!likesSnap.exists()) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد إعجابات</p></div>';
            hideLoading();
            return;
        }

        const likedPostIds = [];
        likesSnap.forEach(postLikesSnap => {
            if (postLikesSnap.hasChild(userId)) {
                likedPostIds.push(postLikesSnap.key);
            }
        });

        if (!likedPostIds.length) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد إعجابات</p></div>';
            hideLoading();
            return;
        }

        container.innerHTML = '';
        for (const postId of likedPostIds.slice(0, 20)) {
            const postSnap = await get(ref(database, `posts/${postId}`));
            if (!postSnap.exists()) continue;

            const el = document.createElement('div');
            el.setAttribute('data-post-id', postId);
            container.appendChild(el);
            await renderPost({ id: postId, ...postSnap.val() }, el);
        }

        hideLoading();
    } catch (error) {
        container.innerHTML = '<div class="empty-state"><p>خطأ</p></div>';
        hideLoading();
    }
}

async function updateProfilePicture() {
    const url = document.getElementById('profile-picture-url')?.value.trim();
    if (!url) { alert('أدخل رابط الصورة'); return; }

    showLoading();
    try {
        new URL(url);
        await update(ref(database, 'users/' + auth.currentUser.uid), { profilePicture: url });
        document.getElementById('profile-picture').src = url;
        document.getElementById('sidebar-avatar').src = url;
        document.getElementById('composer-avatar').src = url;
        document.getElementById('profile-picture-url').value = '';
        alert('تم التحديث');
    } catch (error) {
        alert('رابط غير صالح');
    } finally {
        hideLoading();
    }
}

export { init, showProfile, updateProfilePicture, editProfile, saveProfile };

// Expose to window for HTML onclick handlers
if (typeof window !== 'undefined') {
    window.saveProfile = saveProfile;
    window.updateProfilePicture = updateProfilePicture;
}