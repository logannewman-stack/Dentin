import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck2, ChevronLeft, TriangleAlert } from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, Section } from '@/components/ui/List'
import { EmptyState, Pill, SegmentedControl } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import ProductTile from '@/components/ProductTile'
import { useToast } from '@/components/ui/Toast'
import { useData } from '@/hooks/useData'
import { discardLot, listLots } from '@/lib/repository'
import { daysUntil, fullDate, qty, shortLocation } from '@/lib/format'

const WINDOWS = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 3650, label: 'All' },
]

/**
 * Expiry is a compliance surface, not a housekeeping one. An expired
 * anesthetic carpule in a drawer is a finding on inspection, so expired lots
 * are separated from merely-soon ones rather than sorted together.
 */
export default function Expiry() {
  const navigate = useNavigate()
  const toast = useToast()

  const [days, setDays] = useState(90)
  const [discarding, setDiscarding] = useState(null)
  const [busy, setBusy] = useState(false)

  const { data: lots } = useData(() => listLots(), [])

  const { expired, soon, later } = useMemo(() => {
    const all = (lots ?? []).filter((l) => daysUntil(l.expiresAt) <= days)
    return {
      expired: all.filter((l) => daysUntil(l.expiresAt) < 0),
      soon: all.filter((l) => {
        const d = daysUntil(l.expiresAt)
        return d >= 0 && d <= 30
      }),
      later: all.filter((l) => daysUntil(l.expiresAt) > 30),
    }
  }, [lots, days])

  const confirmDiscard = async () => {
    setBusy(true)
    try {
      const wasExpired = daysUntil(discarding.expiresAt) < 0
      await discardLot(discarding.id, wasExpired ? 'Expired' : 'Discarded')
      toast({
        title: 'Lot written off',
        body: `${discarding.productName} · lot ${discarding.lotNumber}`,
      })
      setDiscarding(null)
    } catch (e) {
      toast({ title: 'Could not discard', body: e.message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const renderLot = (lot) => {
    const d = daysUntil(lot.expiresAt)
    return (
      <Row
        key={lot.id}
        chevron={false}
        onClick={() => setDiscarding(lot)}
        leading={<ProductTile product={lot} size={38} />}
        title={lot.productName}
        subtitle={`Lot ${lot.lotNumber} · ${qty(lot.quantity)} ${lot.unit} · ${shortLocation(
          lot.locationName,
        )}`}
        trailing={
          <div className="text-right">
            <Pill tone={d < 0 ? 'critical' : d <= 30 ? 'warning' : 'quiet'}>
              {d < 0 ? `${Math.abs(d)}d ago` : `${d}d`}
            </Pill>
            <p className="mt-0.5 text-caption text-label-3">{fullDate(lot.expiresAt)}</p>
          </div>
        }
      />
    )
  }

  const total = expired.length + soon.length + later.length

  return (
    <Screen
      title="Expiry"
      subtitle={`${expired.length} expired · ${soon.length} within 30 days`}
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
      <div className="pb-1 pt-3">
        <SegmentedControl value={days} onChange={setDays} options={WINDOWS} />
      </div>

      {expired.length > 0 ? (
        <div className="mt-3 flex items-start gap-3 rounded-card bg-ios-red p-4 text-white">
          <TriangleAlert size={20} strokeWidth={2.2} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-headline font-semibold">
              {expired.length} expired {expired.length === 1 ? 'lot is' : 'lots are'} still on the
              shelf
            </p>
            <p className="mt-0.5 text-footnote text-white/85">
              Pull these before the next session. An expired lot in a drawer is a finding on
              inspection.
            </p>
          </div>
        </div>
      ) : null}

      {expired.length > 0 ? (
        <Section title="Expired" footer="Write these off to remove them from on-hand.">
          {expired.map(renderLot)}
        </Section>
      ) : null}

      {soon.length > 0 ? (
        <Section title="Within 30 days" footer="Use these first — rotate them to the front.">
          {soon.map(renderLot)}
        </Section>
      ) : null}

      {later.length > 0 ? <Section title="Later">{later.map(renderLot)}</Section> : null}

      {total === 0 ? (
        <EmptyState
          icon={CalendarCheck2}
          title="Nothing expiring"
          body={`No tracked lot expires in the next ${days === 3650 ? 'ten years' : `${days} days`}.`}
        />
      ) : null}

      <Sheet
        open={Boolean(discarding)}
        onClose={() => setDiscarding(null)}
        title="Write off lot"
        detent="small"
        footer={
          <Button
            className="w-full"
            size="lg"
            variant="destructive"
            loading={busy}
            onClick={confirmDiscard}
          >
            Write off {qty(discarding?.quantity ?? 0)} {discarding?.unit ?? ''}
          </Button>
        }
      >
        {discarding ? (
          <div className="px-1 py-6 text-center">
            <p className="text-body text-label">{discarding.productName}</p>
            <p className="mt-1 font-mono text-subhead text-label-2">Lot {discarding.lotNumber}</p>
            <p className="mt-3 text-subhead text-label-3">
              Expires {fullDate(discarding.expiresAt)} · {qty(discarding.quantity)}{' '}
              {discarding.unit} at {shortLocation(discarding.locationName)}
            </p>
            <p className="mt-3 text-footnote text-label-3">
              This removes the quantity from stock and records it as waste. The ledger entry
              cannot be edited afterwards.
            </p>
          </div>
        ) : null}
      </Sheet>
    </Screen>
  )
}
