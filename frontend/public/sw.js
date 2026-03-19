// Network-only service worker — satisfies Chrome PWA installability without caching.
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)))
