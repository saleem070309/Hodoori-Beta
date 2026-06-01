const CACHE_NAME = 'attendance-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './dashboard-admin.html',
  './dashboard-teacher.html',
  './portal-student.html',
  './styles/style.css',
  './assets/brand-logo.png',
  './manifest.json',
  'https://cdn.tailwindcss.com?plugins=forms,container-queries',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap',
  'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js'
];

// face-api models to cache specifically
const MODEL_BASE_URL = 'https://justadudewhohacks.github.io/face-api.js/models/';
const MODELS = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Add models to cache list
      const modelAssets = MODELS.map(m => MODEL_BASE_URL + m);
      return cache.addAll([...ASSETS_TO_CACHE, ...modelAssets]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached version or fetch from network
      return response || fetch(event.request).then(fetchRes => {
          return caches.open(CACHE_NAME).then(cache => {
              // Cache new resources dynamically (like model shards if missing)
              if (event.request.url.includes('face-api.js/models')) {
                cache.put(event.request.url, fetchRes.clone());
              }
              return fetchRes;
          });
      });
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'تنبيه جديد', body: event.data.text() };
    }
  }

  const title = data.title || 'نظام الحضور الذكي';
  const options = {
    body: data.body || 'لديك إشعار جديد من النظام',
    icon: './assets/brand-logo.png',
    badge: './assets/brand-logo.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const url = event.notification.data.url;
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
