import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Building2,
  Check,
  FileSpreadsheet,
  Loader2,
  MapPin,
  ScanLine,
  Store,
} from 'lucide-react'
import { SUPPLIERS } from '@/lib/demoData'
import { STARTER_PACK, completePracticeSetup } from '@/lib/repository'
import { useAuth } from '@/lib/AuthContext'
import { cn, haptic } from '@/lib/utils'

function Field({ label, value, onChange, placeholder, type = 'text', autoComplete, inputMode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption font-medium uppercase tracking-[0.4px] text-label-3">
        {label}
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
  const [locations, setLocations] = useState([{ name: '', operatories: '' }])
  const [suppliers, setSuppliers] = useState(() =>
    // Pre-select the ones nearly every practice already buys from.
    new Set(['henry-schein', 'patterson', 'benco', 'darby', 'net32']),
  )
  const [stock, setStock] = useState('starter')
  const [busy, setBusy] = useState(false)
  const [finishError, setFinishError] = useState(null)

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
      {
        key: 'locations',
        Icon: Store,
        title: 'Locations',
        blurb: 'Stock, par levels and orders are tracked per location.',
        valid: locations.some((l) => l.name.trim().length > 1),
      },
      {
        key: 'suppliers',
        Icon: Store,
        title: 'Who you buy from',
        blurb: 'Dentin prices every item across the suppliers you select.',
        valid: suppliers.size > 0,
      },
      {
        key: 'stock',
        Icon: Boxes,
        title: 'Stock the shelves',
        blurb: 'How should your inventory start? Everything is editable later.',
        valid: true,
      },
    ],
    [practice, address, locations, suppliers],
  )

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  const finish = async () => {
    setBusy(true)
    setFinishError(null)
    try {
      await completePracticeSetup({
        practice: { ...practice, ...address },
        locations,
        supplierSlugs: [...suppliers],
        starter: stock,
      })
      completeOnboarding()
      navigate(stock === 'import' ? '/inventory/import' : '/', { replace: true })
    } catch (e) {
      setFinishError(e.message ?? 'Something went wrong — nothing was saved.')
    } finally {
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
                </>
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

              {current.key === 'suppliers'
                ? SUPPLIERS.map((s) => (
                    <SelectCard
                      key={s.id}
                      selected={suppliers.has(s.id)}
                      title={s.name}
                      subtitle={
                        s.freeShipOver > 0
                          ? `Free shipping over $${s.freeShipOver} · ~${s.leadDays}d`
                          : `Flat $${s.shipFee.toFixed(2)} shipping · ~${s.leadDays}d`
                      }
                      onClick={() => toggle(suppliers, setSuppliers)(s.id)}
                    />
                  ))
                : null}

              {current.key === 'stock' ? (
                <>
                  {[
                    {
                      key: 'starter',
                      Icon: Boxes,
                      title: `Start with the essentials (${STARTER_PACK.length} items)`,
                      subtitle:
                        'Gloves, anesthetics, composites, burs — par targets set, counts at zero until you scan the shelves.',
                    },
                    {
                      key: 'import',
                      Icon: FileSpreadsheet,
                      title: 'Import a file',
                      subtitle:
                        'A stocktake sheet or a distributor order-history export — CSV in, inventory out.',
                    },
                    {
                      key: 'blank',
                      Icon: ScanLine,
                      title: 'Start empty',
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

                  {stock === 'starter' ? (
                    <p className="px-1 text-footnote text-label-3">
                      The essentials cover infection control, restorative, preventive, endo,
                      surgery, impressions, anesthetics, burs and disposables. Walk the stockroom
                      with Scan afterwards to count what's on hand — reorder alerts switch on from
                      real counts, never guesses.
                    </p>
                  ) : null}
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
                  ? 'Finish & import inventory'
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
