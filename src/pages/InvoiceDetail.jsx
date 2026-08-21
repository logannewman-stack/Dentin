import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Clock,
  DollarSign,
  Paperclip,
  TrendingDown,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import BackButton from '@/components/ui/BackButton'
import { Row, Section } from '@/components/ui/List'
import { Pill } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import { supabase, myPracticeId } from '@/lib/repoCore'
import { money, fullDate, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const STATUS = {
  review: { label: 'Under review', tone: 'info' },
  clean: { label: 'Reconciled', tone: 'good' },
  accepted: { label: 'Accepted', tone: 'good' },
  disputed: { label: 'Disputed', tone: 'warning' },
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const { data: invoice, loading } = useData(async () => {
    const practiceId = await myPracticeId()
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        invoice_lines(*),
        vendor_accounts(name, supplier_accounts(name, rep_name))
      `)
      .eq('id', id)
      .eq('practice_id', practiceId)
      .single()

    if (error) throw error
    return data
  }, [id])

  if (loading || !invoice) {
    return (
      <Screen title="Invoice" largeTitle={false}>
        <div className="space-y-3 pt-4">
          <div className="skeleton h-32 rounded-card" />
          <div className="skeleton h-64 rounded-card" />
        </div>
      </Screen>
    )
  }

  const status = STATUS[invoice.status] ?? STATUS.review
  const lines = invoice.invoice_lines || []
  const flaggedLines = lines.filter((l) => l.variance_pct && Math.abs(l.variance_pct) > 5)

  return (
    <Screen
      title={invoice.invoice_number || 'Invoice'}
      largeTitle={false}
      leading={
        <BackButton />
      }
    >
      {/* Summary */}
      <div className="mt-3 rounded-card bg-surface shadow-card p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-headline font-semibold">
              {invoice.vendor_accounts?.name || 'Unknown vendor'}
            </h2>
            <p className="mt-0.5 text-footnote text-label-3">
              {invoice.invoice_number} · {fullDate(invoice.invoice_date)}
            </p>
          </div>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>

        {/* Key figures */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-footnote text-label-3">
              Total
            </p>
            <p className="tnum mt-1 text-title2 font-bold">{money(invoice.total_cents)}</p>
          </div>
          <div>
            <p className="text-footnote text-label-3">
              Variance
            </p>
            <p
              className={cn(
                'tnum mt-1 text-title2 font-bold',
                invoice.variance_cents > 0 ? 'text-ios-red' : 'text-ios-green',
              )}
            >
              {invoice.variance_cents > 0 ? '+' : ''}
              {money(invoice.variance_cents)}
            </p>
          </div>
        </div>

        {invoice.po_number ? (
          <p className="mt-3 border-t border-separator/50 pt-3 text-footnote text-label-2">
            <strong>PO:</strong> {invoice.po_number}
          </p>
        ) : null}

        {invoice.received_at ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-footnote text-label-2">
            <BadgeCheck size={14} className="shrink-0 text-ios-green" aria-hidden="true" />
            Received {relativeTime(invoice.received_at)}
          </p>
        ) : null}
      </div>

      {/* Price variance warning */}
      {flaggedLines.length > 0 ? (
        <div className="mt-3 rounded-card border-2 border-ios-orange/40 bg-surface p-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-ios-orange" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-headline font-semibold">Price variance flagged</p>
              <p className="mt-0.5 text-footnote text-label-2">
                {flaggedLines.length} item{flaggedLines.length !== 1 ? 's' : ''} billed at a
                different price than your order.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Line items */}
      <Section title={`${lines.length} items`}>
        {lines.map((line) => {
          const variance = line.variance_pct || 0
          const isVariant = Math.abs(variance) > 5
          return (
            <Row
              key={line.id}
              chevron={false}
              leading={
                isVariant ? (
                  <AlertCircle size={20} className="text-ios-orange" aria-hidden="true" />
                ) : (
                  <DollarSign size={20} className="text-label-3" aria-hidden="true" />
                )
              }
              title={line.description || 'Unlabeled item'}
              subtitle={`${line.quantity} units @ ${money(line.unit_price_cents)}`}
              trailing={
                <div className="text-right">
                  <p className="tnum text-callout font-semibold">{money(line.line_total_cents)}</p>
                  {isVariant ? (
                    <p
                      className={cn(
                        'tnum text-caption',
                        variance > 0 ? 'text-ios-red' : 'text-ios-green',
                      )}
                    >
                      {variance > 0 ? '+' : ''}
                      {variance.toFixed(1)}%
                    </p>
                  ) : (
                    <p className="text-caption text-label-3">Matched order</p>
                  )}
                </div>
              }
            />
          )
        })}
      </Section>

      {/* Variance summary */}
      {invoice.variance_cents !== 0 ? (
        <div className="mt-3 rounded-card bg-surface shadow-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-footnote text-label-3">
                Total variance
              </p>
              <p
                className={cn(
                  'tnum mt-1 text-title3 font-bold',
                  invoice.variance_cents > 0 ? 'text-ios-red' : 'text-ios-green',
                )}
              >
                {invoice.variance_cents > 0 ? '+' : ''}
                {money(invoice.variance_cents)}
              </p>
            </div>
            {invoice.variance_pct ? (
              <div className="text-right">
                <p className="text-footnote text-label-3">
                  Percent
                </p>
                <p
                  className={cn(
                    'tnum mt-1 text-title3 font-bold',
                    invoice.variance_pct > 0 ? 'text-ios-red' : 'text-ios-green',
                  )}
                >
                  {invoice.variance_pct > 0 ? '+' : ''}
                  {Math.abs(invoice.variance_pct).toFixed(1)}%
                </p>
              </div>
            ) : null}
          </div>

          {invoice.variance_cents > 0 ? (
            <p className="mt-3 border-t border-separator/50 pt-3 text-footnote text-label-2">
              You were charged more than your order. Verify with the vendor and request a credit
              if this was a billing error.
            </p>
          ) : (
            <p className="mt-3 border-t border-separator/50 pt-3 flex items-center gap-1.5 text-footnote text-label-2">
              <TrendingDown size={14} className="shrink-0 text-ios-green" aria-hidden="true" />
              You were charged less than your order — a good catch.
            </p>
          )}
        </div>
      ) : null}

      {/* Status actions */}
      {invoice.status === 'review' ? (
        <div className="mt-3 flex gap-2">
          <Button
            className="flex-1"
            size="lg"
            variant="secondary"
            onClick={async () => {
              setBusy(true)
              try {
                await supabase
                  .from('invoices')
                  .update({ status: 'disputed' })
                  .eq('id', invoice.id)
                toast({
                  title: 'Marked as disputed',
                  body: 'You flagged this invoice for follow-up with the vendor.',
                })
                navigate(-1)
              } catch (error) {
                toast({ title: 'Error', body: error.message, tone: 'error' })
              } finally {
                setBusy(false)
              }
            }}
            loading={busy}
          >
            Dispute
          </Button>
          <Button
            className="flex-1"
            size="lg"
            onClick={async () => {
              setBusy(true)
              try {
                await supabase
                  .from('invoices')
                  .update({ status: 'accepted', received_at: new Date().toISOString() })
                  .eq('id', invoice.id)
                toast({
                  title: 'Invoice accepted',
                  body: flaggedLines.length > 0 ? 'Check price variances with the vendor.' : '',
                })
                navigate(-1)
              } catch (error) {
                toast({ title: 'Error', body: error.message, tone: 'error' })
              } finally {
                setBusy(false)
              }
            }}
            loading={busy}
          >
            Accept
          </Button>
        </div>
      ) : null}

      {/* Metadata footer */}
      <div className="mt-4 rounded-card border border-line/50 bg-surface/50 p-3">
        <p className="text-caption text-label-3">
          Imported {relativeTime(invoice.created_at)}
          {invoice.notes ? ` · Notes: ${invoice.notes}` : ''}
        </p>
      </div>
    </Screen>
  )
}
