/**
 * 12-point sparkline for stat tiles. Trend only — no axis, no labels; the
 * tile's value carries the number. The final point wears an end-dot with a
 * surface ring so it stays legible where it meets the edge.
 */
export default function Sparkline({ values, width = 64, height = 24, tone = 'viz-1' }) {
  if (!values?.length || values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = width / (values.length - 1)
  const pad = 3

  const points = values.map((v, i) => [
    i * stepX,
    pad + (1 - (v - min) / span) * (height - pad * 2),
  ])

  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const [lastX, lastY] = points[points.length - 1]
  const stroke = `rgb(var(--${tone}))`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className="overflow-visible"
    >
      <path d={d} stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={4} fill={stroke} stroke="rgb(var(--surface))" strokeWidth={2} />
    </svg>
  )
}
