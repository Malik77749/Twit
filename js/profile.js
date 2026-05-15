// Profile Module
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { showLoading, hideLoading, showView } from './ui.js';
import { getUserData } from './firebase-helpers.js';
import { renderPost, renderRetweet } from './posts.js';

let auth, database;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

async function showProfile(userId) {
    showLoading();
    userId = userId || auth.currentUser?.uid;
    if (!userId) { hideLoading(); return; }

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

        // Profile actions
        const actionsDiv = document.getElementById('profile-actions');
        if (isOwnProfile) {
            actionsDiv.innerHTML = `
                <button class="profile-edit-btn" onclick="editProfile()">تعديل الملف الشخصي</button>
                <div id="profile-edit-form" style="display:none;margin-top:12px;">
                    <input type="text" class="auth-input" id="profile-picture-url" placeholder="رابط صورة جديدة" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;">
                    <button class="follow-btn" onclick="updateProfilePicture()" style="font-size:13px;padding:4px 12px;background:var(--accent);color:white;">حفظ</button>
                </div>
            `;
        } else {
            const followSnap = await get(ref(database, `followers/${userId}/${auth.currentUser.uid}`));
            const isFollowing = followSnap.exists();
            actionsDiv.innerHTML = `<button class="follow-btn ${isFollowing ? 'following' : ''}" data-follow-id="${userId}" onclick="followUser('${userId}', event)">${isFollowing ? 'متابَع' : 'متابعة'}</button>`;
        }

        // Profile tabs
        document.querySelectorAll('.profile-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
            });
        });

        showView('profile');
        loadProfilePosts(userId);
    } catch (error) {
        alert('خطأ: ' + error.message);
        hideLoading();
    }
}

function editProfile() {
    const form = document.getElementById('profile-edit-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
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

export { init, showProfile, updateProfilePicture, editProfile };
