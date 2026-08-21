import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Compass, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { track, trackOnce } from '@/lib/analytics'
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

const PROOF = [
  'Par levels that account for supplier lead time',
  'Every SKU priced across seven suppliers',
  'Barcode receiving straight into the ledger',
]

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
    <div className="relative min-h-[100dvh] overflow-hidden bg-brand-900">
      {/* Depth: two soft light sources over a deep clinical teal */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% -10%, #17A9A5 0%, #0E7C7B 38%, #0A4B4C 68%, #06292B 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(60% 40% at 85% 15%, rgba(255,255,255,0.18) 0%, transparent 70%)',
        }}
      />

      <div
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-[26rem] flex-col px-6"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 48px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)',
        }}
      >
        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          className="flex flex-col items-center text-center"
        >
          <img src="/icon.svg" alt="" width={64} height={64} className="rounded-[4px] shadow-raised" />
          <h1 className="mt-4 text-[40px] font-bold leading-none tracking-tight text-white">
            Dentin
          </h1>
          <p className="mt-2 text-callout text-white/70">The price beneath the top layer.</p>
          {/* The offer, above the fold. 15% is the floor, not the ceiling: the
              catalog's own spread runs 17.7% against a Henry Schein-loyal
              practice and 20.2% against Patterson, so a claim of 15% is one
              most practices should clear rather than chase. */}
          {/* text-wrap:balance keeps both lines from orphaning a single word
              on a 320px screen, where these wrap to two lines each. */}
          <p className="mt-6 max-w-[20rem] text-title1 font-bold leading-tight text-white [text-wrap:balance]">
            Save 15%+ on your inventory costs
          </p>
          <p className="mt-2 max-w-[20rem] text-subhead text-white/70 [text-wrap:balance]">
            with one-of-a-kind competitive pricing built in.
          </p>
        </motion.div>

        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.32, 0.72, 0, 1] }}
          className="mt-8 rounded-[4px] bg-white/10 p-1.5 backdrop-blur-xl"
        >
          {/* Segmented sign-in / create — hidden while confirming a code */}
          <div className={cn('flex gap-1 rounded-[4px] bg-black/15 p-1', mode === 'verify' && 'hidden')}>
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
                  'flex-1 rounded-[3px] py-2 text-subhead font-semibold transition-colors duration-200',
                  mode === t.key ? 'bg-white text-brand-800' : 'text-white/75',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mode === 'verify' ? (
            <form onSubmit={submitCode} className="p-3.5 pt-4">
              <p className="text-body font-semibold text-white">Check your email</p>
              <p className="mt-1 text-footnote text-white/70">
                Enter the 6-digit code we sent to <b className="text-white/90">{email}</b>.
              </p>

              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="000000"
                aria-label="6-digit verification code"
                className="tnum mt-3.5 h-[54px] w-full rounded-[4px] border border-white/20 bg-black/25 text-center text-title2 font-bold tracking-[0.4em] text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-white/50"
              />

              {error ? (
                <p role="alert" className="mt-3 text-footnote text-[#FFC7C2]">
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

              <div className="mt-3 flex items-center justify-center gap-4 text-footnote text-white/65">
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
                <p role="status" className="mt-3 text-center text-footnote text-[#C8F5D0]">
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
              className="press mb-3 flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[4px] bg-white text-body font-semibold text-[#1F1F1F] transition-opacity active:opacity-85 disabled:opacity-60"
            >
              <GoogleMark />
              Continue with Google
            </button>

            <div className="mb-3 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-white/15" />
              <span className="text-caption font-medium uppercase tracking-[0.5px] text-white/45">
                or use email
              </span>
              <span className="h-px flex-1 bg-white/15" />
            </div>

            {mode === 'signup' ? (
              <label className="mb-2.5 block">
                <span className="mb-1 block text-caption font-medium uppercase tracking-[0.4px] text-white/60">
                  Your name
                </span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  placeholder="Dr. Logan Newman"
                  className="w-full rounded-ios border border-white/15 bg-black/25 px-3.5 py-3 text-callout text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/50"
                />
              </label>
            ) : null}

            <label className="mb-2.5 block">
              <span className="mb-1 block text-caption font-medium uppercase tracking-[0.4px] text-white/60">
                Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@practice.com"
                className="w-full rounded-ios border border-white/15 bg-black/25 px-3.5 py-3 text-callout text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/50"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-caption font-medium uppercase tracking-[0.4px] text-white/60">
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
                  className="w-full rounded-ios border border-white/15 bg-black/25 px-3.5 py-3 pr-11 text-callout text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-white/55"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            {error ? (
              <p role="alert" className="mt-3 text-footnote text-[#FFC7C2]">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="mt-3 text-footnote text-[#C8F5D0]">
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
                className="press mt-3 block text-footnote text-white/65"
              >
                Forgot your password?
              </button>
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
                  {mode === 'signin' ? 'Sign in' : 'Create practice account'}
                  <ArrowRight size={17} strokeWidth={2.4} />
                </>
              )}
            </button>
          </form>
          )}
        </motion.div>

        {/* Proof points */}
        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-7 flex flex-col gap-2.5"
        >
          {PROOF.map((line) => (
            <li key={line} className="flex items-start gap-2.5">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-white/55" aria-hidden="true" />
              <span className="text-subhead text-white/75">{line}</span>
            </li>
          ))}
        </motion.ul>

        <div className="flex-1" />

        {/* Look before you sign up. Available on the live site too — the demo
            practice is bundled with the app, so it costs nothing to show. */}
        <div className="mt-8">
          {isDemoAuth ? (
            /* Unmissable build-mode label: if this renders in production, the
               deployment was built without the VITE_SUPABASE_* keys. */
            <p className="mb-3 text-center text-caption font-medium text-amber-300/90">
              Demo build — Supabase keys were not visible when this deployment was built.
              Accounts and data here are simulated.
            </p>
          ) : null}
          <div className="mb-3 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-white/15" />
            <span className="text-caption font-medium uppercase tracking-[0.5px] text-white/45">
              or
            </span>
            <span className="h-px flex-1 bg-white/15" />
          </div>

          <button
            type="button"
            onClick={() => {
              exploreDemo()
              navigate('/', { replace: true })
            }}
            className="group flex w-full items-center gap-3.5 rounded-[4px] border border-white/25 bg-white/10 px-4 py-3.5 text-left backdrop-blur-xl transition-colors duration-150 hover:bg-white/[0.16] active:bg-white/20"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-white/15 text-white">
              <Compass size={18} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold text-white">
                See a demo practice
              </span>
              <span className="mt-0.5 block text-caption text-white/60">
                A furnished example — stocked shelves, live price comparison, real orders. No
                account, no card.
              </span>
            </span>
            <ArrowRight
              size={17}
              strokeWidth={2.4}
              className="shrink-0 text-white/60 transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  )
}
