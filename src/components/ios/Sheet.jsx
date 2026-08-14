import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * iOS sheet: springs up from the bottom, dims what's behind it, and can be
 * flicked or dragged down to dismiss.
 */
export default function Sheet({ open, onClose, title, children, footer, detent = 'medium' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    // Freeze the layer behind the sheet.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const heights = {
    small: 'max-h-[42dvh]',
    medium: 'max-h-[74dvh]',
    large: 'max-h-[94dvh]',
  }

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.div
            className={cn(
              'absolute inset-x-0 bottom-0 flex flex-col rounded-t-sheet bg-canvas shadow-sheet',
              heights[detent],
            )}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 340, mass: 0.9 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 620) onClose?.()
            }}
          >
            {/* Grabber */}
            <div className="flex justify-center pb-1 pt-2.5">
              <div className="h-[5px] w-9 rounded-full bg-label-3/40" aria-hidden="true" />
            </div>

            <div className="flex items-center justify-between px-4 pb-2 pt-1">
              <h2 className="text-title3 font-semibold">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="press flex h-[30px] w-[30px] items-center justify-center rounded-full bg-surface-2 text-label-3"
              >
                <X size={17} strokeWidth={2.4} />
              </button>
            </div>

            <div className="scroll-area flex-1 overflow-y-auto px-4 pb-2">{children}</div>

            {footer ? (
              <div
                className="border-t border-separator/50 bg-surface/80 px-4 pt-3 backdrop-blur"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
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
