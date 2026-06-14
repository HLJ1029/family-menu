const CACHE_NAME = "humi-shell-v1";
const IMAGE_CACHE_NAME = "humi-dish-images-v1";
const BASE_PATH = new URL(self.registration.scope).pathname;
const APP_SHELL = [
  BASE_PATH,
  `${BASE_PATH}offline.html`,
  `${BASE_PATH}manifest.webmanifest`,
  `${BASE_PATH}assets/dishes/manifest.json`,
  `${BASE_PATH}icons/humi-icon-192.png`,
  `${BASE_PATH}icons/humi-icon-512.png`,
];
const CRITICAL_DISH_IMAGES = [
  `${BASE_PATH}assets/dishes/webp/tomato-egg.webp`,
  `${BASE_PATH}assets/dishes/webp/home-style-tofu.webp`,
  `${BASE_PATH}assets/dishes/webp/minced-pork-steamed-egg.webp`,
  `${BASE_PATH}assets/dishes/thumbs/tomato-egg.webp`,
  `${BASE_PATH}assets/dishes/thumbs/home-style-tofu.webp`,
  `${BASE_PATH}assets/dishes/thumbs/minced-pork-steamed-egg.webp`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => caches.open(IMAGE_CACHE_NAME))
      .then((cache) => cache.addAll(CRITICAL_DISH_IMAGES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![CACHE_NAME, IMAGE_CACHE_NAME].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE_PATH)) return;

  if (url.pathname.includes("/assets/dishes/")) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE_NAME));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(BASE_PATH, copy));
          return response;
        })
        .catch(() => caches.match(BASE_PATH).then((cached) => cached ?? caches.match(`${BASE_PATH}offline.html`))),
    );
    return;
  }

  event.respondWith(cacheFirst(request, CACHE_NAME));
});

function cacheFirst(request, cacheName) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(cacheName).then((cache) => cache.put(request, copy));
      }
      return response;
    });
  });
}
