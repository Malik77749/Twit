// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyApU1ph6_FlzjpkmykJR0tXnUbNUr4RF04",
    authDomain: "amine-tv-live.firebaseapp.com",
    databaseURL: "https://amine-tv-live-default-rtdb.firebaseio.com",
    projectId: "amine-tv-live",
    storageBucket: "amine-tv-live.firebasestorage.app",
    messagingSenderId: "915423630143",
    appId: "1:915423630143:android:98c04849211a2e75d7798a"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
    console.log('[SW] Background message:', payload);

    const { title, body, icon, click_action } = payload.notification || payload.data || {};

    self.registration.showNotification(title || 'Twit', {
        body: body || 'لديك إشعار جديد',
        icon: icon || '/icon-192.png',
        badge: '/icon-192.png',
        tag: payload.data?.tag || 'twit-notification',
        data: { url: click_action || '/' },
        vibrate: [200, 100, 200],
        actions: [
            { action: 'open', title: 'فتح' },
            { action: 'dismiss', title: 'إغلاق' }
        ]
    });
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // If window already open, focus it
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open new window
            return clients.openWindow(url);
        })
    );
});
