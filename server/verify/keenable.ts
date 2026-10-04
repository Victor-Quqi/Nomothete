/**
 * Keenable's keyless public search and fetch.
 *
 * The public tier allows 1,000 requests an hour and 10 a second per egress IP,
 * shared between search and fetch. This client stays under both on its own and
 * stops asking while a 429's Retry-After runs. Docs: https://docs.keenable.ai
 */

import { tr } from '../i18n.ts'

const BASE = 'https://api.keenable.ai/v1'
const HEADERS = { 'X-Keenable-Title': 'Nomothete' }

const TIMEOUT_MS = 12_000
/** Seven a second at most, under the ten the tier allows. */
const MIN_GAP_MS = 150
/** Headroom under the hourly 1,000 for anything else on the same IP. */
const HOURLY_CAP = 900
const DEFAULT_RETRY_S = 60

export class KeenableError extends Error {
  readonly kind: 'rate-limited' | 'unavailable'
  constructor(kind: 'rate-limited' | 'unavailable', message: string) {
    super(message)
    this.kind = kind
  }
}

export interface SearchHit {
  url: string
  title: string
  snippet: string
}

export interface Page {
  url: string
  title: string
  content: string
}

let nextAt = 0
let blockedUntil = 0
const sent: number[] = []

/** Tests only. */
export function resetKeenableLimits() {
  nextAt = 0
  blockedUntil = 0
  sent.length = 0
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const t = setTimeout(done, ms)
    function done() {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    function onAbort() {
      clearTimeout(t)
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function slot(signal: AbortSignal) {
  const now = Date.now()
  if (blockedUntil > now) {
    throw new KeenableError('rate-limited', tr(`联网搜索已达频率上限，约 ${Math.ceil((blockedUntil - now) / 60_000)} 分钟后再试`, `Web search rate limit reached. Try again in about ${Math.ceil((blockedUntil - now) / 60_000)} ${Math.ceil((blockedUntil - now) / 60_000) === 1 ? 'minute' : 'minutes'}.`))
  }
  while (sent.length && now - sent[0] > 3_600_000) sent.shift()
  if (sent.length >= HOURLY_CAP) throw new KeenableError('rate-limited', tr('联网搜索已达每小时上限，稍后再试', 'Web search hourly limit reached. Try again later.'))
  const at = Math.max(now, nextAt)
  nextAt = at + MIN_GAP_MS
  sent.push(at)
  if (at > now) await sleep(at - now, signal)
}

function retryAfterMs(header: string | null): number {
  if (!header) return DEFAULT_RETRY_S * 1000
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(1, seconds) * 1000
  const date = Date.parse(header)
  return Number.isFinite(date) ? Math.max(1000, date - Date.now()) : DEFAULT_RETRY_S * 1000
}

async function call(url: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
  await slot(signal)
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) })
  } catch (err) {
    if (signal.aborted) throw err
    throw new KeenableError('unavailable', tr('联网搜索没有响应', 'Web search did not respond.'))
  }
  if (res.status === 429) {
    blockedUntil = Date.now() + retryAfterMs(res.headers.get('retry-after'))
    await res.body?.cancel().catch(() => {})
    throw new KeenableError('rate-limited', tr('联网搜索已达频率上限，稍后再试', 'Web search rate limit reached. Try again later.'))
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {})
    throw new KeenableError('unavailable', tr(`联网搜索返回 ${res.status}`, `Web search returned status ${res.status}.`))
  }
  try {
    return await res.json()
  } catch {
    throw new KeenableError('unavailable', tr('联网搜索返回的内容无法读取', 'Could not read the web search response.'))
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

function httpUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

export async function search(
  input: { query: string; site?: string; maxResults: number; snippetChars: number },
  signal: AbortSignal,
): Promise<SearchHit[]> {
  const body: Record<string, unknown> = {
    query: input.query,
    max_results: input.maxResults,
    snippet_max_length: input.snippetChars,
  }
  if (input.site) body.site = input.site
  const data = (await call(
    `${BASE}/search/public`,
    { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    signal,
  )) as { results?: unknown }
  if (!Array.isArray(data?.results)) throw new KeenableError('unavailable', tr('联网搜索返回的内容无法读取', 'Could not read the web search response.'))
  const out: SearchHit[] = []
  for (const r of data.results as Record<string, unknown>[]) {
    const url = httpUrl(str(r?.url))
    if (!url) continue
    out.push({ url, title: str(r.title), snippet: [str(r.description), str(r.snippet)].filter(Boolean).join('\n') })
  }
  return out
}

/**
 * Raw page text. `prompt` is never sent: it asks the provider to write an
 * extraction, and the evidence has to be the source's own words.
 */
export async function fetchPage(input: { url: string; maxChars: number }, signal: AbortSignal): Promise<Page> {
  const url = httpUrl(input.url)
  if (!url) throw new KeenableError('unavailable', tr('资料链接不是网页地址', 'The reference link is not a web address.'))
  const q = new URLSearchParams({ url, max_chars: String(input.maxChars) })
  const data = (await call(`${BASE}/fetch/public?${q}`, { headers: HEADERS }, signal)) as Record<string, unknown>
  const content = str(data?.content)
  if (!content) throw new KeenableError('unavailable', tr('页面没有可读内容', 'The page has no readable content.'))
  return { url: httpUrl(str(data.url)) ?? url, title: str(data.title), content }
}
