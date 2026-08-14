import { useEffect, useState } from 'react'
import {
  Activity,
  Bell,
  Building2,
  CalendarClock,
  Check,
  FileSpreadsheet,
  Info,
  MapPin,
  Moon,
  Share,
  Sparkles,
  Sun,
  SunMoon,
  Users,
  Wrench,
} from 'lucide-react'
import Screen from '@/components/ios/Screen'
import { Row, RowIcon, Section } from '@/components/ios/List'
import { Pill, SegmentedControl, Toggle } from '@/components/ios/Controls'
import Button from '@/components/ios/Button'
import Sheet from '@/components/ios/Sheet'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { useData } from '@/hooks/useData'
import { getPractice, isDemo, listLocations } from '@/lib/repository'
import { permission, pushSupport, sendTestNotification, subscribeToPush } from '@/lib/push'

const FIELDS = [
  { key: 'name', label: 'Practice name', placeholder: 'Ridgeline Dental Studio' },
  { key: 'legalName', label: 'Legal entity', placeholder: 'Ridgeline Dental Studio, PLLC' },
  { key: 'phone', label: 'Phone', placeholder: '(512) 555-0148', type: 'tel' },
  { key: 'email', label: 'Email', placeholder: 'ops@practice.com', type: 'email' },
  { key: 'address1', label: 'Street address', placeholder: '4820 Bee Cave Road' },
  { key: 'address2', label: 'Suite / unit', placeholder: 'Suite 210' },
  { key: 'city', label: 'City', placeholder: 'Austin' },
  { key: 'region', label: 'State', placeholder: 'TX' },
  { key: 'postalCode', label: 'ZIP', placeholder: '78746', type: 'text' },
]

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

