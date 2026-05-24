// Notifications Module — Grouped tabs + filters like X
import { ref, update, onValue, get } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js?v=3';
import { showView } from './ui.js?v=3';
import { toggleComments } from './comments.js?v=3';

let auth, database;
let notificationsUnsub = null;
let currentNotificationsTab = 'all';
let currentNotificationsFilter = 'all';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

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

function inferType(notif) {
    if (notif.type) return notif.type;
    const msg = (notif.message || '').toLowerCase();
    if (msg.includes('أعجب')) return 'likes';
    if (msg.includes('أعاد') || msg.includes('إعادة')) return 'retweets';
    if (msg.includes('متابعتك') || msg.includes('بدأ')) return 'follows';
    if (msg.includes('@') || msg.includes('رد') || msg.includes('mention')) return 'mentions';
    return 'other';
}

function inferIcon(type) {
    if (type === 'likes') return '❤️';
    if (type === 'retweets') return '🔄';
    if (type === 'follows') return '👤';
    if (type === 'mentions') return '💬';
    return '🔔';
}

function groupNotifications(notifications) {
    const groupedMap = new Map();

    for (const notif of notifications) {
        const type = inferType(notif);
        const groupKey = `${type}::${notif.postId || 'general'}`;
        if (!groupedMap.has(groupKey)) {
            groupedMap.set(groupKey, {
                id: groupKey,
                type,
                postId: notif.postId || null,
                timestamp: notif.timestamp,
                read: !!notif.read,
                notifications: []
            });
        }

        const group = groupedMap.get(groupKey);
        group.notifications.push(notif);
        if (new Date(notif.timestamp) > new Date(group.timestamp)) group.timestamp = notif.timestamp;
        if (!notif.read) group.read = false;
    }

    return [...groupedMap.values()]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .map(group => {
            const names = group.notifications
                .map(n => n.actorName || ((n.message || '').match(/^[^\s]+/) || [])[0] || 'مستخدم')
                .slice(0, 3);

            let summary = group.notifications[0]?.message || 'إشعار جديد';
            if (group.notifications.length > 1) {
                if (group.type === 'likes') {
                    summary = `${names[0] || 'أحدهم'}${names[1] ? ' و' + names[1] : ''}${group.notifications.length > 2 ? ' و' + (group.notifications.length - 2) + ' آخرون' : ''} أعجبوا بمنشورك`;
                } else if (group.type === 'retweets') {
                    summary = `${names[0] || 'أحدهم'}${names[1] ? ' و' + names[1] : ''}${group.notifications.length > 2 ? ' و' + (group.notifications.length - 2) + ' آخرون' : ''} أعادوا نشر منشورك`;
                } else if (group.type === 'follows') {
                    summary = `${names[0] || 'أحدهم'}${names[1] ? ' و' + names[1] : ''}${group.notifications.length > 2 ? ' و' + (group.notifications.length - 2) + ' آخرون' : ''} بدؤوا بمتابعتك`;
                } else if (group.type === 'mentions') {
                    summary = `${names[0] || 'أحدهم'}${names[1] ? ' و' + names[1] : ''}${group.notifications.length > 2 ? ' و' + (group.notifications.length - 2) + ' آخرون' : ''} ذكروك أو ردوا عليك`;
                }
            }

            return {
                ...group,
                summary
            };
        });
}

function filterNotifications(grouped) {
    return grouped.filter(group => {
        const type = group.type;
        if (currentNotificationsTab === 'mentions' && type !== 'mentions') return false;
        if (currentNotificationsFilter !== 'all' && type !== currentNotificationsFilter) return false;
        return true;
    });
}

