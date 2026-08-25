// ===== Mimer Admin Panel — Main Controller =====
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getDatabase, ref, get, set, update, remove, push, query, orderByChild, limitToLast, equalTo, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

// Import config from main site
const firebaseConfig = {
    apiKey: "AIzaSyCQYolSIdkBvuunY0r1DnxSHCNzjPrTcYY",
    authDomain: "mimer-23cf6.firebaseapp.com",
    databaseURL: "https://mimer-23cf6-default-rtdb.firebaseio.com",
    projectId: "mimer-23cf6",
    storageBucket: "mimer-23cf6.firebasestorage.app",
    messagingSenderId: "894290551568",
    appId: "1:894290551568:web:5270deb5704f625284bb95",
    measurementId: "G-QSGNW29K5B"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

// ===== State =====
let currentAdmin = null;
let allUsers = [];
let allPosts = [];
let allReports = [];
let allAuditLogs = [];
let allVerificationThreads = [];
let allCommunities = [];
let currentUsersFilter = 'all';
let currentPostsFilter = 'all';
let currentReportsFilter = 'pending';
let currentAuditFilter = 'all';
let currentCommunitiesFilter = 'all';
let usersPage = 1;
let postsPage = 1;
const PAGE_SIZE = 20;
let usersChart = null;
let postsChart = null;

// ===== Utility =====
const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso) {
    if (!iso) return '';
    const now = Date.now();
    const diff = now - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'الآن';
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `منذ ${days} يوم`;
    return formatDate(iso);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, type = 'info') {
    const toast = document.getElementById('admin-toast');
    toast.textContent = msg;
    toast.className = 'admin-toast show' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
    setTimeout(() => toast.className = 'admin-toast', 3000);
}

function getUserStatus(userData) {
    if (userData.banStatus === 'banned') return 'banned';
    if (userData.banStatus === 'suspended') return 'suspended';
    return 'active';
}

function getUserAvatar(userData) {
    const raw = String(userData?.profilePicture || '').trim();
    const safe = /^(https?:\/\/|data:image\/)/i.test(raw) ? raw : DEFAULT_AVATAR;
    return escapeHtml(safe);
}

function getUserName(userData) {
    return userData.name || 'مستخدم بدون اسم';
}

function getUserHandle(userData) {
    return userData.email || userData.phoneDisplay || userData.phone || '';
}

// Safe timestamp comparison — handles both ISO strings and Unix numbers
function isToday(ts) {
    if (!ts) return false;
    const today = new Date().toISOString().split('T')[0];
    try {
        const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
        if (isNaN(d.getTime())) return false;
        return d.toISOString().startsWith(today);
    } catch { return false; }
}

function safeDate(ts) {
    if (!ts) return null;
    try {
        const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
        return isNaN(d.getTime()) ? null : d;
    } catch { return null; }
}

// ===== Auth =====
document.getElementById('admin-login-btn').addEventListener('click', async () => {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value.trim();
    const errorEl = document.getElementById('admin-error');

    if (!email || !password) {
        errorEl.textContent = 'أدخل البريد وكلمة المرور';
        return;
    }

    try {
        errorEl.textContent = '';
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        const messages = {
            'auth/user-not-found': 'البريد غير مسجل',
            'auth/wrong-password': 'كلمة المرور غير صحيحة',
            'auth/invalid-credential': 'بيانات الدخول غير صحيحة',
            'auth/too-many-requests': 'محاولات كثيرة، حاول لاحقاً'
        };
        errorEl.textContent = messages[error.code] || error.message;
    }
});

window.adminLogout = async () => {
    await signOut(auth);
};

// ===== Auth State =====
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Check if admin
        try {
            const adminSnap = await get(ref(database, `users/${user.uid}/isAdmin`));
            const isAdmin = adminSnap.val();
            if (isAdmin === true) {
                currentAdmin = user;
                document.getElementById('admin-auth').style.display = 'none';
                document.getElementById('admin-app').style.display = 'flex';
                document.getElementById('admin-name').textContent = user.displayName || 'أدمن';
                await loadAllData();
                loadDashboard();
            } else {
                document.getElementById('admin-error').textContent = 'ليس لديك صلاحيات الأدمن';
                await signOut(auth);
            }
        } catch (e) {
            document.getElementById('admin-error').textContent = 'خطأ في التحقق من الصلاحيات';
            await signOut(auth);
        }
    } else {
        currentAdmin = null;
        document.getElementById('admin-auth').style.display = 'flex';
        document.getElementById('admin-app').style.display = 'none';
    }
});

// ===== Navigation =====
window.switchAdminView = (view) => {
    const views = ['dashboard', 'users', 'posts', 'reports', 'verification', 'communities', 'settings', 'audit'];
    views.forEach(v => {
        const el = document.getElementById(`${v}-view`);
        if (el) el.style.display = v === view ? 'block' : 'none';
    });
    document.querySelectorAll('.admin-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    const mobileNav = document.getElementById('admin-mobile-nav');
    if (mobileNav) mobileNav.value = view;
    // Refresh data on view switch
    if (view === 'users') renderUsersTable();
    if (view === 'posts') renderPostsTable();
    if (view === 'reports') renderReportsList();
    if (view === 'verification') loadVerificationInbox();
    if (view === 'audit') renderAuditList();
    if (view === 'communities') renderCommunitiesList();
    if (view === 'settings') loadSettings();
};

// ===== Load All Data =====
async function loadAllData() {
    try {
        // Load users
        const usersSnap = await get(ref(database, 'users'));
        allUsers = [];
        if (usersSnap.exists()) {
            usersSnap.forEach(child => {
                allUsers.push({ id: child.key, ...child.val() });
            });
        }

        // Load bans
        const bansSnap = await get(ref(database, 'bans'));
        if (bansSnap.exists()) {
            bansSnap.forEach(child => {
                const uid = child.key;
                const banData = child.val();
                const user = allUsers.find(u => u.id === uid);
                if (user) user.banStatus = banData.status;
            });
        }

        // Load posts
        const postsSnap = await get(ref(database, 'posts'));
        allPosts = [];
        if (postsSnap.exists()) {
            postsSnap.forEach(child => {
                allPosts.push({ id: child.key, ...child.val() });
            });
            allPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        // Load reports
        const reportsSnap = await get(ref(database, 'reports'));
        allReports = [];
        if (reportsSnap.exists()) {
            reportsSnap.forEach(child => {
                allReports.push({ id: child.key, ...child.val() });
            });
        }

        // Load verification inbox
        const verificationSnap = await get(ref(database, 'verificationThreads'));
        allVerificationThreads = [];
        if (verificationSnap.exists()) verificationSnap.forEach(child => {
            const raw = child.val() || {};
            allVerificationThreads.push({ id: child.key, ...(raw.meta || {}), messages: raw.messages || {} });
        });
        allVerificationThreads.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
        const verificationBadge = document.getElementById('verification-badge');
        const unreadVerification = allVerificationThreads.filter(t => t.unreadForAdmin).length;
        if (verificationBadge) { verificationBadge.textContent = unreadVerification; verificationBadge.style.display = unreadVerification ? 'flex' : 'none'; }

        // Load communities
        const communitiesSnap = await get(ref(database, 'communities'));
        allCommunities = [];
        if (communitiesSnap.exists()) communitiesSnap.forEach(child => allCommunities.push({ id: child.key, ...child.val() }));
        allCommunities.sort((a, b) => Number(b.memberCount || 0) - Number(a.memberCount || 0));

        // Load audit logs
        const auditSnap = await get(ref(database, 'auditLog'));
        allAuditLogs = [];
        if (auditSnap.exists()) {
            auditSnap.forEach(child => {
                allAuditLogs.push({ id: child.key, ...child.val() });
            });
            allAuditLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        // Update badges
        const pendingReports = allReports.filter(r => r.status === 'pending').length;
        document.getElementById('reports-badge').textContent = pendingReports;
        document.getElementById('reports-badge').style.display = pendingReports > 0 ? 'flex' : 'none';

        // Update quick stats
        updateQuickStats();
        updateReportQueueSummary();
        renderRecentUsers();

    } catch (e) {
        console.error('Error loading data:', e);
    }
}

// ===== Dashboard =====
async function loadDashboard() {
    try {
        // Stats
        document.getElementById('stat-total-users').textContent = allUsers.length || '—';
        document.getElementById('stat-total-posts').textContent = allPosts.length || '—';

        const todayPosts = allPosts.filter(p => isToday(p.timestamp)).length;
        document.getElementById('stat-active-users').textContent = todayPosts > 0 ? Math.min(todayPosts * 3, allUsers.length) : '—';

        const bannedCount = allUsers.filter(u => u.banStatus === 'banned' || u.banStatus === 'suspended').length;
        document.getElementById('stat-banned-users').textContent = bannedCount;

        const pendingReports = allReports.filter(r => r.status === 'pending').length;
        document.getElementById('stat-pending-reports').textContent = pendingReports;

        // Charts
        renderUsersChart();
        renderPostsChart();
        renderActivityFeed();

    } catch (e) {
        console.error('Dashboard error:', e);
    }
}

function renderUsersChart() {
    const ctx = document.getElementById('users-chart');
    if (!ctx) return;

    // Generate last 30 days data
    const labels = [];
    const data = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }));
        const count = allUsers.filter(u => {
            if (!u.joinDate) return false;
            const d = safeDate(u.joinDate);
            return d && d.toISOString().startsWith(dateStr);
        }).length;
        data.push(count);
    }

    if (usersChart) usersChart.destroy();
    usersChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'مستخدمين جدد',
                data,
                borderColor: '#1d9bf0',
                backgroundColor: 'rgba(29, 155, 240, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: '#1d9bf0'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#71767b', maxTicksLimit: 8 }, grid: { color: '#2f3336' } },
                y: { ticks: { color: '#71767b', stepSize: 1 }, grid: { color: '#2f3336' }, beginAtZero: true }
            }
        }
    });
}

