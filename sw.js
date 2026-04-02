const CACHE_NAME = 'blunderrush-v2';

const ASSETS_TO_CACHE = [
  './',
  './BlunderRush.html',
  './manifest.json',
  // Vendor (formerly CDN)
  './vendor/chess.min.js',
  './vendor/three.min.js',
  './vendor/jquery-3.5.1.min.js',
  './vendor/chessboard-1.0.0.min.js',
  './vendor/chessboard-1.0.0.min.css',
  // Local JS
  './papaparse.min.js',
  './OrbitControls.js',
  './chessboard3.min.js',
  // CSV puzzle data
  './puzzles_with_moves_and_evals.csv',
  // Audio
  './ding.mp3',
  './buzz.mp3',
  // 2D piece images
  './img/chesspieces/wikipedia/bB.png',
  './img/chesspieces/wikipedia/bK.png',
  './img/chesspieces/wikipedia/bN.png',
  './img/chesspieces/wikipedia/bP.png',
  './img/chesspieces/wikipedia/bQ.png',
  './img/chesspieces/wikipedia/bR.png',
  './img/chesspieces/wikipedia/wB.png',
  './img/chesspieces/wikipedia/wK.png',
  './img/chesspieces/wikipedia/wN.png',
  './img/chesspieces/wikipedia/wP.png',
  './img/chesspieces/wikipedia/wQ.png',
  './img/chesspieces/wikipedia/wR.png',
  // Board images
  './img/board-background.png',
  './img/satinweave.png',
  // App icons
  './img/icon-180.png',
  './img/icon-192.png',
  './img/icon-512.png',
  // 3D font
  './assets/fonts/helvetiker_regular.typeface.json',
  // 3D piece models
  './assets/chesspieces/bauhaus/B.json',
  './assets/chesspieces/bauhaus/K.json',
  './assets/chesspieces/bauhaus/N.json',
  './assets/chesspieces/bauhaus/P.json',
  './assets/chesspieces/bauhaus/Q.json',
  './assets/chesspieces/bauhaus/R.json',
  './assets/chesspieces/classic/B.json',
  './assets/chesspieces/classic/K.json',
  './assets/chesspieces/classic/N.json',
  './assets/chesspieces/classic/P.json',
  './assets/chesspieces/classic/Q.json',
  './assets/chesspieces/classic/R.json',
  './assets/chesspieces/iconic/B.json',
  './assets/chesspieces/iconic/K.json',
  './assets/chesspieces/iconic/N.json',
  './assets/chesspieces/iconic/P.json',
  './assets/chesspieces/iconic/Q.json',
  './assets/chesspieces/iconic/R.json',
  './assets/chesspieces/mueller/B.json',
  './assets/chesspieces/mueller/K.json',
  './assets/chesspieces/mueller/N.json',
  './assets/chesspieces/mueller/P.json',
  './assets/chesspieces/mueller/Q.json',
  './assets/chesspieces/mueller/R.json'
];

// Install: pre-cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate: delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first strategy
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
