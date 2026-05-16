// Profile Module
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { showLoading, hideLoading, showView } from './ui.js?v=3';
import { getUserData } from './firebase-helpers.js?v=3';
import { renderPost, renderRetweet } from './posts.js?v=3';
import { escapeHtml } from './utils.js?v=3';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

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
    window.currentProfileUserId = userId;

    try {
        const userData = await getUserData(database, userId);
        const isOwnProfile = userId === auth.currentUser?.uid;

        const protectedIcon = userData.isProtected ? ' <i class="fas fa-lock" style="font-size:14px;color:var(--text-secondary);"></i>' : '';
        document.getElementById('profile-name').innerHTML = escapeHtml(userData.name || 'مستخدم') + protectedIcon;
        document.getElementById('profile-view-name').innerHTML = escapeHtml(userData.name || 'مستخدم') + protectedIcon;
        document.getElementById('profile-handle').textContent = '@' + (userData.name || 'user').replace(/\s/g, '').toLowerCase();
        document.getElementById('profile-followers').textContent = userData.followers || 0;
        document.getElementById('profile-following').textContent = userData.following || 0;
        document.getElementById('profile-picture').src = userData.profilePicture || DEFAULT_AVATAR;

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

        // Website + Location (if exists)
        const websiteEl = document.getElementById('profile-website');
        const locationEl = document.getElementById('profile-location');
        if (websiteEl) {
            if (userData.website) {
                websiteEl.innerHTML = `<i class="fas fa-link"></i> <a href="${escapeHtml(userData.website)}" target="_blank" rel="noopener noreferrer" style="color:var(--text-link);">${escapeHtml(userData.website)}</a>`;
                websiteEl.style.display = 'block';
            } else {
                websiteEl.style.display = 'none';
            }
        }
        if (locationEl) {
            if (userData.location) {
                locationEl.innerHTML = `<i class="fas fa-location-dot"></i> ${escapeHtml(userData.location)}`;
                locationEl.style.display = 'block';
            } else {
                locationEl.style.display = 'none';
            }
        }

        // Banner image
        const bannerEl = document.querySelector('.profile-banner');
        if (bannerEl) {
            if (userData.banner) {
                bannerEl.style.backgroundImage = `url(${userData.banner})`;
                bannerEl.style.backgroundSize = 'cover';
                bannerEl.style.backgroundPosition = 'center';
                bannerEl.querySelector('.profile-banner-gradient').style.display = 'none';
            } else {
                bannerEl.style.backgroundImage = '';
                const grad = bannerEl.querySelector('.profile-banner-gradient');
                if (grad) grad.style.display = 'block';
            }
        }

        // Profile actions
        const actionsDiv = document.getElementById('profile-actions');
        if (isOwnProfile) {
            actionsDiv.innerHTML = `
                <button class="profile-edit-btn" onclick="editProfile()">تعديل الملف الشخصي</button>
                <div id="profile-edit-form" style="display:none;margin-top:12px;">
                    <input type="text" class="auth-input" id="profile-name-input" placeholder="الاسم الجديد" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;" value="${escapeHtml(userData.name || '')}">
                    <input type="text" class="auth-input" id="profile-picture-url" placeholder="رابط صورة الملف الشخصي" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;">
                    <input type="text" class="auth-input" id="profile-banner-url" placeholder="رابط صورة الغلاف" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;" value="${escapeHtml(userData.banner || '')}">
                    <input type="text" class="auth-input" id="profile-bio-input" placeholder="نبذة عنك" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;" value="${escapeHtml(userData.bio || '')}">
                    <input type="text" class="auth-input" id="profile-website-input" placeholder="الموقع الإلكتروني" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;" value="${escapeHtml(userData.website || '')}">
                    <input type="text" class="auth-input" id="profile-location-input" placeholder="الموقع الجغرافي" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;" value="${escapeHtml(userData.location || '')}">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <input type="checkbox" id="profile-protected-input" ${userData.isProtected ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent);">
                        <label for="profile-protected-input" style="font-size:14px;color:var(--text-primary);cursor:pointer;"><i class="fas fa-lock"></i> حساب خاص (المنشورات تظهر للمتابعين فقط)</label>
                    </div>
                    <button class="follow-btn" onclick="saveProfile()" style="font-size:13px;padding:4px 12px;background:var(--accent);color:white;">حفظ</button>
                </div>
            `;
        } else {
            const followSnap = await get(ref(database, `followers/${userId}/${auth.currentUser.uid}`));
            const isFollowing = followSnap.exists();
            actionsDiv.innerHTML = `
                <button class="follow-btn" onclick="openDMWithUser('${userId}')" style="margin-right:8px;"><i class="far fa-envelope"></i></button>
                <button class="follow-btn ${isFollowing ? 'following' : ''}" data-follow-id="${userId}" onclick="followUser('${userId}', event)">${isFollowing ? 'متابَع' : 'متابعة'}</button>
                <button class="follow-btn" onclick="openPostMenu(null, '${userId}', false, event)" style="padding:6px 10px;"><i class="fas fa-ellipsis"></i></button>
            `;
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
    const bannerInput = document.getElementById('profile-banner-url');
    const bioInput = document.getElementById('profile-bio-input');
    const websiteInput = document.getElementById('profile-website-input');
    const locationInput = document.getElementById('profile-location-input');

    const name = nameInput?.value.trim();
    const picUrl = picInput?.value.trim();
    const bannerUrl = bannerInput?.value.trim();
    const bio = bioInput?.value.trim();
    const website = websiteInput?.value.trim();
    const location = locationInput?.value.trim();
    const isProtected = document.getElementById('profile-protected-input')?.checked || false;

    if (!name) { alert('أدخل اسمك'); return; }

    showLoading();
    try {
        const updates = { name, isProtected };
        if (bio !== undefined) updates.bio = bio;
        if (website !== undefined) updates.website = website;
        if (location !== undefined) updates.location = location;

        if (picUrl) {
            new URL(picUrl);
            updates.profilePicture = picUrl;
        }

        if (bannerUrl) {
            new URL(bannerUrl);
            updates.banner = bannerUrl;
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

        // Update banner
        if (bannerUrl) {
            const bannerEl = document.querySelector('.profile-banner');
            if (bannerEl) {
                bannerEl.style.backgroundImage = `url(${bannerUrl})`;
                bannerEl.style.backgroundSize = 'cover';
                bannerEl.style.backgroundPosition = 'center';
                const grad = bannerEl.querySelector('.profile-banner-gradient');
                if (grad) grad.style.display = 'none';
            }
        }

        // Update bio
        const bioEl = document.getElementById('profile-bio');
        if (bioEl) {
            bioEl.textContent = bio || '';
            bioEl.style.display = bio ? 'block' : 'none';
        }

        // Update website
        const websiteEl = document.getElementById('profile-website');
        if (websiteEl) {
            if (website) {
                websiteEl.innerHTML = `<i class="fas fa-link"></i> <a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer" style="color:var(--text-link);">${escapeHtml(website)}</a>`;
                websiteEl.style.display = 'block';
            } else {
                websiteEl.style.display = 'none';
            }
        }

        // Update location
        const locationEl = document.getElementById('profile-location');
        if (locationEl) {
            if (location) {
                locationEl.innerHTML = `<i class="fas fa-location-dot"></i> ${escapeHtml(location)}`;
                locationEl.style.display = 'block';
            } else {
                locationEl.style.display = 'none';
            }
        }

        // Update sidebar name
        document.getElementById('sidebar-name').textContent = name;
        document.getElementById('drawer-name').textContent = name;

        document.getElementById('profile-edit-form').style.display = 'none';
        showToast('تم التحديث');
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
        const [postsSnap, retweetsSnap, userSnap] = await Promise.all([
            get(ref(database, 'posts')),
            get(ref(database, 'retweets')),
            get(ref(database, 'users/' + userId))
        ]);

        container.innerHTML = '';
        const allItems = [];
        const userData = userSnap.val() || {};
        const pinnedPostId = userData.pinnedPost;

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

        if (!allItems.length && !pinnedPostId) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد منشورات</p></div>';
            hideLoading();
            return;
        }

        allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Show pinned post first (if exists)
        if (pinnedPostId) {
            const pinnedSnap = await get(ref(database, 'posts/' + pinnedPostId));
            if (pinnedSnap.exists()) {
                const pinnedEl = document.createElement('div');
                pinnedEl.setAttribute('data-post-id', pinnedPostId);
                pinnedEl.style.borderBottom = '2px solid var(--accent)';
                container.appendChild(pinnedEl);
                await renderPost({ id: pinnedPostId, ...pinnedSnap.val(), isPinned: true }, pinnedEl);

                // Remove pinned from regular list
                const pinnedIdx = allItems.findIndex(i => i.id === pinnedPostId);
                if (pinnedIdx !== -1) allItems.splice(pinnedIdx, 1);
            }
        }

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

/**
 * Show list of followers for a user
 */
async function showFollowersList(userId) {
    const container = document.getElementById('profile-posts');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    try {
        const followersSnap = await get(ref(database, `followers/${userId}`));
        if (!followersSnap.exists()) {
            container.innerHTML = '<div class="empty-state"><p>لا يوجد متابعون</p></div>';
            return;
        }

        container.innerHTML = '';
        const followerIds = [];
        followersSnap.forEach(child => { followerIds.push(child.key); });

        for (const fid of followerIds.slice(0, 30)) {
            const userData = await getUserData(database, fid);
            if (!userData.name) continue;

            const isFollowing = (await get(ref(database, `followers/${fid}/${auth.currentUser?.uid}`))).exists();
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-color);cursor:pointer;';
            el.onclick = () => showProfile(fid);
            el.innerHTML = `
                <img src="${userData.profilePicture || DEFAULT_AVATAR}" style="width:40px;height:40px;border-radius:50%;" alt="">
                <div style="flex:1;">
                    <div style="font-weight:700;font-size:15px;">${escapeHtml(userData.name)}</div>
                    <div style="color:var(--text-secondary);font-size:13px;">@${escapeHtml(userData.name).replace(/\s/g, '').toLowerCase()}</div>
                </div>
                ${fid !== auth.currentUser?.uid ? `<button class="follow-btn ${isFollowing ? 'following' : ''}" onclick="event.stopPropagation(); followUser('${fid}', event)">${isFollowing ? 'متابَع' : 'متابعة'}</button>` : ''}
            `;
            container.appendChild(el);
        }

        if (!followerIds.length) {
            container.innerHTML = '<div class="empty-state"><p>لا يوجد متابعون</p></div>';
        }
    } catch (error) {
        container.innerHTML = '<div class="empty-state"><p>خطأ</p></div>';
    }
}

/**
 * Show list of users this account is following
 */
async function showFollowingList(userId) {
    const container = document.getElementById('profile-posts');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    try {
        const allFollowersSnap = await get(ref(database, 'followers'));
        if (!allFollowersSnap.exists()) {
            container.innerHTML = '<div class="empty-state"><p>لا يتابع أحداً</p></div>';
            return;
        }

        container.innerHTML = '';
        const followingIds = [];

        // Find all users where this userId is a follower
        allFollowersSnap.forEach(targetUserSnap => {
            if (targetUserSnap.hasChild(userId)) {
                followingIds.push(targetUserSnap.key);
            }
        });

        for (const fid of followingIds.slice(0, 30)) {
            const userData = await getUserData(database, fid);
            if (!userData.name) continue;

            const isFollowing = (await get(ref(database, `followers/${fid}/${auth.currentUser?.uid}`))).exists();
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-color);cursor:pointer;';
            el.onclick = () => showProfile(fid);
            el.innerHTML = `
                <img src="${userData.profilePicture || DEFAULT_AVATAR}" style="width:40px;height:40px;border-radius:50%;" alt="">
                <div style="flex:1;">
                    <div style="font-weight:700;font-size:15px;">${escapeHtml(userData.name)}</div>
                    <div style="color:var(--text-secondary);font-size:13px;">@${escapeHtml(userData.name).replace(/\s/g, '').toLowerCase()}</div>
                </div>
                ${fid !== auth.currentUser?.uid ? `<button class="follow-btn ${isFollowing ? 'following' : ''}" onclick="event.stopPropagation(); followUser('${fid}', event)">${isFollowing ? 'متابَع' : 'متابعة'}</button>` : ''}
            `;
            container.appendChild(el);
        }

        if (!followingIds.length) {
            container.innerHTML = '<div class="empty-state"><p>لا يتابع أحداً</p></div>';
        }
    } catch (error) {
        container.innerHTML = '<div class="empty-state"><p>خطأ</p></div>';
    }
}

export { init, showProfile, updateProfilePicture, editProfile, saveProfile, showFollowersList, showFollowingList };

// Expose to window for HTML onclick handlers
if (typeof window !== 'undefined') {
    window.saveProfile = saveProfile;
    window.updateProfilePicture = updateProfilePicture;
    window.showFollowersList = showFollowersList;
    window.showFollowingList = showFollowingList;
}