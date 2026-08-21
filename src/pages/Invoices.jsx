import { useMemo, useState } from 'react'
import { ReceiptText, TrendingUp } from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, RowIcon, Section } from '@/components/ui/List'
import { EmptyState, Pill, SegmentedControl } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import { useData } from '@/hooks/useData'
import { getPriceCreep, listInvoices } from '@/lib/repository'
import { money, shortDate } from '@/lib/format'

const STATUS = {
  review: { label: 'Needs review', tone: 'warning' },
  clean: { label: 'Clean', tone: 'good' },
  accepted: { label: 'Accepted', tone: 'quiet' },
  disputed: { label: 'Disputed', tone: 'critical' },
}

function InvoiceRow({ invoice }) {
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
      to={`/invoices/${invoice.id}`}
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
  const { data: invoices, loading } = useData(() => listInvoices(), [])
  const { data: creep } = useData(() => getPriceCreep(), [])
  const [tab, setTab] = useState('open')

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
        <div className="mt-3 flex items-center gap-3.5 rounded-card bg-surface shadow-card p-3">
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
              <InvoiceRow key={i.id} invoice={i} />
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

    </Screen>
  )
}
