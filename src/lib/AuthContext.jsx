import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabase'

const AuthContext = createContext(null)

const DEMO_KEY = 'dentin:demo-session'
const ONBOARDED_KEY = 'dentin:onboarded'

/**
 * Auth bypass — open the app straight on Today, no sign-in, no setup wizard.
 *
 * On by default until Supabase is configured, so the app is immediately
 * demoable. Once a live project is wired the real session takes over; set
 * VITE_BYPASS_AUTH=true to keep skipping the gate even then.
 *
 * /welcome and /onboarding stay reachable by URL either way, so the flows can
 * still be shown without turning the gate back on.
 */
export const BYPASS_AUTH =
  import.meta.env.VITE_BYPASS_AUTH === 'true' || !isSupabaseConfigured

/**
 * Auth for both worlds.
 *
 * With Supabase configured this is a real session. Without it the app runs the
 * demo practice, and "signing in" is a local flag — so the welcome and
 * onboarding flows stay explorable rather than being dead screens until a
 * backend exists.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(BYPASS_AUTH ? { demo: true, bypassed: true } : null)
  const [loading, setLoading] = useState(!BYPASS_AUTH)
  const [onboarded, setOnboarded] = useState(
    () => BYPASS_AUTH || localStorage.getItem(ONBOARDED_KEY) === 'true',
  )

  useEffect(() => {
    if (BYPASS_AUTH) return undefined

    if (!isSupabaseConfigured) {
      setSession(localStorage.getItem(DEMO_KEY) === 'true' ? { demo: true } : null)
      setLoading(false)
      return undefined
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async ({ email, password }) => {
    if (!isSupabaseConfigured) {
      localStorage.setItem(DEMO_KEY, 'true')
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
    localStorage.removeItem(DEMO_KEY)
    localStorage.removeItem(ONBOARDED_KEY)
    if (isSupabaseConfigured) await supabase.auth.signOut()
    // With the gate bypassed there is nothing to sign out of — the app would
    // simply re-enter — so leave the session in place.
    if (BYPASS_AUTH) return
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
