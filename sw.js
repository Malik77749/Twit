const CACHE_NAME = 'mimer-v10';
const APP_ROOT = new URL('./', self.location).pathname;
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './css/professional.css',
    './js/app.js',
    './js/auth.js',
    './js/config.js',
    './js/cloudinary.js',
    './js/posts.js',
    './js/comments.js',
    './js/ui.js',
    './js/utils.js',
    './js/firebase-helpers.js',
    './js/notifications.js',
    './js/profile.js',
    './js/pagination.js',
    './js/rate-limiter.js',
    './js/push-notifications.js',
    './js/dm.js',
    './js/block-mute.js',
    './js/polls.js',
    './js/theme.js',
    './js/drafts.js',
    './js/two-factor.js',
    './js/image-cdn.js',
    './manifest.json',
    './assets/mimer-icon-original.png',
    './assets/mimer-icon-original.png',
    './assets/mimer-launch-original.jpg',
    './js/verification.js',
    './js/verified.js'
];

function isExternalRequest(url) {
    return url.origin !== self.location.origin ||
        /firebaseio\.com|googleapis\.com|gstatic\.com|firebase|cloudflare/i.test(url.hostname + url.pathname);
}

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            const requests = STATIC_ASSETS.map(asset => new Request(new URL(asset, self.location).href));
            await Promise.allSettled(requests.map(request => cache.add(request)));
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (isExternalRequest(url)) return;

    event.respondWith(
        fetch(request).then(response => {
            if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
            }
            return response;
        }).catch(() => caches.match(request).then(cached => {
            if (cached) return cached;
            if (request.mode === 'navigate') {
                return caches.match(new URL('./index.html', self.location).href);
            }
            return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }))
    );
});
