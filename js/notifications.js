// Notifications Module
import { ref, update, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js';
import { showLoading, hideLoading, showView } from './ui.js';
import { toggleComments } from './comments.js';

let auth, database;
let notificationsUnsub = null;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

function formatNotifTime(timestamp) {
    const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `${Math.floor(diff / 60)}د`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}س`;
    return `${Math.floor(diff / 86400)}ي`;
}

function loadNotifications() {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    if (notificationsUnsub) notificationsUnsub();

    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notif-badge');
    list.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    notificationsUnsub = onValue(ref(database, `notifications/${userId}`), async snapshot => {
        list.innerHTML = '';

        if (!snapshot.exists()) {
            list.innerHTML = '<div class="empty-state"><h3>الإشعارات</h3><p>لا توجد إشعارات</p></div>';
            badge.style.display = 'none';
            return;
        }

        const notifications = [];
        snapshot.forEach(child => {
            notifications.push({ id: child.key, ...child.val() });
        });

        const unread = notifications.filter(n => !n.read).length;
        badge.textContent = unread;
        badge.style.display = unread > 0 ? 'inline' : 'none';

        notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        for (const notif of notifications) {
            const el = document.createElement('div');
            el.className = `notification-item ${!notif.read ? 'unread' : ''}`;
            el.innerHTML = `
                <p style="margin:0;${!notif.read ? 'font-weight:700;' : ''}">${escapeHtml(notif.message)}</p>
                <small style="color:var(--text-secondary);">${formatNotifTime(notif.timestamp)}</small>
            `;
            el.addEventListener('click', async () => {
                if (!notif.read) {
                    await update(ref(database, `notifications/${userId}/${notif.id}`), { read: true });
                }
                if (notif.postId) {
                    showView('home');
                    const section = document.getElementById(`comments-${notif.postId}`);
                    if (section) {
                        section.style.display = 'block';
                        section.scrollIntoView({ behavior: 'smooth' });
                        toggleComments(notif.postId);
                    }
                }
            });
            list.appendChild(el);
        }
    });
}

export { init, loadNotifications };