function renderGroupedNotification(group) {
    const icon = inferIcon(group.type);
    const avatars = group.notifications
        .slice(0, 3)
        .map(notif => `<img class="notif-avatar" src="${escapeHtml(notif.actorAvatar || DEFAULT_AVATAR)}" alt="${escapeHtml(notif.actorName || 'مستخدم')}">`)
        .join('');

    return `
        <div class="notif-item ${!group.read ? 'unread' : ''}" onclick="openNotificationTarget('${group.postId || ''}', ${!group.read})">
            <div class="notif-icon-wrap">${icon}</div>
            <div style="flex:1;min-width:0;">
                <div class="notif-avatars">${avatars}</div>
                <div class="notif-text">${escapeHtml(group.summary)}</div>
                <div class="notif-time">${formatNotifTime(group.timestamp)}</div>
            </div>
        </div>
    `;
}

function updateBadges(unread) {
    const mobileBadge = document.getElementById('notif-badge');
    const desktopBadge = document.getElementById('notif-badge-desktop');
    if (mobileBadge) {
        mobileBadge.textContent = unread;
        mobileBadge.style.display = unread > 0 ? 'inline-flex' : 'none';
    }
    if (desktopBadge) {
        desktopBadge.textContent = unread;
        desktopBadge.style.display = unread > 0 ? 'inline-flex' : 'none';
    }
}

function loadNotifications() {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    if (notificationsUnsub) notificationsUnsub();
    const list = document.getElementById('notifications-list');
    if (list) list.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    notificationsUnsub = onValue(ref(database, `notifications/${userId}`), async snapshot => {
        if (!list) return;
        if (!snapshot.exists()) {
            list.innerHTML = '<div class="empty-state"><h3>الإشعارات</h3><p>لا توجد إشعارات</p></div>';
            updateBadges(0);
            return;
        }

        const notifications = [];
        snapshot.forEach(child => notifications.push({ id: child.key, ...child.val() }));
        notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const unread = notifications.filter(n => !n.read).length;
        updateBadges(unread);

        const grouped = groupNotifications(notifications);
        const filtered = filterNotifications(grouped);

        if (!filtered.length) {
            list.innerHTML = '<div class="empty-state"><h3>الإشعارات</h3><p>لا توجد نتائج مطابقة</p></div>';
            return;
        }

        list.innerHTML = filtered.map(renderGroupedNotification).join('');
    });
}

window.setNotificationsTab = function(tab, btn) {
    currentNotificationsTab = tab;
    document.querySelectorAll('.notif-tab').forEach(el => el.classList.remove('active'));
    btn?.classList.add('active');
    loadNotifications();
};

window.setNotificationsFilter = function(filter, btn) {
    currentNotificationsFilter = filter;
    document.querySelectorAll('.notif-filter-chip').forEach(el => el.classList.remove('active'));
    btn?.classList.add('active');
    loadNotifications();
};

window.openNotificationTarget = async function(postId, shouldMarkRead) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    if (shouldMarkRead) {
        const snap = await get(ref(database, `notifications/${userId}`));
        const updates = {};
        if (snap.exists()) {
            snap.forEach(child => {
                if (!child.val().read && (!postId || child.val().postId === postId)) {
                    updates[`notifications/${userId}/${child.key}/read`] = true;
                }
            });
        }
        if (Object.keys(updates).length) await update(ref(database), updates);
    }

    if (postId) {
        if (window.openPostDetail) {
            window.openPostDetail(postId);
            return;
        }
        showView('home');
        const section = document.getElementById(`comments-${postId}`);
        if (section) {
            section.style.display = 'block';
            section.scrollIntoView({ behavior: 'smooth' });
            toggleComments(postId);
        }
    }
};

window.markAllNotificationsRead = async function() {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
        const snapshot = await get(ref(database, `notifications/${userId}`));
        if (!snapshot.exists()) return;

        const updates = {};
        snapshot.forEach(child => {
            if (!child.val().read) updates[`notifications/${userId}/${child.key}/read`] = true;
        });
        if (Object.keys(updates).length) await update(ref(database), updates);
    } catch (error) {
        console.error('Error marking notifications read:', error);
    }
};

export { init, loadNotifications };
