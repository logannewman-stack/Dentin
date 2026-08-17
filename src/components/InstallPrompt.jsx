import { useEffect, useState } from 'react'
import { Share, Smartphone, X } from 'lucide-react'

const DISMISS_KEY = 'dentin:install-dismissed'

/**
 * The nudge to install.
 *
 * Two things a browser tab cannot do on iPhone: receive push alerts, and keep
 * you signed in past about a week (Safari clears a site's storage when it is
 * not visited). Both are fixed by adding Dentin to the Home Screen, so this
 * asks — once, dismissibly, and never when already installed.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === 'true',
  )

  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true)
  const isIos =
    typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    // Chrome/Edge/Android hand us the real install prompt to fire later.
    const onPrompt = (e) => {
      e.preventDefault()
      setDeferred(e)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const close = () => {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
  }

  // Nothing to offer: already installed, dismissed, or a desktop browser with
  // no install support (where a tab already keeps its session and alerts).
  if (standalone || dismissed || (!isIos && !deferred)) return null

  return (
    <div className="mt-3 flex items-start gap-3 rounded-card border border-line bg-surface p-3.5">
      <span
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-brand-600/12 text-brand-700 dark:text-brand-400"
        aria-hidden="true"
      >
        <Smartphone size={17} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-callout font-semibold text-label">Install Dentin on this device</p>
        <p className="mt-0.5 text-footnote text-label-3">
          {isIos ? (
            <>
              Tap <Share size={12} className="inline-block align-[-1px]" aria-hidden="true" /> Share,
              then <b className="text-label-2">Add to Home Screen</b>. Installing keeps you signed
              in and lets low-stock alerts reach your phone — Safari allows neither in a tab.
            </>
          ) : (
            <>Keeps you signed in and lets low-stock alerts reach you without the tab open.</>
          )}
        </p>
        {!isIos && deferred ? (
          <button
            type="button"
            onClick={async () => {
              deferred.prompt()
              await deferred.userChoice
              setDeferred(null)
              close()
            }}
            className="press mt-2 rounded-[3px] bg-brand-600 px-3 py-1.5 text-footnote font-semibold text-white"
          >
            Install
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] text-label-3"
      >
        <X size={14} strokeWidth={2.4} />
      </button>
    </div>
  )
}
