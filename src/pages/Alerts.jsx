import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellOff,
  CalendarClock,
  PackageX,
  TrendingDown,
  Wrench,
} from 'lucide-react'
import Screen from '@/components/ui/Screen'
import { Row, RowIcon, Section } from '@/components/ui/List'
import { EmptyState, SegmentedControl } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import { useData } from '@/hooks/useData'
import { listAlerts } from '@/lib/repository'

const ICONS = {
  out_of_stock: PackageX,
  low_stock: TrendingDown,
  expiring: CalendarClock,
  expired: AlertTriangle,
  service_due: Wrench,
  price_drop: TrendingDown,
}

const TINTS = { critical: 'red', warning: 'orange', info: 'blue' }

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
]

export default function Alerts() {
  const { data: alerts } = useData(() => listAlerts(), [])
  const [filter, setFilter] = useState('all')

  const counts = useMemo(() => {
    const all = alerts ?? []
    return {
      all: all.length,
      critical: all.filter((a) => a.severity === 'critical').length,
      warning: all.filter((a) => a.severity === 'warning').length,
    }
  }, [alerts])

  const rows = useMemo(
    () => (filter === 'all' ? (alerts ?? []) : (alerts ?? []).filter((a) => a.severity === filter)),
    [alerts, filter],
  )

  const grouped = useMemo(() => {
    const labels = {
      out_of_stock: 'Out of stock',
      low_stock: 'At reorder point',
      expiring: 'Expiring lots',
      expired: 'Expired lots',
      service_due: 'Equipment service',
      price_drop: 'Price drops',
    }
    const map = new Map()
    for (const a of rows) {
      const key = labels[a.type] ?? 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(a)
    }
    return [...map.entries()]
  }, [rows])

  return (
    <Screen
      title="Alerts"
      subtitle={counts.all ? `${counts.critical} critical · ${counts.warning} warning` : undefined}
    >
      <div className="pb-1 pt-2">
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Nothing needs you"
          body="No stock is below par, no lot is expiring, and no equipment service is due in the next 30 days."
        />
      ) : (
        grouped.map(([label, items]) => (
          <Section key={label} title={label}>
            {items.map((alert) => {
              const Icon = ICONS[alert.type] ?? AlertTriangle
              return (
                <Row
                  key={alert.id}
                  to={alert.item ? `/inventory/${alert.item.id}` : '/equipment'}
                  leading={
                    <RowIcon tint={TINTS[alert.severity] ?? 'gray'}>
                      <Icon size={15} strokeWidth={2.2} />
                    </RowIcon>
                  }
                  title={alert.title}
                  subtitle={alert.body}
                />
              )
            })}
          </Section>
        ))
      )}

      {counts.critical > 0 ? (
        <div className="pt-4">
          <Button to="/orders/new" className="w-full" size="lg">
            Reorder everything that is short
          </Button>
        </div>
      ) : null}
    </Screen>
  )
}
