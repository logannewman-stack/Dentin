import { useEffect, useState } from 'react'

/**
 * Interface skin: which design language the app wears.
 *
 * Two complete languages ship side by side, and this picks between them the
 * same way the theme picks light or dark — a `data-skin` attribute on the
 * root element that CSS variables key off. Almost everything that differs
 * (radii, the type ramp, row metrics, whether a panel draws a border or casts
 * a shadow, whether chrome is opaque or translucent) is a variable, so the
 * switch is instant and needs no reload.
 *
 * A handful of differences are structural rather than visual — iOS has a
 * large title that collapses on scroll and slides screens in from the edge;
 * the software skin has a fixed compact bar and barely moves. Those read the
 * skin through `useSkin()` instead.
 *
 *   ios       phone-OS: grouped cards, 44pt rows, 17px body, SF, big radii
 *   software  the sharp language: hairline structure, 38px rows, 14px body
 */
const KEY = 'dentin:skin'

export const SKINS = ['ios', 'software']
export const DEFAULT_SKIN = 'ios'

export const SKIN_LABEL = {
  ios: 'iOS',
  software: 'Software',
}

export function readSkin() {
  try {
    const stored = localStorage.getItem(KEY)
    return SKINS.includes(stored) ? stored : DEFAULT_SKIN
  } catch {
    // Private mode, or storage disabled — the default still works.
    return DEFAULT_SKIN
  }
}

/** Paints the attribute. Called at boot before first paint, and on change. */
export function applySkin(skin) {
  const next = SKINS.includes(skin) ? skin : DEFAULT_SKIN
  document.documentElement.setAttribute('data-skin', next)
  return next
}

// Components that branch on skin structurally need to hear about a change
// even though they do not own the setting, so the module keeps the list.
const listeners = new Set()

export function setSkin(skin) {
  const next = SKINS.includes(skin) ? skin : DEFAULT_SKIN
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Not persisting is survivable; not switching is not.
  }
  applySkin(next)
  listeners.forEach((fn) => fn(next))
}

/** `const [skin, setSkin] = useSkin()`, live across the whole tree. */
export function useSkin() {
  const [skin, set] = useState(readSkin)

  useEffect(() => {
    listeners.add(set)
    return () => listeners.delete(set)
  }, [])

  return [skin, setSkin]
}
