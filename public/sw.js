// Service worker do app: guarda a "casca" do app para abrir rápido e funcionar com internet instável.
// Dados (Supabase) nunca passam pelo cache: sempre vão direto à rede.
const CACHE = 'esimon-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/logo.png', '/logo-dark.png', '/icon-192.png'])))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Páginas: tenta a rede (versão nova) e cai no cache se estiver sem internet
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put('/', copia)) }
      return r
    }).catch(() => caches.match('/')))
    return
  }
  // Arquivos do app (têm nome com hash, nunca mudam): cache primeiro
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)) }
    return r
  })))
})
