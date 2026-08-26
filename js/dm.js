// Direct Messages Module — Real-time Messaging
import { ref, push, set, get, update, runTransaction, onValue, query, orderByChild, limitToLast, off } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js?v=9';
import { getUserData, addNotification } from './firebase-helpers.js?v=9';
import * as rateLimiter from './rate-limiter.js?v=9';
import * as cloudinary from './cloudinary.js?v=10';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

let auth, database;
let activeConversation = null;
let conversationListeners = new Map();
let conversationsListener = null;
let unreadListener = null;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Get or create conversation between two users
 */
async function canMessageUser(otherUserId) {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId || !otherUserId || currentUserId === otherUserId) return false;
    const [targetSnap, blockedByMe, followsTarget, followsMe] = await Promise.all([
        get(ref(database, `users/${otherUserId}`)),
        get(ref(database, `blocks/${currentUserId}/${otherUserId}`)),
        get(ref(database, `followers/${otherUserId}/${currentUserId}`)),
        get(ref(database, `followers/${currentUserId}/${otherUserId}`))
    ]);
    // The other account's block list is private. Firebase rules enforce the
    // final check on message writes, so the client must not read that list.
    if (!targetSnap.exists() || blockedByMe.exists()) return false;
    const target = targetSnap.val() || {};
    if (['banned', 'suspended', 'deleted'].includes(target.accountStatus)) return false;
    const privacy = target.messagePrivacy || 'everyone';
    if (privacy === 'none') return false;
    if (privacy === 'following' && !followsTarget.exists()) return false;
    if (privacy === 'mutual' && (!followsTarget.exists() || !followsMe.exists())) return false;
    return true;
}

async function getOrCreateConversation(otherUserId) {
    const currentUserId = auth.currentUser?.uid;
    if (!(await canMessageUser(otherUserId))) {
        window.showToast?.('هذا الحساب لا يسمح بالمراسلة أو لا يمكن مراسلته حاليًا');
        return null;
    }
    if (currentUserId === otherUserId) return null;

    // Create deterministic conversation ID (smaller uid first)
    const ids = [currentUserId, otherUserId].sort();
    const conversationId = ids.join('_');

    const convRef = ref(database, `conversations/${conversationId}`);
    const snapshot = await get(convRef);

    if (!snapshot.exists()) {
        // Create new conversation
        const currentUserData = await getUserData(database, currentUserId);
        const otherUserData = await getUserData(database, otherUserId);

        await set(convRef, {
            participants: {
                [currentUserId]: true,
                [otherUserId]: true
            },
            participantInfo: {
                [currentUserId]: {
                    name: currentUserData.name || 'مستخدم',
                    avatar: currentUserData.profilePicture || DEFAULT_AVATAR
                },
                [otherUserId]: {
                    name: otherUserData.name || 'مستخدم',
                    avatar: otherUserData.profilePicture || DEFAULT_AVATAR
                }
            },
            createdAt: new Date().toISOString(),
            status: 'pending',
            requestedBy: currentUserId,
            requesterId: currentUserId,
            recipientId: otherUserId,
            lastMessage: null,
            lastMessageTime: null
        });
    }

    // Keep a private per-user index so the conversation list does not need
    // to read the entire conversations collection, which is denied by RTDB rules.
    await update(ref(database), {
        [`users/${currentUserId}/conversationIndex/${conversationId}`]: true,
        [`users/${otherUserId}/conversationIndex/${conversationId}`]: true
    });

    return conversationId;
}

/**
 * Send a message
 */
