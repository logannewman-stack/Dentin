import { clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge classifies any unknown `text-*` class as a text colour. Our
 * iOS type ramp (text-body, text-caption, …) looks exactly like that, so
 * without this registration a size would be silently dropped whenever it was
 * merged alongside a colour — `cn('text-caption', 'text-ios-red')` would emit
 * only the colour and the element would fall back to the inherited size.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'caption2',
            'caption',
            'footnote',
            'subhead',
            'callout',
            'body',
            'headline',
            'title3',
            'title2',
            'title1',
            'large',
          ],
        },
      ],
    },
  },
})

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Light haptic tap. Real on Android/Chrome; a no-op on iOS Safari, which does
 * not expose the vibration API — the visual press state carries it there.
 */
export function haptic(pattern = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern)
    } catch {
      /* vibration blocked — not worth surfacing */
    }
  }
}

export function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item)
    ;(acc[key] ||= []).push(item)
    return acc
  }, {})
}

export function debounce(fn, ms = 250) {
  let timer
  const wrapped = (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  wrapped.cancel = () => clearTimeout(timer)
  return wrapped
}
