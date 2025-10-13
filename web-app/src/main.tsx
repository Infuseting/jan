import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

import './index.css'
import './i18n'
import { getServiceHub } from '@/hooks/useServiceHub'
import { handlePublishTrigger } from './lib/publishExecutor'
import { listen } from '@tauri-apps/api/event'
import { startMessageTriggerDispatcher } from './lib/messageTriggerDispatcher'

// Mobile-specific viewport and styling setup
const setupMobileViewport = () => {
  // Check if running on mobile platform (iOS/Android via Tauri)
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
                   window.matchMedia('(max-width: 768px)').matches

  if (isMobile) {
    // Update viewport meta tag to disable zoom
    const viewportMeta = document.querySelector('meta[name="viewport"]')
    if (viewportMeta) {
      viewportMeta.setAttribute('content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
      )
    }

    // Add mobile-specific styles for status bar
    const style = document.createElement('style')
    style.textContent = `
      body {
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);
      }

      #root {
        min-height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
      }

      /* Prevent zoom on input focus */
      input, textarea, select {
        font-size: 16px !important;
      }
    `
    document.head.appendChild(style)
  }
}

// Initialize mobile setup
setupMobileViewport()

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
}

// Register a global listener for publish triggers emitted by the backend Tauri process.
// This ensures that when Tauri emits `publish:trigger` the web-app will execute the
// persisted board snapshot's node graph even if the UI is minimized.
try {
  // getServiceHub may not be initialized at the very first boot in some tests; guard it.
  const hub = getServiceHub()
  hub.events().listen('publish:trigger', (evt: any) => {
    const payload = evt.payload || {}
    const builderId = payload.builder_id || payload.builderId || ''
    const triggerId = payload.trigger_id || payload.triggerId || ''
    // run asynchronously
    handlePublishTrigger(builderId, triggerId)
  }).catch((e) => { console.error('failed to subscribe to publish:trigger', e) })
} catch (e) {
  // ignore in test environments
}
// Also register a direct Tauri event listener which does not depend on service hub readiness.
try {
  listen('publish:trigger', (evt: any) => {
    try {
      const payload = evt.payload || {}
      const builderId = payload.builder_id || payload.builderId || ''
      const triggerId = payload.trigger_id || payload.triggerId || ''
      handlePublishTrigger(builderId, triggerId)
    } catch (e) {
      console.error('publish:trigger direct handler error', e)
    }
  }).catch((e) => { console.error('failed to register direct Tauri listener publish:trigger', e) })
} catch (e) {
  // ignore in environments without Tauri
}

// Start message trigger dispatcher to listen for local message events and dispatch triggers
try {
  startMessageTriggerDispatcher()
} catch (e) { console.error('failed to start message trigger dispatcher', e) }
