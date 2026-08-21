import { useMemo, useState } from 'react'
import { CircleDot, ShieldCheck, Wrench } from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, RowIcon, Section } from '@/components/ui/List'
import { EmptyState, Pill } from '@/components/ui/Controls'
import Sheet from '@/components/ui/Sheet'
import { useData } from '@/hooks/useData'
import { listAssets, listLocations } from '@/lib/repository'
import { fullDate, money } from '@/lib/format'

const STATUS_TONE = { active: 'good', servicing: 'warning', retired: 'quiet' }

function serviceDays(asset) {
  return Math.round((new Date(asset.nextServiceAt) - new Date()) / 86400000)
}

export default function Equipment() {
  const { data: assets } = useData(() => listAssets(), [])
  const { data: locations } = useData(() => listLocations(), [])
  const [detail, setDetail] = useState(null)

  const { due, healthy, capital } = useMemo(() => {
    const all = assets ?? []
    return {
      due: all.filter((a) => serviceDays(a) <= 30).sort((x, y) => serviceDays(x) - serviceDays(y)),
      healthy: all.filter((a) => serviceDays(a) > 30),
      capital: all.reduce((sum, a) => sum + (a.purchasePrice ?? 0), 0),
    }
  }, [assets])

  const locationName = (id) => (locations ?? []).find((l) => l.id === id)?.name ?? '—'

  const renderAsset = (asset) => {
    const days = serviceDays(asset)
    return (
      <Row
        key={asset.id}
        onClick={() => setDetail(asset)}
        chevron
        leading={
          <RowIcon tint={days < 0 ? 'red' : days <= 30 ? 'orange' : 'quiet'}>
            <Wrench size={15} strokeWidth={2.2} />
          </RowIcon>
        }
        title={asset.name}
        subtitle={`${asset.manufacturer} ${asset.model} · ${asset.serialNumber}`}
        trailing={
          <Pill tone={days < 0 ? 'critical' : days <= 30 ? 'warning' : 'quiet'}>
            {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
          </Pill>
        }
      />
    )
  }

  return (
    <Screen title="Equipment" subtitle={assets?.length ? `${assets.length} assets` : undefined}>
      {assets?.length ? (
        <div className="mt-3 flex gap-2.5">
          <div className="flex-1 rounded-card bg-surface shadow-card p-3">
            <p className="text-caption font-medium uppercase tracking-[0.4px] text-label-3">
              Capital value
            </p>
            <p className="tnum mt-1.5 text-title2 font-bold">{money(capital)}</p>
            <p className="mt-0.5 text-caption text-label-3">at purchase</p>
          </div>
          <div className="flex-1 rounded-card bg-surface shadow-card p-3">
            <p className="text-caption font-medium uppercase tracking-[0.4px] text-label-3">
              Service due
            </p>
            <p
              className={`tnum mt-1.5 text-title2 font-bold ${
                due.length ? 'text-ios-orange' : 'text-ios-green'
              }`}
            >
              {due.length}
            </p>
            <p className="mt-0.5 text-caption text-label-3">next 30 days</p>
          </div>
        </div>
      ) : null}

      {due.length > 0 ? (
        <Section
          title="Service due"
          footer="Sterilizer and compressor logs are the first thing a board inspection asks to see."
        >
          {due.map(renderAsset)}
        </Section>
      ) : null}

      {healthy.length > 0 ? <Section title="In service">{healthy.map(renderAsset)}</Section> : null}

      {!assets?.length ? (
        <EmptyState
          icon={Wrench}
          title="No equipment logged"
          body="Track chairs, sterilizers, compressors and imaging with serials, warranty dates and service intervals."
        />
      ) : null}

      <Sheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ''}
        detent="medium"
      >
        {detail ? (
          <div className="py-2">
            <Section title="Asset">
              <Row title="Manufacturer" detail={detail.manufacturer} chevron={false} />
              <Row title="Model" detail={detail.model} chevron={false} />
              <Row title="Serial number" detail={detail.serialNumber} chevron={false} />
              <Row title="Location" detail={locationName(detail.locationId)} chevron={false} />
              <Row
                title="Status"
                chevron={false}
                trailing={
                  <Pill tone={STATUS_TONE[detail.status] ?? 'quiet'} icon={CircleDot}>
                    {detail.status}
                  </Pill>
                }
              />
            </Section>

            <Section title="Lifecycle">
              <Row title="Purchased" detail={fullDate(detail.purchasedAt)} chevron={false} />
              <Row title="Purchase price" detail={money(detail.purchasePrice)} chevron={false} />
              <Row
                title="Warranty"
                detail={fullDate(detail.warrantyExpiresAt)}
                chevron={false}
                trailing={
                  new Date(detail.warrantyExpiresAt) < new Date() ? (
                    <Pill tone="quiet">Expired</Pill>
                  ) : (
                    <Pill tone="good" icon={ShieldCheck}>
                      Active
                    </Pill>
                  )
                }
              />
            </Section>

            <Section title="Service">
              <Row title="Last serviced" detail={fullDate(detail.lastServicedAt)} chevron={false} />
              <Row
                title="Next service"
                detail={fullDate(detail.nextServiceAt)}
                chevron={false}
                trailing={
                  serviceDays(detail) < 0 ? (
                    <Pill tone="critical">{Math.abs(serviceDays(detail))}d overdue</Pill>
                  ) : null
                }
              />
            </Section>
          </div>
        ) : null}
      </Sheet>
    </Screen>
  )
}
