import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Boxes,
  Building2,
  Check,
  CreditCard,
  FileSpreadsheet,
  Loader2,
  MapPin,
  ScanLine,
  Store,
} from 'lucide-react'
import { SUPPLIERS, VENDOR_DIRECTORY, VENDOR_KINDS } from '@/lib/demoData'
import { SearchField, SegmentedControl } from '@/components/ui/Controls'
import { queueWalkthrough } from '@/components/Walkthrough'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  captureReferralCode,
  completePracticeSetup,
  getSubscription,
  setReferralCode,
  startSubscriptionCheckout,
  syncBillingQuantity,
} from '@/lib/repository'
import { useData } from '@/hooks/useData'
import { useAuth } from '@/lib/AuthContext'
import { track } from '@/lib/analytics'
import { cn, haptic } from '@/lib/utils'

// Wizard progress survives the round-trip to Stripe's checkout page. Versioned:
// v1 drafts stored a step INDEX under the old order, where the card came second.
// Replaying one against the current order would drop somebody on the wrong
// screen, so old drafts are simply ignored rather than mistranslated.
const DRAFT_KEY = 'dentin:onboarding-draft-v2'

const KIND_LABEL = Object.fromEntries(VENDOR_KINDS.map((k) => [k.id, k.label]))

// Every dental vendor in the directory as a pickable choice — the handful
// Dentin prices today lead the list and carry their shipping economics.
const VENDOR_CHOICES = VENDOR_DIRECTORY.map((d) => {
  const slug = d.supplierId ?? d.id
  const s = SUPPLIERS.find((x) => x.id === slug)
  return {
    slug,
    name: s?.name ?? d.name,
    kind: d.kind,
    hq: d.hq ?? '',
    priced: Boolean(s),
    subtitle: s
      ? `Priced by Dentin · ${
          s.freeShipOver > 0
            ? `free shipping over $${s.freeShipOver}`
            : `flat $${s.shipFee.toFixed(2)} shipping`
        } · ~${s.leadDays}d`
      : `${KIND_LABEL[d.kind] ?? d.kind}${d.hq ? ` · ${d.hq}` : ''}`,
  }
}).sort((a, b) => (a.priced !== b.priced ? (a.priced ? -1 : 1) : a.name.localeCompare(b.name)))

const OPTIONAL_SUFFIX = /\s*\(optional\)\s*$/i

function Field({ label, value, onChange, placeholder, type = 'text', autoComplete, inputMode }) {
  // "(optional)" carries real information — whether this can be skipped — so
  // it reads a shade darker than the field name rather than fading out.
  const text = String(label)
  const optional = OPTIONAL_SUFFIX.test(text)
  const name = text.replace(OPTIONAL_SUFFIX, '')

  return (
    <label className="block">
      <span className="mb-1 block text-caption font-medium uppercase tracking-[0.4px] text-label-3">
        {name}
        {optional ? <span className="ml-1 text-label-2">(optional)</span> : null}
      </span>
      <input
        type={type}
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-ios bg-surface px-3.5 py-3 text-callout text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      />
    </label>
  )
}

