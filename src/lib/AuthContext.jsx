import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabase'

const AuthContext = createContext(null)

const DEMO_KEY = 'dentin:demo-session'
const ONBOARDED_KEY = 'dentin:onboarded'

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
    if (!isSupabaseConfigured && localStorage.getItem(DEMO_KEY) === 'true') {
      return { demo: true }
    }
    return null
  })
  // Only a real backend needs an async session check; demo state is local.
  const [loading, setLoading] = useState(isSupabaseConfigured && !AUTO_ENTER)
  const [onboarded, setOnboarded] = useState(
    () => AUTO_ENTER || localStorage.getItem(ONBOARDED_KEY) === 'true',
  )

  useEffect(() => {
    if (AUTO_ENTER || !isSupabaseConfigured) return undefined

    let active = true

    // Live truth for "onboarded" is the database, not a browser flag: a
    // profile with a practice attached has finished setup, on any device.
    const syncOnboarded = async (session) => {
      if (!session?.user) return
      const { data } = await supabase
        .from('profiles')
        .select('practice_id')
        .eq('id', session.user.id)
        .maybeSingle()
      if (active) setOnboarded(Boolean(data?.practice_id))
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

  const signIn = useCallback(async ({ email, password }) => {
    if (!isSupabaseConfigured) {
      // Signing in claims an existing practice — no setup wizard.
      localStorage.setItem(DEMO_KEY, 'true')
      localStorage.setItem(ONBOARDED_KEY, 'true')
      setOnboarded(true)
      setSession({ demo: true })
      return { error: null }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  const signUp = useCallback(async ({ email, password, fullName }) => {
    if (!isSupabaseConfigured) {
      localStorage.setItem(DEMO_KEY, 'true')
      setSession({ demo: true })
      return { error: null }
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    // With the door force-skipped there is nothing to sign out of — the app
    // would simply re-enter — so leave the session in place.
    if (AUTO_ENTER) return
    localStorage.removeItem(DEMO_KEY)
    localStorage.removeItem(ONBOARDED_KEY)
    if (isSupabaseConfigured) await supabase.auth.signOut()
    setOnboarded(false)
    setSession(null)
  }, [])

  /** Enter without an account — demo builds only. */
  const exploreDemo = useCallback(() => {
    localStorage.setItem(DEMO_KEY, 'true')
    localStorage.setItem(ONBOARDED_KEY, 'true')
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
      signIn,
      signUp,
      signOut,
      exploreDemo,
      completeOnboarding,
    }),
    [session, loading, onboarded, signIn, signUp, signOut, exploreDemo, completeOnboarding],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
