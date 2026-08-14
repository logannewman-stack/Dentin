import { useRef, useState } from 'react'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { cn, haptic } from '@/lib/utils'

/**
 * iOS swipe-to-action row.
 *
 * Drag left to reveal trailing actions; they stay open until tapped or the row
 * is swiped back. A hard flick past the threshold fires the first (primary)
 * action directly, which is the shortcut a nurse doing a shelf count actually
 * uses.
 */
const ACTION_WIDTH = 78

export default function SwipeRow({ children, actions = [], className }) {
  const x = useMotionValue(0)
  const [open, setOpen] = useState(false)
  const firedRef = useRef(false)

  const maxOpen = actions.length * ACTION_WIDTH
  // Actions fade in as the row uncovers them, so they never pop.
  const actionOpacity = useTransform(x, [-maxOpen, -maxOpen * 0.35, 0], [1, 0.75, 0])

  if (!actions.length) return children

  const close = () => {
    setOpen(false)
    x.set(0)
  }

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Action rail */}
      <motion.div
        className="absolute inset-y-0 right-0 flex"
        style={{ opacity: actionOpacity }}
        aria-hidden={!open}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              haptic(10)
              action.onPress()
              close()
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-1 text-white',
              action.tone === 'destructive' && 'bg-ios-red',
              action.tone === 'warning' && 'bg-ios-orange',
              (!action.tone || action.tone === 'brand') && 'bg-brand-600',
            )}
            style={{ width: ACTION_WIDTH }}
          >
            {action.icon ? <action.icon size={19} strokeWidth={2.2} aria-hidden="true" /> : null}
            <span className="text-caption2 font-semibold">{action.label}</span>
          </button>
        ))}
      </motion.div>

      <motion.div
        drag="x"
        dragDirectionLock
        style={{ x }}
        dragConstraints={{ left: -maxOpen, right: 0 }}
        dragElastic={{ left: 0.12, right: 0 }}
        onDragStart={() => {
          firedRef.current = false
        }}
        onDrag={(_, info) => {
          // Flick past 1.4× the rail: run the primary action without a tap.
          if (!firedRef.current && info.offset.x < -maxOpen * 1.4) {
            firedRef.current = true
            haptic(12)
            actions[0].onPress()
            close()
          }
        }}
        onDragEnd={(_, info) => {
          if (firedRef.current) return
          const shouldOpen = info.offset.x < -maxOpen / 2 || info.velocity.x < -320
          setOpen(shouldOpen)
          x.set(shouldOpen ? -maxOpen : 0)
        }}
        animate={{ x: open ? -maxOpen : 0 }}
        transition={{ type: 'spring', damping: 34, stiffness: 420 }}
        className="relative bg-surface"
      >
        {children}
      </motion.div>
    </div>
  )
}
