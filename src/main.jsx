import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { applySkin, readSkin } from './lib/skin'
import App from './App'
import '@fontsource-variable/inter'
import './index.css'

// Restore the saved appearance before first paint so there is no flash.
const saved = localStorage.getItem('dentin:theme')
if (saved === 'dark' || saved === 'light') {
  document.documentElement.setAttribute('data-theme', saved)
}

// Same for the skin. This has to run before React mounts: the two languages
// differ in type size and row height, so painting one and swapping to the
// other would reflow the whole first screen in front of the user.
applySkin(readSkin())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      {/* Page views for every route, plus the transport for the funnel events
          in lib/analytics.js. Cookieless, and inert until Web Analytics is
          switched on for the project in the Vercel dashboard. */}
      <Analytics />
    </BrowserRouter>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline shell is an enhancement — the app works without it */
    })
  })
}
