import { useMemo, useState } from 'react'
import { Ban, BadgeCheck, ReceiptText, Store, TrendingUp } from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, RowIcon, Section } from '@/components/ui/List'
import { EmptyState, Pill, SegmentedControl } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import { getInvoice, getPriceCreep, listInvoices, setInvoiceStatus } from '@/lib/repository'
import { fullDate, money, qty, shortDate, unitMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

const STATUS = {
  review: { label: 'Needs review', tone: 'warning' },
  clean: { label: 'Clean', tone: 'good' },
  accepted: { label: 'Accepted', tone: 'quiet' },
  disputed: { label: 'Disputed', tone: 'critical' },
}

const FLAGS = {
  price_up: { label: 'Price up', tone: 'critical', rank: 0 },
  qty_mismatch: { label: 'Quantity', tone: 'warning', rank: 1 },
  not_on_order: { label: 'Not ordered', tone: 'warning', rank: 2 },
  new_item: { label: 'New item', tone: 'info', rank: 3 },
  price_down: { label: 'Price down', tone: 'good', rank: 4 },
  ok: { label: 'Matches', tone: 'quiet', rank: 5 },
}

const SOURCE_LABEL = {
  order: 'the purchase order',
  contract: 'your contract price',
  last_invoice: 'the last invoice',
}

/** One billed line inside the sheet — the sentence wraps, it never truncates. */
function LineRow({ line }) {
  const flag = FLAGS[line.flag] ?? FLAGS.ok
  const over = (line.variance ?? 0) > 0

  return (
    <div className="row flex-wrap items-start py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-subhead font-medium text-label">
          {line.productName ?? line.description}
        </span>
        <span className="block text-caption text-label-3">
          {qty(line.quantity)} × {line.packSize > 1 ? `pack of ${line.packSize}` : 'each'}
          {line.unitPrice != null ? ` · ${unitMoney(line.unitPrice)} per unit` : ''}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-2.5">
        <span className="text-right">
          <span className="tnum block text-callout font-semibold">{money(line.price)}</span>
          {line.expectedPrice != null ? (
            <span className="tnum block text-caption text-label-3">
              expected {money(line.expectedPrice)}
            </span>
          ) : null}
        </span>
        <Pill tone={flag.tone}>{flag.label}</Pill>
      </span>

      {line.variance != null && line.variance !== 0 ? (
        <span className="w-full pt-1">
          <span
            className={cn(
              'tnum text-footnote font-semibold',
              over ? 'text-ios-red' : 'text-ios-green',
            )}
          >
            {over ? '+' : '−'}
            {money(Math.abs(line.variance))}
            {line.variancePct != null
              ? ` · ${over ? '+' : '−'}${Math.abs(line.variancePct).toFixed(1)}%`
              : ''}
          </span>
          {line.expectedSource ? (
            <span className="text-footnote text-label-3">
              {' '}
              against {line.expectedLabel ?? SOURCE_LABEL[line.expectedSource]}
            </span>
          ) : null}
        </span>
      ) : null}

      {line.message ? (
        <p className="w-full pt-1 text-footnote leading-snug text-label-2">{line.message}</p>
      ) : null}
    </div>
  )
}

function InvoiceRow({ invoice, onOpen }) {
  const status = STATUS[invoice.status] ?? STATUS.review
  return (
    <Row
      leading={<ReceiptText size={16} strokeWidth={1.9} className="text-label-2" aria-hidden="true" />}
      title={invoice.supplierName ?? 'Invoice'}
      subtitle={[
        invoice.invoiceNumber ?? 'no number',
        shortDate(invoice.invoiceDate),
        invoice.orderReference,
      ]
        .filter(Boolean)
        .join(' · ')}
      chevron={false}
      onClick={() => onOpen(invoice.id)}
      trailing={
        <div className="text-right">
          <p className="tnum text-callout font-semibold">{money(invoice.total)}</p>
          {invoice.overcharge > 0 ? (
            <p className="tnum text-caption font-medium text-ios-red">
              +{money(invoice.overcharge)}
            </p>
          ) : (
            <Pill tone={status.tone}>{status.label}</Pill>
          )}
        </div>
      }
    />
  )
}

export default function Invoices() {
  const toast = useToast()
  const { data: invoices, loading } = useData(() => listInvoices(), [])
  const { data: creep } = useData(() => getPriceCreep(), [])

  const [openId, setOpenId] = useState(null)
  const [tab, setTab] = useState('open')
  const [busy, setBusy] = useState(false)

  const { data: invoice } = useData(
    () => (openId ? getInvoice(openId) : Promise.resolve(null)),
    [openId],
  )

  const { open, filed, exposure } = useMemo(() => {
    const all = invoices ?? []
    return {
      open: all.filter((i) => i.status === 'review'),
      filed: all.filter((i) => i.status !== 'review'),
      // Only what is still unanswered. Money on an invoice somebody already
      // accepted is a decision that was made, not an open question.
      exposure: all
        .filter((i) => i.status === 'review')
        .reduce((sum, i) => sum + (i.overcharge ?? 0), 0),
    }
  }, [invoices])

  const shown = tab === 'open' ? open : filed

  const decide = async (status) => {
    setBusy(true)
    try {
      await setInvoiceStatus(openId, status)
      toast({
        title: status === 'accepted' ? 'Marked accepted' : 'Marked disputed',
        body:
          status === 'accepted'
            ? `${invoice?.supplierName ?? 'Vendor'} invoice filed as billed`
            : 'Take the line detail to your rep — the numbers are on the invoice',
      })
      setOpenId(null)
    } catch (e) {
      toast({ title: 'Could not update', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const sheetLines = useMemo(() => {
    const lines = invoice?.lines ?? []
    return [...lines].sort(
      (a, b) =>
        (FLAGS[a.flag]?.rank ?? 9) - (FLAGS[b.flag]?.rank ?? 9) ||
        (b.variance ?? 0) - (a.variance ?? 0),
    )
  }, [invoice])

  return (
    <Screen
      title="Invoices"
      subtitle={invoices?.length ? `${invoices.length} on file` : undefined}
      trailing={
        <Button to="/invoices/import" variant="plain" size="sm" className="pr-1">
          Check one
        </Button>
      }
    >
      {/* What is still owed an answer — the reason to open this screen */}
      {exposure > 0 ? (
        <div className="mt-3 flex items-center gap-3.5 rounded-card border border-line bg-surface p-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[3px] bg-ios-red/12 text-ios-red">
            <TrendingUp size={21} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="tnum text-title2 font-bold">{money(exposure)}</p>
            <p className="text-footnote text-label-3">
              billed above what you expected, across {open.length} invoice
              {open.length === 1 ? '' : 's'} waiting on you
            </p>
          </div>
        </div>
      ) : null}

      {/* Price creep — the pattern no single invoice shows */}
      {creep?.length ? (
        <Section
          title="Prices that have climbed"
          footer="Same item, same vendor, billed higher than it was. The yearly figure uses your own usage; where Dentin does not know the usage it says so rather than guessing."
        >
          {creep.slice(0, 6).map((item) => (
            <Row
              key={`${item.productId}-${item.supplierId}`}
              chevron={false}
              leading={
                <RowIcon tint="orange">
                  <TrendingUp size={14} strokeWidth={2.2} />
                </RowIcon>
              }
              title={item.productName ?? 'Item'}
              subtitle={`${item.supplierName ?? 'Vendor'} · ${money(item.earliestPrice)} → ${money(
                item.latestPrice,
              )} over ${item.invoices} invoices`}
              trailing={
                <div className="text-right">
                  <p className="tnum text-callout font-semibold text-ios-red">
                    +{item.increasePct.toFixed(1)}%
                  </p>
                  <p className="tnum text-caption text-label-3">
                    {item.annualImpact != null
                      ? `${money(item.annualImpact)}/yr`
                      : 'usage unknown'}
                  </p>
                </div>
              }
            />
          ))}
        </Section>
      ) : null}

      {invoices?.length ? (
        <>
          <div className="mt-4">
            <SegmentedControl
              value={tab}
              onChange={setTab}
              options={[
                { value: 'open', label: 'Needs review', count: open.length },
                { value: 'filed', label: 'Filed', count: filed.length },
              ]}
            />
          </div>

          <Section
            className="mt-2"
            footer={
              tab === 'open'
                ? 'Open one to see every line against what you expected to pay.'
                : undefined
            }
          >
            {shown.map((i) => (
              <InvoiceRow key={i.id} invoice={i} onOpen={setOpenId} />
            ))}
            {!shown.length ? (
              <Row
                chevron={false}
                title={tab === 'open' ? 'Nothing waiting on you' : 'Nothing filed yet'}
                subtitle={
                  tab === 'open'
                    ? 'Every invoice on file has been looked at'
                    : 'Invoices you accept or dispute land here'
                }
              />
            ) : null}
          </Section>
        </>
      ) : null}

      {!loading && !invoices?.length ? (
        <EmptyState
          icon={ReceiptText}
          title="No invoices checked yet"
          body="A quoted price and a billed price are not the same number. Drop an invoice in and Dentin lines every line up against the purchase order, your contract, and what the same item cost last time."
          action={<Button to="/invoices/import">Check an invoice</Button>}
        />
      ) : null}

      {/* One invoice, line by line */}
      <Sheet
        open={Boolean(openId)}
        onClose={() => setOpenId(null)}
        title={invoice?.supplierName ?? 'Invoice'}
        detent="large"
        footer={
          invoice ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                icon={Ban}
                loading={busy}
                disabled={invoice.status === 'disputed'}
                onClick={() => decide('disputed')}
              >
                {invoice.status === 'disputed' ? 'Disputed' : 'Dispute'}
              </Button>
              <Button
                className="flex-1"
                icon={BadgeCheck}
                loading={busy}
                disabled={invoice.status === 'accepted'}
                onClick={() => decide('accepted')}
              >
                {invoice.status === 'accepted' ? 'Accepted' : 'Accept'}
              </Button>
            </div>
          ) : null
        }
      >
        {invoice ? (
          <>
            <div className="mt-3 rounded-card border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Store size={15} className="shrink-0 text-label-3" aria-hidden="true" />
                    <h3 className="truncate text-headline font-semibold">
                      {invoice.invoiceNumber ?? 'No invoice number'}
                    </h3>
                  </div>
                  <p className="mt-0.5 text-footnote text-label-3">
                    {fullDate(invoice.invoiceDate)}
                    {invoice.orderReference ? ` · bills ${invoice.orderReference}` : ''}
                  </p>
                </div>
                <Pill tone={(STATUS[invoice.status] ?? STATUS.review).tone}>
                  {(STATUS[invoice.status] ?? STATUS.review).label}
                </Pill>
              </div>

              <div className="mt-3 flex items-end justify-between gap-3 border-t border-separator/50 pt-2.5">
                <div>
                  <p className="text-caption text-label-3">Invoice total</p>
                  <p className="tnum text-title3 font-bold">{money(invoice.total)}</p>
                </div>
                <div className="text-right">
                  <p className="text-caption text-label-3">Above expected</p>
                  <p
                    className={cn(
                      'tnum text-title3 font-bold',
                      invoice.overcharge > 0 ? 'text-ios-red' : 'text-label-3',
                    )}
                  >
                    {money(invoice.overcharge)}
                  </p>
                </div>
              </div>

              {invoice.flaggedLines === 0 ? (
                <p className="mt-2.5 flex items-start gap-2 border-t border-separator/50 pt-2.5 text-footnote text-label-2">
                  <BadgeCheck size={14} className="mt-0.5 shrink-0 text-ios-green" aria-hidden="true" />
                  Every line matched what you expected.
                </p>
              ) : null}

              {invoice.note ? (
                <p className="mt-2.5 border-t border-separator/50 pt-2.5 text-footnote text-label-2">
                  {invoice.note}
                </p>
              ) : null}
            </div>

            <p className="section-label px-1">
              {sheetLines.length} line{sheetLines.length === 1 ? '' : 's'}
            </p>
            <div className="panel">
              {sheetLines.map((line) => (
                <LineRow key={line.id} line={line} />
              ))}
            </div>

            <p className="px-1 pb-2 pt-2 text-footnote text-label-3">
              Disputing does not send anything on its own — take these numbers to your rep. Dentin
              keeps the invoice either way, so next month has something to compare against.
            </p>
          </>
        ) : (
          <div className="space-y-3 py-4">
            <div className="skeleton h-24 rounded-card" />
            <div className="skeleton h-48 rounded-card" />
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
