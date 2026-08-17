import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, Section } from '@/components/ui/List'
import { Pill, SegmentedControl } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/lib/AuthContext'
import { useData } from '@/hooks/useData'
import { getCurrentUser, isDemo, updateCurrentUser } from '@/lib/repository'

const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  clinician: 'Clinician',
  assistant: 'Assistant',
  viewer: 'Viewer',
}

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('dentin:theme') ?? 'system')

  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
      localStorage.removeItem('dentin:theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
      localStorage.setItem('dentin:theme', theme)
    }
  }, [theme])

  return [theme, setTheme]
}

/**
 * The signed-in person's own settings — identity, appearance, security,
 * session. Practice-wide configuration stays under Settings; this screen is
 * only ever about "me".
 */
export default function Account() {
  const navigate = useNavigate()
  const toast = useToast()
  const { signOut, bypassed, autoEntered, previewing } = useAuth()
  const [theme, setTheme] = useTheme()

  const { data: user } = useData(() => getCurrentUser(), [])
  const [draft, setDraft] = useState({ name: '', email: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user) setDraft({ name: user.name ?? '', email: user.email ?? '' })
  }, [user])

  const dirty = user && (draft.name !== user.name || draft.email !== user.email)

  const save = async () => {
    setBusy(true)
    try {
      await updateCurrentUser({ name: draft.name.trim(), email: draft.email.trim() })
      toast({ title: 'Profile updated', body: draft.name })
    } catch (e) {
      toast({ title: 'Could not save', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const needsLiveAuth = () =>
    toast({
      title: isDemo ? 'Needs live auth' : 'Not available yet',
      body: isDemo
        ? 'Password and two-factor settings activate once Supabase auth is connected.'
        : 'Coming soon.',
      tone: 'info',
    })

  return (
    <Screen
      title="Account"
      subtitle={user?.email}
      leading={
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="press flex items-center gap-0.5 rounded-[3px] pl-1 pr-1.5 text-brand-600 dark:text-brand-400"
        >
          <ChevronLeft size={22} strokeWidth={2.2} />
          <span className="text-body">Back</span>
        </button>
      }
    >
      {/* Identity */}
      <div className="panel mt-3 flex items-center gap-3 p-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] bg-brand-600 text-subhead font-bold text-white">
          {user?.initials ?? '·'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-headline">{user?.name ?? '—'}</p>
          <p className="ident truncate text-label-3">{user?.email ?? '—'}</p>
        </div>
        <Pill tone="brand" icon={ShieldCheck}>
          {ROLE_LABELS[user?.role] ?? 'Member'}
        </Pill>
      </div>

      {/* Profile */}
      <Section
        title="Profile"
        footer={
          isDemo
            ? 'Demo edits persist for this session. Connected to Supabase, email changes go through a confirmation link.'
            : 'Email changes send a confirmation link before they take effect.'
        }
      >
        <label className="row block py-2">
          <span className="block text-caption2 font-semibold uppercase tracking-[0.07em] text-label-3">
            Full name
          </span>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            autoComplete="name"
            className="mt-0.5 w-full bg-transparent text-body text-label placeholder:text-label-3 focus:outline-none"
            placeholder="Dr. Logan Newman"
          />
        </label>
        <label className="row block py-2">
          <span className="block text-caption2 font-semibold uppercase tracking-[0.07em] text-label-3">
            Email
          </span>
          <input
            type="email"
            value={draft.email}
            onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            autoComplete="email"
            className="mt-0.5 w-full bg-transparent text-body text-label placeholder:text-label-3 focus:outline-none"
            placeholder="you@practice.com"
          />
        </label>
      </Section>

      {dirty ? (
        <div className="mt-2">
          <Button className="w-full" loading={busy} icon={Check} onClick={save}>
            Save changes
          </Button>
        </div>
      ) : null}

      {/* Appearance — a per-person choice, so it lives here */}
      <Section title="Appearance">
        <div className="p-3">
          <SegmentedControl
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
        </div>
      </Section>

      {/* Security */}
      <Section
        title="Security"
        footer="Every stock movement and order is attributed to your account, so the ledger names who did what."
      >
        <Row
          leading={<KeyRound size={16} strokeWidth={1.9} className="text-label-2" aria-hidden="true" />}
          title="Change password"
          subtitle={isDemo ? 'Available with live auth' : 'Update your password'}
          chevron={false}
          onClick={needsLiveAuth}
        />
        <Row
          leading={<ShieldCheck size={16} strokeWidth={1.9} className="text-label-2" aria-hidden="true" />}
          title="Two-factor authentication"
          subtitle={isDemo ? 'Available with live auth' : 'Add a second factor'}
          chevron={false}
          onClick={needsLiveAuth}
        />
      </Section>

      {/* Session */}
      <Section
        footer={
          autoEntered
            ? 'Sign-in is bypassed in this build, so there is no session to end — this previews the sign-in screen instead.'
            : bypassed || previewing
              ? 'You are in the demo practice. Leaving returns to the welcome screen — nothing here touches a real account.'
              : undefined
        }
      >
        {autoEntered ? (
          <Row
            leading={<LogOut size={16} strokeWidth={1.9} className="text-label-2" aria-hidden="true" />}
            title="Preview the sign-in screen"
            onClick={() => navigate('/welcome')}
          />
        ) : bypassed || previewing ? (
          <Row
            leading={<LogOut size={16} strokeWidth={1.9} className="text-label-2" aria-hidden="true" />}
            title="Leave the demo"
            subtitle="Back to sign in and create account"
            chevron={false}
            onClick={signOut}
          />
        ) : (
          <Row
            leading={<LogOut size={16} strokeWidth={1.9} className="text-ios-red" aria-hidden="true" />}
            title="Sign out"
            destructive
            chevron={false}
            onClick={signOut}
          />
        )}
      </Section>
    </Screen>
  )
}
