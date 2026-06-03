'use client'

import { useEffect } from 'react'

const SERVICE_WORKER_VERSION = '2026-06-02-v6'
const RELOAD_MARKER = `sw-reloaded-${SERVICE_WORKER_VERSION}`

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => {
            registrations.forEach((registration) => {
              registration.unregister().catch(() => {})
            })
          })
          .catch(() => {})
      }

      return
    }

    if (!('serviceWorker' in navigator)) {
      return
    }

    const handleControllerChange = () => {
      if (sessionStorage.getItem(RELOAD_MARKER) === 'true') {
        return
      }

      sessionStorage.setItem(RELOAD_MARKER, 'true')
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    navigator.serviceWorker
      .register(`/sw.js?v=${SERVICE_WORKER_VERSION}`, {
        scope: '/',
        updateViaCache: 'none',
      })
      .then((registration) => {
        registration.update().catch(() => {})
        console.log('Service Worker registrado:', registration.scope)
      })
      .catch((error) => {
        console.warn('Service Worker falhou:', error.message)
      })

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  return null
}
