import { useMemo } from 'react'
import { PackagePlus, ShoppingCart, TrendingDown } from 'lucide-react'
import Screen from '@/components/ios/Screen'
import { Row, RowIcon, Section } from '@/components/ios/List'
import { EmptyState, Pill } from '@/components/ios/Controls'
import Button from '@/components/ios/Button'
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
  const { data: orders } = useData(() => listOrders(), [])
  const { data: suggestions } = useData(() => reorderSuggestions(), [])

  const { open, past, totalSaved } = useMemo(() => {
    const all = orders ?? []
    return {
      open: all.filter((o) => ['draft', 'submitted', 'confirmed', 'partial'].includes(o.status)),
      past: all.filter((o) => ['received', 'cancelled'].includes(o.status)),
      totalSaved: all.reduce((sum, o) => sum + (o.savings ?? 0), 0),
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
        <div className="mt-3 flex items-center gap-3.5 rounded-card bg-surface p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ios-green/12 text-ios-green">
            <TrendingDown size={21} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="tnum text-title2 font-bold">{money(totalSaved)}</p>
            <p className="text-footnote text-label-3">saved against list price across all orders</p>
          </div>
        </div>
      ) : null}

      {needsReorder > 0 ? (
        <div className="mt-3 rounded-card bg-surface p-4">
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

      {open.length > 0 ? (
        <Section title="Open">
          {open.map((order) => {
            const s = STATUS[order.status]
            return (
              <Row
                key={order.id}
                to={`/orders/${order.id}`}
                leading={
                  <RowIcon tint="brand">
                    <ShoppingCart size={15} strokeWidth={2.2} />
                  </RowIcon>
                }
                title={order.supplierName ?? 'Order'}
                subtitle={`${order.reference} · ${
                  order.expectedAt ? `arrives ${fullDate(order.expectedAt)}` : 'no ETA'
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
                leading={
                  <RowIcon tint="quiet">
                    <ShoppingCart size={15} strokeWidth={2.2} />
                  </RowIcon>
                }
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

      {!orders?.length ? (
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
