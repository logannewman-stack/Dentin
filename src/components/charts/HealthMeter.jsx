import { cn } from '@/lib/utils'

/**
 * Stock health as a single part-to-whole meter.
 *
 * Status colours are reserved and never stand alone: every segment carries a
 * count and a written label beneath the bar, so state survives colour-blindness,
 * greyscale print and forced-colors.
 */
const SEGMENTS = [
  { key: 'out', label: 'Out', color: 'var(--seg-out)' },
  { key: 'low', label: 'Reorder', color: 'var(--seg-low)' },
  { key: 'below_par', label: 'Below par', color: 'var(--seg-below)' },
  { key: 'ok', label: 'Healthy', color: 'var(--seg-ok)' },
]

export default function HealthMeter({ counts, className }) {
  const total = SEGMENTS.reduce((sum, s) => sum + (counts[s.key] ?? 0), 0)
  if (!total) return null

  const present = SEGMENTS.filter((s) => (counts[s.key] ?? 0) > 0)

  return (
    <div
      className={cn('w-full', className)}
      style={{
        '--seg-out': '#FF3B30',
        '--seg-low': '#FF9500',
        '--seg-below': '#FFCC00',
        '--seg-ok': '#34C759',
      }}
    >
      {/* 2px surface gaps do the separating — no strokes around segments. */}
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden">
        {present.map((s, i) => (
          <span
            key={s.key}
            className={cn(
              'h-full',
              i === 0 && 'rounded-l-full',
              i === present.length - 1 && 'rounded-r-full',
            )}
            style={{
              width: `${((counts[s.key] ?? 0) / total) * 100}%`,
              background: s.color,
            }}
            aria-hidden="true"
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {present.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: s.color }}
              aria-hidden="true"
            />
            <span className="tnum text-caption font-semibold text-label">{counts[s.key]}</span>
            <span className="text-caption text-label-3">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
