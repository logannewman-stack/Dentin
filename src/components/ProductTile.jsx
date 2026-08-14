import { cn } from '@/lib/utils'

/**
 * Product art.
 *
 * A licensed catalog feed supplies real pack shots; until one is wired we
 * render a stable, branded tile derived from the product itself rather than
 * a grey box — the category colour and brand mark make items scannable in a
 * long list, which is what the photo would have been doing anyway.
 */
const CATEGORY_TINT = {
  'infection-control': ['#34C759', '#1E9B62'],
  restorative: ['#007AFF', '#0A5BC4'],
  preventive: ['#30B0C7', '#1B7F91'],
  endodontics: ['#AF52DE', '#7B32A8'],
  'oral-surgery': ['#FF3B30', '#C0261E'],
  implants: ['#5856D6', '#3A38A0'],
  orthodontics: ['#FF2D55', '#C41B3C'],
  'impression-lab': ['#FF9500', '#C26C00'],
  anesthetics: ['#FF6B57', '#C4402E'],
  'rotary-burs': ['#8E8E93', '#5C5C61'],
  imaging: ['#0A84FF', '#0757AC'],
  whitening: ['#FFCC00', '#C29A00'],
  disposables: ['#98989D', '#6B6B70'],
  equipment: ['#0E7C7B', '#08514F'],
}

export default function ProductTile({ product, size = 44, className, imageUrl }) {
  const [from, to] = CATEGORY_TINT[product?.categorySlug] ?? CATEGORY_TINT.disposables
  const brand = product?.brand ?? product?.productName ?? '?'
  const mark = brand.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={cn('shrink-0 rounded-[5px] bg-surface-2 object-cover', className)}
        style={{ width: size, height: size }}
      />
    )
  }

  // Flat tint with a same-hue rule and inked mark, rather than a glossy
  // gradient chip — quieter beside dense rows, and the category still reads.
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[4px] border font-semibold',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.3,
        background: `color-mix(in srgb, ${from} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${from} 30%, transparent)`,
        color: to,
      }}
    >
      {mark}
    </span>
  )
}
