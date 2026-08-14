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
  Sparkles,
  Star,
  Truck,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, Section } from '@/components/ui/List'
import { EmptyState, Pill, SegmentedControl, Toggle } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import { NewVendorRail, VendorStatus } from '@/components/VendorBadge'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import {
  getPriceOpportunities,
  listVendors,
  removeVendorAccount,
  saveVendorAccount,
} from '@/lib/repository'
import { fullDate, money, moneyRound, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

function VendorCard({ vendor, savings, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="press relative w-full overflow-hidden rounded-card border border-line bg-surface p-3 text-left"
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
        <span className="flex items-center gap-1">
          <Truck size={11} aria-hidden="true" />~{vendor.leadDays}d
        </span>
        <span>
          {vendor.freeShipOver > 0
            ? `Free ship over ${moneyRound(vendor.freeShipOver)}`
            : `${money(vendor.shipFee)} flat ship`}
        </span>
        {vendor.hasAccount && vendor.repName ? <span>Rep: {vendor.repName}</span> : null}
      </div>
    </button>
  )
}

export default function Vendors() {
  const navigate = useNavigate()
  const toast = useToast()

  const { data: vendors } = useData(() => listVendors(), [])
  const { data: opportunity } = useData(() => getPriceOpportunities(), [])

  // Deep-linkable, so "find new vendors" entry points can land on Discover.
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'new' ? 'new' : 'accounts'
  const setTab = (next) => setParams(next === 'new' ? { tab: 'new' } : {}, { replace: true })

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

  const list = tab === 'accounts' ? withAccounts : newVendors

  return (
    <Screen
      title="Vendors"
      subtitle={`${withAccounts.length} accounts · ${newVendors.length} available`}
      largeTitle={false}
      leading={
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="press flex items-center gap-0.5 pl-1 text-brand-600 dark:text-brand-400"
        >
          <ChevronLeft size={24} strokeWidth={2.2} />
          <span className="text-body">Back</span>
        </button>
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

      <div className="pb-1 pt-3">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'accounts', label: 'Your accounts', count: withAccounts.length },
            { value: 'new', label: 'Find new', count: newVendors.length },
          ]}
        />
      </div>

      {tab === 'new' ? (
        <p className="px-1 pb-1 pt-2 text-footnote text-label-3">
          Vendors Dentin prices but you cannot order from yet. Opening an account is usually a
          form and a credit check.
        </p>
      ) : null}

      <div className="mt-2 flex flex-col gap-2.5">
        {list.map((vendor) => (
          <VendorCard
            key={vendor.supplierId}
            vendor={vendor}
            savings={savingsBy.get(vendor.supplierId) ?? 0}
            onOpen={() => openDetail(vendor)}
          />
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={tab === 'accounts' ? 'No accounts yet' : 'No new vendors'}
          body={
            tab === 'accounts'
              ? 'Add the suppliers you already buy from so Dentin only quotes prices you can actually place.'
              : 'You already hold an account with every vendor Dentin prices.'
          }
          action={
            tab === 'accounts' ? (
              <Button onClick={() => setTab('new')}>Browse vendors</Button>
            ) : null
          }
        />
      ) : null}

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
            <div className="rounded-card border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-headline font-semibold">{detail.name}</h3>
                  <p className="mt-0.5 text-footnote text-label-3">{detail.blurb}</p>
                </div>
                <VendorStatus hasAccount={detail.hasAccount} isPreferred={detail.isPreferred} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-separator/50 pt-3">
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
              <Section title="Strengths">
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
