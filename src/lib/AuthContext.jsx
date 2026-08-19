import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabase'
import { track } from './analytics'

const AuthContext = createContext(null)

const DEMO_KEY = 'dentin:demo-session'
const ONBOARDED_KEY = 'dentin:onboarded'
const DEMO_MODE_KEY = 'dentin:demo-mode'

/**
 * Previewing the furnished demo on a live deployment. Read once at load —
 * the repository does the same, and entering or leaving reloads the page, so
 * the whole app is only ever in one world at a time.
 */
const PREVIEWING =
  typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_MODE_KEY) === 'true'

/**
 * BYPASS_AUTH means the build has no real auth backend — the app runs the
 * demo practice and "signing in" is a local flag.
 *
 * That is not the same as skipping the front door. A first-time visitor to
 * the deployed site always lands on Welcome and chooses: sign in, create an
 * account, or preview the mock practice. The choice persists locally, so
 * they only see the door once. Set VITE_BYPASS_AUTH=true (local dev) to
 * skip the door entirely and open straight on Today.
 */
export const BYPASS_AUTH =
  import.meta.env.VITE_BYPASS_AUTH === 'true' || !isSupabaseConfigured

// Explicit dev flag only — the implicit demo build still shows the door.
const AUTO_ENTER = import.meta.env.VITE_BYPASS_AUTH === 'true'

