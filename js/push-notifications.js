// Push Notifications Module — Firebase Cloud Messaging
import { getMessaging, getToken, onMessage, deleteToken } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';
import { ref, set, get, remove, push } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

let messaging = null;
let database = null;
let currentToken = null;
let onMessageCallback = null;

const VAPID_KEY = 'BKh4bKlE5N渼1k2l3m4n5o6p7q8r9s0t'; // Replace with your VAPID key from Firebase Console

/**
 * Initialize push notifications
 */
function init(app, databaseInstance, onNotifCallback) {
    database = databaseInstance;
    onMessageCallback = onNotifCallback;

    try {
        messaging = getMessaging(app);
        console.log('FCM Messaging initialized');
    } catch (error) {
        console.warn('FCM not supported:', error);
    }
}

/**
 * Request notification permission and get FCM token
 */
async function requestPermission(userId) {
    if (!messaging) {
        console.warn('Messaging not initialized');
        return null;
    }

    // Check if notifications are supported
    if (!('Notification' in window)) {
        console.warn('Notifications not supported in this browser');
        return null;
    }

    // Check current permission
    if (Notification.permission === 'denied') {
        console.warn('Notifications blocked by user');
        return null;
    }

    // Request permission if not granted
    if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('Notification permission not granted');
            return null;
        }
    }

    try {
        // Register service worker
        const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('Service Worker registered');

        // Get FCM token
        const token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: swRegistration
        });

        if (token) {
            currentToken = token;
            // Store token in database
            await saveToken(userId, token);
            console.log('FCM Token obtained');
            return token;
        }
    } catch (error) {
        console.error('Error getting FCM token:', error);
    }

    return null;
}

/**
 * Save FCM token to database
 */
async function saveToken(userId, token) {
    if (!userId || !token) return;

    try {
        // Store token with metadata
        const tokenRef = ref(database, `fcmTokens/${userId}/${btoa(token).replace(/[=]/g, '')}`);
        await set(tokenRef, {
            token: token,
            platform: getPlatform(),
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error saving FCM token:', error);
    }
}

/**
 * Remove FCM token
 */
async function removeToken(userId) {
    if (!userId || !currentToken) return;

    try {
        const tokenRef = ref(database, `fcmTokens/${userId}/${btoa(currentToken).replace(/[=]/g, '')}`);
        await remove(tokenRef);
        await deleteToken(messaging);
        currentToken = null;
    } catch (error) {
        console.error('Error removing FCM token:', error);
    }
}

/**
 * Listen for foreground messages
 */
function onForegroundMessage(callback) {
    if (!messaging) return;

    onMessage(messaging, (payload) => {
        console.log('Foreground message:', payload);

        // Show browser notification even in foreground
        if (Notification.permission === 'granted') {
            const { title, body, icon, click_action } = payload.notification || payload.data || {};

            const notification = new Notification(title || 'Twit', {
                body: body || 'لديك إشعار جديد',
                icon: icon || '/icon-192.svg',
                tag: payload.data?.tag || 'twit-notification',
                data: { url: click_action || '/' }
            });

            notification.onclick = function() {
                window.focus();
                if (click_action) {
                    window.location.href = click_action;
                }
                notification.close();
            };
        }

        // Call custom callback
        if (callback) callback(payload);
    });
}

/**
 * Check if push notifications are enabled
 */
function isEnabled() {
    return 'Notification' in window && Notification.permission === 'granted';
}

/**
 * Get platform info
 */
function getPlatform() {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'android';
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    if (/Mac/.test(ua)) return 'macos';
    if (/Win/.test(ua)) return 'windows';
    if (/Linux/.test(ua)) return 'linux';
    return 'web';
}

/**
 * Show notification settings UI
 */
function getPermissionStatus() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'granted', 'denied', 'default'
}

export {
    init,
    requestPermission,
    removeToken,
    onForegroundMessage,
    isEnabled,
    getPermissionStatus
};
