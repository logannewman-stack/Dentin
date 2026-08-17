import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

/**
 * Where a recovery link lands. Supabase turns the token in the URL into a
 * session before this renders, so all that is left is choosing the new
 * password — which is why this route has to sit outside every other gate.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const { updatePassword, session } = useAuth()

  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { error: err } = await updatePassword(password)
      if (err) {
        setError(err.message)
        return
      }
      setDone(true)
      setTimeout(() => navigate('/', { replace: true }), 1200)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-brand-900">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% -10%, #17A9A5 0%, #0E7C7B 38%, #0A4B4C 68%, #06292B 100%)',
        }}
      />
      <div
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-[26rem] flex-col justify-center px-6"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-[4px] bg-white/15 text-white">
          <KeyRound size={20} strokeWidth={2.1} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-title1 font-bold tracking-tight text-white">
          {done ? 'Password updated' : 'Choose a new password'}
        </h1>
        <p className="mt-1.5 text-subhead text-white/70">
          {done
            ? 'Signing you in…'
            : session
              ? 'This replaces the old one everywhere you use Dentin.'
              : 'Open the link from your email on this device to set a new password.'}
        </p>

        {!done && session ? (
          <form onSubmit={submit} className="mt-6">
            <label className="block">
              <span className="mb-1 block text-caption font-medium uppercase tracking-[0.4px] text-white/55">
                New password
              </span>
              <span className="relative block">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="h-[50px] w-full rounded-[4px] border border-white/20 bg-white/10 px-3.5 pr-11 text-callout text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-white/55"
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
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
              {busy ? <Loader2 size={18} className="animate-spin" /> : 'Save new password'}
            </button>
          </form>
        ) : null}

        {done ? (
          <span className="mt-6 flex h-11 w-11 items-center justify-center rounded-[4px] bg-white/15 text-white">
            <Check size={22} strokeWidth={2.6} aria-hidden="true" />
          </span>
        ) : null}

        {!session && !done ? (
          <button
            type="button"
            onClick={() => navigate('/welcome', { replace: true })}
            className="press mt-6 text-center text-footnote text-white/70"
          >
            Back to sign in
          </button>
        ) : null}
      </div>
    </div>
  )
}
