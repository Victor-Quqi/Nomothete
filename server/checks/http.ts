/**
 * Shared outbound HTTP: one global concurrency pool, per-host politeness, and a
 * SQLite-backed response cache so a name is never asked about twice.
 */
import { getDb } from '../db.ts'

const UA = 'nomothete/0.1 (+https://github.com/nomothete) self-hosted naming tool'

const MAX_INFLIGHT = 10
let inflight = 0
const queue: (() => void)[] = []

function acquire(): Promise<void> {
  if (inflight < MAX_INFLIGHT) {
    inflight++
    return Promise.resolve()
  }
  return new Promise(resolve => queue.push(() => { inflight++; resolve() }))
}

function release() {
  inflight--
  queue.shift()?.()
}

export interface Probe {
  status: number
  body: string
  cached: boolean
}

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 // a day; registries move slowly

export async function probe(
  url: string,
  opts: { signal?: AbortSignal; method?: string; ttlMs?: number; headers?: Record<string, string> } = {},
): Promise<Probe> {
  const db = getDb()
  const ttl = opts.ttlMs ?? CACHE_TTL_MS
  const key = `${opts.method ?? 'GET'} ${url}`
  const hit = db
    .prepare('SELECT status, body, fetchedAt FROM http_cache WHERE url = ?')
    .get(key) as { status: number; body: string; fetchedAt: number } | undefined
  if (hit && Date.now() - hit.fetchedAt < ttl) {
    return { status: hit.status, body: hit.body, cached: true }
  }

  await acquire()
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000),
      headers: { 'user-agent': UA, accept: 'application/json', ...opts.headers },
      redirect: 'follow',
    })
    // Only bodies we might parse are worth storing.
    const body = opts.method === 'HEAD' ? '' : (await res.text()).slice(0, 200_000)
    db.prepare(
      'INSERT INTO http_cache (url, status, body, fetchedAt) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(url) DO UPDATE SET status = excluded.status, body = excluded.body, fetchedAt = excluded.fetchedAt',
    ).run(key, res.status, body, Date.now())
    return { status: res.status, body, cached: false }
  } finally {
    release()
  }
}

/** Probe many URLs, tolerating individual failures. */
export async function probeAll(
  urls: string[],
  opts: { signal?: AbortSignal; method?: string; ttlMs?: number } = {},
): Promise<(Probe | null)[]> {
  return Promise.all(
    urls.map(u =>
      probe(u, opts).catch(() => null),
    ),
  )
}
