import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Bell,
  Boxes,
  Check,
  ScanLine,
  Share,
  ShoppingCart,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import Sheet from '@/components/ui/Sheet'

const TOUR_KEY = 'dentin:tour-seen'
const PENDING_KEY = 'dentin:tour-pending'

/** Onboarding sets this; the dashboard picks it up on first arrival. */
export function queueWalkthrough() {
  localStorage.setItem(PENDING_KEY, 'true')
}

const STEPS = [
  {
    Icon: ScanLine,
    title: 'Count with the camera',
    body: 'Scan tab, point at a barcode or QR. Dentin reads GS1 codes, so the lot number and expiry come in with the box — no typing, and expired stock gets flagged before it reaches a tray.',
  },
  {
    Icon: Boxes,
    title: 'Par levels do the watching',
    body: 'Set what you like to keep on hand. Dentin tracks what leaves the shelf, works out how many days of cover are left, and tells you before something runs out — not after.',
  },
  {
    Icon: Sparkles,
    title: 'Every item, every vendor',
    body: 'Competitive pricing shows what each supplier charges for the same item, side by side. Landed cost adds shipping, minimums, surcharges and tax, so "free shipping" only wins when it actually is cheaper.',
  },
  {
    Icon: ShoppingCart,
    title: 'Build the order in one pass',
    body: 'Reorder gathers everything below par, prices it split across vendors or consolidated with one, and warns you when something is already on the way. Change any quantity or vendor before it sends.',
  },
  {
    Icon: Bell,
    title: 'Alerts that reach you',
    body: 'Low stock, lots nearing expiry and equipment service coming due — as one daily digest, not a stream of noise. Turn each kind on or off under Settings.',
  },
]

/**
 * The optional tour after setup.
 *
 * Five screens on what makes Dentin worth opening tomorrow, then the one
 * thing a new practice should actually do on their phone: install it. Every
 * screen can be skipped, and it never reappears once seen.
 */
export default function Walkthrough({ open: openProp, onClose }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [deferred, setDeferred] = useState(null)

  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true)
  const isIos =
    typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    if (openProp) {
      setStep(0)
      setOpen(true)
      return
    }
    if (localStorage.getItem(PENDING_KEY) === 'true') {
      localStorage.removeItem(PENDING_KEY)
      if (localStorage.getItem(TOUR_KEY) !== 'true') setOpen(true)
    }
  }, [openProp])

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault()
      setDeferred(e)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const finish = () => {
    localStorage.setItem(TOUR_KEY, 'true')
    setOpen(false)
    onClose?.()
  }

  const total = STEPS.length + 1 // the install screen closes it out
  const onInstallStep = step === STEPS.length
  const current = STEPS[step]

  return (
    <Sheet
      open={open}
      onClose={finish}
      title={onInstallStep ? 'One last thing' : `Getting started · ${step + 1} of ${total}`}
      detent="medium"
      footer={
        <div className="flex items-center gap-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="press h-[46px] shrink-0 rounded-[4px] border border-line px-4 text-callout font-semibold text-label-2"
            >
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="press h-[46px] shrink-0 rounded-[4px] px-3 text-callout font-medium text-label-3"
            >
              Skip
            </button>
          )}
          <button
            type="button"
            onClick={() => (onInstallStep ? finish() : setStep((s) => s + 1))}
            className="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-[4px] bg-brand-600 text-body font-semibold text-white transition-opacity active:opacity-85"
          >
            {onInstallStep ? 'Start using Dentin' : 'Next'}
            {onInstallStep ? (
              <Check size={17} strokeWidth={2.4} aria-hidden="true" />
            ) : (
              <ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" />
            )}
          </button>
        </div>
      }
    >
      <div className="px-4 pb-4 pt-5">
        {/* Progress */}
        <div className="mb-5 flex gap-1.5" aria-hidden="true">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-fill/25'}`}
            />
          ))}
        </div>

        {onInstallStep ? (
          <>
            <span className="flex h-11 w-11 items-center justify-center rounded-[4px] bg-brand-600 text-white">
              <Smartphone size={21} strokeWidth={2.1} aria-hidden="true" />
            </span>
            <h3 className="mt-3.5 text-title2 font-bold tracking-tight">
              {standalone ? 'You are all set' : 'Put Dentin on your phone'}
            </h3>
            {standalone ? (
              <p className="mt-1.5 text-subhead text-label-2">
                Dentin is installed on this device — alerts can reach you and you will stay
                signed in.
              </p>
            ) : isIos ? (
              <>
                <p className="mt-1.5 text-subhead text-label-2">
                  Two things only an installed app can do on iPhone: send you low-stock alerts,
                  and keep you signed in. Safari clears a website&apos;s login after about a week.
                </p>
                <ol className="mt-3 space-y-2">
                  {[
                    <>
                      Tap <Share size={13} className="inline-block align-[-2px]" aria-hidden="true" />{' '}
                      <b className="text-label">Share</b> at the bottom of Safari
                    </>,
                    <>
                      Scroll and choose <b className="text-label">Add to Home Screen</b>
                    </>,
                    <>
                      Tap <b className="text-label">Add</b> — Dentin now opens like any other app
                    </>,
                  ].map((line, i) => (
                    <li key={i} className="flex gap-2.5 text-subhead text-label-2">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600/12 text-caption font-bold text-brand-700 dark:text-brand-400"
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-subhead text-label-2">
                  Installing keeps you signed in and lets alerts reach you without a tab open. On
                  the front desk computer the browser works fine as it is.
                </p>
                {deferred ? (
                  <button
                    type="button"
                    onClick={async () => {
                      deferred.prompt()
                      await deferred.userChoice
                      setDeferred(null)
                    }}
                    className="press mt-3 rounded-[3px] bg-brand-600 px-3.5 py-2 text-subhead font-semibold text-white"
                  >
                    Install Dentin
                  </button>
                ) : (
                  <p className="mt-3 text-footnote text-label-3">
                    On a phone, open dentininventory.com and use your browser&apos;s
                    &ldquo;Add to Home Screen&rdquo; option.
                  </p>
                )}
              </>
            )}
            <p className="mt-4 text-footnote text-label-3">
              You can replay this walkthrough anytime from Settings.
            </p>
          </>
        ) : (
          <>
            <span className="flex h-11 w-11 items-center justify-center rounded-[4px] bg-brand-600 text-white">
              <current.Icon size={21} strokeWidth={2.1} aria-hidden="true" />
            </span>
            <h3 className="mt-3.5 text-title2 font-bold tracking-tight">{current.title}</h3>
            <p className="mt-1.5 text-subhead leading-relaxed text-label-2">{current.body}</p>
          </>
        )}
      </div>
    </Sheet>
  )
}