async function sendMessage(conversationId, text = '', replyToId, mediaFile = null) {
    text = String(text || '').trim();
    if (!text && !mediaFile) return;

    const userId = auth.currentUser?.uid;
    if (!userId) return;
    const conversationSnap = await get(ref(database, `conversations/${conversationId}`));
    if (!conversationSnap.exists() || !conversationSnap.val().participants?.[userId]) {
        window.showToast?.('المحادثة غير صالحة');
        return;
    }
    const conversation = conversationSnap.val();
    if (conversation.status === 'rejected' || (conversation.status === 'pending' && conversation.requestedBy !== userId)) {
        window.showToast?.(conversation.status === 'rejected' ? 'تم رفض طلب المحادثة' : 'بانتظار قبول طلب المحادثة');
        return;
    }
    if (!(await canMessageUser(Object.keys(conversation.participants).find(id => id !== userId)))) return;

    // Daily backend-backed usage counter for unverified accounts
    const userDataForLimit = await getUserData(database, userId);
    const verifiedUntil = userDataForLimit.verificationEnd ? new Date(userDataForLimit.verificationEnd).getTime() : 0;
    const isVerified = !!userDataForLimit.verified && (!verifiedUntil || verifiedUntil >= Date.now());
    const dayKey = new Date().toISOString().slice(0, 10);
    let usageRef;
    if (!isVerified) {
        usageRef = ref(database, `messageUsage/${userId}/${dayKey}`);
        const usageTx = await runTransaction(usageRef, value => (value || 0) < 100 ? (value || 0) + 1 : value);
        if (!usageTx.committed || usageTx.snapshot.val() > 100) {
            window.showToast?.('وصلت إلى الحد اليومي 100 رسالة للحسابات غير الموثقة');
            return;
        }
    }

    // Rate limit
    const limitCheck = rateLimiter.checkLimit(userId, 'comment'); // Reuse comment limits
    if (!limitCheck.allowed) {
        rateLimiter.showRateLimitToast(limitCheck.reason);
        return;
    }

    // Character limit
    if (text.length > 1000) {
        if (window.showToast) window.showToast('الحد الأقصى 1000 حرف');
        return;
    }

    try {
        const userData = await getUserData(database, userId);

        let uploadedMedia = null;
        if (mediaFile) {
            uploadedMedia = await cloudinary.uploadMedia(mediaFile, { folder: `mimer/messages/${conversationId}` });
        }
        const messageRef = push(ref(database, `messages/${conversationId}`));
        const messageData = {
            senderId: userId,
            senderName: userData.name || 'مستخدم',
            senderAvatar: userData.profilePicture || DEFAULT_AVATAR,
            text: escapeHtml(text),
            timestamp: new Date().toISOString(),
            read: false
        };
        if (uploadedMedia) {
            messageData.media = {
                type: uploadedMedia.type,
                url: uploadedMedia.secureUrl || uploadedMedia.url,
                format: uploadedMedia.format || ''
            };
        }

        if (replyToId) {
            messageData.replyTo = replyToId;
        }

        await set(messageRef, messageData);

        // Update conversation metadata
        await update(ref(database, `conversations/${conversationId}`), {
            lastMessage: text ? escapeHtml(text).substring(0, 100) : (uploadedMedia?.type === 'video' ? 'أرسل فيديو' : 'أرسل صورة'),
            lastMessageTime: new Date().toISOString(),
            lastSenderId: userId
        });

        // Notify only about a new message/request; opening the chat never emits a read receipt.
        const recipientId = Object.keys(conversation.participants).find(pid => pid !== userId);
        const senderName = userData.name || 'مستخدم';
        if (recipientId) await addNotification(database, recipientId, conversation.status === 'pending' ? `أرسل ${senderName} طلب محادثة` : `أرسل ${senderName} رسالة`, null, { actorId: userId, actorName: senderName, actorAvatar: userData.profilePicture || DEFAULT_AVATAR, type: conversation.status === 'pending' ? 'message_request' : 'messages', conversationId });

        // Update unread count for recipient
        const convSnap = await get(ref(database, `conversations/${conversationId}`));
        if (convSnap.exists()) {
            const participants = convSnap.val().participants;
            for (const pid of Object.keys(participants)) {
                if (pid !== userId) {
                    await runTransaction(ref(database, `conversations/${conversationId}/unreadCounts/${pid}`), value => (value || 0) + 1);
                }
            }
        }

        rateLimiter.recordAction(userId, 'comment');
    } catch (error) {
        console.error('Send message error:', error);
        if (window.showToast) window.showToast('خطأ في إرسال الرسالة');
    }
}

