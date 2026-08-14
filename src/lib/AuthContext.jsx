import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabase'

const AuthContext = createContext(null)

const DEMO_KEY = 'dentin:demo-session'
const ONBOARDED_KEY = 'dentin:onboarded'

/**
 * Auth for both worlds.
 *
 * With Supabase configured this is a real session. Without it the app runs the
 * demo practice, and "signing in" is a local flag — so the welcome and
 * onboarding flows stay explorable rather than being dead screens until a
 * backend exists.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem(ONBOARDED_KEY) === 'true',
  )

  useEffect(() => {
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
    setOnboarded(false)
    setSession(null)
    if (isSupabaseConfigured) await supabase.auth.signOut()
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
