import { cn } from '@/lib/utils'

/**
 * Horizontal magnitude bars, ranked.
 *
 * One series, so no legend — the section title says what is plotted. Every bar
 * wears the same hue: colour here would encode nothing the label does not
 * already carry. Values ride the tip of each bar, which is what the axis would
 * otherwise be for.
 */
export default function BarList({ items, formatValue = (v) => v, className, emptyLabel }) {
  if (!items?.length) {
    return <p className="px-4 py-6 text-center text-footnote text-label-3">{emptyLabel}</p>
  }

  const max = Math.max(...items.map((i) => i.value), 1)

  return (
    <ul className={cn('flex flex-col gap-3', className)}>
      {items.map((item) => {
        const pct = (item.value / max) * 100
        return (
          <li key={item.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-subhead text-label">{item.label}</span>
              <span className="tnum shrink-0 text-subhead font-semibold text-label">
                {formatValue(item.value)}
              </span>
            </div>

            <div className="mt-1.5 flex items-center gap-2">
              <span className="relative h-[6px] flex-1 overflow-hidden rounded-[2px] bg-fill/12">
                <span
                  className="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-300 ease-sharp"
                  style={{
                    width: `${Math.max(pct, 2)}%`,
                    background: 'rgb(var(--viz-1))',
                  }}
                />
              </span>
              {item.caption ? (
                <span className="tnum w-11 shrink-0 text-right text-caption text-label-3">
                  {item.caption}
                </span>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
