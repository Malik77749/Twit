// Service Worker — PWA Offline Support + Caching
const CACHE_NAME = 'twit-v3';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/auth.js',
    '/js/config.js',
    '/js/posts.js',
    '/js/comments.js',
    '/js/ui.js',
    '/js/utils.js',
    '/js/firebase-helpers.js',
    '/js/notifications.js',
    '/js/profile.js',
    '/js/pagination.js',
    '/js/rate-limiter.js',
    '/js/push-notifications.js',
    '/js/dm.js',
    '/js/block-mute.js',
    '/js/polls.js',
    '/js/theme.js',
    '/js/drafts.js',
    '/manifest.json',
    '/icon-192.svg',
    '/icon-512.svg'
];

// Install — cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch — Network first, fallback to cache
self.addEventListener('fetch', event => {
    const { request } = event;

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip Firebase/API requests
    if (request.url.includes('firebaseio.com') ||
        request.url.includes('googleapis.com') ||
        request.url.includes('gstatic.com') ||
        request.url.includes('firebase') ||
        request.url.includes('cloudflare')) {
        return;
    }

    event.respondWith(
        fetch(request)
            .then(response => {
                // Cache successful responses
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache
                return caches.match(request).then(cached => {
                    if (cached) return cached;
                    // Fallback to index.html for navigation
                    if (request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});
