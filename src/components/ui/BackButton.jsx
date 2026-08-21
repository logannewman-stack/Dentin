import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn, haptic } from '@/lib/utils'

/**
 * The nav bar's back control.
 *
 * A chevron and a word, in the accent colour, with no border and no fill —
 * UINavigationController's, not a button someone drew. Three details do the
 * work: the chevron is thin and oversized (24px at 2.2 weight, so it reads as
 * a direction rather than an icon), the label sits tight against it, and the
 * whole thing dims on press instead of filling.
 *
 * `label` should name where you are going back to when that is knowable —
 * "Inventory" tells you more than "Back" — and falls back to "Back" when it
 * is not.
 */
export default function BackButton({ label = 'Back', to, onClick, className }) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={(e) => {
        haptic(4)
        if (onClick) onClick(e)
        else if (to) navigate(to)
        else navigate(-1)
      }}
      // -ml-1 pulls the chevron's own optical padding back to the 16px
      // gutter, so the glyph lines up with the content below it.
      className={cn(
        '-ml-1 flex items-center gap-0.5 py-1 pr-2 text-body text-brand-600',
        'transition-opacity duration-200 ease-out active:opacity-45 active:duration-0',
        'dark:text-brand-400',
        className,
      )}
    >
      <ChevronLeft size={24} strokeWidth={2.2} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  )
}
