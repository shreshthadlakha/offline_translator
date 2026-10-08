/*
  Private Translator service worker.
  Precaches the app's own files, including the self hosted ONNX runtime in
  /ort/, so the app works offline after the one time model download. It only
  ever handles requests to its own origin. Model files from the Hugging Face
  Hub and every other cross origin request pass straight through untouched.
*/

const SHELL_CACHE = "pt-shell-v2";

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/fonts/plex-arabic-400-arabic.woff2",
  "/fonts/plex-arabic-500-arabic.woff2",
  "/fonts/plex-devanagari-400-devanagari.woff2",
  "/fonts/plex-devanagari-500-devanagari.woff2",
  "/fonts/plex-hebrew-400-hebrew.woff2",
  "/fonts/plex-thai-400-thai.woff2",
  "/ort/ort-wasm-simd-threaded.jsep.mjs",
  "/ort/ort-wasm-simd-threaded.jsep.wasm",
  "/translator.worker.js",
];

// Assets that never change for a given install: served cache first.
const CACHE_FIRST = ["/ort/", "/fonts/", "/icons/", "/icon.svg", "/manifest.webmanifest"];
// Everything else of the app's own origin is network first, cache fallback.

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Precache in parallel. A single failure shouldn't block installation.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // This app's own files only. Cross origin requests, including the one time
  // model download, are never touched.
  if (new URL(request.url).origin !== self.location.origin) return;
  if (request.method !== "GET") return;
  if (request.mode === "websocket") return;
  if (request.url.includes("/_next/webpack-hmr")) return;

  const isCacheFirst = CACHE_FIRST.some((prefix) => new URL(request.url).pathname.startsWith(prefix));

  if (isCacheFirst) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return new Response("Offline", { status: 503 });
        }
      })(),
    );
    return;
  }

  // Network first with a cache fallback, so development reloads and updated
  // builds stay fresh while offline use still works.
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = (await cache.match(request)) ?? (await cache.match("/"));
        if (cached) return cached;
        return new Response("Offline", { status: 503 });
      }
    })(),
  );
});