/**
 * Load conversations list
 */
function loadConversations(callback) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    if (conversationsListener) conversationsListener();

    const indexRef = ref(database, `users/${userId}/conversationIndex`);
    conversationsListener = onValue(indexRef, async (indexSnapshot) => {
        const conversationIds = [];
        if (indexSnapshot.exists()) {
            indexSnapshot.forEach(child => { if (child.val() === true) conversationIds.push(child.key); });
        }

        const snapshots = await Promise.all(conversationIds.map(id => get(ref(database, `conversations/${id}`))));
        const conversations = snapshots
            .map((snapshot, index) => snapshot.exists() ? { id: conversationIds[index], ...snapshot.val() } : null)
            .filter(conv => conv && conv.participants?.[userId] && !conv.deletedFor?.[userId]);

        conversations.sort((a, b) => {
            const timeA = a.lastMessageTime ? new Date(a.lastMessageTime) : new Date(a.createdAt);
            const timeB = b.lastMessageTime ? new Date(b.lastMessageTime) : new Date(b.createdAt);
            return timeB - timeA;
        });

        const enrichedConversations = await Promise.all(conversations.map(async (conv) => {
            const unreadCount = conv.unreadCounts?.[userId] || 0;
            if (conv.isGroup) return {
                id: conv.id,
                isGroup: true,
                groupName: conv.groupName || 'مجموعة',
                participants: conv.participants,
                participantInfo: conv.participantInfo,
                lastMessage: conv.lastMessage || 'لا توجد رسائل',
                lastMessageTime: conv.lastMessageTime || conv.createdAt,
                unreadCount,
                status: conv.status || 'accepted',
                requestedBy: conv.requestedBy
            };

            const otherUserId = Object.keys(conv.participants || {}).find(id => id !== userId);
            if (!otherUserId) return null;
            const otherUserInfo = conv.participantInfo?.[otherUserId] || await getUserData(database, otherUserId);
            return {
                id: conv.id,
                otherUserId,
                otherUserName: otherUserInfo.name || 'مستخدم',
                otherUserAvatar: otherUserInfo.profilePicture || DEFAULT_AVATAR,
                lastMessage: conv.lastMessage || 'لا توجد رسائل',
                lastMessageTime: conv.lastMessageTime || conv.createdAt,
                unreadCount,
                status: conv.status || 'accepted',
                requestedBy: conv.requestedBy
            };
        }));

        callback(enrichedConversations.filter(Boolean));
    }, (error) => {
        console.error('Load conversations error:', error);
        callback([]);
    });
}

/**
 * Load messages for a conversation
 */
function loadMessages(conversationId, callback) {
    if (!conversationId) return;

    // Cleanup old listener
    if (conversationListeners.has(conversationId)) {
        conversationListeners.get(conversationId)();
    }

    const messagesRef = query(
        ref(database, `messages/${conversationId}`),
        orderByChild('timestamp'),
        limitToLast(100)
    );

    const unsub = onValue(messagesRef, (snapshot) => {
        const messages = [];

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                messages.push({
                    id: child.key,
                    ...child.val()
                });
            });
        }

        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        callback(messages);
    });

    conversationListeners.set(conversationId, unsub);
}

/**
 * Mark messages as read
 */
async function markAsRead(conversationId) {
    const userId = auth.currentUser?.uid;
    if (!userId || !conversationId) return;

    try {
        // Reset unread count
        await update(ref(database, `conversations/${conversationId}/unreadCounts`), {
            [userId]: 0
        });

        // Mark individual messages as read
        const messagesSnap = await get(ref(database, `messages/${conversationId}`));
        if (messagesSnap.exists()) {
            const updates = {};
            messagesSnap.forEach(child => {
                const msg = child.val();
                if (msg.senderId !== userId && !msg.read) {
                    updates[`messages/${conversationId}/${child.key}/read`] = true;
                }
            });
            if (Object.keys(updates).length > 0) {
                await update(ref(database), updates);
            }
        }
    } catch (error) {
        console.error('Mark as read error:', error);
    }
}

