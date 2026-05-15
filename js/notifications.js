// Notifications Module
import { ref, get, update, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { formatTimestamp } from './utils.js';
import { escapeHtml } from './utils.js';
import { showLoading, hideLoading, toggleSections } from './ui.js';
import { toggleComments } from './comments.js';

let auth, database;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Load and display notifications with real-time updates
 */
function loadNotifications() {
    showLoading();
    const userId = auth.currentUser?.uid;
    if (!userId) {
        hideLoading();
        return;
    }

    const notificationsList = document.getElementById('notifications-list');
    const notificationCount = document.getElementById('notification-count');
    notificationsList.innerHTML = '<p class="loading">جارٍ تحميل الإشعارات...</p>';

    onValue(ref(database, `notifications/${userId}`), async snapshot => {
        notificationsList.innerHTML = '';

        if (!snapshot.exists()) {
            notificationsList.innerHTML = '<p class="text-center">لا توجد إشعارات</p>';
            notificationCount.style.display = 'none';
            hideLoading();
            return;
        }

        const notifications = [];
        snapshot.forEach(child => {
            notifications.push({ id: child.key, ...child.val() });
        });

        const unreadCount = notifications.filter(n => !n.read).length;
        notificationCount.textContent = unreadCount;
        notificationCount.style.display = unreadCount > 0 ? 'inline-block' : 'none';

        notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        for (const notification of notifications) {
            const notificationElement = document.createElement('div');
            notificationElement.className = `notification-item ${!notification.read ? 'unread' : ''}`;
            notificationElement.innerHTML = `
                <p style="margin: 0; ${!notification.read ? 'font-weight: bold;' : ''}">${escapeHtml(notification.message)}</p>
                <small style="color: var(--action-color);">${formatTimestamp(notification.timestamp)}</small>
            `;
            notificationElement.addEventListener('click', async () => {
                if (!notification.read) {
                    await update(ref(database, `notifications/${userId}/${notification.id}`), { read: true });
                }
                if (notification.postId) {
                    toggleSections('home');
                    toggleComments(notification.postId);
                    document.getElementById(`comments-${notification.postId}`)?.scrollIntoView({ behavior: 'smooth' });
                }
            });
            notificationsList.appendChild(notificationElement);
        }
        hideLoading();
    });
}

export { init, loadNotifications };
