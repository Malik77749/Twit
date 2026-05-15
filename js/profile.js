// Profile Module
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { formatJoinDate } from './utils.js';
import { showLoading, hideLoading, toggleSections } from './ui.js';
import { renderFeedItem } from './posts.js';

let auth, database;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Show user profile
 */
async function showProfile(userId) {
    showLoading();
    userId = userId || auth.currentUser?.uid;
    if (!userId) {
        hideLoading();
        return;
    }

    try {
        const snapshot = await get(ref(database, 'users/' + userId));
        const userData = snapshot.val();

        document.getElementById('profile-name').textContent = userData?.name || 'مستخدم';
        document.getElementById('profile-join-date').textContent = userData?.joinDate ? formatJoinDate(userData.joinDate) : '';
        document.getElementById('profile-followers').textContent = userData?.followers || 0;
        document.getElementById('profile-following').textContent = userData?.following || 0;
        document.getElementById('profile-picture').src = userData?.profilePicture || 'https://via.placeholder.com/80';

        // Show profile picture update form for own profile
        const profilePictureUpdateDiv = document.getElementById('profile-picture-update');
        profilePictureUpdateDiv.innerHTML = '';
        if (userId === auth.currentUser?.uid) {
            profilePictureUpdateDiv.innerHTML = `
                <label for="profile-picture-url" class="form-label">تغيير صورة الملف الشخصي</label>
                <input type="text" class="form-control profile-picture-input" id="profile-picture-url" placeholder="أدخل رابط الصورة">
                <button class="btn btn-primary btn-sm mt-2" onclick="updateProfilePicture()">تحديث الصورة</button>
            `;
        }

        toggleSections('profile');
        loadProfilePosts(userId);
    } catch (error) {
        alert('خطأ أثناء تحميل الملف الشخصي');
        hideLoading();
    }
}

/**
 * Update profile picture
 */
async function updateProfilePicture() {
    showLoading();
    const pictureUrl = document.getElementById('profile-picture-url').value.trim();

    if (!pictureUrl) {
        alert('يرجى إدخال رابط صورة صالح');
        hideLoading();
        return;
    }

    try {
        new URL(pictureUrl); // validate URL
        const userId = auth.currentUser.uid;
        await update(ref(database, 'users/' + userId), { profilePicture: pictureUrl });
        document.getElementById('profile-picture').src = pictureUrl;
        document.getElementById('profile-picture-url').value = '';
        alert('تم تحديث صورة الملف الشخصي بنجاح');
    } catch (error) {
        alert('رابط الصورة غير صالح أو حدث خطأ أثناء التحديث');
    } finally {
        hideLoading();
    }
}

/**
 * Load posts for a specific user profile
 */
async function loadProfilePosts(userId) {
    showLoading();
    const profilePostsDiv = document.getElementById('profile-posts');
    profilePostsDiv.innerHTML = '<p class="loading">جارٍ تحميل التغريدات...</p>';

    try {
        const postsSnapshot = await get(ref(database, 'posts'));
        const retweetsSnapshot = await get(ref(database, 'retweets'));
        profilePostsDiv.innerHTML = '';

        const posts = [];
        if (postsSnapshot.exists()) {
            postsSnapshot.forEach(child => {
                const post = child.val();
                if (post.userId === userId) {
                    posts.push({ id: child.key, ...post, type: 'post' });
                }
            });
        }

        const retweets = [];
        if (retweetsSnapshot.exists()) {
            retweetsSnapshot.forEach(child => {
                const retweet = child.val();
                if (retweet.userId === userId) {
                    retweets.push({ id: child.key, ...retweet, type: 'retweet' });
                }
            });
        }

        if (!posts.length && !retweets.length) {
            profilePostsDiv.innerHTML = '<p class="loading">لا توجد تغريدات أو إعادة تغريدات.</p>';
            hideLoading();
            return;
        }

        const allItems = [...posts, ...retweets].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        for (const item of allItems) {
            const container = document.createElement('div');
            container.setAttribute('data-post-id', item.id);
            profilePostsDiv.appendChild(container);
            await renderFeedItem(item, container);
        }

        hideLoading();
    } catch (error) {
        profilePostsDiv.innerHTML = '<p class="error-message">حدث خطأ أثناء تحميل التغريدات.</p>';
        hideLoading();
    }
}

export { init, showProfile, updateProfilePicture };
