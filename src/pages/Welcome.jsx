import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Compass, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { track, trackOnce } from '@/lib/analytics'
import { PRODUCTS, SUPPLIERS, offersFor } from '@/lib/demoData'
import { cn } from '@/lib/utils'

/** Google's mark, inline — brand assets may not be recoloured or redrawn. */
function GoogleMark(props) {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" {...props}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

// Counted, never typed. The supplier list grows, and a hard-coded "seven"
// would quietly understate the product the day it stops being true.
const PROOF = [
  'Par levels that account for supplier lead time',
  `Every SKU priced across ${SUPPLIERS.length} suppliers`,
  'Barcode receiving straight into the ledger',
]

/**
 * The worked example on the left of the page.
 *
 * Run through the same engine the app uses rather than typed out as marketing
 * copy, so the numbers on the front door can never drift from the numbers
 * behind it. Aquasil is deliberate — a product every practice recognises — and
 * the widest spread in the catalog is the fallback if it ever leaves.
 */
const SAMPLE = (() => {
  const product =
    PRODUCTS.find((p) => /aquasil/i.test(p.name)) ??
    PRODUCTS.slice().sort((a, b) => offersFor(b.id).length - offersFor(a.id).length)[0]
  if (!product) return null

  const offers = offersFor(product.id)
    .filter((o) => o.inStock)
    .sort((a, b) => b.price - a.price)
  if (offers.length < 3) return null

  const best = offers[offers.length - 1]
  const worst = offers[0]
  return {
    product,
    offers,
    best,
    saved: worst.price - best.price,
    pct: ((worst.price - best.price) / worst.price) * 100,
  }
})()

export default function Welcome() {
  const navigate = useNavigate()
  const {
    signIn,
    signUp,
    exploreDemo,
    isDemoAuth,
    requestPasswordReset,
    verifyEmailCode,
    resendEmailCode,
    signInWithGoogle,
  } = useAuth()

  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [code, setCode] = useState('')

  // The top of the funnel. Every other rate is a fraction of this number.
  useEffect(() => {
    trackOnce('welcome_viewed')
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    track('auth_submitted', { method: mode === 'signin' ? 'email_signin' : 'email_signup' })
    try {
      const fn = mode === 'signin' ? signIn : signUp
      const { error: err, needsConfirmation } = await fn({ email, password, fullName })
      if (err) {
        // The message itself is never sent — only that this step failed.
        track('auth_failed', { method: mode === 'signin' ? 'email_signin' : 'email_signup' })
        setError(err.message)
        return
      }
      // Confirmation on: there is no session yet. Collect the emailed code
      // here rather than sending people off to their inbox and back.
      if (mode === 'signup' && needsConfirmation) {
        track('signup_needs_code')
        setMode('verify')
        setNotice(`We sent a 6-digit code to ${email}.`)
        return
      }
      if (mode === 'signup') track('signup_completed', { method: 'email' })
      navigate(mode === 'signup' ? '/onboarding' : '/', { replace: true })
    } catch (err) {
      setError(err.message ?? 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (e) => {
    e.preventDefault()
    if (code.replace(/\D/g, '').length < 6) {
      setError('Enter all six digits.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { error: err } = await verifyEmailCode({ email, token: code })
      if (err) {
        track('signup_code_rejected')
        setError(
          /expired|invalid/i.test(err.message)
            ? 'That code is wrong or has expired. Send a new one below.'
            : err.message,
        )
        return
      }
      track('signup_completed', { method: 'email_code' })
      navigate('/onboarding', { replace: true })
    } catch (err) {
      setError(err.message ?? 'Could not verify that code.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-brand-900 lg:grid lg:grid-cols-[1.1fr_minmax(27rem,0.9fr)]">
      {/* ------------------------------------------------------------------
          LEFT — the argument. One restrained light source over deep teal;
          the two stacked radials and the decorative blur that used to live
          here are what DESIGN.md retired everywhere else in the app.
         ------------------------------------------------------------------ */}
      <section
        className="relative flex flex-col justify-center overflow-hidden px-6 pb-10 pt-14 lg:px-14 lg:py-16"
        style={{
          background:
            'radial-gradient(115% 75% at 12% 0%, #0F6E6C 0%, #0B4E4B 45%, #0C3F3D 100%)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, ease: [0.32, 0.72, 0, 1] }}
          className="mx-auto w-full max-w-[34rem]"
        >
          {/* Wordmark reads as a lockup, not a splash screen: mark and name
              on one baseline, left-aligned like the rest of the product. */}
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="" width={38} height={38} className="rounded-[4px]" />
            <span className="text-title2 font-bold tracking-tight text-white">Dentin</span>
            <span className="ml-1 rounded-[2px] border border-white/25 px-1.5 py-0.5 text-caption2 font-semibold uppercase tracking-[0.07em] text-white/70">
              For dental practices
            </span>
          </div>

          {/* 15 is the floor, not the ceiling: the catalog's own spread runs
              17.7% against a Henry Schein-loyal practice and 20.2% against
              Patterson, so most practices should clear this rather than
              chase it. text-wrap:balance stops a one-word last line. */}
          <h1 className="mt-9 text-[2rem] font-bold leading-[1.08] tracking-[-0.026em] text-white [text-wrap:balance] lg:text-[2.75rem]">
            Save 15%+ on your inventory costs
          </h1>
          <p className="mt-4 max-w-[30rem] text-body leading-relaxed text-white/70 [text-wrap:balance]">
            One-of-a-kind competitive pricing, built in. Dentin prices every SKU you buy
            across {SUPPLIERS.length} suppliers and tells you which one is actually cheapest
            — landed, after shipping.
          </p>

          {/* The product, not a promise. Same engine as the app. */}
          {SAMPLE ? (
            <figure className="panel mt-9 max-w-[30rem] bg-surface">
              <figcaption className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="text-caption2 font-semibold uppercase tracking-[0.07em] text-label-3">
                  Live price check
                </span>
                <span className="text-caption2 font-semibold uppercase tracking-[0.07em] text-label-3">
                  {SAMPLE.offers.length} suppliers
                </span>
              </figcaption>

              <div className="border-b border-line px-3 py-2.5">
                <p className="text-subhead font-semibold text-label">{SAMPLE.product.name}</p>
                <p className="mt-0.5 text-caption text-label-3">
                  {SAMPLE.product.brand} · pack of {SAMPLE.product.packSize}
                </p>
              </div>

              <ul>
                {SAMPLE.offers.map((o) => {
                  const isBest = o.supplierId === SAMPLE.best.supplierId
                  return (
                    <li
                      key={o.supplierId}
                      className={cn(
                        'flex items-center justify-between px-3 py-1.5',
                        isBest && 'bg-ios-green/[0.07]',
                      )}
                    >
                      <span
                        className={cn(
                          'flex items-center gap-1.5 text-caption',
                          isBest ? 'font-semibold text-label' : 'text-label-2',
                        )}
                      >
                        {o.supplierName}
                        {isBest ? (
                          <span className="rounded-[2px] bg-ios-green px-1 py-px text-caption2 font-semibold uppercase tracking-[0.06em] text-white">
                            Best
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          'tnum text-caption',
                          isBest ? 'font-bold text-ios-green' : 'text-label-3 line-through',
                        )}
                      >
                        ${o.price.toFixed(2)}
                      </span>
                    </li>
                  )
                })}
              </ul>

              <div className="flex items-center justify-between border-t border-line bg-surface-2 px-3 py-2">
                <span className="text-caption font-semibold text-label-2">Saved on this line</span>
                <span className="tnum text-subhead font-bold text-ios-green">
                  ${SAMPLE.saved.toFixed(2)}
                  <span className="ml-1.5 text-caption font-semibold text-label-3">
                    {SAMPLE.pct.toFixed(0)}%
                  </span>
                </span>
              </div>
            </figure>
          ) : null}

          {/* Full container width, or two columns of ~14rem strand the last
              word of the longer lines. */}
          <ul className="mt-8 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {PROOF.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <ShieldCheck size={14} className="mt-[3px] shrink-0 text-white/45" aria-hidden="true" />
                <span className="text-caption leading-snug text-white/70 [text-wrap:balance]">
                  {line}
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      </section>

      {/* ------------------------------------------------------------------
          RIGHT — the door. A solid app surface rather than a glass tile, so
          signing in reads as stepping into the product.
         ------------------------------------------------------------------ */}
      <section
        className="flex flex-col justify-center bg-canvas px-6 py-12 lg:border-l lg:border-black/20 lg:px-12"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 3rem)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, delay: 0.04, ease: [0.32, 0.72, 0, 1] }}
          className="mx-auto w-full max-w-[24rem]"
        >
          <div className="panel">
          {/* A tab strip with a divider and an underline, not a filled pill —
              the sharp-UI segmented control. Hidden while confirming a code. */}
          <div
            className={cn(
              'flex border-b border-line bg-surface-2',
              mode === 'verify' && 'hidden',
            )}
          >
            {[
              { key: 'signin', label: 'Sign in' },
              { key: 'signup', label: 'Create account' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setMode(t.key)
                  setError(null)
                }}
                aria-pressed={mode === t.key}
                className={cn(
                  'focus-ring relative flex-1 py-2.5 text-subhead font-semibold transition-colors duration-100',
                  'after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:content-[""]',
                  mode === t.key
                    ? 'bg-surface text-label after:bg-brand-600'
                    : 'text-label-3 hover:text-label-2 after:bg-transparent',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mode === 'verify' ? (
            <form onSubmit={submitCode} className="p-3.5 pt-4">
              <p className="text-body font-semibold text-label">Check your email</p>
              <p className="mt-1 text-footnote text-label-2">
                Enter the 6-digit code we sent to <b className="text-label">{email}</b>.
              </p>

              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="000000"
                aria-label="6-digit verification code"
                className="tnum mt-3.5 h-[54px] w-full rounded-[4px] border border-line bg-surface-2 text-center text-title2 font-bold tracking-[0.4em] text-label placeholder:text-label-3 focus-ring"
              />

              {error ? (
                <p role="alert" className="mt-3 text-footnote text-ios-red">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="mt-4 flex h-[50px] w-full items-center justify-center gap-2 rounded-[4px] bg-white text-body font-semibold text-brand-800 transition-opacity active:opacity-80 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    Verify and continue
                    <ArrowRight size={17} strokeWidth={2.4} />
                  </>
                )}
              </button>

              <div className="mt-3 flex items-center justify-center gap-4 text-footnote text-label-3">
                <button
                  type="button"
                  onClick={async () => {
                    setError(null)
                    const { error: err } = await resendEmailCode(email)
                    setNotice(err ? null : 'A new code is on its way.')
                    if (err) setError(err.message)
                  }}
                  className="press"
                >
                  Send a new code
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup')
                    setCode('')
                    setError(null)
                    setNotice(null)
                  }}
                  className="press"
                >
                  Use a different email
                </button>
              </div>

              {notice ? (
                <p role="status" className="mt-3 text-center text-footnote text-ios-green">
                  {notice}
                </p>
              ) : null}
            </form>
          ) : (
          <form onSubmit={submit} className="p-3.5 pt-4">
            {/* Most practices run on Google Workspace — one tap, no password
                to invent or forget. */}
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setError(null)
                // Fired before the redirect leaves the page — Google owns the
                // next screen, so this is the last moment we can observe.
                track('auth_submitted', { method: 'google' })
                const { error: err } = await signInWithGoogle()
                if (err) {
                  track('auth_failed', { method: 'google' })
                  setError(err.message)
                }
              }}
              className="press focus-ring mb-3.5 flex h-[42px] w-full items-center justify-center gap-2.5 rounded-field bg-fill/[0.08] dark:bg-fill/[0.20] text-body font-semibold text-label disabled:opacity-55"
            >
              <GoogleMark />
              Continue with Google
            </button>

            <div className="mb-3.5 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-line" />
              <span className="text-caption2 font-semibold uppercase tracking-[0.07em] text-label-3">
                or use email
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>

            {mode === 'signup' ? (
              <label className="mb-2.5 block">
                <span className="mb-1 block text-caption font-medium uppercase tracking-[0.4px] text-label-3">
                  Your name
                </span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  placeholder="Dr. Logan Newman"
                  className="w-full rounded-field bg-fill/[0.08] px-4 py-3 text-body text-label placeholder:text-label-3 dark:bg-fill/[0.20] focus-ring"
                />
              </label>
            ) : null}

            <label className="mb-2.5 block">
              <span className="mb-1 block text-caption font-medium uppercase tracking-[0.4px] text-label-3">
                Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@practice.com"
                className="w-full rounded-field bg-fill/[0.08] px-4 py-3 text-body text-label placeholder:text-label-3 dark:bg-fill/[0.20] focus-ring"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-caption font-medium uppercase tracking-[0.4px] text-label-3">
                Password
              </span>
              <span className="relative block">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                  className="w-full rounded-field bg-fill/[0.08] dark:bg-fill/[0.20] px-3.5 py-3 pr-11 text-callout text-label placeholder:text-label-3 focus-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-label/55"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            {error ? (
              <p role="alert" className="mt-3 text-footnote text-ios-red">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="mt-3 text-footnote text-ios-green">
                {notice}
              </p>
            ) : null}

            {mode === 'signin' ? (
              <button
                type="button"
                onClick={async () => {
                  if (!email.trim()) {
                    setError('Enter your email first, then tap this again.')
                    return
                  }
                  setError(null)
                  await requestPasswordReset(email.trim())
                  // Deliberately the same message either way — confirming
                  // whether an address has an account would leak it.
                  setNotice(
                    `If ${email.trim()} has a Dentin account, a reset link is on its way. The link opens on this device.`,
                  )
                }}
                className="press mt-3 block text-footnote text-label-3"
              >
                Forgot your password?
              </button>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="focus-ring mt-4 flex h-[42px] w-full items-center justify-center gap-2 rounded-ios bg-brand-600 text-body font-semibold text-white transition-colors duration-100 hover:bg-brand-700 disabled:opacity-55"
            >
              {busy ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <>
                  {mode === 'signin' ? 'Sign in' : 'Create practice account'}
                  <ArrowRight size={16} strokeWidth={2.4} />
                </>
              )}
            </button>
          </form>
          )}
          </div>

          {/* Look before you sign up. Available on the live site too — the demo
              practice is bundled with the app, so it costs nothing to show. */}
          {isDemoAuth ? (
            /* Unmissable build-mode label: if this renders in production, the
               deployment was built without the VITE_SUPABASE_* keys. */
            <p className="mt-4 rounded-ios border border-ios-orange/35 bg-ios-orange/10 px-3 py-2 text-caption font-medium text-ios-orange">
              Demo build — Supabase keys were not visible when this deployment was built.
              Accounts and data here are simulated.
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => {
              exploreDemo()
              navigate('/', { replace: true })
            }}
            className="press focus-ring group mt-3 flex w-full items-center gap-3 rounded-card bg-surface shadow-card px-3 py-3 text-left"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-line bg-surface-2 text-label-2">
              <Compass size={16} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-subhead font-semibold text-label">
                See a demo practice first
              </span>
              <span className="mt-0.5 block text-caption leading-snug text-label-3">
                Stocked shelves, live price comparison, real orders. No account, no card.
              </span>
            </span>
            <ArrowRight
              size={16}
              strokeWidth={2.4}
              className="shrink-0 text-label-3 transition-transform duration-100 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>

          <p className="mt-6 text-center text-caption text-label-3">
            Card details are handled by Stripe. Dentin never sees the number.
          </p>
        </motion.div>
      </section>
    </div>
  )
}
