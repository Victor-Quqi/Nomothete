import { useCallback, useEffect, useState } from 'react'
import { tr } from './i18n.ts'

/** Which light the room is in. `system` follows the OS, and keeps following it. */
export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_LABEL: Record<ThemeChoice, string> = {
  system: tr('跟随系统', 'System'),
  light: tr('浅色', 'Light'),
  dark: tr('深色', 'Dark'),
}

// The script at the top of index.html reads the same key with the same rule,
// before the first paint, so the page never opens in the wrong light and then
// changes its mind. A preference of this browser, not of the server's data.
const KEY = 'nomothete.theme'

const osLight = () => window.matchMedia('(prefers-color-scheme: light)')

function stored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function resolve(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice
  return osLight().matches ? 'light' : 'dark'
}

function apply(theme: 'light' | 'dark') {
  const root = document.documentElement
  if (root.dataset.theme === theme) return
  // Holds every control's own transition off while the light changes, so the
  // room changes in one piece; see [data-theme-switching] in styles.css.
  root.setAttribute('data-theme-switching', '')
  const settle = () => setTimeout(() => root.removeAttribute('data-theme-switching'), 1)
  const flip = () => {
    root.dataset.theme = theme
    // Style the new light now, while transitions are still off, rather than
    // on the next frame, after they are back on.
    void document.body.offsetHeight
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (document.startViewTransition && !reduced) {
    document.startViewTransition(flip).finished.finally(settle)
  } else {
    flip()
    settle()
  }
}

export function useTheme(): [ThemeChoice, (next: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(stored)

  useEffect(() => {
    apply(resolve(choice))
    if (choice !== 'system') return
    const os = osLight()
    const follow = () => apply(resolve('system'))
    os.addEventListener('change', follow)
    return () => os.removeEventListener('change', follow)
  }, [choice])

  // Another tab changed it.
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === KEY || e.key === null) setChoice(stored())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const choose = useCallback((next: ThemeChoice) => {
    try {
      if (next === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch {
      // Private mode and the like: the choice still holds until the tab closes.
    }
    setChoice(next)
  }, [])

  return [choice, choose]
}
