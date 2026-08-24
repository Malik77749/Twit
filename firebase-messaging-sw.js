// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCQYolSIdkBvuunY0r1DnxSHCNzjPrTcYY",
    authDomain: "mimer-23cf6.firebaseapp.com",
    databaseURL: "https://mimer-23cf6-default-rtdb.firebaseio.com",
    projectId: "mimer-23cf6",
    storageBucket: "mimer-23cf6.firebasestorage.app",
    messagingSenderId: "894290551568",
    appId: "1:894290551568:web:5270deb5704f625284bb95",
    measurementId: "G-QSGNW29K5B"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
    console.log('[SW] Background message:', payload);

    const { title, body, icon, click_action } = payload.notification || payload.data || {};

    self.registration.showNotification(title || 'ميمر Mimer', {
        body: body || 'لديك إشعار جديد',
        icon: icon || './assets/mimer-icon-original.png',
        badge: './assets/mimer-icon-original.png',
        tag: payload.data?.tag || 'mimer-notification',
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
