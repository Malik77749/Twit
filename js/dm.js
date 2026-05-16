// Direct Messages Module — Real-time Messaging
import { ref, push, set, get, update, onValue, query, orderByChild, limitToLast, off } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js?v=3';
import { getUserData } from './firebase-helpers.js?v=3';
import * as rateLimiter from './rate-limiter.js?v=3';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

let auth, database;
let activeConversation = null;
let conversationListeners = new Map();
let conversationsListener = null;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Get or create conversation between two users
 */
async function getOrCreateConversation(otherUserId) {
    const currentUserId = auth.currentUser.uid;
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
            lastMessage: null,
            lastMessageTime: null
        });
    }

    return conversationId;
}

/**
 * Send a message
 */
async function sendMessage(conversationId, text, replyToId) {
    if (!text.trim()) return;

    const userId = auth.currentUser.uid;

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

        const messageRef = push(ref(database, `messages/${conversationId}`));
        const messageData = {
            senderId: userId,
            senderName: userData.name || 'مستخدم',
            senderAvatar: userData.profilePicture || DEFAULT_AVATAR,
            text: escapeHtml(text),
            timestamp: new Date().toISOString(),
            read: false
        };

        if (replyToId) {
            messageData.replyTo = replyToId;
        }

        await set(messageRef, messageData);

        // Update conversation metadata
        await update(ref(database, `conversations/${conversationId}`), {
            lastMessage: escapeHtml(text).substring(0, 100),
            lastMessageTime: new Date().toISOString(),
            lastSenderId: userId
        });

        // Update unread count for recipient
        const convSnap = await get(ref(database, `conversations/${conversationId}`));
        if (convSnap.exists()) {
            const participants = convSnap.val().participants;
            for (const pid of Object.keys(participants)) {
                if (pid !== userId) {
                    const currentUnread = convSnap.val().unreadCounts?.[pid] || 0;
                    await update(ref(database, `conversations/${conversationId}/unreadCounts`), {
                        [pid]: currentUnread + 1
                    });
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

    // Cleanup old listener
    if (conversationsListener) {
        conversationsListener();
    }

    const convRef = ref(database, 'conversations');

    conversationsListener = onValue(convRef, async (snapshot) => {
        const conversations = [];

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const conv = child.val();
                if (conv.participants && conv.participants[userId]) {
                    conversations.push({
                        id: child.key,
                        ...conv
                    });
                }
            });
        }

        // Sort by last message time
        conversations.sort((a, b) => {
            const timeA = a.lastMessageTime ? new Date(a.lastMessageTime) : new Date(a.createdAt);
            const timeB = b.lastMessageTime ? new Date(b.lastMessageTime) : new Date(b.createdAt);
            return timeB - timeA;
        });

        // Get other user info for each conversation
        const enrichedConversations = [];
        for (const conv of conversations) {
            const otherUserId = Object.keys(conv.participants).find(id => id !== userId);
            if (!otherUserId) continue;

            const otherUserInfo = conv.participantInfo?.[otherUserId] || await getUserData(database, otherUserId);
            const unreadCount = conv.unreadCounts?.[userId] || 0;

            enrichedConversations.push({
                id: conv.id,
                otherUserId: otherUserId,
                otherUserName: otherUserInfo.name || 'مستخدم',
                otherUserAvatar: otherUserInfo.profilePicture || DEFAULT_AVATAR,
                lastMessage: conv.lastMessage || 'لا توجد رسائل',
                lastMessageTime: conv.lastMessageTime || conv.createdAt,
                unreadCount: unreadCount
            });
        }

        callback(enrichedConversations);
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
function getUnreadCount(callback) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const convRef = ref(database, 'conversations');
    return onValue(convRef, (snapshot) => {
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
    for (const conv of conversations) {
        const hasUnread = conv.unreadCount > 0;
        html += `
            <div class="dm-conversation-item ${hasUnread ? 'unread' : ''}" onclick="openDMConversation('${conv.otherUserId}')">
                <img class="dm-avatar" src="${conv.otherUserAvatar}" alt="">
                <div class="dm-info">
                    <div class="dm-header-row">
                        <span class="dm-name">${escapeHtml(conv.otherUserName)}</span>
                        <span class="dm-time">${formatMessageTime(conv.lastMessageTime)}</span>
                    </div>
                    <div class="dm-preview ${hasUnread ? 'dm-unread-text' : ''}">${escapeHtml(conv.lastMessage).substring(0, 50)}</div>
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
            html += `
                <div class="dm-message ${isOwn ? 'dm-own' : 'dm-other'}">
                    ${!isOwn ? `<img class="dm-msg-avatar" src="${msg.senderAvatar || DEFAULT_AVATAR}" alt="">` : ''}
                    <div class="dm-bubble">
                        <div class="dm-text">${escapeHtml(msg.text)}</div>
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
    cleanup,
    formatMessageTime,
    renderConversationsList,
    renderMessages
};
