import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  Check,
  ChevronLeft,
  ExternalLink,
  Mail,
  Phone,
  ReceiptText,
  Scale,
  Sparkles,
  Star,
  Truck,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import BackButton from '@/components/ui/BackButton'
import { Row, Section } from '@/components/ui/List'
import { EmptyState, Pill, SearchField, SegmentedControl, Toggle } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import { NewVendorRail, VendorStatus } from '@/components/VendorBadge'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import {
  VENDOR_KINDS,
  getPriceOpportunities,
  listVendorDirectory,
  listVendors,
  removeVendorAccount,
  saveVendorAccount,
} from '@/lib/repository'
import { fullDate, money, moneyRound, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const KIND_LABEL = Object.fromEntries(VENDOR_KINDS.map((k) => [k.id, k.label]))

function VendorCard({ vendor, savings, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="press relative w-full overflow-hidden rounded-card bg-surface shadow-card p-3 text-left"
    >
      <NewVendorRail active={!vendor.hasAccount} />

      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-headline font-semibold">{vendor.name}</h3>
            <VendorStatus hasAccount={vendor.hasAccount} isPreferred={vendor.isPreferred} />
          </div>

          {vendor.hasAccount ? (
            <p className="mt-1 truncate font-mono text-caption text-label-3">
              {vendor.accountNumber}
              {vendor.terms ? ` · ${vendor.terms}` : ''}
            </p>
          ) : (
            <p className="mt-1 line-clamp-2 text-footnote text-label-3">{vendor.blurb}</p>
          )}
        </div>

        <div className="shrink-0 text-right">
          {vendor.hasAccount ? (
            <>
              <p className="tnum text-callout font-semibold">{moneyRound(vendor.totalSpend)}</p>
              <p className="text-caption text-label-3">{vendor.orderCount} orders</p>
            </>
          ) : savings > 0 ? (
            <>
              <p className="tnum text-callout font-bold" style={{ color: 'rgb(var(--viz-2))' }}>
                +{money(savings)}
              </p>
              <p className="text-caption text-label-3">could save</p>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-caption text-label-3">
        {vendor.priced === false ? (
          <>
            {vendor.kind ? <span>{KIND_LABEL[vendor.kind] ?? vendor.kind}</span> : null}
            {vendor.hq ? <span>{vendor.hq}</span> : null}
            <span>No price feed yet</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1">
              <Truck size={11} aria-hidden="true" />~{vendor.leadDays}d
            </span>
            <span>
              {vendor.freeShipOver > 0
                ? `Free ship over ${moneyRound(vendor.freeShipOver)}`
                : `${money(vendor.shipFee)} flat ship`}
            </span>
          </>
        )}
        {vendor.hasAccount && vendor.repName ? <span>Rep: {vendor.repName}</span> : null}
      </div>
    </button>
  )
}

/**
 * A directory listing — a real vendor Dentin does not price yet. Deliberately
 * quieter than VendorCard: no numbers are claimed, just who they are.
 */
function DirectoryCard({ entry, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="press w-full rounded-card bg-surface shadow-card p-3 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-subhead font-semibold">{entry.name}</h3>
            {entry.hasAccount ? <VendorStatus hasAccount isPreferred={false} /> : null}
          </div>
          <p className="mt-0.5 line-clamp-1 text-footnote text-label-3">{entry.blurb}</p>
          {entry.knownFor?.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {entry.knownFor.slice(0, 3).map((k) => (
                <Pill key={k}>{k}</Pill>
              ))}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right text-caption text-label-3">
          <p>{KIND_LABEL[entry.kind] ?? entry.kind}</p>
          {entry.hq ? <p className="mt-0.5">{entry.hq}</p> : null}
        </div>
      </div>
    </button>
  )
}

export default function Vendors() {
  const navigate = useNavigate()
  const toast = useToast()

  const { data: vendors, loading } = useData(() => listVendors(), [])
  const { data: directory } = useData(() => listVendorDirectory(), [])
  const { data: opportunity } = useData(() => getPriceOpportunities(), [])

  // Deep-linkable, so "find new vendors" entry points can land on Discover.
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'new' ? 'new' : 'accounts'
  const setTab = (next) => setParams(next === 'new' ? { tab: 'new' } : {}, { replace: true })

  const [q, setQ] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)

  const { withAccounts, newVendors } = useMemo(() => {
    const all = vendors ?? []
    return {
      withAccounts: all.filter((v) => v.hasAccount),
      newVendors: all.filter((v) => !v.hasAccount),
    }
  }, [vendors])

  // The searchable pool: every directory entry. Without a query, entries the
  // practice already holds are left to the Accounts tab; a search finds them
  // anyway — looking up "Henry Schein" should never come back empty.
  const searching = q.trim().length > 0 || kindFilter !== 'all'
  const directoryResults = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pool = directory ?? []
    const scoped = searching ? pool : pool.filter((d) => !d.hasAccount)
    return scoped.filter((d) => {
      if (kindFilter !== 'all' && d.kind !== kindFilter) return false
      if (!needle) return true
      const hay = [d.name, d.blurb, d.hq, KIND_LABEL[d.kind], ...(d.knownFor ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [directory, q, kindFilter, searching])

  const newTabCount = useMemo(
    () => (directory ?? []).filter((d) => !d.hasAccount).length,
    [directory],
  )

  const savingsBy = useMemo(() => {
    const map = new Map()
    for (const v of opportunity?.byVendor ?? []) map.set(v.supplierId, v.savings)
    return map
  }, [opportunity])

  const openDetail = (vendor) => {
    setDetail(vendor)
    setForm({
      accountNumber: vendor.accountNumber ?? '',
      repName: vendor.repName ?? '',
      repPhone: vendor.repPhone ?? '',
      repEmail: vendor.repEmail ?? '',
      terms: vendor.terms ?? 'Net 30',
      isPreferred: vendor.isPreferred,
    })
  }

  const save = async () => {
    setBusy(true)
    try {
      await saveVendorAccount(detail.supplierId, {
        ...form,
        openedAt: detail.openedAt ?? new Date().toISOString().slice(0, 10),
      })
      toast({
        title: detail.hasAccount ? 'Account updated' : 'Account added',
        body: `${detail.name} is now orderable`,
      })
      setDetail(null)
    } catch (e) {
      toast({ title: 'Could not save', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await removeVendorAccount(detail.supplierId)
      toast({ title: 'Account removed', body: detail.name })
      setDetail(null)
    } finally {
      setBusy(false)
    }
  }

  // Directory entries without a price feed still open the same detail sheet —
  // built into vendor-row shape so one sheet serves both.
  const openDirectoryDetail = (entry) =>
    openDetail(
      entry.vendor ?? {
        supplierId: entry.supplierId,
        name: entry.name,
        blurb: entry.blurb,
        website: entry.website,
        strengths: entry.knownFor ?? [],
        caveats: [],
        freeShipOver: 0,
        shipFee: 0,
        leadDays: null,
        priced: false,
        kind: entry.kind,
        hq: entry.hq,
        hasAccount: false,
        isPreferred: false,
      },
    )

  const visibleDirectory = directoryResults.filter((d) => searching || !d.priced)

  return (
    <Screen
      title="Vendors"
      subtitle={`${withAccounts.length} accounts · ${newTabCount} available`}
      largeTitle={false}
      leading={
        <BackButton />
      }
    >
      {/* The opportunity, stated in money */}
      {opportunity?.totalSavings > 0 ? (
        <button
          type="button"
          onClick={() => navigate('/vendors/compare')}
          className="press mt-3 w-full overflow-hidden rounded-card p-4 text-left text-white"
          style={{
            background:
              'linear-gradient(135deg, rgb(var(--viz-2)) 0%, rgb(var(--viz-2) / 0.82) 100%)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} strokeWidth={2.6} aria-hidden="true" />
            <span className="text-caption font-bold uppercase tracking-[0.5px]">
              Competitive pricing
            </span>
          </div>
          <p className="tnum mt-1.5 text-title1 font-bold leading-none">
            {money(opportunity.totalSavings)}
          </p>
          <p className="mt-1.5 text-footnote text-white/90">
            available on {opportunity.rows.length} items from{' '}
            {opportunity.byVendor.length} vendor
            {opportunity.byVendor.length === 1 ? '' : 's'} you have no account with
          </p>
          <span className="mt-3 flex items-center gap-1 text-subhead font-semibold">
            See the breakdown
            <ArrowRight size={15} strokeWidth={2.6} aria-hidden="true" />
          </span>
        </button>
      ) : null}

      {/* Two ways to answer "am I paying too much", side by side. The card
          above compares vendors; these compare against your own contract and
          against what other practices pay. All three are the same question. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => navigate('/vendors/benchmark')}
          className="panel press flex flex-col items-start gap-1 p-3 text-left"
        >
          <Scale size={15} strokeWidth={2} className="text-brand-600" aria-hidden="true" />
          <span className="text-subhead font-semibold">Price benchmarks</span>
          <span className="text-caption text-label-3">What other practices pay</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/invoices')}
          className="panel press flex flex-col items-start gap-1 p-3 text-left"
        >
          <ReceiptText size={15} strokeWidth={2} className="text-brand-600" aria-hidden="true" />
          <span className="text-subhead font-semibold">Invoices</span>
          <span className="text-caption text-label-3">Billed vs what you ordered</span>
        </button>
      </div>

      <div className="pb-1 pt-3">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'accounts', label: 'Your accounts', count: withAccounts.length },
            { value: 'new', label: 'Find new', count: newTabCount },
          ]}
        />
      </div>

      {tab === 'accounts' ? (
        <>
          {loading ? (
            <div className="mt-2 space-y-2.5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="skeleton h-20 rounded-card" />
              ))}
            </div>
          ) : (
            <>
              <div className="mt-2 flex flex-col gap-2.5">
                {withAccounts.map((vendor) => (
                  <VendorCard
                    key={vendor.supplierId}
                    vendor={vendor}
                    savings={savingsBy.get(vendor.supplierId) ?? 0}
                    onOpen={() => openDetail(vendor)}
                  />
                ))}
              </div>

              {withAccounts.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  title="No accounts yet"
                  body="Add the suppliers you already buy from so Dentin only quotes prices you can actually place."
                  action={<Button onClick={() => setTab('new')}>Browse vendors</Button>}
                />
              ) : null}
            </>
          )}
        </>
      ) : (
        <>
          <div className="pt-2">
            <SearchField
              value={q}
              onChange={setQ}
              placeholder="Search vendors — name, brand, category"
            />
          </div>

          {/* Kind filter — the directory is big enough to need a map */}
          <div className="scroll-area -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-0.5 lg:mx-0 lg:flex-wrap lg:px-0">
            {[{ id: 'all', label: 'All' }, ...VENDOR_KINDS].map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKindFilter(k.id)}
                aria-pressed={kindFilter === k.id}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-[3px] border px-2.5 py-1 text-footnote font-medium transition-colors duration-100',
                  kindFilter === k.id
                    ? 'border-label bg-label text-surface'
                    : 'border-line bg-surface text-label-2 hover:bg-surface-2',
                )}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* Vendors Dentin already prices lead — they come with live numbers */}
          {!searching && newVendors.length ? (
            <>
              <p className="section-label px-1">Priced by Dentin</p>
              <div className="flex flex-col gap-2.5">
                {newVendors.map((vendor) => (
                  <VendorCard
                    key={vendor.supplierId}
                    vendor={vendor}
                    savings={savingsBy.get(vendor.supplierId) ?? 0}
                    onOpen={() => openDetail(vendor)}
                  />
                ))}
              </div>
              <p className="section-label px-1">Vendor directory</p>
            </>
          ) : null}

          <div className={cn('flex flex-col gap-2', searching && 'mt-3')}>
            {visibleDirectory.map((d) =>
              d.priced && d.vendor ? (
                <VendorCard
                  key={d.directoryId}
                  vendor={d.vendor}
                  savings={savingsBy.get(d.supplierId) ?? 0}
                  onOpen={() => openDetail(d.vendor)}
                />
              ) : (
                <DirectoryCard key={d.directoryId} entry={d} onOpen={() => openDirectoryDetail(d)} />
              ),
            )}
          </div>

          {visibleDirectory.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No vendors match"
              body="Try a shorter name — the directory spans distributors, makers, instruments, equipment, implants and labs."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ('')
                    setKindFilter('all')
                  }}
                >
                  Clear search
                </Button>
              }
            />
          ) : null}

          <p className="px-1 pb-1 pt-3 text-footnote text-label-3">
            Vendors marked NEW are already priced by Dentin. Directory vendors show pricing once a
            feed is connected — adding the account still keeps terms, reps and orders in one place.
          </p>
        </>
      )}

      {/* Vendor detail */}
      <Sheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ''}
        detent="large"
        footer={
          <div className="flex gap-2">
            {detail?.hasAccount ? (
              <Button variant="secondary" className="flex-1" onClick={remove} disabled={busy}>
                Remove
              </Button>
            ) : null}
            <Button className="flex-1" loading={busy} onClick={save}>
              {detail?.hasAccount ? 'Save account' : 'Add this account'}
            </Button>
          </div>
        }
      >
        {detail ? (
          <div className="py-2">
            <div className="rounded-card bg-surface shadow-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-headline font-semibold">{detail.name}</h3>
                  <p className="mt-0.5 text-footnote text-label-3">{detail.blurb}</p>
                </div>
                <VendorStatus hasAccount={detail.hasAccount} isPreferred={detail.isPreferred} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-separator/50 pt-3">
                {detail.priced === false ? (
                  <>
                    <div>
                      <dt className="text-caption text-label-3">Category</dt>
                      <dd className="text-callout font-semibold">
                        {KIND_LABEL[detail.kind] ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-label-3">Headquarters</dt>
                      <dd className="text-callout font-semibold">{detail.hq ?? '—'}</dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <dt className="text-caption text-label-3">Typical lead time</dt>
                      <dd className="tnum text-callout font-semibold">~{detail.leadDays} days</dd>
                    </div>
                    <div>
                      <dt className="text-caption text-label-3">Shipping</dt>
                      <dd className="text-callout font-semibold">
                        {detail.freeShipOver > 0
                          ? `Free over ${moneyRound(detail.freeShipOver)}`
                          : `${money(detail.shipFee)} flat`}
                      </dd>
                    </div>
                  </>
                )}
                {detail.hasAccount ? (
                  <>
                    <div>
                      <dt className="text-caption text-label-3">Spend to date</dt>
                      <dd className="tnum text-callout font-semibold">
                        {moneyRound(detail.totalSpend)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-label-3">Account opened</dt>
                      <dd className="text-callout font-semibold">{fullDate(detail.openedAt)}</dd>
                    </div>
                  </>
                ) : null}
              </dl>

              {detail.website ? (
                <a
                  href={`https://${detail.website}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="press mt-3 flex items-center gap-1.5 text-subhead font-medium text-brand-600 dark:text-brand-400"
                >
                  {detail.website}
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              ) : null}
            </div>

            {/* What they are good at */}
            {detail.strengths?.length ? (
              <Section title={detail.priced === false ? 'Known for' : 'Strengths'}>
                {detail.strengths.map((s) => (
                  <Row
                    key={s}
                    title={s}
                    chevron={false}
                    leading={
                      <Check size={15} className="text-ios-green" strokeWidth={2.6} aria-hidden="true" />
                    }
                  />
                ))}
              </Section>
            ) : null}

            {detail.caveats?.length ? (
              <Section title="Trade-offs">
                {detail.caveats.map((c) => (
                  <Row key={c} title={c} chevron={false} />
                ))}
              </Section>
            ) : null}

            {/* Account details */}
            <Section
              title="Account"
              footer={
                detail.hasAccount
                  ? 'Preferred vendors win price ties and are suggested first when building an order.'
                  : detail.priced === false
                    ? 'Dentin does not price this vendor yet — tracking the account keeps terms, reps and orders in one place until a price feed is connected.'
                    : 'Add the account number once you open it — Dentin will then treat this vendor as orderable.'
              }
            >
              {[
                ['accountNumber', 'Account number', 'HS-4471902'],
                ['terms', 'Payment terms', 'Net 30'],
                ['repName', 'Rep name', 'Marisol Ferrer'],
                ['repPhone', 'Rep phone', '(800) 555-0112'],
                ['repEmail', 'Rep email', 'rep@supplier.com'],
              ].map(([key, label, placeholder]) => (
                <label key={key} className="row block py-2.5">
                  <span className="block text-caption font-medium uppercase tracking-[0.4px] text-label-3">
                    {label}
                  </span>
                  <input
                    value={form[key] ?? ''}
                    placeholder={placeholder}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className={cn(
                      'mt-0.5 w-full bg-transparent text-body text-label placeholder:text-label-3 focus:outline-none',
                      key === 'accountNumber' && 'font-mono',
                    )}
                  />
                </label>
              ))}

              <Row
                title="Preferred vendor"
                subtitle="Suggested first, and wins price ties"
                chevron={false}
                trailing={
                  <Toggle
                    checked={Boolean(form.isPreferred)}
                    onChange={(v) => setForm((f) => ({ ...f, isPreferred: v }))}
                    label="Preferred vendor"
                  />
                }
              />
            </Section>

            {detail.hasAccount && (detail.repPhone || detail.repEmail) ? (
              <Section title="Contact your rep">
                {detail.repPhone ? (
                  <Row
                    title={detail.repPhone}
                    leading={<Phone size={15} className="text-label-3" aria-hidden="true" />}
                    onClick={() => window.open(`tel:${detail.repPhone.replace(/\D/g, '')}`)}
                    chevron={false}
                  />
                ) : null}
                {detail.repEmail ? (
                  <Row
                    title={detail.repEmail}
                    leading={<Mail size={15} className="text-label-3" aria-hidden="true" />}
                    onClick={() => window.open(`mailto:${detail.repEmail}`)}
                    chevron={false}
                  />
                ) : null}
                {detail.lastOrderedAt ? (
                  <Row
                    title="Last order"
                    detail={relativeTime(detail.lastOrderedAt)}
                    chevron={false}
                  />
                ) : null}
              </Section>
            ) : null}

            {!detail.hasAccount && (savingsBy.get(detail.supplierId) ?? 0) > 0 ? (
              <div
                className="mt-4 rounded-card p-4 text-white"
                style={{ background: 'rgb(var(--viz-2))' }}
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles size={13} strokeWidth={2.6} aria-hidden="true" />
                  <span className="text-caption font-bold uppercase tracking-[0.5px]">
                    Opening this account
                  </span>
                </div>
                <p className="tnum mt-1.5 text-title2 font-bold">
                  {money(savingsBy.get(detail.supplierId))}
                </p>
                <p className="mt-1 text-footnote text-white/90">
                  saved on your next restock, versus your current accounts
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </Screen>
  )
}
