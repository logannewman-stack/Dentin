import { useMemo } from 'react'
import {
  Building2,
  Landmark,
  PackagePlus,
  ShoppingCart,
  Sparkles,
  TrendingDown,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, RowIcon, Section } from '@/components/ui/List'
import { EmptyState, Pill } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import { useData } from '@/hooks/useData'
import { listOrders, reorderSuggestions } from '@/lib/repository'
import { fullDate, money, relativeTime } from '@/lib/format'

const STATUS = {
  draft: { label: 'Draft', tone: 'quiet' },
  submitted: { label: 'Submitted', tone: 'info' },
  confirmed: { label: 'In transit', tone: 'brand' },
  partial: { label: 'Partial', tone: 'warning' },
  received: { label: 'Received', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'critical' },
}

export default function Orders() {
  const { data: orders, loading } = useData(() => listOrders(), [])
  const { data: suggestions } = useData(() => reorderSuggestions(), [])

  const { open, past, totalSaved, payables } = useMemo(() => {
    const all = orders ?? []
    return {
      open: all.filter((o) => ['draft', 'submitted', 'confirmed', 'partial'].includes(o.status)),
      past: all.filter((o) => ['received', 'cancelled'].includes(o.status)),
      totalSaved: all.reduce((sum, o) => sum + (o.savings ?? 0), 0),
      payables: all
        .filter((o) => o.paymentStatus === 'unpaid')
        .sort((a, b) => new Date(a.paymentDueAt ?? 0) - new Date(b.paymentDueAt ?? 0)),
    }
  }, [orders])

  const needsReorder = suggestions?.length ?? 0

  return (
    <Screen
      title="Orders"
      subtitle={orders?.length ? `${orders.length} total` : undefined}
      trailing={
        <Button to="/orders/new" variant="plain" size="sm" className="pr-1">
          New
        </Button>
      }
    >
      {/* Savings to date — the product's whole promise, quantified */}
      {totalSaved > 0 ? (
        <div className="mt-3 flex items-center gap-3.5 rounded-card border border-line bg-surface p-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[3px] bg-ios-green/12 text-ios-green">
            <TrendingDown size={21} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="tnum text-title2 font-bold">{money(totalSaved)}</p>
            <p className="text-footnote text-label-3">saved against list price across all orders</p>
          </div>
        </div>
      ) : null}

      {needsReorder > 0 ? (
        <div className="mt-3 rounded-card border border-line bg-surface p-3">
          <div className="flex items-center gap-3">
            <RowIcon tint="orange">
              <PackagePlus size={16} strokeWidth={2.2} />
            </RowIcon>
            <div className="min-w-0 flex-1">
              <p className="text-headline font-semibold">{needsReorder} items below par</p>
              <p className="text-footnote text-label-3">Priced across every supplier you buy from</p>
            </div>
          </div>
          <Button to="/orders/new" className="mt-3.5 w-full">
            Build the order
          </Button>
        </div>
      ) : null}

      {/* What the practice owes vendors — payable in one tap from the order */}
      {payables.length > 0 ? (
        <Section
          title="Awaiting payment"
          footer="Payments post from your methods on file and reference the PO number."
        >
          {payables.map((order) => {
            const late = order.paymentDueAt && new Date(order.paymentDueAt) < new Date()
            return (
              <Row
                key={order.id}
                to={`/orders/${order.id}`}
                leading={<Landmark size={16} strokeWidth={1.9} className="text-label-2" aria-hidden="true" />}
                title={order.supplierName ?? 'Order'}
                subtitle={`${order.reference} · ${
                  order.paymentDueAt
                    ? `${late ? 'was due' : 'due'} ${fullDate(order.paymentDueAt)}`
                    : 'due on receipt'
                }`}
                trailing={
                  <div className="text-right">
                    <p className="tnum text-callout font-semibold">{money(order.total)}</p>
                    <Pill tone={late ? 'critical' : 'warning'}>{late ? 'Overdue' : 'Unpaid'}</Pill>
                  </div>
                }
              />
            )
          })}
        </Section>
      ) : null}

      <Section title="Vendors" footer="Dentin only quotes prices you can actually place today.">
        <Row
          to="/vendors"
          leading={<Building2 size={16} strokeWidth={1.9} className="text-label-2" aria-hidden="true" />}
          title="Vendors & accounts"
          subtitle="Account numbers, reps, terms and preferred suppliers"
        />
        <Row
          to="/vendors/compare"
          leading={<Sparkles size={16} strokeWidth={1.9} className="text-label-2" aria-hidden="true" />}
          title="Competitive pricing"
          subtitle="Find vendors that beat your current accounts"
        />
        <Row
          to="/vendors?tab=new"
          leading={<PackagePlus size={16} strokeWidth={1.9} className="text-label-2" aria-hidden="true" />}
          title="Find new vendors"
          subtitle="Suppliers you have not opened an account with"
        />
      </Section>

      {open.length > 0 ? (
        <Section title="Open">
          {open.map((order) => {
            const s = STATUS[order.status]
            return (
              <Row
                key={order.id}
                to={`/orders/${order.id}`}
                leading={<ShoppingCart size={16} strokeWidth={1.9} className="text-label-2" aria-hidden="true" />}
                title={order.supplierName ?? 'Order'}
                subtitle={`${order.reference} · ${
                  order.status === 'draft'
                    ? `${order.itemCount ?? '—'} line${order.itemCount === 1 ? '' : 's'}, not sent`
                    : order.expectedAt
                      ? `arrives ${fullDate(order.expectedAt)}`
                      : 'no ETA'
                }`}
                trailing={
                  <div className="text-right">
                    <p className="tnum text-callout font-semibold">{money(order.total)}</p>
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </div>
                }
              />
            )
          })}
        </Section>
      ) : null}

      {past.length > 0 ? (
        <Section title="History">
          {past.map((order) => {
            const s = STATUS[order.status]
            return (
              <Row
                key={order.id}
                to={`/orders/${order.id}`}
                leading={<ShoppingCart size={16} strokeWidth={1.9} className="text-label-2" aria-hidden="true" />}
                title={order.supplierName ?? 'Order'}
                subtitle={`${order.reference} · ${relativeTime(order.placedAt)}`}
                trailing={
                  <div className="text-right">
                    <p className="tnum text-callout font-semibold">{money(order.total)}</p>
                    {order.savings > 0 ? (
                      <p className="tnum text-caption font-medium text-ios-green">
                        saved {money(order.savings)}
                      </p>
                    ) : (
                      <Pill tone={s.tone}>{s.label}</Pill>
                    )}
                  </div>
                }
              />
            )
          })}
        </Section>
      ) : null}

      {loading ? (
        <div className="space-y-2 pt-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-card" />
          ))}
        </div>
      ) : !orders?.length ? (
        <EmptyState
          icon={ShoppingCart}
          title="No orders yet"
          body="When stock drops below par, Dentin prices the restock across every supplier and builds the order for you."
          action={<Button to="/orders/new">Build an order</Button>}
        />
      ) : null}
    </Screen>
  )
}
