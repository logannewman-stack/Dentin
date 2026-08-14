import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useAuth } from '@/lib/AuthContext'
import { cn } from '@/lib/utils'

const PROOF = [
  'Par levels that account for supplier lead time',
  'Every SKU priced across seven suppliers',
  'Barcode receiving straight into the ledger',
]

export default function Welcome() {
  const navigate = useNavigate()
  const { signIn, signUp, exploreDemo, isDemoAuth } = useAuth()

  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const fn = mode === 'signin' ? signIn : signUp
      const { error: err } = await fn({ email, password, fullName })
      if (err) {
        setError(err.message)
        return
      }
      navigate(mode === 'signup' ? '/onboarding' : '/', { replace: true })
    } catch (err) {
      setError(err.message ?? 'Something went wrong.')
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
        className="relative flex min-h-[100dvh] flex-col px-6"
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
          <p className="mt-2 text-callout text-white/70">The price beneath the rest.</p>
        </motion.div>

        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.32, 0.72, 0, 1] }}
          className="mt-8 rounded-[4px] bg-white/10 p-1.5 backdrop-blur-xl"
        >
          {/* Segmented sign-in / create */}
          <div className="flex gap-1 rounded-[4px] bg-black/15 p-1">
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

          <form onSubmit={submit} className="p-3.5 pt-4">
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

        {isDemoAuth ? (
          <div className="mt-8">
            <Button
              variant="plain"
              className="w-full !text-white/85"
              onClick={() => {
                exploreDemo()
                navigate('/', { replace: true })
              }}
            >
              Explore the demo practice
            </Button>
            <p className="mt-1 text-center text-caption text-white/45">
              A furnished practice with live pricing — no account needed
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
