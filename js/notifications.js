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
    const mobileBadge = document.getElementById('notif-badge');
    const desktopBadge = document.getElementById('notif-badge-desktop');
    list.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    notificationsUnsub = onValue(ref(database, `notifications/${userId}`), async snapshot => {
        list.innerHTML = '';

        if (!snapshot.exists()) {
            list.innerHTML = '<div class="empty-state"><h3>الإشعارات</h3><p>لا توجد إشعارات</p></div>';
            if (mobileBadge) mobileBadge.style.display = 'none';
            if (desktopBadge) desktopBadge.style.display = 'none';
            return;
        }

        const notifications = [];
        snapshot.forEach(child => {
            notifications.push({ id: child.key, ...child.val() });
        });

        const unread = notifications.filter(n => !n.read).length;

        // Update both mobile and desktop badges
        if (mobileBadge) {
            mobileBadge.textContent = unread;
            mobileBadge.style.display = unread > 0 ? 'inline' : 'none';
        }
        if (desktopBadge) {
            desktopBadge.textContent = unread;
            desktopBadge.style.display = unread > 0 ? 'inline-flex' : 'none';
        }

        notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Add "Mark all as read" button if there are unread
        if (unread > 0) {
            const markAllBtn = document.createElement('div');
            markAllBtn.style.cssText = 'padding:8px 16px;border-bottom:1px solid var(--border-color);';
            markAllBtn.innerHTML = `<button style="background:none;border:none;color:var(--accent);font-size:14px;cursor:pointer;font-family:inherit;" onclick="markAllNotificationsRead()">تحديد الكل كمقروء</button>`;
            list.appendChild(markAllBtn);
        }

        for (const notif of notifications) {
            const el = document.createElement('div');
            el.className = `notification-item ${!notif.read ? 'unread' : ''}`;

            // Determine icon based on notification message
            let icon = '🔔';
            if (notif.message?.includes('أعجب')) icon = '❤️';
            else if (notif.message?.includes('أعاد')) icon = '🔄';
            else if (notif.message?.includes('رد')) icon = '💬';
            else if (notif.message?.includes('متابعتك')) icon = '👤';

            el.innerHTML = `
                <div style="display:flex;align-items:flex-start;gap:12px;">
                    <span style="font-size:20px;">${icon}</span>
                    <div style="flex:1;">
                        <p style="margin:0;${!notif.read ? 'font-weight:700;' : ''}">${escapeHtml(notif.message)}</p>
                        <small style="color:var(--text-secondary);">${formatNotifTime(notif.timestamp)}</small>
                    </div>
                </div>
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

// Mark all notifications as read
window.markAllNotificationsRead = async function() {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
        const snapshot = await (await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js')).get(ref(database, `notifications/${userId}`));
        if (snapshot.exists()) {
            const updates = {};
            snapshot.forEach(child => {
                if (!child.val().read) {
                    updates[`notifications/${userId}/${child.key}/read`] = true;
                }
            });
            if (Object.keys(updates).length > 0) {
                await update(ref(database), updates);
            }
        }
    } catch (error) {
        console.error('Error marking notifications read:', error);
    }
};

export { init, loadNotifications };
