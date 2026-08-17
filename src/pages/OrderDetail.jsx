import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  BadgeCheck,
  Check,
  ChevronLeft,
  Copy,
  CreditCard,
  ExternalLink,
  Landmark,
  PackageCheck,
  Phone,
  Send,
  Store,
  Truck,
  X,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, Section } from '@/components/ui/List'
import { Pill, Stepper } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import ProductTile from '@/components/ProductTile'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import {
  formatPurchaseOrder,
  getOrder,
  getPractice,
  listPaymentMethods,
  markOrderSent,
  payOrder,
  receiveOrder,
  removeOrderLine,
  submitDraftOrder,
} from '@/lib/repository'
import { fullDate, money, qty, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

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
  const { data: methods } = useData(() => listPaymentMethods(), [])
  const { data: practice } = useData(() => getPractice(), [])
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [counts, setCounts] = useState({})
  const [busy, setBusy] = useState(false)
  const [paying, setPaying] = useState(false)
  const [methodId, setMethodId] = useState(null)
  const [payBusy, setPayBusy] = useState(false)

  useEffect(() => {
    if (methods?.length && !methodId) {
      setMethodId((methods.find((m) => m.isDefault) ?? methods[0]).id)
    }
  }, [methods, methodId])

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

  const isDraft = order.status === 'draft'
  const overdue =
    order.paymentStatus === 'unpaid' &&
    order.paymentDueAt &&
    new Date(order.paymentDueAt) < new Date()

  const sendDraft = async () => {
    setBusy(true)
    try {
      const result = await submitDraftOrder(order.id)
      toast({
        title: `${order.reference} is ready to send`,
        body: `Place it with ${order.supplierName}, then mark it as placed.${
          result.expectedAt ? ` Expect it ~${fullDate(result.expectedAt)}.` : ''
        }`,
      })
    } catch (e) {
      toast({ title: 'Could not submit', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const dropLine = async (line) => {
    try {
      const result = await removeOrderLine(order.id, line.productId)
      toast({ title: 'Removed from draft', body: line.productName })
      if (result.emptied) navigate('/orders')
    } catch (e) {
      toast({ title: 'Could not remove', body: e.message, tone: 'error' })
    }
  }

  const settle = async () => {
    setPayBusy(true)
    try {
      const result = await payOrder(order.id, { methodId })
      setPaying(false)
      toast({
        title: `Paid ${order.supplierName}`,
        body: `${money(result.amount ?? order.total)}${
          result.confirmation ? ` · ${result.confirmation}` : ''
        }`,
      })
    } catch (e) {
      toast({ title: 'Payment failed', body: e.message, tone: 'error' })
    } finally {
      setPayBusy(false)
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
              {order.reference} ·{' '}
              {isDraft
                ? 'draft — not sent yet'
                : `placed ${relativeTime(order.placedAt)}`}
            </p>
          </div>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>

        {/* Timeline */}
        <ol className={cn('mt-4 flex items-center gap-1.5', isDraft && 'hidden')}>
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
        <div className={cn('mt-1.5 flex justify-between', isDraft && 'hidden')}>
          {['Submitted', 'In transit', 'Received'].map((label) => (
            <span key={label} className="text-caption2 text-label-3">
              {label}
            </span>
          ))}
        </div>

        {isDraft ? (
          <p className="mt-4 border-t border-separator/50 pt-3 text-footnote text-label-2">
            Lines added from price checks and the market scan collect here. Nothing reaches{' '}
            {order.supplierName} until you submit.
            {order.termsLabel ? ` Terms: ${order.termsLabel}.` : ''}
          </p>
        ) : null}

        {order.expectedAt && order.status !== 'received' && !isDraft ? (
          <p className="mt-3 flex items-center gap-1.5 border-t border-separator/50 pt-3 text-footnote text-label-2">
            <Truck size={14} className="shrink-0 text-label-3" aria-hidden="true" />
            Expected {fullDate(order.expectedAt)}
          </p>
        ) : null}
      </div>

      {/* Draft → send it; otherwise → receive it */}
      {isDraft ? (
        <div className="mt-3">
          <Button className="w-full" size="lg" icon={Send} loading={busy} onClick={sendDraft}>
            Finalize this PO for {order.supplierName}
          </Button>
        </div>
      ) : outstanding.length > 0 ? (
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
              isDraft ? (
                <div className="flex items-center gap-2.5">
                  <p className="tnum text-callout font-semibold">{money(line.lineTotal)}</p>
                  <button
                    type="button"
                    aria-label={`Remove ${line.productName}`}
                    onClick={() => dropLine(line)}
                    className="press flex h-7 w-7 items-center justify-center rounded-[3px] border border-line text-label-3"
                  >
                    <X size={14} strokeWidth={2.4} />
                  </button>
                </div>
              ) : (
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
              )
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

      {/* Send it. Dentin issues the PO; a human still transmits it, and the
          app must not imply otherwise. */}
      {order.status !== 'draft' && order.status !== 'cancelled' ? (
        order.sentAt ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-card border border-line bg-surface p-3">
            <BadgeCheck size={16} className="mt-0.5 shrink-0 text-ios-green" aria-hidden="true" />
            <p className="text-subhead text-label-2">
              Sent to {order.supplierName} on{' '}
              <b className="text-label">{fullDate(order.sentAt)}</b>
              {order.sentMethod ? ` · ${order.sentMethod}` : ''}. Check it in when the boxes
              arrive.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-card border-2 border-ios-orange/40 bg-surface p-3">
            <div className="flex items-start gap-2.5">
              <Send size={16} className="mt-0.5 shrink-0 text-ios-orange" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-headline font-semibold">Not sent to the vendor yet</p>
                <p className="mt-0.5 text-footnote text-label-2">
                  Dentin built and priced this order — placing it with {order.supplierName} is
                  still a human step. Copy it into their portal, or call it in.
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={copied ? Check : Copy}
                onClick={async () => {
                  await navigator.clipboard.writeText(formatPurchaseOrder(order, practice))
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                }}
              >
                {copied ? 'Copied' : 'Copy the PO'}
              </Button>
              {order.supplierWebsite ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={ExternalLink}
                  onClick={() =>
                    window.open(`https://${order.supplierWebsite}`, '_blank', 'noopener')
                  }
                >
                  {order.supplierWebsite}
                </Button>
              ) : null}
              {order.supplierPhone ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Phone}
                  onClick={() => window.open(`tel:${order.supplierPhone}`)}
                >
                  Call
                </Button>
              ) : null}
            </div>

            <Button
              className="mt-2.5 w-full"
              size="md"
              loading={sending}
              onClick={async () => {
                setSending(true)
                try {
                  await markOrderSent(order.id)
                  toast({
                    title: 'Marked as sent',
                    body: `${order.reference} is on order with ${order.supplierName}.`,
                  })
                } catch (e) {
                  toast({ title: 'Could not update', body: e.message, tone: 'error' })
                } finally {
                  setSending(false)
                }
              }}
            >
              I placed this order with {order.supplierName}
            </Button>
          </div>
        )
      ) : null}

      {/* Payment — settle the vendor without leaving the order */}
      {order.paymentStatus ? (
        <div className="mt-4 rounded-card border border-line bg-surface p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-headline font-semibold">Payment</p>
            {order.paymentStatus === 'paid' ? (
              <Pill tone="good" icon={BadgeCheck}>
                Paid
              </Pill>
            ) : overdue ? (
              <Pill tone="critical">Overdue</Pill>
            ) : (
              <Pill tone="warning">Unpaid</Pill>
            )}
          </div>

          {order.paymentStatus === 'paid' ? (
            <div className="mt-2 border-t border-separator/50 pt-2.5">
              <p className="text-subhead text-label-2">
                Paid {order.paidAt ? fullDate(order.paidAt) : ''} ·{' '}
                {order.paymentMethodLabel ?? 'On file'}
              </p>
              {order.paymentConfirmation ? (
                <p className="ident mt-1 text-caption text-label-3">
                  Confirmation {order.paymentConfirmation}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 border-t border-separator/50 pt-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn('text-subhead', overdue ? 'font-semibold text-ios-red' : 'text-label-2')}>
                    {order.paymentDueAt
                      ? `${overdue ? 'Was due' : 'Due'} ${fullDate(order.paymentDueAt)}`
                      : 'Due on receipt'}
                  </p>
                  {order.termsLabel ? (
                    <p className="text-caption text-label-3">{order.termsLabel}</p>
                  ) : null}
                </div>
                <p className="tnum shrink-0 text-title3 font-bold">{money(order.total)}</p>
              </div>
              <Button className="mt-3 w-full" size="lg" onClick={() => setPaying(true)}>
                Pay {order.supplierName}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {/* Pay sheet */}
      <Sheet
        open={paying}
        onClose={() => setPaying(false)}
        title={`Pay ${order.supplierName}`}
        detent="medium"
        footer={
          <Button
            className="w-full"
            size="lg"
            loading={payBusy}
            disabled={!methodId}
            onClick={settle}
          >
            Pay {money(order.total)}
          </Button>
        }
      >
        <div className="py-3">
          <div className="rounded-card border border-line bg-surface p-4 text-center">
            <p className="text-caption2 uppercase tracking-[0.07em] text-label-3">
              {order.reference} · {order.supplierName}
            </p>
            <p className="tnum mt-1 text-[34px] font-bold leading-none">{money(order.total)}</p>
            {order.paymentDueAt ? (
              <p className={cn('mt-1.5 text-footnote', overdue ? 'text-ios-red' : 'text-label-3')}>
                {overdue ? 'Was due' : 'Due'} {fullDate(order.paymentDueAt)}
                {order.termsLabel ? ` · ${order.termsLabel}` : ''}
              </p>
            ) : null}
          </div>

          <p className="section-label px-1">Pay with</p>
          <div className="panel">
            {(methods ?? []).map((m) => {
              const Icon = m.kind === 'bank' ? Landmark : CreditCard
              const selected = methodId === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethodId(m.id)}
                  aria-pressed={selected}
                  className="row press w-full py-2.5 text-left"
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border',
                      selected
                        ? 'border-brand-600 bg-brand-600/10 text-brand-700 dark:text-brand-400'
                        : 'border-line text-label-3',
                    )}
                  >
                    <Icon size={15} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-subhead font-medium text-label">
                      {m.label}
                      {m.isDefault ? (
                        <span className="ml-1.5 text-caption text-label-3">Default</span>
                      ) : null}
                    </span>
                    <span className="ident block text-caption text-label-3">{m.detail}</span>
                  </span>
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] border',
                      selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-line',
                    )}
                    aria-hidden="true"
                  >
                    {selected ? <Check size={13} strokeWidth={3} /> : null}
                  </span>
                </button>
              )
            })}
          </div>

          <p className="px-1 pt-2 text-footnote text-label-3">
            Payments post on your account terms and land on the vendor statement with the PO
            number, so reconciliation is a match, not a hunt.
          </p>
        </div>
      </Sheet>

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
