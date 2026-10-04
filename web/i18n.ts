/**
 * The interface language. Read once, before anything renders, and changed by
 * reloading: a switch that re-rendered in place would have to reach every
 * memoised card on the wall, and the server's words (check findings, labels)
 * come back in the new language only when asked again anyway.
 *
 * The server keeps the choice, and until one is made it uses the system's
 * language. This keeps a copy so the first paint is already in the right
 * language; the browser's own list is only a guess for the very first load.
 */
export type Lang = 'zh' | 'en'

const KEY = 'nomothete.lang'

function browserLang(): Lang {
  const first = navigator.languages?.[0] ?? navigator.language ?? ''
  return /^zh/i.test(first) ? 'zh' : 'en'
}

function stored(): Lang | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'zh' || v === 'en' ? v : null
  } catch {
    return null
  }
}

export const lang: Lang = stored() ?? browserLang()

/** The string for the current language. Both are written out where they are used. */
export function tr(zh: string, en: string): string {
  return lang === 'zh' ? zh : en
}

/** Keep a language for the next load. False when there is no storage to keep it in. */
export function rememberLang(next: Lang): boolean {
  try {
    localStorage.setItem(KEY, next)
    return true
  } catch {
    return false
  }
}
