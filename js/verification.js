// Mimer Verification Requests — Firebase-ready shared inbox
import { ref, get, set, push, update, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

let auth, database;
let messagesUnsubscribe = null;
const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

async function getCurrentUserData() {
    const uid = auth.currentUser?.uid;
    if (!uid) return {};
    const snap = await get(ref(database, `users/${uid}`));
    return snap.exists() ? snap.val() : {};
}

async function sendMessage(text) {
    const user = auth.currentUser;
    const clean = text?.trim().slice(0, 1000);
    if (!user || !clean) return false;
    const data = await getCurrentUserData();
    const metaRef = ref(database, `verificationThreads/${user.uid}/meta`);
    const threadSnap = await get(metaRef);
    const now = new Date().toISOString();
    if (!threadSnap.exists()) {
        await set(metaRef, { userId: user.uid, userName: data.name || user.displayName || 'مستخدم', userHandle: data.handle || '', userAvatar: data.profilePicture || DEFAULT_AVATAR, status: 'pending', createdAt: now, lastMessageAt: now, unreadForAdmin: true });
    } else {
        await update(metaRef, { lastMessageAt: now, status: 'pending', unreadForAdmin: true });
    }
    const messageRef = push(ref(database, `verificationThreads/${user.uid}/messages`));
    await set(messageRef, { senderId: user.uid, senderRole: 'user', text: clean, timestamp: now });

    const settingsSnap = await get(ref(database, 'verificationSettings'));
    const settings = settingsSnap.exists() ? settingsSnap.val() : {};
    if (settings.adminAvailable === false && settings.autoReplyEnabled && settings.autoReply) {
        const replyRef = push(ref(database, `verificationThreads/${user.uid}/messages`));
        const replyTime = new Date().toISOString();
        await set(replyRef, { senderId: 'system', senderRole: 'auto', text: String(settings.autoReply).slice(0, 1000), timestamp: replyTime });
        await update(metaRef, { lastMessageAt: replyTime, unreadForUser: true });
    }
    return true;
}

function renderVerificationCenter(container) {
    if (!container || !auth.currentUser) return;
    container.innerHTML = `
      <div style="padding:16px;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;">
          <button class="back-btn" onclick="showSettings()"><i class="fas fa-arrow-right"></i></button>
          <div><h3 style="margin:0;">طلب التوثيق</h3><p style="margin:5px 0 0;color:var(--text-secondary);font-size:13px;">تواصل مع فريق ميمر لطلب توثيق حسابك.</p></div>
        </div>
        <div id="verification-chat" style="min-height:220px;max-height:48vh;overflow:auto;padding:10px;background:var(--bg-secondary);border-radius:16px;"><div class="empty-state"><p>اكتب رسالتك لبدء محادثة التوثيق.</p></div></div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <input id="verification-message-input" class="auth-input" maxlength="1000" placeholder="اكتب رسالة التوثيق..." style="margin:0;flex:1;">
          <button class="follow-btn" style="background:var(--accent);color:#fff;padding:10px 18px;" onclick="sendVerificationMessage()">إرسال</button>
        </div>
      </div>`;
    loadUserThread(document.getElementById('verification-chat'));
}

function loadUserThread(container) {
    if (messagesUnsubscribe) messagesUnsubscribe();
    const uid = auth.currentUser?.uid;
    if (!uid || !container) return;
    messagesUnsubscribe = onValue(ref(database, `verificationThreads/${uid}/messages`), snapshot => {
        const messages = snapshot.exists() ? Object.values(snapshot.val()).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)) : [];
        container.innerHTML = messages.length ? messages.map(message => `<div style="display:flex;justify-content:${message.senderRole === 'user' ? 'flex-start' : 'flex-end'};margin:8px 0;"><div style="max-width:82%;padding:10px 13px;border-radius:14px;background:${message.senderRole === 'user' ? 'var(--accent-soft)' : 'var(--bg-primary)'};border:1px solid var(--border-color);"><div>${escapeHtml(message.text)}</div><small style="color:var(--text-secondary);">${new Date(message.timestamp).toLocaleString('ar-SA')}</small></div></div>`).join('') : '<div class="empty-state"><p>اكتب رسالتك لبدء محادثة التوثيق.</p></div>';
        container.scrollTop = container.scrollHeight;
    });
}

async function getVerificationStatus(userId) {
    const snap = await get(ref(database, `users/${userId}/verified`));
    return snap.exists() ? snap.val() : false;
}

export { init, sendMessage, renderVerificationCenter, getVerificationStatus };

window.sendVerificationMessage = async function() {
    const input = document.getElementById('verification-message-input');
    if (!input?.value.trim()) return;
    const value = input.value;
    input.value = '';
    try { await sendMessage(value); } catch (error) { window.showToast?.('تعذر إرسال الرسالة: ' + error.message); input.value = value; }
};