/**
 * Delete a message
 */
async function deleteMessage(conversationId, messageId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
        const msgSnap = await get(ref(database, `messages/${conversationId}/${messageId}`));
        if (msgSnap.exists() && msgSnap.val().senderId === userId) {
            await set(ref(database, `messages/${conversationId}/${messageId}`), {
                ...msgSnap.val(),
                text: 'تم حذف هذه الرسالة',
                deleted: true
            });
        }
    } catch (error) {
        console.error('Delete message error:', error);
    }
}

/**
 * Get total unread count
 */
async function acceptConversation(conversationId) {
    const userId = auth.currentUser?.uid;
    const snap = await get(ref(database, `conversations/${conversationId}`));
    if (!userId || !snap.exists()) return false;
    const conv = snap.val();
    if (!conv.participants?.[userId] || conv.status !== 'pending' || conv.requestedBy === userId) return false;
    const now = new Date().toISOString();
    await update(ref(database, `conversations/${conversationId}`), { status: 'accepted', acceptedBy: userId, acceptedAt: now });
    const requester = conv.requesterId;
    if (requester) { const data = await getUserData(database, userId); await addNotification(database, requester, `${data.name || 'المستخدم'} قبل طلب المحادثة`, null, { actorId: userId, actorName: data.name || 'مستخدم', actorAvatar: data.profilePicture || DEFAULT_AVATAR, type: 'message_request_accepted', conversationId }); }
    return true;
}

async function rejectConversation(conversationId) {
    const userId = auth.currentUser?.uid;
    const snap = await get(ref(database, `conversations/${conversationId}`));
    if (!userId || !snap.exists()) return false;
    const conv = snap.val();
    if (!conv.participants?.[userId] || conv.status !== 'pending' || conv.requestedBy === userId) return false;
    const now = new Date().toISOString();
    await update(ref(database, `conversations/${conversationId}`), { status: 'rejected', rejectedBy: userId, rejectedAt: now });
    const requester = conv.requesterId;
    if (requester) { const data = await getUserData(database, userId); await addNotification(database, requester, `${data.name || 'المستخدم'} رفض طلب المحادثة`, null, { actorId: userId, actorName: data.name || 'مستخدم', actorAvatar: data.profilePicture || DEFAULT_AVATAR, type: 'message_request_rejected', conversationId }); }
    return true;
}

async function deleteConversation(conversationId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return false;
    const snap = await get(ref(database, `conversations/${conversationId}`));
    if (!snap.exists() || !snap.val().participants?.[userId]) return false;
    await update(ref(database, `conversations/${conversationId}/deletedFor`), { [userId]: true });
    return true;
}

function getUnreadCount(callback) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    if (unreadListener) unreadListener();
    const convRef = ref(database, 'conversations');
    unreadListener = onValue(convRef, (snapshot) => {
        let total = 0;
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const conv = child.val();
                if (conv.participants && conv.participants[userId]) {
                    total += conv.unreadCounts?.[userId] || 0;
                }
            });
        }
        callback(total);
    });
    return unreadListener;
}

/**
 * Open conversation with a user
 */
async function openConversation(otherUserId) {
    const conversationId = await getOrCreateConversation(otherUserId);
    if (!conversationId) return null;

    activeConversation = conversationId;
    await markAsRead(conversationId);
    return conversationId;
}

/**
 * Cleanup listeners
 */
function cleanup() {
    if (conversationsListener) {
        conversationsListener();
        conversationsListener = null;
    }
    if (unreadListener) {
        unreadListener();
        unreadListener = null;
    }
    conversationListeners.forEach(unsub => unsub());
    conversationListeners.clear();
}

/**
 * Format message time
 */