/**
 * Auth for both worlds.
 *
 * With Supabase configured this is a real session. Without it the app runs the
 * demo practice, and "signing in" is a local flag — so the welcome and
 * onboarding flows stay explorable rather than being dead screens until a
 * backend exists.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    if (AUTO_ENTER) return { demo: true, bypassed: true }
    if ((!isSupabaseConfigured || PREVIEWING) && localStorage.getItem(DEMO_KEY) === 'true') {
      return { demo: true }
    }
    return null
  })
  // Only a real backend needs an async session check; demo state is local.
  const [loading, setLoading] = useState(isSupabaseConfigured && !AUTO_ENTER && !PREVIEWING)
  // Live truth for "onboarded" is ONLY the database — a localStorage flag is
  // per-browser, not per-user, so trusting it lets a brand-new account skip
  // the wizard on any machine where someone once onboarded (and then crash
  // on a practice-less dashboard). null = not known yet; the gate waits.
  const [onboarded, setOnboarded] = useState(() => {
    if (AUTO_ENTER) return true
    if (!isSupabaseConfigured || PREVIEWING) return localStorage.getItem(ONBOARDED_KEY) === 'true'
    return null
  })

  useEffect(() => {
    // A preview never touches the real auth session.
    if (AUTO_ENTER || !isSupabaseConfigured || PREVIEWING) return undefined

    let active = true

    const syncOnboarded = async (session) => {
      if (!session?.user) {
        if (active) setOnboarded(null)
        return
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('practice_id')
        .eq('id', session.user.id)
        .maybeSingle()
      if (!active) return
      // On a failed read, never DOWNGRADE a known true — one transient error
      // mid-session must not dump an onboarded user into the setup wizard.
      if (error) {
        setOnboarded((prev) => (prev === true ? true : false))
        return
      }
      setOnboarded(Boolean(data?.practice_id))
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
      syncOnboarded(data.session)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      syncOnboarded(next)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  /**
   * A real sign-in always wins over a leftover demo preview.
   *
   * The preview short-circuits the Supabase session listener, so without
   * this a browser that once opened the demo would accept the password and
   * then bounce straight back to the door — signed in as far as Supabase is
   * concerned, signed out as far as the app could tell. Clearing the flags
   * is not enough on its own: the modules read them at load, so a real
   * session has to land on a fresh page.
   */
  const clearPreview = useCallback(() => {
    localStorage.removeItem(DEMO_MODE_KEY)
    localStorage.removeItem(DEMO_KEY)
    if (PREVIEWING) localStorage.removeItem(ONBOARDED_KEY)
  }, [])

  const reloadIfPreviewing = useCallback(() => {
    if (PREVIEWING) {
      window.location.assign('/')
      return true
    }
    return false
  }, [])

  const signIn = useCallback(
    async ({ email, password }) => {
      if (!isSupabaseConfigured) {
        // Signing in claims an existing practice — no setup wizard.
        localStorage.setItem(DEMO_KEY, 'true')
        localStorage.setItem(ONBOARDED_KEY, 'true')
        setOnboarded(true)
        setSession({ demo: true })
        return { error: null }
      }
      clearPreview()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error) reloadIfPreviewing()
      return { error }
    },
    [clearPreview, reloadIfPreviewing],
  )

  const signUp = useCallback(
    async ({ email, password, fullName }) => {
      if (!isSupabaseConfigured) {
        localStorage.setItem(DEMO_KEY, 'true')
        setSession({ demo: true })
        return { error: null }
      }
      clearPreview()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      })
      // With email confirmation on (Supabase default), signUp succeeds with no
      // session — the caller must say "check your inbox", not bounce silently.
      if (!error && data?.session) reloadIfPreviewing()
      return { error, needsConfirmation: !error && !data?.session }
    },
    [clearPreview, reloadIfPreviewing],
  )

  /**
   * Google sign-in. Supabase bounces through Google and returns to the app
   * with the session in the URL, which the client picks up
   * (detectSessionInUrl). New Google accounts land in onboarding exactly
   * like email signups — the gate decides, not this call.
   */
  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      localStorage.setItem(DEMO_KEY, 'true')
      setSession({ demo: true })
      return { error: null }
    }
    // Google returns to a fresh page load, so clearing here is enough.
    clearPreview()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { prompt: 'select_account' },
      },
    })
    return { error }
  }, [clearPreview])

  /**
   * Confirm a new account with the 6-digit code from the signup email.
   * Supabase names this token type differently across versions, so try the
   * signup type first and fall back to the generic email OTP.
   */
  const verifyEmailCode = useCallback(
    async ({ email, token }) => {
      if (!isSupabaseConfigured) return { error: null }
      const code = String(token).replace(/\D/g, '')
      clearPreview()
      let { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' })
      if (error) {
        const retry = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
        if (!retry.error) {
          reloadIfPreviewing()
          return { error: null }
        }
      }
      if (!error) reloadIfPreviewing()
      return { error }
    },
    [clearPreview, reloadIfPreviewing],
  )

  /** Send the confirmation code again. */
  const resendEmailCode = useCallback(async (email) => {
    if (!isSupabaseConfigured) return { error: null }
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    return { error }
  }, [])

  /** Email a recovery link. Always resolves the same way — telling a
   *  stranger whether an address has an account is a data leak. */
  const requestPasswordReset = useCallback(async (email) => {
    if (!isSupabaseConfigured) return { error: null }
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { error: null }
  }, [])

  /** Set a new password for the session the recovery link established. */
  const updatePassword = useCallback(async (password) => {
    if (!isSupabaseConfigured) return { error: null }
    const { error } = await supabase.auth.updateUser({ password })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    // With the door force-skipped there is nothing to sign out of — the app
    // would simply re-enter — so leave the session in place.
    if (AUTO_ENTER) return
    const wasPreviewing = PREVIEWING
    localStorage.removeItem(DEMO_KEY)
    localStorage.removeItem(ONBOARDED_KEY)
    localStorage.removeItem(DEMO_MODE_KEY)
    // Leaving a preview on a live deployment reloads back into the real app.
    if (wasPreviewing && isSupabaseConfigured) {
      window.location.assign('/welcome')
      return
    }
    if (isSupabaseConfigured) await supabase.auth.signOut()
    setOnboarded(isSupabaseConfigured ? null : false)
    setSession(null)
  }, [])

  /**
   * Enter the furnished demo practice without an account. On a live
   * deployment this reloads, because the data seam decides demo-or-real at
   * module load — a soft state change would leave half the app talking to
   * Supabase and half to the demo store.
   */
  const exploreDemo = useCallback(() => {
    // Fired BEFORE the localStorage writes, so the event is not tagged as
    // demo traffic — this is the click that a real visitor makes.
    track('demo_opened')
    localStorage.setItem(DEMO_MODE_KEY, 'true')
    localStorage.setItem(DEMO_KEY, 'true')
    localStorage.setItem(ONBOARDED_KEY, 'true')
    if (isSupabaseConfigured && !PREVIEWING) {
      // ?demo=1 makes the entry visible as a distinct page view, so the demo
      // is still countable on plans without custom events. React Router drops
      // it on the first in-app navigation.
      window.location.assign('/?demo=1')
      return
    }
    setOnboarded(true)
    setSession({ demo: true })
  }, [])

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDED_KEY, 'true')
    setOnboarded(true)
  }, [])

  const value = useMemo(
    () => ({
      session,
      loading,
      onboarded,
      bypassed: BYPASS_AUTH,
      autoEntered: AUTO_ENTER,
      isDemoAuth: !isSupabaseConfigured,
      previewing: PREVIEWING,
      signIn,
      signUp,
      signOut,
      exploreDemo,
      completeOnboarding,
      requestPasswordReset,
      updatePassword,
      verifyEmailCode,
      resendEmailCode,
      signInWithGoogle,
    }),
    [
      session,
      loading,
      onboarded,
      signIn,
      signUp,
      signOut,
      exploreDemo,
      completeOnboarding,
      requestPasswordReset,
      updatePassword,
      verifyEmailCode,
      resendEmailCode,
      signInWithGoogle,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
