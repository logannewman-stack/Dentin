import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Check,
  ChevronLeft,
  PackageCheck,
  Store,
  Truck,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, Section } from '@/components/ui/List'
import { Pill, Stepper } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import ProductTile from '@/components/ProductTile'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import { getOrder, receiveOrder } from '@/lib/repository'
import { fullDate, money, qty, relativeTime } from '@/lib/format'

const STATUS = {
  draft: { label: 'Draft', tone: 'quiet' },
  submitted: { label: 'Submitted', tone: 'info' },
  confirmed: { label: 'In transit', tone: 'brand' },
  partial: { label: 'Partially received', tone: 'warning' },
  received: { label: 'Received', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'critical' },
}

const TIMELINE = ['submitted', 'confirmed', 'received']

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const { data: order, loading } = useData(() => getOrder(id), [id])
  const [receiving, setReceiving] = useState(false)
  const [counts, setCounts] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!order) return
    // Default to "everything arrived" — the common case; short shipments get edited.
    setCounts(
      Object.fromEntries(
        order.lines.map((l) => [l.id, Math.max(0, l.quantity - l.receivedQty)]),
      ),
    )
  }, [order])

  if (loading || !order) {
    return (
      <Screen title="Order" largeTitle={false}>
        <div className="space-y-3 pt-4">
          <div className="skeleton h-32 rounded-card" />
          <div className="skeleton h-64 rounded-card" />
        </div>
      </Screen>
    )
  }

  const status = STATUS[order.status] ?? STATUS.draft
  const stageIndex = TIMELINE.indexOf(order.status === 'partial' ? 'confirmed' : order.status)
  const outstanding = order.lines.filter((l) => l.receivedQty < l.quantity)
  const totalIncoming = Object.values(counts).reduce((s, v) => s + v, 0)

  const submit = async () => {
    setBusy(true)
    try {
      await receiveOrder(order.id, counts)
      setReceiving(false)
      toast({
        title: 'Delivery received',
        body: `${qty(totalIncoming)} units added to stock`,
      })
    } catch (e) {
      toast({ title: 'Could not receive', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      title={order.reference ?? 'Order'}
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
      {/* Summary */}
      <div className="mt-3 rounded-card border border-line bg-surface p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Store size={15} className="shrink-0 text-label-3" aria-hidden="true" />
              <h2 className="truncate text-headline font-semibold">{order.supplierName}</h2>
            </div>
            <p className="mt-0.5 text-footnote text-label-3">
              {order.reference} · placed {relativeTime(order.placedAt)}
            </p>
          </div>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>

        {/* Timeline */}
        <ol className="mt-4 flex items-center gap-1.5">
          {TIMELINE.map((stage, i) => {
            const done = i <= stageIndex
            return (
              <li key={stage} className="flex flex-1 items-center gap-1.5">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-white ${
                    done ? 'bg-brand-600' : 'bg-fill/20'
                  }`}
                  aria-hidden="true"
                >
                  {done ? <Check size={13} strokeWidth={3} /> : null}
                </span>
                {i < TIMELINE.length - 1 ? (
                  <span
                    className={`h-[2px] flex-1 rounded-full ${
                      i < stageIndex ? 'bg-brand-600' : 'bg-fill/20'
                    }`}
                    aria-hidden="true"
                  />
                ) : null}
              </li>
            )
          })}
        </ol>
        <div className="mt-1.5 flex justify-between">
          {['Submitted', 'In transit', 'Received'].map((label) => (
            <span key={label} className="text-caption2 text-label-3">
              {label}
            </span>
          ))}
        </div>

        {order.expectedAt && order.status !== 'received' ? (
          <p className="mt-3 flex items-center gap-1.5 border-t border-separator/50 pt-3 text-footnote text-label-2">
            <Truck size={14} className="shrink-0 text-label-3" aria-hidden="true" />
            Expected {fullDate(order.expectedAt)}
          </p>
        ) : null}
      </div>

      {/* Receive */}
      {outstanding.length > 0 ? (
        <div className="mt-3">
          <Button
            className="w-full"
            size="lg"
            icon={PackageCheck}
            onClick={() => setReceiving(true)}
          >
            Check in delivery
          </Button>
        </div>
      ) : null}

      {/* Lines */}
      <Section title={`${order.lines.length} items`}>
        {order.lines.map((line) => (
          <Row
            key={line.id}
            chevron={false}
            leading={<ProductTile product={line} size={38} />}
            title={line.productName}
            subtitle={`${qty(line.quantity)} × ${money(line.unitPrice)} per ${
              line.unit ?? 'unit'
            }`}
            trailing={
              <div className="text-right">
                <p className="tnum text-callout font-semibold">{money(line.lineTotal)}</p>
                {line.receivedQty >= line.quantity ? (
                  <p className="text-caption text-ios-green">Received</p>
                ) : line.receivedQty > 0 ? (
                  <p className="tnum text-caption text-ios-orange">
                    {qty(line.receivedQty)}/{qty(line.quantity)}
                  </p>
                ) : (
                  <p className="text-caption text-label-3">Pending</p>
                )}
              </div>
            }
          />
        ))}
      </Section>

      {/* Totals */}
      <Section title="Totals">
        <Row title="Subtotal" detail={money(order.subtotal)} chevron={false} />
        <Row
          title="Shipping"
          detail={order.shipping === 0 ? 'Free' : money(order.shipping)}
          chevron={false}
        />
        <Row title="Tax" detail={money(order.tax)} chevron={false} />
        <Row
          title="Total"
          chevron={false}
          trailing={<span className="tnum text-body font-semibold">{money(order.total)}</span>}
        />
        {order.savings > 0 ? (
          <Row
            title="Saved vs. list"
            chevron={false}
            trailing={
              <span className="tnum text-body font-semibold text-ios-green">
                {money(order.savings)}
              </span>
            }
          />
        ) : null}
      </Section>

      {/* Receiving sheet */}
      <Sheet
        open={receiving}
        onClose={() => setReceiving(false)}
        title="Check in delivery"
        detent="large"
        footer={
          <Button className="w-full" size="lg" loading={busy} onClick={submit}>
            {totalIncoming > 0 ? `Receive ${qty(totalIncoming)} units` : 'Nothing to receive'}
          </Button>
        }
      >
        <p className="px-1 pb-3 pt-1 text-footnote text-label-3">
          Adjust anything that arrived short or damaged. Each line writes a stock movement, so
          on-hand stays auditable.
        </p>

        <div className="panel">
          {outstanding.map((line) => (
            <div key={line.id} className="row flex-wrap py-3">
              <ProductTile product={line} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-subhead font-medium text-label">
                  {line.productName}
                </span>
                <span className="block text-caption text-label-3">
                  Ordered {qty(line.quantity)} {line.unit}
                </span>
              </span>
              <Stepper
                value={counts[line.id] ?? 0}
                onChange={(v) => setCounts((c) => ({ ...c, [line.id]: v }))}
                min={0}
                max={line.quantity - line.receivedQty}
              />
            </div>
          ))}
        </div>
      </Sheet>
    </Screen>
  )
}