function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffDay === 0) {
        return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDay === 1) {
        return 'أمس';
    } else if (diffDay < 7) {
        return date.toLocaleDateString('ar-EG', { weekday: 'long' });
    } else {
        return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    }
}

/**
 * Render conversations list HTML
 */
function renderConversationsList(conversations, container, onConversationClick) {
    if (!container) return;

    if (!conversations.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>الرسائل</h3>
                <p>لا توجد محادثات بعد</p>
                <p style="color:var(--text-secondary);font-size:13px;margin-top:8px;">ابدأ محادثة من ملف شخصي</p>
            </div>
        `;
        return;
    }

    let html = '';

    // Add "New Group" button
    html += `
        <div style="padding:12px 16px;border-bottom:1px solid var(--border-color);">
            <button class="dm-create-group-btn" onclick="showCreateGroupUI()"><i class="fas fa-users"></i> إنشاء مجموعة جديدة</button>
        </div>
    `;

    for (const conv of conversations) {
        const hasUnread = conv.unreadCount > 0;
        const isGroup = conv.isGroup || false;
        const displayName = isGroup ? (conv.groupName || 'مجموعة') : escapeHtml(conv.otherUserName);
        const avatarHtml = isGroup
            ? `<div class="dm-group-avatar"><i class="fas fa-users"></i></div>`
            : `<img class="dm-avatar" src="${conv.otherUserAvatar}" alt="">`;
        const membersHtml = isGroup ? `<div class="dm-group-members">${Object.keys(conv.participants || {}).length} أعضاء</div>` : '';
        const clickAction = isGroup ? `openDMConversation('${conv.id}', true)` : `openDMConversation('${conv.otherUserId}')`;

        html += `
            <div class="dm-conversation-item ${hasUnread ? 'unread' : ''}" onclick="${clickAction}">
                ${avatarHtml}
                <div class="dm-info">
                    <div class="dm-header-row">
                        <span class="dm-name">${displayName}</span>
                        <span class="dm-time">${formatMessageTime(conv.lastMessageTime)}</span>
                    </div>
                    ${membersHtml}
                    <div class="dm-preview ${hasUnread ? 'dm-unread-text' : ''}">${conv.status === 'pending' ? 'طلب محادثة · ' : conv.status === 'rejected' ? 'مرفوضة · ' : ''}${escapeHtml(conv.lastMessage || '').substring(0, 50)}</div>
                </div>
                ${hasUnread ? `<span class="dm-unread-badge">${conv.unreadCount}</span>` : ''}
            </div>
        `;
    }

    container.innerHTML = html;
}

/**
 * Render messages in a conversation
 */
function renderMessages(messages, currentUserId, container) {
    if (!container) return;

    if (!messages.length) {
        container.innerHTML = `
            <div class="dm-empty-chat">
                <p>ابدأ المحادثة</p>
            </div>
        `;
        return;
    }

    let html = '';
    let lastDate = '';

    for (const msg of messages) {
        const isOwn = msg.senderId === currentUserId;
        const msgDate = new Date(msg.timestamp).toLocaleDateString('ar-EG', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        // Date separator
        if (msgDate !== lastDate) {
            html += `<div class="dm-date-separator">${msgDate}</div>`;
            lastDate = msgDate;
        }

        if (msg.deleted) {
            html += `
                <div class="dm-message ${isOwn ? 'dm-own' : 'dm-other'}">
                    <div class="dm-bubble dm-deleted">
                        <span class="dm-deleted-text">تم حذف هذه الرسالة</span>
                    </div>
                </div>
            `;
        } else {
            const media = msg.media?.url ? (msg.media.type === 'video'
                ? `<video class="dm-media" controls preload="metadata" playsinline><source src="${escapeHtml(msg.media.url)}"></video>`
                : `<img class="dm-media" src="${escapeHtml(msg.media.url)}" alt="مرفق في الرسالة" loading="lazy">`) : '';
            html += `
                <div class="dm-message ${isOwn ? 'dm-own' : 'dm-other'}">
                    ${!isOwn ? `<img class="dm-msg-avatar" src="${msg.senderAvatar || DEFAULT_AVATAR}" alt="">` : ''}
                    <div class="dm-bubble">
                        ${media}
                        ${msg.text ? `<div class="dm-text">${escapeHtml(msg.text)}</div>` : ''}
                        <div class="dm-msg-time">
                            ${formatMessageTime(msg.timestamp)}
                            ${isOwn ? `<span class="dm-read-status">${msg.read ? '✓✓' : '✓'}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = html;

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

// ===== Group DMs =====

/**
 * Create a group conversation
 */
async function createGroupConversation(name, memberIds) {
    const currentUserId = auth.currentUser.uid;
    if (!name || memberIds.length < 1) return null;

    const groupRef = push(ref(database, 'conversations'));
    const groupId = groupRef.key;

    const participants = { [currentUserId]: true };
    const participantInfo = {};
    const currentUserData = await getUserData(database, currentUserId);
    participantInfo[currentUserId] = {
        name: currentUserData.name || 'مستخدم',
        avatar: currentUserData.profilePicture || DEFAULT_AVATAR
    };

    for (const mid of memberIds) {
        participants[mid] = true;
        const mData = await getUserData(database, mid);
        participantInfo[mid] = {
            name: mData.name || 'مستخدم',
            avatar: mData.profilePicture || DEFAULT_AVATAR
        };
    }

    await set(groupRef, {
        isGroup: true,
        groupName: name,
        participants,
        participantInfo,
        admins: { [currentUserId]: true },
        createdAt: new Date().toISOString(),
        createdBy: currentUserId,
        lastMessage: null,
        lastMessageTime: null
    });

    return groupId;
}

/**
 * Add member to group
 */
async function addGroupMember(conversationId, userId) {
    const currentUserId = auth.currentUser.uid;

    // Check if current user is admin
    const convSnap = await get(ref(database, `conversations/${conversationId}`));
    if (!convSnap.exists() || !convSnap.val().admins?.[currentUserId]) return false;

    const userData = await getUserData(database, userId);
    await update(ref(database, `conversations/${conversationId}`), {
        [`participants/${userId}`]: true,
        [`participantInfo/${userId}`]: {
            name: userData.name || 'مستخدم',
            avatar: userData.profilePicture || DEFAULT_AVATAR
        }
    });
    return true;
}

/**
 * Remove member from group
 */
async function removeGroupMember(conversationId, userId) {
    const currentUserId = auth.currentUser.uid;

    const convSnap = await get(ref(database, `conversations/${conversationId}`));
    if (!convSnap.exists() || !convSnap.val().admins?.[currentUserId]) return false;

    await update(ref(database, `conversations/${conversationId}`), {
        [`participants/${userId}`]: null,
        [`participantInfo/${userId}`]: null
    });
    return true;
}

/**
 * Leave a group
 */
async function leaveGroup(conversationId) {
    const userId = auth.currentUser.uid;
    await update(ref(database, `conversations/${conversationId}`), {
        [`participants/${userId}`]: null,
        [`participantInfo/${userId}`]: null
    });
}

/**
 * Get group members
 */
async function getGroupMembers(conversationId) {
    const convSnap = await get(ref(database, `conversations/${conversationId}`));
    if (!convSnap.exists()) return [];
    const conv = convSnap.val();
    if (!conv.isGroup) return [];
    return Object.keys(conv.participants || {});
}

export {
    init,
    getOrCreateConversation,
    sendMessage,
    loadConversations,
    loadMessages,
    markAsRead,
    deleteMessage,
    getUnreadCount,
    openConversation,
    canMessageUser,
    acceptConversation,
    rejectConversation,
    deleteConversation,
    cleanup,
    formatMessageTime,
    renderConversationsList,
    renderMessages,
    createGroupConversation,
    addGroupMember,
    removeGroupMember,
    leaveGroup,
    getGroupMembers
};
