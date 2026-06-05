const CACHE_NAME = 'exclusiv-art-v7'
const PRECACHE_ASSETS = [
  '/offline',
  '/manifest.json',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-icon.png',
  '/favicon.ico',
  '/exclusiv-art-logo.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const requests = PRECACHE_ASSETS.map(
        (asset) => new Request(asset, { cache: 'reload' })
      )

      return cache.addAll(requests).catch(() => {})
    })
  )

  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      }),
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable()
        : Promise.resolve(),
    ]).then(() => caches.open(CACHE_NAME))
  )

  self.clients.claim()
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response?.ok) {
    const cache = await caches.open(CACHE_NAME)
    cache.put(request, response.clone())
  }

  return response
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' })
    if (response?.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return caches.match(request)
  }
}

async function navigationFallback(event) {
  try {
    const preloadResponse = await event.preloadResponse
    if (preloadResponse) return preloadResponse

    return await fetch(event.request, { cache: 'no-store' })
  } catch {
    return (
      (await caches.match('/offline')) ||
      new Response('Voce esta offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    )
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  const isSameOrigin = url.origin === self.location.origin

  if (!isSameOrigin || url.hostname.includes('supabase')) {
    return
  }

  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/__nextjs') ||
    url.pathname.startsWith('/api') ||
    url.searchParams.has('_rsc') ||
    event.request.headers.get('RSC') === '1' ||
    event.request.headers.get('Next-Router-Prefetch') === '1'
  ) {
    return
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(navigationFallback(event))
    return
  }

  if (url.pathname === '/manifest.json') {
    event.respondWith(networkFirst(event.request))
    return
  }

  const isStaticAsset = ['image', 'font'].includes(event.request.destination)
  const isKnownPublicAsset = PRECACHE_ASSETS.includes(url.pathname)

  if (isStaticAsset || isKnownPublicAsset) {
    event.respondWith(cacheFirst(event.request))
  }
})
