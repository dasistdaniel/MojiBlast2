'use strict';
// Service Worker: macht MojiBlast 2 installierbar und offline spielbar.
// Strategie „erst Netzwerk, sonst Cache“: online kommt immer die neueste Version,
// offline die zuletzt geladene. Die Version steht im Aufruf (sw.js?v=…), gesetzt vom Commit-Hook.

importScripts('words.js');   // WORDS + wordAudio für die Sprachdateien

const VERSION = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = `mojiblast2-${VERSION}`;
const FILES = [
  './',
  'index.html',
  'style.css',
  'words.js',
  'audio.js',
  'game.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  ...WORDS.map(w => wordAudio(w[0])),
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES.map(f => new Request(f, { cache: 'no-cache' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('mojiblast2-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    // no-cache: am HTTP-Cache von GitHub Pages vorbei immer frisch nachfragen
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
        .then(hit => hit || Response.error())),
  );
});
