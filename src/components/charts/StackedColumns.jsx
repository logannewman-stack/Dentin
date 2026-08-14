import { useId, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Stacked columns, hand-rolled so the mark specs actually hold:
 * caps at 24px thick, a 4px rounded data-end that stays square at the
 * baseline, and a 2px surface gap between touching segments.
 *
 * Each column is one whole — here, list price split into what the practice
 * paid and what Dentin saved — so the stack is a true part-to-whole.
 */
export default function StackedColumns({
  data,
  series,
  formatValue = (v) => v,
  height = 168,
  className,
}) {
  const gradientId = useId()
  const [active, setActive] = useState(null)

  const totals = data.map((d) => series.reduce((sum, s) => sum + (d[s.key] ?? 0), 0))
  const max = Math.max(...totals, 1)

  // Round the axis to a clean number so ticks read as money, not decimals.
  const magnitude = 10 ** Math.floor(Math.log10(max))
  const axisMax = Math.ceil(max / (magnitude / 2)) * (magnitude / 2)
  const ticks = [0, axisMax / 2, axisMax]

  const GAP = 2
  const RADIUS = 4

  return (
    <div className={cn('w-full', className)}>
      {/* Legend — always present for two or more series */}
      {series.length > 1 ? (
        <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ background: `rgb(var(--viz-${s.slot}))` }}
                aria-hidden="true"
              />
              <span className="text-caption text-label-2">{s.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative flex" style={{ height }}>
        {/* Y ticks */}
        <div className="mr-2 flex w-11 shrink-0 flex-col justify-between py-[1px]">
          {[...ticks].reverse().map((t) => (
            <span key={t} className="tnum text-right text-caption2 leading-none text-viz-muted">
              {formatValue(t)}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* Gridlines — hairline, solid, recessive */}
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute inset-x-0 h-px bg-viz-grid"
              style={{ bottom: `${(t / axisMax) * 100}%` }}
              aria-hidden="true"
            />
          ))}

          <div className="absolute inset-0 flex items-end justify-between gap-1">
            {data.map((d, i) => {
              const total = totals[i]
              const isActive = active === i
              let offset = 0

              return (
                <button
                  type="button"
                  key={d.label}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                  aria-label={`${d.label}: ${series
                    .map((s) => `${s.label} ${formatValue(d[s.key] ?? 0)}`)
                    .join(', ')}`}
                >
                  <span
                    className="relative w-full max-w-[24px]"
                    style={{ height: `${(total / axisMax) * 100}%` }}
                  >
                    {series.map((s, si) => {
                      const value = d[s.key] ?? 0
                      if (value <= 0) return null
                      const pct = (value / total) * 100
                      const bottom = offset
                      offset += pct
                      const isTop = si === series.length - 1

                      return (
                        <span
                          key={s.key}
                          className="absolute inset-x-0 transition-opacity duration-150"
                          style={{
                            bottom: `${bottom}%`,
                            height: `calc(${pct}% - ${isTop ? 0 : GAP}px)`,
                            background: `rgb(var(--viz-${s.slot}))`,
                            // Rounded only at the data-end; square on the baseline.
                            borderTopLeftRadius: isTop ? RADIUS : 0,
                            borderTopRightRadius: isTop ? RADIUS : 0,
                            opacity: active == null || isActive ? 1 : 0.4,
                          }}
                        />
                      )
                    })}
                  </span>

                  {/* Tooltip */}
                  {isActive ? (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max -translate-x-1/2 rounded-[10px] bg-surface px-2.5 py-2 shadow-raised"
                    >
                      <span className="block text-caption font-semibold text-label">{d.label}</span>
                      {series.map((s) => (
                        <span key={s.key} className="mt-1 flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-[2px]"
                            style={{ background: `rgb(var(--viz-${s.slot}))` }}
                          />
                          <span className="text-caption text-label-2">{s.label}</span>
                          <span className="tnum ml-auto pl-2 text-caption font-semibold text-label">
                            {formatValue(d[s.key] ?? 0)}
                          </span>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
        <span id={gradientId} className="hidden" />
      </div>

      {/* X labels */}
      <div className="mt-2 flex pl-[52px]">
        {data.map((d) => (
          <span
            key={d.label}
            className="flex-1 text-center text-caption2 leading-none text-viz-muted"
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}