function SelectCard({ selected, title, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic(6)
        onClick()
      }}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-card border-2 p-3.5 text-left transition-colors duration-150',
        selected
          ? 'border-brand-600 bg-brand-600/8'
          : 'border-transparent bg-surface active:bg-surface-2',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-callout font-semibold text-label">{title}</span>
        {subtitle ? (
          <span className="block truncate text-footnote text-label-3">{subtitle}</span>
        ) : null}
      </span>
      <span
        className={cn(
          'flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[3px] border-2 transition-colors',
          selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-separator',
        )}
        aria-hidden="true"
      >
        {selected ? <Check size={14} strokeWidth={3} /> : null}
      </span>
    </button>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { completeOnboarding } = useAuth()

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)

  const [practice, setPractice] = useState({
    name: '',
    legalName: '',
    phone: '',
    email: '',
  })
  const [address, setAddress] = useState({
    address1: '',
    address2: '',
    city: '',
    region: '',
    postalCode: '',
  })
  // One office is the common case — those practices never see the Locations
  // step; the single location is named after the practice automatically.
  const [multiLoc, setMultiLoc] = useState('one')
  const [locations, setLocations] = useState([{ name: '', operatories: '' }])
  // No preselected vendors: who a practice buys from is their answer to give.
  const [suppliers, setSuppliers] = useState(() => new Set())
  const [vendorQuery, setVendorQuery] = useState('')
  // Two ways to start, both empty of assumptions: bring the file from the
  // last system, or build the shelf yourself by catalog and barcode.
  const [stock, setStock] = useState('blank')
  const [busy, setBusy] = useState(false)
  const [finishError, setFinishError] = useState(null)

  // The free trial gates the rest of setup: card at Stripe, $0 today,
  // cancel anytime inside the 7 days.
  const { data: sub } = useData(() => getSubscription(), [])
  const [plan, setPlan] = useState('annual')
  const [trialBusy, setTrialBusy] = useState(false)
  const [trialError, setTrialError] = useState(null)
  const [checkoutReturn, setCheckoutReturn] = useState(null)
  // Whoever referred them — from a ?ref= share link, or typed here.
  const [referral, setReferral] = useState(() => captureReferralCode() ?? '')
  // Set on the way back from Stripe; resolved to the trial step's real index
  // once STEPS exists, since that index depends on the location count.
  const [returnToTrial, setReturnToTrial] = useState(false)
  const subActive =
    ['active', 'trialing', 'past_due'].includes(sub?.status) || checkoutReturn === 'success'

  // Hydrate the draft when returning from Stripe (or a reload mid-wizard).
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const back = new URLSearchParams(window.location.search).get('checkout')
    if (back) {
      setCheckoutReturn(back)
      // 'cancelled' is the single most expensive event in the funnel: they
      // asked for the trial, saw Stripe's card form, and backed out.
      track('checkout_returned', { result: back === 'success' ? 'success' : 'cancelled' })
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw)
      if (d.practice) setPractice(d.practice)
      if (d.address) setAddress(d.address)
      if (d.multiLoc) setMultiLoc(d.multiLoc)
      if (Array.isArray(d.locations) && d.locations.length) setLocations(d.locations)
      if (Array.isArray(d.suppliers)) setSuppliers(new Set(d.suppliers))
      if (d.stock) setStock(d.stock)
      // The card is the last step now, so every return from Stripe lands
      // there: paid, and the footer turns into Finish; backed out, and the
      // pitch is still on screen to try again. Resolved by key rather than a
      // hard-coded index — STEPS grows and shrinks with the location count.
      if (back) setReturnToTrial(true)
      else if (typeof d.step === 'number') setStep(d.step)
    } catch {
      // A malformed draft is not worth blocking setup over.
    }
     
  }, [])

  // Keep the draft current while they work (live only — the demo resets).
  useEffect(() => {
    if (!isSupabaseConfigured) return
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        practice,
        address,
        multiLoc,
        locations,
        suppliers: [...suppliers],
        stock,
        step,
      }),
    )
  }, [practice, address, multiLoc, locations, suppliers, stock, step])

  const startTrial = async () => {
    setTrialBusy(true)
    setTrialError(null)
    track('checkout_opened', { plan })
    try {
      // Persist the WHOLE practice before handing off to Stripe, not just a
      // name-only shell. Two things follow from that. Anyone who backs out at
      // the card form keeps every answer they gave — on any device, not just
      // the browser holding the draft. And the locations now exist before
      // checkout reads them, so the subscription is billed for the real count
      // from the very first invoice instead of starting at one.
      //
      // Safe to run twice: completePracticeSetup short-circuits once the
      // practice has locations, so finish() re-running it after the redirect
      // costs one count query.
      await completePracticeSetup({
        practice: { ...practice, ...address },
        locations:
          multiLoc === 'one'
            ? [{ name: practice.name.trim(), operatories: locations[0]?.operatories ?? '' }]
            : locations,
        supplierSlugs: [...suppliers],
        starterItems: null,
      })
      await startSubscriptionCheckout(plan, '/onboarding')
    } catch (e) {
      // Never reached Stripe at all — a broken redirect, not a decision.
      track('checkout_failed', { plan })
      setTrialError(e.message ?? 'Could not open checkout.')
      setTrialBusy(false)
    }
  }

  const STEPS = useMemo(
    () => [
      {
        key: 'practice',
        Icon: Building2,
        title: 'Your practice',
        blurb: 'This is what appears on purchase orders.',
        valid: practice.name.trim().length > 1,
      },
      {
        key: 'address',
        Icon: MapPin,
        title: 'Where orders ship',
        blurb: 'Suppliers deliver here, and it prints on every PO.',
        valid:
          address.address1.trim().length > 2 &&
          address.city.trim().length > 1 &&
          address.postalCode.trim().length >= 5,
      },
      // Single-location practices skip this step entirely — their location is
      // created from the practice name without another form.
      ...(multiLoc === 'multi'
        ? [
            {
              key: 'locations',
              Icon: Store,
              title: 'Locations',
              blurb: 'Stock, par levels and orders are tracked per location.',
              valid: locations.some((l) => l.name.trim().length > 1),
            },
          ]
        : []),
      {
        key: 'suppliers',
        Icon: Store,
        title: 'Who you buy from',
        blurb: 'Every dental vendor in the directory — check who you order from today.',
        valid: suppliers.size > 0,
      },
      {
        key: 'stock',
        Icon: Boxes,
        title: 'Stock the shelves',
        blurb: 'How should your inventory start? Everything is editable later.',
        valid: true,
      },
      // The card comes LAST, once the practice is built and there is something
      // to lose by walking away. Asking on screen two — before a single shelf
      // was stocked — was costing roughly four out of five signups.
      {
        key: 'trial',
        Icon: CreditCard,
        title: 'Start your free trial',
        blurb: '7 days free — cancel anytime before day 7 and pay nothing.',
        valid: subActive,
      },
    ],
    [practice, address, locations, suppliers, multiLoc, subActive],
  )

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  // Ref, not state: two taps in the same frame both see busy=false, and a
  // doubled run would race the practice-setup writes.
  const finishing = useRef(false)

  // Land on the card step after a Stripe round-trip. Runs once: the flag is
  // cleared immediately, so this never fights the wizard's own navigation.
  useEffect(() => {
    if (!returnToTrial) return
    const i = STEPS.findIndex((s) => s.key === 'trial')
    if (i >= 0) setStep(i)
    setReturnToTrial(false)
  }, [returnToTrial, STEPS])

  // Which wizard screen loses people. `current.key` comes from the fixed
  // STEPS vocabulary — never anything anyone typed.
  useEffect(() => {
    if (!current?.key) return
    track('onboarding_step_viewed', { step: current.key })
  }, [current?.key])

  // Arriving at the Locations step, seed Location 1 with the practice name —
  // nobody should retype what they entered two screens ago.
  useEffect(() => {
    if (current?.key !== 'locations') return
    setLocations((l) =>
      l[0] && !l[0].name.trim() ? [{ ...l[0], name: practice.name }, ...l.slice(1)] : l,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key])

  const vendorResults = useMemo(() => {
    const q = vendorQuery.trim().toLowerCase()
    if (!q) return VENDOR_CHOICES
    return VENDOR_CHOICES.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.kind.toLowerCase().includes(q) ||
        (KIND_LABEL[v.kind] ?? '').toLowerCase().includes(q) ||
        v.hq.toLowerCase().includes(q),
    )
  }, [vendorQuery])

  const finish = async () => {
    if (finishing.current) return
    finishing.current = true
    setBusy(true)
    setFinishError(null)
    try {
      await completePracticeSetup({
        practice: { ...practice, ...address },
        locations:
          multiLoc === 'one'
            ? [{ name: practice.name.trim(), operatories: locations[0]?.operatories ?? '' }]
            : locations,
        supplierSlugs: [...suppliers],
        starterItems: null,
      })
      completeOnboarding()
      track('onboarding_completed', { locations: multiLoc === 'one' ? 1 : locations.length })
      localStorage.removeItem(DRAFT_KEY)
      // Locations now exist before checkout runs, so Stripe should already
      // hold the right quantity. Kept as a safety net for the practice that
      // added a location between opening checkout and finishing. Fire and
      // forget: a billing hiccup must not strand someone at the end of setup,
      // and Billing re-syncs on every visit.
      syncBillingQuantity().catch(() => {})
      // The optional tour waits on the other side of setup.
      queueWalkthrough()
      navigate(stock === 'import' ? '/inventory/import' : '/', { replace: true })
    } catch (e) {
      setFinishError(e.message ?? 'Something went wrong — tap Finish again to pick up where it left off.')
    } finally {
      finishing.current = false
      setBusy(false)
    }
  }

  const go = (delta) => {
    haptic(8)
    if (delta > 0 && isLast) {
      finish()
      return
    }
    if (delta < 0 && step === 0) {
      navigate(-1)
      return
    }
    setDirection(delta)
    setStep((s) => Math.min(STEPS.length - 1, Math.max(0, s + delta)))
  }

  const toggle = (set, setter) => (key) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setter(next)
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-canvas">
      {/* Progress */}
      <header
        className="px-5 pb-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Back"
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-line bg-surface text-label"
          >
            <ArrowLeft size={18} strokeWidth={2.2} />
          </button>
          <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
            {STEPS.map((s, i) => (
              <span
                key={s.key}
                className={cn(
                  'h-[3px] flex-1 rounded-[1px] transition-colors duration-200',
                  i <= step ? 'bg-brand-600' : 'bg-fill/15',
                )}
              />
            ))}
          </div>
          <span className="tnum shrink-0 text-caption text-label-3">
            {step + 1}/{STEPS.length}
          </span>
        </div>
      </header>

      {/* Step body */}
      <div className="scroll-area flex-1 overflow-y-auto px-5">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={current.key}
            custom={direction}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -24 }}
            transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
          >
            <span className="mt-4 flex h-11 w-11 items-center justify-center rounded-[4px] bg-brand-600 text-white">
              <current.Icon size={21} strokeWidth={2.1} aria-hidden="true" />
            </span>
            <h1 className="mt-3.5 text-title1 font-bold tracking-tight">{current.title}</h1>
            <p className="mt-1 text-subhead text-label-3">{current.blurb}</p>

            <div className="mt-6 flex flex-col gap-3 pb-6">
              {current.key === 'practice' ? (
                <>
                  <Field
                    label="Practice name"
                    value={practice.name}
                    onChange={(v) => setPractice((p) => ({ ...p, name: v }))}
                    placeholder="Ridgeline Dental Studio"
                    autoComplete="organization"
                  />
                  <Field
                    label="Legal entity (optional)"
                    value={practice.legalName}
                    onChange={(v) => setPractice((p) => ({ ...p, legalName: v }))}
                    placeholder="Ridgeline Dental Studio, PLLC"
                  />
                  <Field
                    label="Phone"
                    type="tel"
                    inputMode="tel"
                    value={practice.phone}
                    onChange={(v) => setPractice((p) => ({ ...p, phone: v }))}
                    placeholder="(512) 555-0148"
                    autoComplete="tel"
                  />
                  <Field
                    label="Ordering email"
                    type="email"
                    value={practice.email}
                    onChange={(v) => setPractice((p) => ({ ...p, email: v }))}
                    placeholder="ops@practice.com"
                    autoComplete="email"
                  />

                  <span className="mt-2 block text-caption font-medium uppercase tracking-[0.4px] text-label-3">
                    Locations
                  </span>
                  <SelectCard
                    selected={multiLoc === 'one'}
                    title="One location"
                    subtitle={`Stock and orders track to ${practice.name.trim() || 'your practice'}`}
                    onClick={() => setMultiLoc('one')}
                  />
                  <SelectCard
                    selected={multiLoc === 'multi'}
                    title="More than one location"
                    subtitle="Each office gets its own stock, par levels and orders"
                    onClick={() => setMultiLoc('multi')}
                  />
                  {multiLoc === 'one' ? (
                    <Field
                      label="Operatories (optional)"
                      inputMode="numeric"
                      value={locations[0]?.operatories ?? ''}
                      onChange={(v) =>
                        setLocations((l) => [
                          { ...(l[0] ?? { name: '' }), operatories: v.replace(/\D/g, '') },
                          ...l.slice(1),
                        ])
                      }
                      placeholder="8"
                    />
                  ) : null}
                </>
              ) : null}

              {current.key === 'trial' ? (
                subActive ? (
                  <div className="rounded-card border border-line bg-surface p-4">
                    <span className="flex items-center gap-2 text-callout font-semibold text-ios-green">
                      <BadgeCheck size={18} strokeWidth={2.2} aria-hidden="true" />
                      Trial active
                    </span>
                    <p className="mt-1.5 text-subhead text-label-2">
                      Your 7-day free trial is running. Stripe holds the card; cancel anytime
                      under Settings → Billing and pay nothing before day 7.
                    </p>
                  </div>
                ) : (
                  <>
                    <SegmentedControl
                      value={plan}
                      onChange={setPlan}
                      options={[
                        { value: 'annual', label: 'Annual · save 10%' },
                        { value: 'monthly', label: 'Monthly' },
                      ]}
                    />
                    <div className="rounded-card border border-line bg-surface p-4">
                      {plan === 'annual' ? (
                        <>
                          <p className="text-title2 font-bold leading-tight">
                            $180
                            <span className="text-callout font-semibold text-label-3">
                              {' '}
                              / location / month
                            </span>
                          </p>
                          <p className="mt-1 text-footnote text-label-3">
                            Billed annually — $2,160 per location per year, 10% under monthly
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-title2 font-bold leading-tight">
                            $200
                            <span className="text-callout font-semibold text-label-3">
                              {' '}
                              / location / month
                            </span>
                          </p>
                          <p className="mt-1 text-footnote text-label-3">Billed month to month</p>
                        </>
                      )}
                      <ul className="mt-3 border-t border-line pt-3">
                        {[
                          'First 7 days free — cancel anytime, pay nothing',
                          'Card charged only after the trial ends',
                          'Every feature unlocked from minute one',
                        ].map((point) => (
                          <li
                            key={point}
                            className="flex items-start gap-2 py-0.5 text-subhead text-label-2"
                          >
                            <Check
                              size={15}
                              strokeWidth={2.6}
                              className="mt-0.5 shrink-0 text-ios-green"
                              aria-hidden="true"
                            />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <button
                      type="button"
                      disabled={trialBusy}
                      onClick={startTrial}
                      className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[4px] bg-brand-600 text-body font-semibold text-white transition-opacity active:opacity-85 disabled:opacity-60"
                    >
                      {trialBusy ? (
                        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <>
                          <CreditCard size={17} strokeWidth={2.2} aria-hidden="true" />
                          Start the free 7-day trial
                        </>
                      )}
                    </button>
                    {checkoutReturn === 'cancelled' ? (
                      <p className="text-center text-footnote text-label-3">
                        Checkout closed — no charge was made. Start the trial to continue.
                      </p>
                    ) : null}
                    {trialError ? (
                      <p role="alert" className="text-center text-footnote text-ios-red">
                        {trialError}
                      </p>
                    ) : null}
                    <Field
                      label="Referral or promo code (optional)"
                      value={referral}
                      onChange={(v) => {
                        setReferral(v)
                        setReferralCode(v)
                      }}
                      placeholder="e.g. tonyacode2026"
                    />
                    <p className="px-1 text-footnote text-label-3">
                      {referral.trim()
                        ? `We'll apply ${referral.trim()} at checkout — one code per subscription, so it replaces any other.`
                        : 'Checkout and card details are handled by Stripe — Dentin never sees the number. Have a code? Enter it above or on the checkout page.'}
                    </p>
                  </>
                )
              ) : null}

              {current.key === 'address' ? (
                <>
                  <Field
                    label="Street address"
                    value={address.address1}
                    onChange={(v) => setAddress((a) => ({ ...a, address1: v }))}
                    placeholder="4820 Bee Cave Road"
                    autoComplete="address-line1"
                  />
                  <Field
                    label="Suite / unit"
                    value={address.address2}
                    onChange={(v) => setAddress((a) => ({ ...a, address2: v }))}
                    placeholder="Suite 210"
                    autoComplete="address-line2"
                  />
                  <Field
                    label="City"
                    value={address.city}
                    onChange={(v) => setAddress((a) => ({ ...a, city: v }))}
                    placeholder="Austin"
                    autoComplete="address-level2"
                  />
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Field
                        label="State"
                        value={address.region}
                        onChange={(v) => setAddress((a) => ({ ...a, region: v }))}
                        placeholder="TX"
                        autoComplete="address-level1"
                      />
                    </div>
                    <div className="flex-1">
                      <Field
                        label="ZIP"
                        inputMode="numeric"
                        value={address.postalCode}
                        onChange={(v) => setAddress((a) => ({ ...a, postalCode: v }))}
                        placeholder="78746"
                        autoComplete="postal-code"
                      />
                    </div>
                  </div>
                </>
              ) : null}

              {current.key === 'locations' ? (
                <>
                  {locations.map((loc, i) => (
                    <div key={i} className="rounded-card border border-line bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-caption font-medium uppercase tracking-[0.4px] text-label-3">
                          Location {i + 1}
                        </span>
                        {locations.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLocations((l) => l.filter((_, idx) => idx !== i))
                            }
                            className="press text-caption font-medium text-ios-red"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <input
                        value={loc.name}
                        onChange={(e) =>
                          setLocations((l) =>
                            l.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        placeholder="Ridgeline Dental — Main"
                        className="mt-1.5 w-full bg-transparent text-callout text-label placeholder:text-label-3 focus:outline-none"
                      />
                      <input
                        value={loc.operatories}
                        inputMode="numeric"
                        onChange={(e) =>
                          setLocations((l) =>
                            l.map((x, idx) =>
                              idx === i
                                ? { ...x, operatories: e.target.value.replace(/\D/g, '') }
                                : x,
                            ),
                          )
                        }
                        placeholder="Operatories, e.g. 8"
                        className="mt-1 w-full bg-transparent text-footnote text-label-2 placeholder:text-label-3 focus:outline-none"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setLocations((l) => [...l, { name: '', operatories: '' }])}
                    className="press rounded-card border-2 border-dashed border-separator py-3 text-callout font-semibold text-brand-600 dark:text-brand-400"
                  >
                    Add another location
                  </button>
                </>
              ) : null}

              {current.key === 'suppliers' ? (
                <>
                  <SearchField
                    value={vendorQuery}
                    onChange={setVendorQuery}
                    placeholder="Search any dental vendor — name, type, state"
                  />
                  {suppliers.size > 0 ? (
                    <p className="text-footnote font-medium text-label-2">
                      {suppliers.size} selected
                    </p>
                  ) : null}
                  {vendorResults.map((v) => (
                    <SelectCard
                      key={v.slug}
                      selected={suppliers.has(v.slug)}
                      title={v.name}
                      subtitle={v.subtitle}
                      onClick={() => toggle(suppliers, setSuppliers)(v.slug)}
                    />
                  ))}
                  {vendorResults.length === 0 ? (
                    <p className="py-4 text-center text-subhead text-label-3">
                      No vendor matches “{vendorQuery.trim()}”. Check the spelling or pick them
                      up later under Vendors.
                    </p>
                  ) : null}
                  <p className="pt-1 text-footnote text-label-3">
                    Vendors marked “Priced by Dentin” are compared on every item today. The whole
                    directory stays searchable later under Vendors.
                  </p>
                </>
              ) : null}

              {current.key === 'stock' ? (
                <>
                  {[
                    {
                      key: 'import',
                      Icon: FileSpreadsheet,
                      title: 'Upload from your previous system',
                      subtitle:
                        'A CSV export from your old inventory software or a distributor portal — file in, inventory out.',
                    },
                    {
                      key: 'blank',
                      Icon: ScanLine,
                      title: 'Start from scratch',
                      subtitle: 'Add items one by one from the catalog or by scanning barcodes.',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        haptic(6)
                        setStock(opt.key)
                      }}
                      aria-pressed={stock === opt.key}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-card border-2 p-3.5 text-left transition-colors duration-150',
                        stock === opt.key
                          ? 'border-brand-600 bg-brand-600/8'
                          : 'border-line bg-surface active:bg-surface-2',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px]',
                          stock === opt.key
                            ? 'bg-brand-600 text-white'
                            : 'border border-line text-label-2',
                        )}
                        aria-hidden="true"
                      >
                        <opt.Icon size={17} strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-callout font-semibold text-label">
                          {opt.title}
                        </span>
                        <span className="mt-0.5 block text-footnote text-label-3">
                          {opt.subtitle}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'mt-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2',
                          stock === opt.key
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-separator',
                        )}
                        aria-hidden="true"
                      >
                        {stock === opt.key ? <Check size={13} strokeWidth={3} /> : null}
                      </span>
                    </button>
                  ))}

                  <p className="px-1 text-footnote text-label-3">
                    Either way the shelf starts honestly empty — counts come from your file or
                    your own scanning, never from guesses.
                  </p>
                </>
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div
        className="border-t border-separator/50 bg-surface/85 px-5 pt-3 backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}
      >
        <button
          type="button"
          disabled={!current.valid || busy}
          onClick={() => go(1)}
          className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[4px] bg-brand-600 text-body font-semibold text-white transition-opacity active:opacity-85 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          ) : (
            <>
              {isLast
                ? stock === 'import'
                  ? 'Finish & upload your file'
                  : 'Finish setup'
                : 'Continue'}
              <ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" />
            </>
          )}
        </button>
        {finishError ? (
          <p role="alert" className="mt-2 text-center text-caption text-ios-red">
            {finishError}
          </p>
        ) : !current.valid ? (
          <p className="mt-2 text-center text-caption text-label-3">
            {current.key === 'address'
              ? 'Street, city and ZIP are needed to ship'
              : 'Fill this in to continue'}
          </p>
        ) : null}
      </div>
    </div>
  )
}
