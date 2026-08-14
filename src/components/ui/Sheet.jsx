import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Panel that rises from the bottom.
 *
 * Sharper and quicker than the iOS sheet it replaces: a small top radius, a
 * titled header bar with a rule under it, no drag grabber, and a short eased
 * move instead of a spring. Drag-to-dismiss is kept because it is genuinely
 * faster than reaching for the close control on a phone.
 */
export default function Sheet({ open, onClose, title, children, footer, detent = 'medium' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const heights = {
    small: 'max-h-[46dvh]',
    medium: 'max-h-[76dvh]',
    large: 'max-h-[94dvh]',
  }

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div
            className="absolute inset-0 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={onClose}
          />

          <motion.div
            className={cn(
              'absolute inset-x-0 bottom-0 flex flex-col rounded-t-sheet border-t border-line bg-canvas shadow-sheet',
              heights[detent],
            )}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 620) onClose?.()
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5">
              <h2 className="truncate text-headline">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="focus-ring flex h-6 w-6 items-center justify-center rounded-[4px] text-label-3 transition-colors hover:bg-surface-2 hover:text-label"
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            </div>

            <div className="scroll-area flex-1 overflow-y-auto px-3 pb-2">{children}</div>

            {footer ? (
              <div
                className="border-t border-line bg-surface px-3 pt-2.5"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
              >
                {footer}
              </div>
            ) : (
              <div style={{ height: 'env(safe-area-inset-bottom)' }} />
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