function renderPostsChart() {
    const ctx = document.getElementById('posts-chart');
    if (!ctx) return;

    const labels = [];
    const data = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('ar-SA', { weekday: 'short' }));
        const count = allPosts.filter(p => {
            if (!p.timestamp) return false;
            const d = safeDate(p.timestamp);
            return d && d.toISOString().startsWith(dateStr);
        }).length;
        data.push(count);
    }

    if (postsChart) postsChart.destroy();
    postsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'منشورات',
                data,
                backgroundColor: '#1d9bf0',
                borderRadius: 8,
                barThickness: 32
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#71767b' }, grid: { display: false } },
                y: { ticks: { color: '#71767b', stepSize: 1 }, grid: { color: '#2f3336' }, beginAtZero: true }
            }
        }
    });
}

function renderActivityFeed() {
    const container = document.getElementById('activity-feed');
    // Combine recent activities from audit log + posts
    const activities = [];

    // Recent audit logs
    allAuditLogs.slice(0, 10).forEach(log => {
        activities.push({
            type: log.action,
            text: `${escapeHtml(log.adminName || 'أدمن')} — ${escapeHtml(log.action || '')}: ${escapeHtml(log.targetName || log.targetId || '')}`,
            time: log.timestamp,
            icon: getAuditIcon(log.action)
        });
    });

    // Recent posts
    allPosts.slice(0, 5).forEach(post => {
        const user = allUsers.find(u => u.id === post.userId);
        activities.push({
            type: 'post',
            text: `${escapeHtml(getUserName(user || {}))} نشر: ${escapeHtml((post.content || '').substring(0, 50))}`,
            time: post.timestamp,
            icon: 'post'
        });
    });

    activities.sort((a, b) => new Date(b.time) - new Date(a.time));

    if (activities.length === 0) {
        container.innerHTML = '<div class="admin-empty"><i class="fas fa-clock"></i><h3>لا توجد نشاطات</h3></div>';
        return;
    }

    container.innerHTML = activities.slice(0, 15).map(a => `
        <div class="activity-item">
            <div class="activity-icon ${a.icon}"><i class="fas fa-${getActivityFaIcon(a.icon)}"></i></div>
            <div class="activity-info">
                <div class="activity-text">${a.text}</div>
                <div class="activity-time">${timeAgo(a.time)}</div>
            </div>
        </div>
    `).join('');
}

function getAuditIcon(action) {
    if (action.includes('ban')) return 'ban';
    if (action.includes('suspend')) return 'ban';
    if (action.includes('verify')) return 'verify';
    if (action.includes('delete')) return 'report';
    if (action.includes('settings')) return 'settings';
    if (action.includes('login')) return 'login';
    return 'post';
}

function getActivityFaIcon(type) {
    const icons = { login: 'right-to-bracket', post: 'file-lines', report: 'flag', ban: 'ban', verify: 'check-circle', settings: 'gear' };
    return icons[type] || 'circle';
}

window.refreshDashboard = async () => {
    await loadAllData();
    loadDashboard();
    showToast('تم تحديث البيانات', 'success');
};

// ===== Users Management =====
function renderUsersTable() {
    let filtered = [...allUsers];

    // Apply filter
    if (currentUsersFilter === 'active') filtered = filtered.filter(u => !u.banStatus || u.banStatus === 'active');
    else if (currentUsersFilter === 'suspended') filtered = filtered.filter(u => u.banStatus === 'suspended');
    else if (currentUsersFilter === 'banned') filtered = filtered.filter(u => u.banStatus === 'banned');
    else if (currentUsersFilter === 'verified') filtered = filtered.filter(u => u.verified === true || u.verified === 'blue');

    // Apply search
    const search = document.getElementById('users-search')?.value?.toLowerCase() || '';
    if (search) {
        filtered = filtered.filter(u =>
            (u.name || '').toLowerCase().includes(search) ||
            (u.email || '').toLowerCase().includes(search) ||
            (u.phone || '').includes(search) ||
            (u.phoneDisplay || '').includes(search)
        );
    }

    // Pagination
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (usersPage > totalPages) usersPage = 1;
    const start = (usersPage - 1) * PAGE_SIZE;
    const pageData = filtered.slice(start, start + PAGE_SIZE);

    const tbody = document.getElementById('users-table-body');
    if (pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5"><div class="admin-empty"><i class="fas fa-users"></i><h3>لا يوجد مستخدمين</h3></div></td></tr>';
    } else {
        tbody.innerHTML = pageData.map(u => {
            const status = getUserStatus(u);
            const statusLabel = status === 'banned' ? 'محظور' : status === 'suspended' ? 'معلق' : 'نشط';
            return `
            <tr onclick="openUserModal('${u.id}')">
                <td>
                    <div class="table-user">
                        <img src="${getUserAvatar(u)}" alt="">
                        <div class="table-user-info">
                            <div class="table-user-name">${escapeHtml(getUserName(u))} ${u.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''}</div>
                            <div class="table-user-handle">${escapeHtml(getUserHandle(u))}</div>
                        </div>
                    </div>
                </td>
                <td>${formatDate(u.joinDate)}</td>
                <td>${allPosts.filter(p => p.userId === u.id).length}</td>
                <td><span class="status-badge ${status}"><span class="dot"></span>${statusLabel}</span></td>
                <td>
                    <button class="action-btn outline small" onclick="event.stopPropagation();openUserModal('${u.id}')"><i class="fas fa-eye"></i></button>
                </td>
            </tr>`;
        }).join('');
    }

    // Pagination controls
    renderPagination('users-pagination', totalPages, usersPage, (p) => { usersPage = p; renderUsersTable(); });
}

