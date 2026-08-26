const CACHE_NAME = 'mimer-v22';
const MEDIA_CACHE_NAME = 'mimer-media-v1';
const MEDIA_DB_NAME = 'mimer-media-meta';
const MEDIA_DB_VERSION = 1;
const MEDIA_STORE = 'entries';
const MAX_MEDIA_ENTRIES = 60;
const MAX_MEDIA_BYTES = 24 * 1024 * 1024;
const MAX_MEDIA_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const UNKNOWN_MEDIA_BYTES = 512 * 1024;
const APP_ROOT = new URL('./', self.location).pathname;
const STATIC_ASSETS = [
    './', './index.html', './css/style.css', './css/professional.css',
    './js/app.js', './js/auth.js', './js/config.js', './js/cloudinary.js',
    './js/posts.js', './js/comments.js', './js/ui.js', './js/utils.js',
    './js/firebase-helpers.js', './js/notifications.js', './js/profile.js',
    './js/pagination.js', './js/rate-limiter.js', './js/push-notifications.js',
    './js/dm.js', './js/block-mute.js', './js/polls.js', './js/theme.js',
    './js/drafts.js', './js/two-factor.js', './js/image-cdn.js', './manifest.json',
    './assets/mimer-icon-original.png', './assets/mimer-launch-original.jpg',
    './js/verification.js', './js/verified.js'
];

function isExternalRequest(url) {
    return url.origin !== self.location.origin ||
        /firebaseio\.com|googleapis\.com|gstatic\.com|firebase|cloudflare/i.test(url.hostname + url.pathname);
}

function isCacheableMedia(request, url) {
    if (request.method !== 'GET' || request.destination !== 'image') return false;
    if (url.hostname !== 'res.cloudinary.com') return false;
    return /\/image\/upload\//.test(url.pathname) ||
        (/\/video\/upload\//.test(url.pathname) && /\.(?:jpg|jpeg|png|webp|gif)$/i.test(url.pathname));
}

function openMediaDb() {
    if (!self.indexedDB) return Promise.resolve(null);
    return new Promise(resolve => {
        const request = indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(MEDIA_STORE)) {
                db.createObjectStore(MEDIA_STORE, { keyPath: 'url' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
}

async function putMediaMeta(url, bytes = 0) {
    try {
        const db = await openMediaDb();
        if (!db) return;
        await new Promise((resolve, reject) => {
            const tx = db.transaction(MEDIA_STORE, 'readwrite');
            tx.objectStore(MEDIA_STORE).put({
                url,
                bytes: Number(bytes) || 0,
                lastUsed: Date.now()
            });
            tx.oncomplete = resolve;
            tx.onerror = reject;
            tx.onabort = reject;
        });
        db.close();
    } catch (_) { /* Metadata must never block media rendering. */ }
}

async function deleteMediaMeta(url) {
    try {
        const db = await openMediaDb();
        if (!db) return;
        await new Promise((resolve, reject) => {
            const tx = db.transaction(MEDIA_STORE, 'readwrite');
            tx.objectStore(MEDIA_STORE).delete(url);
            tx.oncomplete = resolve;
            tx.onerror = reject;
            tx.onabort = reject;
        });
        db.close();
    } catch (_) {}
}

async function getAllMediaMeta() {
    try {
        const db = await openMediaDb();
        if (!db) return [];
        const records = await new Promise((resolve, reject) => {
            const tx = db.transaction(MEDIA_STORE, 'readonly');
            const request = tx.objectStore(MEDIA_STORE).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = reject;
        });
        db.close();
        return records;
    } catch (_) {
        return [];
    }
}

async function deleteMediaEntry(cache, entry) {
    await cache.delete(entry.request);
    await deleteMediaMeta(entry.url);
}

async function trimMediaCache() {
    try {
        const cache = await caches.open(MEDIA_CACHE_NAME);
        const requests = await cache.keys();
        const metadataRecords = await getAllMediaMeta();
        const metadata = new Map(metadataRecords.map(record => [record.url, record]));
        const now = Date.now();
        const entries = [];

        const liveUrls = new Set(requests.map(request => request.url));
        for (const record of metadataRecords) {
            if (!liveUrls.has(record.url)) await deleteMediaMeta(record.url);
        }

        for (const request of requests) {
            const url = request.url;
            const meta = metadata.get(url);
            const response = await cache.match(request);
            const headerBytes = Number(response?.headers?.get('content-length') || 0);
            entries.push({
                request,
                url,
                bytes: Number(meta?.bytes) || headerBytes || UNKNOWN_MEDIA_BYTES,
                lastUsed: Number(meta?.lastUsed) || 0
            });
        }

        for (const entry of entries.filter(item => item.lastUsed && now - item.lastUsed > MAX_MEDIA_AGE_MS)) {
            await deleteMediaEntry(cache, entry);
        }

        const remaining = entries
            .filter(entry => !(entry.lastUsed && now - entry.lastUsed > MAX_MEDIA_AGE_MS))
            .sort((a, b) => a.lastUsed - b.lastUsed);
        const estimatePromise = self.navigator?.storage?.estimate
            ? self.navigator.storage.estimate()
            : Promise.resolve(null);
        const estimate = await estimatePromise.catch(() => null);
        const quotaBudget = estimate?.quota ? Math.floor(Number(estimate.quota) * 0.05) : MAX_MEDIA_BYTES;
        const budget = Math.max(8 * 1024 * 1024, Math.min(MAX_MEDIA_BYTES, quotaBudget));
        let totalBytes = remaining.reduce((sum, entry) => sum + entry.bytes, 0);

        while (remaining.length > MAX_MEDIA_ENTRIES || totalBytes > budget) {
            const oldest = remaining.shift();
            if (!oldest) break;
            totalBytes -= oldest.bytes;
            await deleteMediaEntry(cache, oldest);
        }
    } catch (_) { /* Cache cleanup is best effort. */ }
}

async function cacheMediaRequest(request) {
    const cache = await caches.open(MEDIA_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
        void putMediaMeta(request.url, Number(cached.headers.get('content-length') || 0));
        return cached;
    }

    const response = await fetch(request);
    const cacheable = response.ok || response.type === 'opaque';
    if (cacheable) {
        const clone = response.clone();
        try {
            await cache.put(request, clone);
            await putMediaMeta(request.url, Number(response.headers.get('content-length') || 0));
            await trimMediaCache();
        } catch (_) {
            await trimMediaCache();
            try {
                await cache.put(request, response.clone());
                await putMediaMeta(request.url, Number(response.headers.get('content-length') || 0));
            } catch (_) {}
        }
    }
    return response;
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
            keys.filter(key => key !== CACHE_NAME && key !== MEDIA_CACHE_NAME).map(key => caches.delete(key))
        )).then(() => trimMediaCache())
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (isCacheableMedia(request, url)) {
        event.respondWith(cacheMediaRequest(request));
        return;
    }
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
