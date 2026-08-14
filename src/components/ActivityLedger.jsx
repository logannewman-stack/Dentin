import { ArrowDownLeft, ArrowUpRight, ClipboardCheck, Trash2 } from 'lucide-react'
import { Row } from '@/components/ios/List'
import { qty, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const TYPES = {
  received: { label: 'Received', Icon: ArrowDownLeft, tone: 'text-ios-green' },
  consumed: { label: 'Used', Icon: ArrowUpRight, tone: 'text-label-2' },
  wasted: { label: 'Wasted', Icon: Trash2, tone: 'text-ios-red' },
  counted: { label: 'Counted', Icon: ClipboardCheck, tone: 'text-ios-blue' },
  adjusted: { label: 'Adjusted', Icon: ClipboardCheck, tone: 'text-ios-orange' },
  transferred: { label: 'Transferred', Icon: ArrowUpRight, tone: 'text-ios-purple' },
  returned: { label: 'Returned', Icon: ArrowDownLeft, tone: 'text-ios-green' },
}

/**
 * The movement ledger, rendered as an audit trail rather than a feed.
 *
 * Each entry carries who, when, why and the balance it left behind — which is
 * what makes on-hand defensible when someone asks where the composite went.
 */
export default function ActivityLedger({ movements, showProduct }) {
  if (!movements?.length) {
    return (
      <Row
        chevron={false}
        title="No movements recorded"
        subtitle="Receiving, using and counting stock all appear here"
      />
    )
  }

  return movements.map((m) => {
    const meta = TYPES[m.type] ?? TYPES.adjusted
    const positive = m.quantity > 0

    return (
      <Row
        key={m.id}
        chevron={false}
        leading={
          <span
            className={cn(
              'flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-full bg-fill/10',
              meta.tone,
            )}
            aria-hidden="true"
          >
            <meta.Icon size={15} strokeWidth={2.3} />
          </span>
        }
        title={showProduct ? m.productName : meta.label}
        subtitle={[
          showProduct ? meta.label : null,
          m.reason,
          m.userName,
        ]
          .filter(Boolean)
          .join(' · ')}
        trailing={
          <div className="text-right">
            {m.type === 'counted' ? (
              <p className="tnum text-callout font-semibold text-ios-blue">set</p>
            ) : (
              <p
                className={cn(
                  'tnum text-callout font-semibold',
                  positive ? 'text-ios-green' : 'text-label',
                )}
              >
                {positive ? '+' : '−'}
                {qty(Math.abs(m.quantity))}
              </p>
            )}
            <p className="text-caption text-label-3">{relativeTime(m.createdAt)}</p>
          </div>
        }
      >
        {m.balanceAfter != null ? (
          <span className="tnum mt-0.5 text-caption text-label-3">
            balance {qty(m.balanceAfter)}
          </span>
        ) : null}
      </Row>
    )
  })
}