window.filterUsers = () => { usersPage = 1; renderUsersTable(); };
window.setUsersFilter = (filter, btn) => {
    currentUsersFilter = filter;
    document.querySelectorAll('#users-view .filter-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    usersPage = 1;
    renderUsersTable();
};

// ===== User Modal =====
window.openUserModal = async (uid) => {
    const user = allUsers.find(u => u.id === uid);
    if (!user) return;

    const status = getUserStatus(user);
    const statusLabel = status === 'banned' ? 'محظور' : status === 'suspended' ? 'معلق' : 'نشط';

    // Get user's posts count
    const userPosts = allPosts.filter(p => p.userId === uid);

    // Get ban info
    let banInfo = '';
    if (user.banStatus === 'banned') banInfo = `<div style="color:var(--danger);margin-top:8px;"><i class="fas fa-ban"></i> محظور${user.banReason ? ': ' + escapeHtml(user.banReason) : ''}</div>`;
    if (user.banStatus === 'suspended') banInfo = `<div style="color:var(--warning);margin-top:8px;"><i class="fas fa-clock"></i> معلق${user.banReason ? ': ' + escapeHtml(user.banReason) : ''}</div>`;

    document.getElementById('user-modal-body').innerHTML = `
        <div class="user-detail-header">
            <img class="user-detail-avatar" src="${getUserAvatar(user)}" alt="">
            <div>
                <div class="user-detail-name">${escapeHtml(getUserName(user))} ${user.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''}</div>
                <div class="user-detail-handle">${escapeHtml(user.email || user.phoneDisplay || '')}</div>
                <span class="status-badge ${status}"><span class="dot"></span>${statusLabel}</span>
            </div>
        </div>
        ${banInfo}
        <div class="user-detail-stats">
            <div class="user-detail-stat"><strong>${userPosts.length}</strong><span>منشورات</span></div>
            <div class="user-detail-stat"><strong>${user.followers || 0}</strong><span>متابعين</span></div>
            <div class="user-detail-stat"><strong>${user.following || 0}</strong><span>يتابع</span></div>
        </div>
        <div class="user-detail-info">
            <div class="user-detail-info-row"><i class="fas fa-envelope"></i><span class="label">البريد:</span>${user.email || '—'}</div>
            <div class="user-detail-info-row"><i class="fas fa-phone"></i><span class="label">الهاتف:</span>${user.phoneDisplay || user.phone || '—'}</div>
            <div class="user-detail-info-row"><i class="fas fa-calendar"></i><span class="label">انضم:</span>${formatDate(user.joinDate)}</div>
            <div class="user-detail-info-row"><i class="fas fa-shield"></i><span class="label">المزود:</span>${user.provider || '—'}</div>
            ${user.bio ? `<div class="user-detail-info-row"><i class="fas fa-align-right"></i><span class="label">البايو:</span>${escapeHtml(user.bio)}</div>` : ''}
        </div>
        <div class="user-detail-actions">
            ${!user.verified ? `<button class="action-btn primary" onclick="verifyUser('${uid}')"><i class="fas fa-check-circle"></i> توثيق</button>` : `<button class="action-btn outline" onclick="unverifyUser('${uid}')"><i class="fas fa-times-circle"></i> إلغاء التوثيق</button>`}
            ${status !== 'suspended' ? `<button class="action-btn warning" onclick="suspendUser('${uid}')"><i class="fas fa-clock"></i> إيقاف مؤقت</button>` : `<button class="action-btn success" onclick="unsuspendUser('${uid}')"><i class="fas fa-check"></i> إلغاء الإيقاف</button>`}
            ${status !== 'banned' ? `<button class="action-btn danger" onclick="banUser('${uid}')"><i class="fas fa-ban"></i> حظر</button>` : `<button class="action-btn success" onclick="unbanUser('${uid}')"><i class="fas fa-check"></i> إلغاء الحظر</button>`}
            <button class="action-btn outline" onclick="sendNotification('${uid}')"><i class="fas fa-bell"></i> إرسال إشعار</button>
            <button class="action-btn danger" onclick="deleteUser('${uid}')"><i class="fas fa-trash"></i> حذف الحساب</button>
        </div>
    `;
    document.getElementById('user-modal').classList.add('show');
};

window.closeUserModal = () => {
    document.getElementById('user-modal').classList.remove('show');
};

// ===== User Actions =====
async function logAudit(action, targetId, targetName, details = '') {
    const logRef = push(ref(database, 'auditLog'));
    await set(logRef, {
        action,
        adminId: currentAdmin.uid,
        adminName: currentAdmin.displayName || currentAdmin.email || 'أدمن',
        targetId,
        targetName: targetName || '',
        details,
        timestamp: new Date().toISOString()
    });
}

window.verifyUser = async (uid) => {
    const user = allUsers.find(u => u.id === uid);
    const startInput = prompt('تاريخ بداية التوثيق (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!startInput) return;
    const endInput = prompt('تاريخ نهاية التوثيق (YYYY-MM-DD):', new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10));
    if (!endInput) return;
    const start = new Date(`${startInput}T00:00:00Z`);
    const end = new Date(`${endInput}T23:59:59Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) { showToast('تواريخ التوثيق غير صحيحة', 'error'); return; }
    try {
        await update(ref(database, `users/${uid}`), { verified: 'blue', verificationStart: start.toISOString(), verificationEnd: end.toISOString() });
        const noticeRef = push(ref(database, `notifications/${uid}`));
        await set(noticeRef, { type: 'verification', message: `تم توثيق حسابك في ميمر حتى ${endInput}. سنذكّرك عند اقتراب التجديد.`, from: 'admin', read: false, timestamp: new Date().toISOString() });
        const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
        if (days <= 30) { const renewalRef = push(ref(database, `notifications/${uid}`)); await set(renewalRef, { type: 'verification-renewal', message: `ينتهي توثيق حسابك خلال ${Math.max(1, days)} يومًا. يمكنك طلب التجديد من إعدادات الحساب.`, from: 'admin', read: false, timestamp: new Date().toISOString() }); }
        if (user) { user.verified = 'blue'; user.verificationStart = start.toISOString(); user.verificationEnd = end.toISOString(); }
        await logAudit('verify', uid, getUserName(user || {}), `توثيق أزرق من ${startInput} إلى ${endInput}`);
        showToast('تم توثيق الحساب', 'success');
        openUserModal(uid);
        renderUsersTable();
    } catch (e) {
        showToast('خطأ: ' + e.message, 'error');
    }
};

window.unverifyUser = async (uid) => {
    try {
        await update(ref(database, `users/${uid}`), { verified: false, verificationStart: null, verificationEnd: null });
        const user = allUsers.find(u => u.id === uid);
        if (user) user.verified = false;
        await logAudit('unverify', uid, getUserName(user || {}), 'إلغاء التوثيق');
        showToast('تم إلغاء التوثيق', 'success');
        openUserModal(uid);
        renderUsersTable();
    } catch (e) {
        showToast('خطأ: ' + e.message, 'error');
    }
};

window.suspendUser = async (uid) => {
    const user = allUsers.find(u => u.id === uid);
    const rawDays = prompt('مدة التجميد بالأيام (1 إلى 365):', '7');
    if (rawDays === null) return;
    const days = Math.max(1, Math.min(365, Number.parseInt(rawDays, 10) || 0));
    if (!days) { showToast('أدخل عدد أيام صحيحاً', 'error'); return; }
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    showConfirm('إيقاف الحساب', `هل تريد إيقاف حساب "${getUserName(user)}" لمدة ${days} أيام؟`, async () => {
        try {
            await set(ref(database, `bans/${uid}`), { status: 'suspended', durationDays: days, expiresAt, reason: 'إيقاف مؤقت من الأدمن', timestamp: new Date().toISOString() });
            if (user) user.banStatus = 'suspended';
            await logAudit('suspend', uid, getUserName(user || {}), 'إيقاف الحساب مؤقتاً');
            showToast('تم إيقاف الحساب', 'success');
            openUserModal(uid);
            renderUsersTable();
        } catch (e) {
            showToast('خطأ: ' + e.message, 'error');
        }
    });
};

window.unsuspendUser = async (uid) => {
    try {
        await remove(ref(database, `bans/${uid}`));
        const user = allUsers.find(u => u.id === uid);
        if (user) user.banStatus = null;
        await logAudit('unsuspend', uid, getUserName(user || {}), 'إلغاء الإيقاف');
        showToast('تم إلغاء الإيقاف', 'success');
        openUserModal(uid);
        renderUsersTable();
    } catch (e) {
        showToast('خطأ: ' + e.message, 'error');
    }
};

window.banUser = async (uid) => {
    const user = allUsers.find(u => u.id === uid);
    showConfirm('حظر الحساب', `هل تريد حظر "${getUserName(user)}" نهائياً؟ هذا الإجراء لا يمكن التراجع عنه بسهولة.`, async () => {
        try {
            await set(ref(database, `bans/${uid}`), { status: 'banned', reason: 'حظر دائم من الأدمن', timestamp: new Date().toISOString() });
            if (user) user.banStatus = 'banned';
            await logAudit('ban', uid, getUserName(user || {}), 'حظر الحساب');
            showToast('تم حظر الحساب', 'success');
            openUserModal(uid);
            renderUsersTable();
        } catch (e) {
            showToast('خطأ: ' + e.message, 'error');
        }
    });
};

window.unbanUser = async (uid) => {
    try {
        await remove(ref(database, `bans/${uid}`));
        const user = allUsers.find(u => u.id === uid);
        if (user) user.banStatus = null;
        await logAudit('unban', uid, getUserName(user || {}), 'إلغاء الحظر');
        showToast('تم إلغاء الحظر', 'success');
        openUserModal(uid);
        renderUsersTable();
    } catch (e) {
        showToast('خطأ: ' + e.message, 'error');
    }
};

window.deleteUser = async (uid) => {
    const user = allUsers.find(u => u.id === uid);
    showConfirm('حذف الحساب', `⚠️ حذف "${getUserName(user)}" — سيتم حذف جميع بياناته نهائياً. هذا الإجراء لا رجعة فيه!`, async () => {
        try {
            // Delete user data
            await remove(ref(database, `users/${uid}`));
            await remove(ref(database, `bans/${uid}`));
            // Delete user's posts
            const userPosts = allPosts.filter(p => p.userId === uid);
            for (const post of userPosts) {
                await remove(ref(database, `posts/${post.id}`));
            }
            // Remove from local state
            allUsers = allUsers.filter(u => u.id !== uid);
            allPosts = allPosts.filter(p => p.userId !== uid);
            await logAudit('delete_user', uid, getUserName(user || {}), 'حذف الحساب وجميع بياناته');
            showToast('تم حذف الحساب', 'success');
            closeUserModal();
            renderUsersTable();
        } catch (e) {
            showToast('خطأ: ' + e.message, 'error');
        }
    });
};

window.sendNotification = async (uid) => {
    const user = allUsers.find(u => u.id === uid);
    const message = prompt(`إرسال إشعار لـ ${getUserName(user)}:`);
    if (!message) return;
    try {
        const notifRef = push(ref(database, `notifications/${uid}`));
        await set(notifRef, {
            type: 'admin_message',
            message,
            from: 'admin',
            read: false,
            timestamp: new Date().toISOString()
        });
        await logAudit('send_notification', uid, getUserName(user || {}), message);
        showToast('تم إرسال الإشعار', 'success');
    } catch (e) {
        showToast('خطأ: ' + e.message, 'error');
    }
};

// ===== Posts Management =====
function renderPostsTable() {
    let filtered = [...allPosts];

    if (currentPostsFilter === 'reported') {
        const reportedIds = allReports.filter(r => r.status === 'pending').map(r => r.postId);
        filtered = filtered.filter(p => reportedIds.includes(p.id));
    }
    else if (currentPostsFilter === 'hidden') filtered = filtered.filter(p => p.hidden);
    else if (currentPostsFilter === 'pinned') filtered = filtered.filter(p => p.pinned);

    const search = document.getElementById('posts-search')?.value?.toLowerCase() || '';
    if (search) {
        filtered = filtered.filter(p => (p.content || '').toLowerCase().includes(search));
    }

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (postsPage > totalPages) postsPage = 1;
    const start = (postsPage - 1) * PAGE_SIZE;
    const pageData = filtered.slice(start, start + PAGE_SIZE);

    const tbody = document.getElementById('posts-table-body');
    if (pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5"><div class="admin-empty"><i class="fas fa-file-lines"></i><h3>لا توجد منشورات</h3></div></td></tr>';
    } else {
        tbody.innerHTML = pageData.map(p => {
            const user = allUsers.find(u => u.id === p.userId);
            const reportCount = allReports.filter(r => r.postId === p.id && r.status === 'pending').length;
            return `
            <tr onclick="openPostModal('${p.id}')">
                <td>
                    <div class="table-user">
                        <img src="${getUserAvatar(user || {})}" alt="">
                        <div class="table-user-info">
                            <div class="table-user-name">${escapeHtml(getUserName(user || {}))} ${(user || {}).verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''}</div>
                            <div class="table-user-handle">${escapeHtml(getUserHandle(user || {}))}</div>
                        </div>
                    </div>
                </td>
                <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml((p.content || '').substring(0, 80))}</td>
                <td>${timeAgo(p.timestamp)}</td>
                <td>${countLikes(p)}</td>
                <td>
                    ${reportCount > 0 ? `<span class="status-badge banned" style="font-size:12px;"><i class="fas fa-flag"></i> ${reportCount}</span>` : ''}
                    <button class="action-btn outline small" onclick="event.stopPropagation();openPostModal('${p.id}')"><i class="fas fa-eye"></i></button>
                </td>
            </tr>`;
        }).join('');
    }

    renderPagination('posts-pagination', totalPages, postsPage, (p) => { postsPage = p; renderPostsTable(); });
}

window.filterPosts = () => { postsPage = 1; renderPostsTable(); };
window.setPostsFilter = (filter, btn) => {
    currentPostsFilter = filter;
    document.querySelectorAll('#posts-view .filter-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    postsPage = 1;
    renderPostsTable();
};

window.openPostModal = (postId) => {
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    const user = allUsers.find(u => u.id === post.userId);

    const postMediaItems = Array.isArray(post.media) && post.media.length
        ? post.media.filter(item => item?.url)
        : post.imageUrl
            ? [{ type: 'image', url: post.imageUrl }]
            : post.videoUrl
                ? [{ type: 'embed', url: post.videoUrl }]
                : [];
    const postMediaHtml = postMediaItems.map(item => {
        const url = String(item.url || '').trim();
        if (!url) return '';
        const safeUrl = escapeHtml(url);
        if (item.type === 'video') return `<video controls playsinline preload="metadata" style="max-width:100%;border-radius:16px;margin-bottom:12px;"><source src="${safeUrl}">متصفحك لا يدعم تشغيل الفيديو.</video>`;
        if (item.type === 'embed') return `<iframe src="${safeUrl}" title="فيديو المنشور" allowfullscreen loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:16px;margin-bottom:12px;"></iframe>`;
        return `<img src="${safeUrl}" style="max-width:100%;max-height:360px;object-fit:contain;border-radius:16px;border:1px solid var(--border-color);margin-bottom:12px;" alt="صورة المنشور" loading="lazy">`;
    }).join('');
    document.getElementById('post-modal-body').innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <img src="${getUserAvatar(user || {})}" style="width:48px;height:48px;border-radius:50%;" alt="">
            <div>
                <div style="font-weight:800;font-size:17px;">${escapeHtml(getUserName(user || {}))}</div>
                <div style="color:var(--text-secondary);font-size:15px;">${formatTime(post.timestamp)}</div>
            </div>
        </div>
        <div style="font-size:18px;line-height:1.5;margin-bottom:16px;white-space:pre-wrap;">${escapeHtml(post.content)}</div>
        ${postMediaHtml}
        <div style="display:flex;gap:20px;padding:12px 0;border-top:1px solid var(--border-color);border-bottom:1px solid var(--border-color);margin-bottom:16px;color:var(--text-secondary);">
            <span><i class="fas fa-heart" style="color:var(--like-color);"></i> ${countLikes(post)}</span>
            <span><i class="fas fa-comment"></i> ${post.commentCount || 0}</span>
            <span><i class="fas fa-retweet" style="color:var(--success);"></i> ${post.retweets || 0}</span>
            <span><i class="fas fa-eye"></i> ${post.views || 0}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="action-btn outline" onclick="togglePinPost('${postId}')"><i class="fas fa-thumbtack"></i> ${post.pinned ? 'إلغاء التثبيت' : 'تثبيت'}</button>
            <button class="action-btn outline" onclick="toggleHidePost('${postId}')"><i class="fas fa-eye-slash"></i> ${post.hidden ? 'إظهار' : 'إخفاء'}</button>
            <button class="action-btn danger" onclick="deletePost('${postId}')"><i class="fas fa-trash"></i> حذف</button>
        </div>
    `;
    document.getElementById('post-modal').classList.add('show');
};

window.closePostModal = () => {
    document.getElementById('post-modal').classList.remove('show');
};

window.togglePinPost = async (postId) => {
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    try {
        await update(ref(database, `posts/${postId}`), { pinned: !post.pinned });
        post.pinned = !post.pinned;
        await logAudit(post.pinned ? 'pin_post' : 'unpin_post', postId, '', post.pinned ? 'تثبيت المنشور' : 'إلغاء التثبيت');
        showToast(post.pinned ? 'تم تثبيت المنشور' : 'تم إلغاء التثبيت', 'success');
        openPostModal(postId);
        renderPostsTable();
    } catch (e) {
        showToast('خطأ: ' + e.message, 'error');
    }
};

window.toggleHidePost = async (postId) => {
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    try {
        await update(ref(database, `posts/${postId}`), { hidden: !post.hidden });
        post.hidden = !post.hidden;
        await logAudit(post.hidden ? 'hide_post' : 'show_post', postId, '', post.hidden ? 'إخفاء المنشور' : 'إظهار المنشور');
        showToast(post.hidden ? 'تم إخفاء المنشور' : 'تم إظهار المنشور', 'success');
        openPostModal(postId);
        renderPostsTable();
    } catch (e) {
        showToast('خطأ: ' + e.message, 'error');
    }
};

window.deletePost = async (postId) => {
    showConfirm('حذف المنشور', 'هل تريد حذف هذا المنشور نهائياً؟', async () => {
        try {
            await remove(ref(database, `posts/${postId}`));
            allPosts = allPosts.filter(p => p.id !== postId);
            await logAudit('delete_post', postId, '', 'حذف المنشور');
            showToast('تم حذف المنشور', 'success');
            closePostModal();
            renderPostsTable();
        } catch (e) {
            showToast('خطأ: ' + e.message, 'error');
        }
    });
};

// ===== Reports =====
function renderReportsList() {
    let filtered = [...allReports];

    if (currentReportsFilter === 'pending') filtered = filtered.filter(r => r.status === 'pending');
    else if (currentReportsFilter === 'content') filtered = filtered.filter(r => r.type === 'content');
    else if (currentReportsFilter === 'spam') filtered = filtered.filter(r => r.type === 'spam');
    else if (currentReportsFilter === 'fake') filtered = filtered.filter(r => r.type === 'fake');

    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    updateReportQueueSummary();
    const container = document.getElementById('reports-list');
    if (filtered.length === 0) {
        container.innerHTML = '<div class="admin-empty"><i class="fas fa-flag"></i><h3>لا توجد بلاغات</h3><p>لا توجد بلاغات مطابقة</p></div>';
        return;
    }

    container.innerHTML = filtered.map(r => {
        const targetUserId = r.reportedUserId || r.userId || '';
        const typeLabel = r.type === 'content' ? 'محتوى مخالف' : r.type === 'spam' ? 'إزعاج' : r.type === 'fake' ? 'حساب وهمي' : r.type === 'user' ? 'حساب' : 'أخرى';
        const typeClass = r.type === 'content' ? 'content' : r.type === 'spam' ? 'spam' : r.type === 'fake' ? 'fake' : 'other';
        const reporter = allUsers.find(u => u.id === r.reporterId);
        const post = r.postId ? allPosts.find(p => p.id === r.postId) : null;
        const reportedUser = allUsers.find(u => u.id === targetUserId);
        const targetHtml = post
            ? `<div class="report-content">"${escapeHtml((post.content || '').substring(0, 240))}"</div>`
            : reportedUser
                ? `<div class="report-content" style="display:flex;align-items:center;gap:10px;"><img src="${getUserAvatar(reportedUser)}" style="width:36px;height:36px;border-radius:50%;" alt=""><span>${escapeHtml(getUserName(reportedUser))} — ${escapeHtml(getUserHandle(reportedUser))}</span></div>`
                : '<div class="report-content" style="color:var(--text-secondary);">الحساب أو المنشور غير موجود</div>';

        return `
        <div class="report-item">
            <div class="report-header">
                <span class="report-type ${typeClass}">${typeLabel}</span>
                <span style="color:var(--text-secondary);font-size:13px;">${timeAgo(r.timestamp)}</span>
            </div>
            <div class="report-reason">
                <i class="fas fa-user"></i> ${escapeHtml(getUserName(reporter || {}))} أبلغ عن:
            </div>
            ${targetHtml}
            ${r.reason ? `<div style="color:var(--text-secondary);font-size:14px;margin-top:4px;">السبب: ${escapeHtml(r.reason)}</div>` : ''}
            <div class="report-actions">
                <button class="action-btn outline small" onclick="dismissReport('${r.id}')"><i class="fas fa-check"></i> تجاهل</button>
                ${post ? `<button class="action-btn danger small" onclick="deleteReportedPost('${r.id}', '${r.postId}')"><i class="fas fa-trash"></i> حذف المنشور</button>` : ''}
                ${targetUserId ? `<button class="action-btn warning small" onclick="warnReportedUser('${r.id}', '${targetUserId}')"><i class="fas fa-exclamation-triangle"></i> تحذير</button>` : ''}
                ${targetUserId ? `<button class="action-btn danger small" onclick="banReportedUser('${r.id}', '${targetUserId}')"><i class="fas fa-ban"></i> حظر</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

function updateReportQueueSummary() {
    const pending = allReports.filter(r => r.status === 'pending').length;
    const resolved = allReports.filter(r => ['resolved','dismissed','warned'].includes(r.status)).length;
    const content = allReports.filter(r => r.type === 'content').length;
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText('reports-queue-count', pending);
    setText('reports-resolved-count', resolved);
    setText('reports-content-count', content);
}

window.setReportsFilter = (filter, btn) => {
    currentReportsFilter = filter;
    document.querySelectorAll('#reports-view .filter-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    renderReportsList();
};

window.dismissReport = async (reportId) => {
    try {
        await update(ref(database, `reports/${reportId}`), { status: 'dismissed' });
        const r = allReports.find(x => x.id === reportId);
        if (r) r.status = 'dismissed';
        await logAudit('dismiss_report', reportId, '', 'تجاهل البلاغ');
        showToast('تم تجاهل البلاغ', 'success');
        renderReportsList();
    } catch (e) {
        showToast('خطأ: ' + e.message, 'error');
    }
};

window.deleteReportedPost = async (reportId, postId) => {
    showConfirm('حذف المنشور', 'هل تريد حذف هذا المنشور المُبلّغ عنه؟', async () => {
        try {
            await remove(ref(database, `posts/${postId}`));
            await update(ref(database, `reports/${reportId}`), { status: 'resolved' });
            allPosts = allPosts.filter(p => p.id !== postId);
            const r = allReports.find(x => x.id === reportId);
            if (r) r.status = 'resolved';
            await logAudit('delete_post_report', postId, '', 'حذف منشور مُبلّغ عنه');
            showToast('تم حذف المنشور', 'success');
            renderReportsList();
        } catch (e) {
            showToast('خطأ: ' + e.message, 'error');
        }
    });
};

window.warnReportedUser = async (reportId, uid) => {
    const user = allUsers.find(u => u.id === uid);
    try {
        const warningRef = push(ref(database, `warnings/${uid}`));
        const warning = {
            type: 'warning',
            message: 'تم الإبلاغ عن محتوى مخالف في حسابك. يرجى مراجعة قواعد المجتمع.',
            reportId,
            adminId: currentAdmin?.uid || '',
            read: false,
            timestamp: new Date().toISOString()
        };
        await set(warningRef, warning);
        const notifRef = push(ref(database, `notifications/${uid}`));
        await set(notifRef, { ...warning, from: 'admin' });
        await update(ref(database, `reports/${reportId}`), { status: 'warned' });
        await logAudit('warn_user', uid, getUserName(user || {}), 'تحذير بسبب بلاغ');
        showToast('تم إرسال تحذير', 'success');
        renderReportsList();
    } catch (e) {
        showToast('خطأ: ' + e.message, 'error');
    }
};

window.banReportedUser = async (reportId, uid) => {
    const user = allUsers.find(u => u.id === uid);
    showConfirm('حظر المستخدم', `هل تريد حظر "${getUserName(user)}"؟`, async () => {
        try {
            await set(ref(database, `bans/${uid}`), { status: 'banned', reason: 'حظر بسبب بلاغ', timestamp: new Date().toISOString() });
            if (user) user.banStatus = 'banned';
            await update(ref(database, `reports/${reportId}`), { status: 'resolved' });
            await logAudit('ban_from_report', uid, getUserName(user || {}), 'حظر بسبب بلاغ');
            showToast('تم حظر المستخدم', 'success');
            renderReportsList();
        } catch (e) {
            showToast('خطأ: ' + e.message, 'error');
        }
    });
};

// ===== Communities =====
async function renderCommunitiesList() {
    const container = document.getElementById('communities-list');
    if (!container) return;
    try {
        if (!allCommunities.length) {
            const snap = await get(ref(database, 'communities'));
            allCommunities = [];
            if (snap.exists()) snap.forEach(child => allCommunities.push({ id: child.key, ...child.val() }));
        }
        const search = document.getElementById('communities-search')?.value?.trim().toLowerCase() || '';
        let communities = allCommunities.filter(c => {
            const active = c.status !== 'suspended';
            if (currentCommunitiesFilter === 'active' && !active) return false;
            if (currentCommunitiesFilter === 'suspended' && active) return false;
            return !search || `${c.name || ''} ${c.description || ''}`.toLowerCase().includes(search);
        });
        communities.sort((a, b) => Number(b.memberCount || 0) - Number(a.memberCount || 0));
        if (!communities.length) {
            container.innerHTML = '<div class="admin-empty"><i class="fas fa-people-group"></i><h3>لا توجد مجتمعات مطابقة</h3><p>جرّب تغيير البحث أو الفلتر.</p></div>';
            return;
        }
        container.innerHTML = communities.map(c => {
            const suspended = c.status === 'suspended';
            const type = c.isPrivate ? 'خاص' : 'عام';
            return `<article class="admin-community-card ${suspended ? 'is-suspended' : ''}">
                <div class="admin-community-icon">${c.icon || '<i class="fas fa-people-group"></i>'}</div>
                <div class="admin-community-body"><div class="admin-community-title"><strong>${escapeHtml(c.name || 'مجتمع بلا اسم')}</strong><span class="status-badge ${suspended ? 'suspended' : 'active'}"><span class="dot"></span>${suspended ? 'موقوف' : 'نشط'}</span></div>
                <p>${escapeHtml(c.description || 'لا يوجد وصف')}</p><div class="admin-community-meta"><span>${Number(c.memberCount || 0)} عضو</span><span>${Number(c.postCount || 0)} منشور</span><span>${type}</span></div></div>
                <div class="admin-community-actions"><button class="action-btn outline small" onclick="toggleCommunityStatus('${c.id}')">${suspended ? 'إعادة التفعيل' : 'إيقاف'}</button><button class="action-btn danger small" onclick="deleteCommunity('${c.id}')">حذف</button></div>
            </article>`;
        }).join('');
    } catch (e) {
        console.error('Communities admin error:', e);
        container.innerHTML = '<div class="admin-empty"><p>تعذر تحميل المجتمعات. حاول تحديث الصفحة.</p></div>';
    }
}
window.renderCommunitiesList = renderCommunitiesList;
window.filterCommunities = () => renderCommunitiesList();
window.setCommunitiesFilter = (filter, btn) => {
    currentCommunitiesFilter = filter;
    document.querySelectorAll('#communities-view .filter-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    renderCommunitiesList();
};
window.toggleCommunityStatus = async (commId) => {
    const community = allCommunities.find(c => c.id === commId);
    if (!community) return;
    const nextStatus = community.status === 'suspended' ? 'active' : 'suspended';
    try {
        await update(ref(database, `communities/${commId}`), { status: nextStatus, moderatedAt: new Date().toISOString(), moderatedBy: currentAdmin.uid });
        community.status = nextStatus;
        await logAudit(nextStatus === 'suspended' ? 'suspend_community' : 'restore_community', commId, community.name, nextStatus === 'suspended' ? 'إيقاف المجتمع' : 'إعادة تفعيل المجتمع');
        showToast(nextStatus === 'suspended' ? 'تم إيقاف المجتمع' : 'تمت إعادة تفعيل المجتمع', 'success');
        renderCommunitiesList();
    } catch (e) { showToast('تعذر تحديث حالة المجتمع: ' + e.message, 'error'); }
};
window.deleteCommunity = async (commId) => {
    const community = allCommunities.find(c => c.id === commId);
    showConfirm('حذف المجتمع', `هل تريد حذف مجتمع «${getUserName({name: community?.name || ''})}» وجميع عضوياته؟`, async () => {
        try {
            await update(ref(database), { [`communities/${commId}`]: null, [`communityMembers/${commId}`]: null, [`communityPosts/${commId}`]: null });
            allCommunities = allCommunities.filter(c => c.id !== commId);
            await logAudit('delete_community', commId, community?.name || '', 'حذف المجتمع وعضوياته ومنشوراته المفهرسة');
            showToast('تم حذف المجتمع', 'success');
            renderCommunitiesList();
        } catch (e) { showToast('خطأ: ' + e.message, 'error'); }
    });
};

// ===== Settings =====
async function loadSettings() {
    try {
        const snap = await get(ref(database, 'siteSettings'));
        if (snap.exists()) {
            const s = snap.val();
            document.getElementById('setting-site-name').value = s.siteName || 'Mimer';
            document.getElementById('setting-site-desc').value = s.siteDesc || '';
            document.getElementById('setting-registration').checked = s.registrationEnabled !== false;
            document.getElementById('setting-char-limit').value = s.charLimit || '500';
            document.getElementById('setting-dms').checked = s.dmsEnabled !== false;
            document.getElementById('setting-polls').checked = s.pollsEnabled !== false;
            document.getElementById('setting-maintenance').checked = s.maintenance || false;
            document.getElementById('setting-maintenance-msg').value = s.maintenanceMsg || '';
        }
        const verificationSnap = await get(ref(database, 'verificationSettings'));
        const v = verificationSnap.exists() ? verificationSnap.val() : {};
        const autoReply = document.getElementById('setting-verification-auto-reply');
        const autoText = document.getElementById('setting-verification-auto-text');
        const available = document.getElementById('setting-verification-available');
        if (autoReply) autoReply.checked = v.autoReplyEnabled === true;
        if (autoText) autoText.value = v.autoReply || '';
        if (available) available.checked = v.adminAvailable !== false;
    } catch (e) {
        console.error('Load settings error:', e);
    }
}

window.saveSettings = async () => {
    try {
        const settings = {
            siteName: document.getElementById('setting-site-name').value || 'Mimer',
            siteDesc: document.getElementById('setting-site-desc').value || '',
            registrationEnabled: document.getElementById('setting-registration').checked,
            charLimit: document.getElementById('setting-char-limit').value,
            dmsEnabled: document.getElementById('setting-dms').checked,
            pollsEnabled: document.getElementById('setting-polls').checked,
            maintenance: document.getElementById('setting-maintenance').checked,
            maintenanceMsg: document.getElementById('setting-maintenance-msg').value || '',
            updatedAt: new Date().toISOString(),
            updatedBy: currentAdmin.uid
        };
        await set(ref(database, 'siteSettings'), settings);
        await set(ref(database, 'verificationSettings'), {
            autoReplyEnabled: document.getElementById('setting-verification-auto-reply')?.checked === true,
            autoReply: document.getElementById('setting-verification-auto-text')?.value.trim().slice(0, 1000) || '',
            adminAvailable: document.getElementById('setting-verification-available')?.checked !== false,
            updatedAt: new Date().toISOString(), updatedBy: currentAdmin.uid
        });
        await logAudit('update_settings', '', '', 'تحديث إعدادات الموقع ورسائل التوثيق');
        showToast('تم حفظ الإعدادات', 'success');
    } catch (e) {
        showToast('خطأ: ' + e.message, 'error');
    }
};

// ===== Audit Log =====
function renderAuditList() {
    let filtered = [...allAuditLogs];

    if (currentAuditFilter !== 'all') {
        filtered = filtered.filter(l => l.action.includes(currentAuditFilter));
    }

    const container = document.getElementById('audit-list');
    if (filtered.length === 0) {
        container.innerHTML = '<div class="admin-empty"><i class="fas fa-clipboard-list"></i><h3>لا توجد عمليات</h3></div>';
        return;
    }

    container.innerHTML = filtered.slice(0, 100).map(l => {
        const icon = getAuditIcon(l.action);
        return `
        <div class="audit-item">
            <div class="audit-icon ${icon}"><i class="fas fa-${getActivityFaIcon(icon)}"></i></div>
            <div class="audit-info">
                <div class="audit-text">${escapeHtml(l.adminName || 'أدمن')} — ${escapeHtml(l.action)}${l.targetName ? `: ${escapeHtml(l.targetName)}` : ''}</div>
                <div class="audit-meta">
                    <span>${formatTime(l.timestamp)}</span>
                    ${l.details ? `<span>${escapeHtml(l.details)}</span>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');
}

window.setAuditFilter = (filter, btn) => {
    currentAuditFilter = filter;
    document.querySelectorAll('#audit-view .filter-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    renderAuditList();
};

// ===== Quick Search =====
window.quickSearch = (val) => {
    if (!val) return;
    // Quick search across users and posts
    const q = val.toLowerCase();
    const matchedUsers = allUsers.filter(u => (u.name || '').toLowerCase().includes(q)).slice(0, 3);
    const matchedPosts = allPosts.filter(p => (p.content || '').toLowerCase().includes(q)).slice(0, 3);
    // Could show results in right panel — for now just switch to relevant view
};

// ===== Export CSV =====
window.exportUsersCSV = () => {
    const headers = ['ID', 'Name', 'Email', 'Phone', 'Join Date', 'Status', 'Verified'];
    const rows = allUsers.map(u => [
        u.id, u.name, u.email || '', u.phone || '', u.joinDate || '', getUserStatus(u), u.verified ? 'Yes' : 'No'
    ]);
    downloadCSV(headers, rows, 'mimer-users.csv');
    showToast('تم تصدير المستخدمين', 'success');
};

window.exportAuditCSV = () => {
    const headers = ['Timestamp', 'Admin', 'Action', 'Target', 'Details'];
    const rows = allAuditLogs.map(l => [
        l.timestamp, l.adminName, l.action, l.targetName || '', l.details || ''
    ]);
    downloadCSV(headers, rows, 'mimer-audit-log.csv');
    showToast('تم تصدير السجل', 'success');
};

function downloadCSV(headers, rows, filename) {
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ===== Pagination Helper =====
function renderPagination(containerId, totalPages, currentPage, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container || totalPages <= 1) {
        if (container) container.innerHTML = '';
        return;
    }

    let html = `<button ${currentPage === 1 ? 'disabled' : ''} onclick="void(0)">السابق</button>`;

    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

    for (let i = start; i <= end; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}">${i}</button>`;
    }

    html += `<button ${currentPage === totalPages ? 'disabled' : ''}>التالي</button>`;

    container.innerHTML = html;

    // Attach event listeners
    container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const text = btn.textContent;
            if (text === 'السابق') onPageChange(currentPage - 1);
            else if (text === 'التالي') onPageChange(currentPage + 1);
            else {
                const num = parseInt(text);
                if (!isNaN(num)) onPageChange(num);
            }
        });
    });
}

