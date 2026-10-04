/**
 * Global switches the browser can flip. Stored in the database rather than
 * `.env`, so they stay editable when a config file locks the model settings.
 */
import { getDb } from './db.ts'
import { isLang, lang, setLang, systemLang, type Lang } from './i18n.ts'

const AUTO_VERIFY = 'autoVerify'
const LANGUAGE = 'language'

export interface Settings {
  /** Rationale verification on a positive Verdict or a recheck. Default on. */
  autoVerify: boolean
  /** The interface language: the one picked in Settings, else the system's. */
  language: Lang
}

function read(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value
}

function write(key: string, value: string) {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

export function autoVerifyEnabled(): boolean {
  return read(AUTO_VERIFY) !== 'off'
}

export function setAutoVerify(on: boolean) {
  write(AUTO_VERIFY, on ? 'on' : 'off')
}

/** Put the stored language in force. Called once the database is open. */
export function loadLanguage() {
  const stored = read(LANGUAGE)
  setLang(isLang(stored) ? stored : systemLang())
}

export function setLanguage(next: Lang) {
  write(LANGUAGE, next)
  setLang(next)
}

export function getSettings(): Settings {
  return { autoVerify: autoVerifyEnabled(), language: lang() }
}
