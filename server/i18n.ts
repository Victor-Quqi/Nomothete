/**
 * The interface language, for everything the server says: check findings,
 * notices, errors, the labels in the bootstrap payload, the terminal.
 *
 * One language per install. The browser sets it (Settings, or on first load
 * from its own language); until then the system locale decides, which is also
 * what the terminal goes by before there is a database to ask.
 *
 * Generated names and their rationales are not interface. They follow the
 * brief's language, whatever this is set to.
 */
export type Lang = 'zh' | 'en'

export function systemLang(): Lang {
  const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || ''
  const locale = env || Intl.DateTimeFormat().resolvedOptions().locale
  return /^zh/i.test(locale) ? 'zh' : 'en'
}

let current: Lang = systemLang()

export function lang(): Lang {
  return current
}

export function setLang(next: Lang) {
  current = next
}

/** The string for the current language. Both are written out where they are used. */
export function tr(zh: string, en: string): string {
  return current === 'zh' ? zh : en
}

export function isLang(value: unknown): value is Lang {
  return value === 'zh' || value === 'en'
}