// ===== Confirm Modal =====
let confirmCallback = null;

function showConfirm(title, message, callback) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    confirmCallback = callback;
    document.getElementById('confirm-modal').classList.add('show');
}

window.closeConfirmModal = () => {
    document.getElementById('confirm-modal').classList.remove('show');
    confirmCallback = null;
};

document.getElementById('confirm-action-btn').addEventListener('click', async () => {
    if (confirmCallback) await confirmCallback();
    closeConfirmModal();
});

// ===== Quick Stats =====
function countLikes(post) {
    if (!post.likes) return 0;
    if (typeof post.likes === 'number') return post.likes;
    if (typeof post.likes === 'object') return Object.keys(post.likes).length;
    return 0;
}

function updateQuickStats() {
    const todayPosts = allPosts.filter(p => isToday(p.timestamp)).length;
    const newUsers = allUsers.filter(u => isToday(u.joinDate)).length;
    const totalLikes = allPosts.reduce((sum, p) => sum + countLikes(p), 0);

    document.getElementById('quick-today-posts').textContent = todayPosts;
    document.getElementById('quick-new-users').textContent = newUsers;
    document.getElementById('quick-likes').textContent = totalLikes;
}

function renderRecentUsers() {
    const container = document.getElementById('recent-users-list');
    const recent = [...allUsers].sort((a, b) => new Date(b.joinDate || 0) - new Date(a.joinDate || 0)).slice(0, 5);

    if (recent.length === 0) {
        container.innerHTML = '<div style="padding:16px;color:var(--text-secondary);text-align:center;">لا يوجد مستخدمين</div>';
        return;
    }

    container.innerHTML = recent.map(u => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;transition:background 0.2s;" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''" onclick="openUserModal('${u.id}')">
            <img src="${getUserAvatar(u)}" style="width:40px;height:40px;border-radius:50%;" alt="">
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(getUserName(u))}</div>
                <div style="color:var(--text-secondary);font-size:13px;">${timeAgo(u.joinDate)}</div>
            </div>
        </div>
    `).join('');
}

// Close modals on overlay click
document.querySelectorAll('.admin-modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('show');
        }
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.admin-modal-overlay.show').forEach(m => m.classList.remove('show'));
    }
});

console.log('Admin panel loaded OK');


// ===== Verification Messages =====
window.loadVerificationInbox = async function() {
    const list = document.getElementById('verification-threads-list');
    if (!list) return;
    try {
        const snap = await get(ref(database, 'verificationThreads'));
        allVerificationThreads = [];
        if (snap.exists()) snap.forEach(child => {
            const raw = child.val() || {};
            allVerificationThreads.push({ id: child.key, ...(raw.meta || {}), messages: raw.messages || {} });
        });
        allVerificationThreads.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
        const unread = allVerificationThreads.filter(t => t.unreadForAdmin).length;
        const badge = document.getElementById('verification-badge');
        if (badge) { badge.textContent = unread; badge.style.display = unread ? 'flex' : 'none'; }
        if (!allVerificationThreads.length) {
            list.innerHTML = '<div class="admin-empty"><i class="fas fa-circle-check"></i><h3>لا توجد طلبات توثيق</h3><p>ستظهر المحادثات الجديدة هنا.</p></div>';
            return;
        }
        list.innerHTML = allVerificationThreads.map(thread => `
          <button class="admin-verification-thread ${thread.unreadForAdmin ? 'unread' : ''}" onclick="openVerificationAdminChat('${thread.id}')">
            <img src="${getUserAvatar(thread)}" alt="">
            <span><strong>${escapeHtml(thread.userName || 'مستخدم')}</strong><small>@${escapeHtml(thread.userHandle || '')}</small><em>${timeAgo(thread.lastMessageAt)}</em></span>
          </button>`).join('');
    } catch (error) { list.innerHTML = `<div class="admin-empty"><p>تعذر تحميل رسائل التوثيق: ${escapeHtml(error.message)}</p></div>`; }
};

window.openVerificationAdminChat = async function(uid) {
    const panel = document.getElementById('verification-chat-panel');
    const thread = allVerificationThreads.find(item => item.id === uid);
    if (!panel || !thread) return;
    await update(ref(database, `verificationThreads/${uid}/meta`), { unreadForAdmin: false });
    const messages = Object.values(thread.messages || {}).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    panel.innerHTML = `
      <div class="admin-chat-header"><img src="${getUserAvatar(thread)}" alt=""><div><strong>${escapeHtml(thread.userName || 'مستخدم')}</strong><small>@${escapeHtml(thread.userHandle || '')}</small></div></div>
      <div id="admin-verification-messages" class="admin-chat-messages">${messages.length ? messages.map(m => `<div class="admin-chat-bubble ${m.senderRole === 'user' ? 'user' : 'admin'}"><div>${escapeHtml(m.text)}</div><small>${formatTime(m.timestamp)}</small></div>`).join('') : '<div class="admin-empty"><p>لا توجد رسائل بعد.</p></div>'}</div>
      <div class="admin-chat-compose"><textarea id="admin-verification-reply" maxlength="1000" placeholder="اكتب ردًا للمستخدم..."></textarea><button class="action-btn primary" onclick="sendVerificationAdminReply('${uid}')"><i class="fas fa-paper-plane"></i> إرسال</button></div>`;
    const messagesBox = document.getElementById('admin-verification-messages');
    if (messagesBox) messagesBox.scrollTop = messagesBox.scrollHeight;
};

window.sendVerificationAdminReply = async function(uid) {
    const input = document.getElementById('admin-verification-reply');
    const text = input?.value.trim().slice(0, 1000);
    if (!text) return;
    try {
        const now = new Date().toISOString();
        await set(push(ref(database, `verificationThreads/${uid}/messages`)), { senderId: currentAdmin.uid, senderRole: 'admin', text, timestamp: now });
        await update(ref(database, `verificationThreads/${uid}/meta`), { lastMessageAt: now, unreadForUser: true, unreadForAdmin: false, status: 'in_review' });
        input.value = '';
        await loadVerificationInbox();
        openVerificationAdminChat(uid);
        showToast('تم إرسال الرد', 'success');
    } catch (error) { showToast('تعذر إرسال الرد: ' + error.message, 'error'); }
};