export default function Settings() {
  const navigate = useNavigate()
  const { signOut, bypassed } = useAuth()
  const { data: practice } = useData(() => getPractice(), [])
  const { data: locations } = useData(() => listLocations(), [])

  const [theme, setTheme] = useTheme()
  const [addressOpen, setAddressOpen] = useState(false)
  const [draft, setDraft] = useState({})
  const [saved, setSaved] = useState(false)

  const [prefs, setPrefs] = useState(() => ({
    lowStock: true,
    expiring: true,
    serviceDue: true,
    priceDrops: true,
    orderUpdates: true,
  }))

  const [pushState, setPushState] = useState(() => ({
    ...pushSupport(),
    permission: permission(),
  }))
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState(null)

  useEffect(() => {
    if (practice) setDraft(practice)
  }, [practice])

  const shipTo = practice
    ? [
        practice.address1,
        practice.address2,
        [practice.city, practice.region].filter(Boolean).join(', '),
        practice.postalCode,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const enablePush = async () => {
    setPushBusy(true)
    setPushError(null)
    try {
      await subscribeToPush()
      setPushState((s) => ({ ...s, permission: 'granted' }))
      await sendTestNotification()
    } catch (e) {
      const messages = {
        'ios-needs-install':
          'On iPhone, add Dentin to your Home Screen first — Safari only delivers push to installed apps.',
        'missing-vapid-key': 'Push keys are not configured for this deployment yet.',
        'permission-denied': 'Notifications were declined. Enable them in system settings.',
        unsupported: 'This browser does not support push notifications.',
      }
      setPushError(messages[e.message] ?? 'Could not enable notifications.')
    } finally {
      setPushBusy(false)
    }
  }

  const saveAddress = () => {
    // Demo mode keeps the edit in memory; live mode persists via Supabase.
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      setAddressOpen(false)
    }, 900)
  }

  return (
    <Screen title="Practice" subtitle={practice?.name}>
      {/* Practice identity */}
      <Section title="Practice">
        <Row
          leading={
            <RowIcon tint="brand">
              <Building2 size={15} strokeWidth={2.2} />
            </RowIcon>
          }
          title={practice?.name ?? 'Your practice'}
          subtitle={practice?.legalName}
          onClick={() => setAddressOpen(true)}
        />
        <Row
          leading={
            <RowIcon tint="blue">
              <MapPin size={15} strokeWidth={2.2} />
            </RowIcon>
          }
          title="Shipping address"
          subtitle={shipTo || 'Add the address orders ship to'}
          onClick={() => setAddressOpen(true)}
        />
      </Section>

      {/* Vendors */}
      <Section title="Purchasing">
        <Row
          leading={
            <RowIcon tint="brand">
              <Building2 size={15} strokeWidth={2.2} />
            </RowIcon>
          }
          title="Vendors & accounts"
          subtitle="Who you can order from, and on what terms"
          to="/vendors"
        />
        <Row
          leading={
            <RowIcon tint="orange">
              <Sparkles size={15} strokeWidth={2.2} />
            </RowIcon>
          }
          title="Competitive pricing"
          subtitle="Vendors that beat your current accounts"
          to="/vendors/compare"
        />
        <Row
          leading={
            <RowIcon tint="green">
              <FileSpreadsheet size={15} strokeWidth={2.2} />
            </RowIcon>
          }
          title="Import contract pricing"
          subtitle="Load the negotiated price file from your rep"
          to="/vendors/import"
        />
      </Section>

      <Section title="Practice operations">
        <Row
          leading={
            <RowIcon tint="purple">
              <Users size={15} strokeWidth={2.2} />
            </RowIcon>
          }
          title="Team & roles"
          subtitle="Who can order, and who moved the stock"
          to="/team"
        />
        <Row
          leading={
            <RowIcon tint="blue">
              <Activity size={15} strokeWidth={2.2} />
            </RowIcon>
          }
          title="Procedures & consumption"
          subtitle="What each procedure draws from stock"
          to="/procedures"
        />
        <Row
          leading={
            <RowIcon tint="red">
              <CalendarClock size={15} strokeWidth={2.2} />
            </RowIcon>
          }
          title="Lot expiry"
          subtitle="Expired and expiring lots on the shelf"
          to="/expiry"
        />
        <Row
          leading={
            <RowIcon tint="gray">
              <Wrench size={15} strokeWidth={2.2} />
            </RowIcon>
          }
          title="Equipment register"
          subtitle="Serials, warranties and service history"
          to="/equipment"
        />
      </Section>

      {/* Locations */}
      <Section
        title="Locations"
        footer="Stock, par levels and orders are tracked per location."
      >
        {(locations ?? []).map((l) => (
          <Row
            key={l.id}
            title={l.name}
            subtitle={`${l.operatories} operatories`}
            chevron={false}
            trailing={l.isPrimary ? <Pill tone="brand">Primary</Pill> : null}
          />
        ))}
      </Section>

      {/* Notifications */}
      <Section
        title="Alerts"
        footer={
          pushState.permission === 'granted'
            ? 'Dentin checks stock every morning and notifies you before you run out.'
            : 'Turn on notifications to hear about low stock before it becomes a cancelled appointment.'
        }
      >
        {pushState.permission !== 'granted' ? (
          <Row
            leading={
              <RowIcon tint="orange">
                <Bell size={15} strokeWidth={2.2} />
              </RowIcon>
            }
            title="Enable push notifications"
            subtitle={
              pushState.reason === 'ios-needs-install'
                ? 'Add to Home Screen first on iPhone'
                : 'Low stock, expiring lots, service due'
            }
            onClick={enablePush}
            disabled={pushBusy}
            chevron={false}
            trailing={pushBusy ? <Pill tone="quiet">Enabling…</Pill> : null}
          />
        ) : (
          <Row
            leading={
              <RowIcon tint="green">
                <Check size={15} strokeWidth={2.6} />
              </RowIcon>
            }
            title="Push notifications on"
            subtitle="This device will receive alerts"
            chevron={false}
            onClick={sendTestNotification}
            trailing={<Pill tone="good">Active</Pill>}
          />
        )}

        {[
          ['lowStock', 'Low stock', 'When an item hits its reorder point'],
          ['expiring', 'Expiring lots', 'Anesthetics and materials nearing expiry'],
          ['serviceDue', 'Equipment service', 'Sterilizer, compressor and chair intervals'],
          ['priceDrops', 'Price drops', 'When something you buy gets cheaper'],
          ['orderUpdates', 'Order updates', 'Confirmations and deliveries'],
        ].map(([key, label, hint]) => (
          <Row
            key={key}
            title={label}
            subtitle={hint}
            chevron={false}
            trailing={
              <Toggle
                checked={prefs[key]}
                onChange={(v) => setPrefs((p) => ({ ...p, [key]: v }))}
                label={label}
              />
            }
          />
        ))}
      </Section>

      {pushError ? (
        <div className="mt-2 flex items-start gap-2 rounded-card bg-ios-orange/10 p-3.5">
          <Info size={15} className="mt-0.5 shrink-0 text-ios-orange" aria-hidden="true" />
          <p className="text-footnote text-label-2">{pushError}</p>
        </div>
      ) : null}

      {pushState.reason === 'ios-needs-install' ? (
        <div className="mt-2 flex items-start gap-2 rounded-card bg-surface p-3.5">
          <Share size={15} className="mt-0.5 shrink-0 text-ios-blue" aria-hidden="true" />
          <p className="text-footnote text-label-2">
            To install on iPhone: tap Share, then <strong>Add to Home Screen</strong>. Dentin then
            runs full-screen and can send alerts.
          </p>
        </div>
      ) : null}

      {/* Appearance */}
      <Section title="Appearance">
        <div className="p-3.5">
          <SegmentedControl
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'Auto' },
            ]}
          />
          <p className="mt-2.5 flex items-center gap-1.5 text-footnote text-label-3">
            {theme === 'light' ? (
              <Sun size={13} />
            ) : theme === 'dark' ? (
              <Moon size={13} />
            ) : (
              <SunMoon size={13} />
            )}
            {theme === 'system' ? 'Follows your device setting' : `Always ${theme}`}
          </p>
        </div>
      </Section>

      {/* About */}
      <Section title="About">
        <Row title="Version" detail="1.0.0" chevron={false} />
        <Row
          title="Data source"
          detail={isDemo ? 'Demo practice' : 'Supabase'}
          chevron={false}
          trailing={isDemo ? <Pill tone="warning">Demo</Pill> : <Pill tone="good">Live</Pill>}
        />
      </Section>

      <Section
        footer={
          bypassed
            ? 'Sign-in is bypassed, so the app opens straight on Today. Set VITE_BYPASS_AUTH=false once Supabase is connected to turn the gate back on.'
            : undefined
        }
      >
        <Row
          title="Re-run practice setup"
          subtitle="Revisit locations, suppliers and what you track"
          onClick={() => navigate('/onboarding')}
        />
        {bypassed ? (
          <Row
            title="Preview the sign-in screen"
            subtitle="Sign-in is bypassed in this build"
            onClick={() => navigate('/welcome')}
          />
        ) : (
          <Row title="Sign out" destructive chevron={false} onClick={signOut} />
        )}
      </Section>

      <p className="px-1 pb-2 pt-6 text-center text-footnote text-label-3">
        Dentin — the price beneath the rest.
      </p>

      {/* Address editor */}
      <Sheet
        open={addressOpen}
        onClose={() => setAddressOpen(false)}
        title="Practice details"
        detent="large"
        footer={
          <Button className="w-full" size="lg" onClick={saveAddress} icon={saved ? Check : undefined}>
            {saved ? 'Saved' : 'Save'}
          </Button>
        }
      >
        <div className="space-y-4 py-3">
          <div className="ios-group">
            {FIELDS.map((field) => (
              <label key={field.key} className="ios-row block py-2.5">
                <span className="block text-caption font-medium uppercase tracking-[0.4px] text-label-3">
                  {field.label}
                </span>
                <input
                  type={field.type ?? 'text'}
                  value={draft[field.key] ?? ''}
                  placeholder={field.placeholder}
                  onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                  className="mt-0.5 w-full bg-transparent text-body text-label placeholder:text-label-3 focus:outline-none"
                />
              </label>
            ))}
          </div>

          <p className="px-1 text-footnote text-label-3">
            This is the address suppliers ship to and the one that appears on purchase orders.
          </p>

          {isDemo ? (
            <p className="px-1 text-footnote text-ios-orange">
              Running on the demo practice — edits are kept for this session only. Connect Supabase
              to persist them.
            </p>
          ) : null}
        </div>
      </Sheet>
    </Screen>
  )
}
