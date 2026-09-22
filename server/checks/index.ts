/**
 * The check pipeline.
 *
 * Adding a check is pushing one object into this array. Nothing downstream
 * changes — not the runner, not the persistence, not the UI, which renders
 * whatever badges come back.
 */
import { getDb, nowMs } from '../db.ts'
import { localIndexCheck, validityCheck } from './local.ts'
import { availabilityCheck, publishabilityCheck } from './registry.ts'
import { domainCheck, githubCheck, npmNeighbourhoodCheck } from './reach.ts'
import type { Check, CheckResult } from './types.ts'

export const CHECKS: Check[] = [
  validityCheck,
  localIndexCheck,
  availabilityCheck,
  npmNeighbourhoodCheck,
  publishabilityCheck,
  githubCheck,
  domainCheck,
]

export const CHECK_MANIFEST = CHECKS.map(c => ({
  id: c.id,
  label: c.label,
  tier: c.tier,
  when: c.when,
}))

export function persistCheck(candidateId: string, r: CheckResult) {
  getDb()
    .prepare(
      'INSERT INTO checks (candidateId, checkId, label, tier, status, headline, detail, data, checkedAt) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(candidateId, checkId) DO UPDATE SET status=excluded.status, headline=excluded.headline, ' +
        'detail=excluded.detail, data=excluded.data, checkedAt=excluded.checkedAt',
    )
    .run(
      candidateId,
      r.checkId,
      r.label,
      r.tier,
      r.status,
      r.headline,
      r.detail ?? null,
      r.data ? JSON.stringify(r.data) : null,
      nowMs(),
    )
}

/**
 * Put words to what a check found.
 *
 * Every reader goes through here, including the one loading rows written months
 * ago by a build whose wording has since been thrown out. The words come from
 * this build; only the facts come from the row. Rows too old to carry facts, and
 * rows recording a thrown exception, keep whatever they were written with —
 * there is nothing to re-derive them from.
 */
export function describeCheck(
  check: Check,
  data: Record<string, unknown> | undefined,
  name: string,
): CheckResult | null {
  const reading = data ? check.describe(data, name) : null
  if (!reading) return null
  return { checkId: check.id, label: check.label, tier: check.tier, ...reading, data }
}

/** A row as stored. `data` is still JSON at this point. */
export interface CheckRow {
  checkId: string
  label: string
  tier: string
  status: string
  headline: string
  detail: string | null
  data: string | null
}

const ROW_COLUMNS = 'checkId, label, tier, status, headline, detail, data'

/**
 * A stored row, read back as this build would say it.
 *
 * Null means this build would not show the check at all — a re-reading that
 * comes back empty makes the row stale, not authoritative.
 */
export function readCheckRow(row: CheckRow, name: string): CheckResult | null {
  let data: Record<string, unknown> | undefined
  try {
    data = row.data ? (JSON.parse(row.data) as Record<string, unknown>) : undefined
    const check = CHECKS.find(c => c.id === row.checkId)
    if (check && data) return describeCheck(check, data, name)
  } catch {
    // Facts written by a build whose shape this one no longer understands.
    // Falling back to the words stored beside them beats losing the check, and
    // beats a 500 on the whole session.
  }
  return {
    checkId: row.checkId,
    label: row.label,
    tier: row.tier as CheckResult['tier'],
    status: row.status as CheckResult['status'],
    headline: row.headline,
    detail: row.detail ?? undefined,
    data,
  }
}

export function loadChecks(candidateId: string, name: string): CheckResult[] {
  const rows = getDb()
    .prepare(`SELECT ${ROW_COLUMNS} FROM checks WHERE candidateId = ?`)
    .all(candidateId) as unknown as CheckRow[]
  return rows.map(r => readCheckRow(r, name)).filter((c): c is CheckResult => c !== null)
}

interface RunOpts {
  signal: AbortSignal
  onResult?: (r: CheckResult) => void
  /** A stored answer was erased because this run found nothing to say. */
  onGone?: (checkId: string) => void
}

/**
 * Run one tier's worth of checks for a name and hand each result back as it
 * lands. Checks never block one another and never throw into the caller.
 */
export async function runChecks(
  candidateId: string,
  name: string,
  opts: RunOpts & { deep?: boolean; all?: boolean },
): Promise<CheckResult[]> {
  const wanted = opts.all
    ? CHECKS
    : CHECKS.filter(c => (opts.deep ? c.when === 'after-upvote' : c.when === 'always'))
  return run(candidateId, name, wanted, opts.signal, opts.onResult, opts.onGone)
}

/**
 * Ask again for the answers that may have changed since the name was generated.
 *
 *   - Checks with no row at all, whatever their tier: a check added after a
 *     session was made has never run for the names already in it.
 *   - Every local check. `local-index` is fed by every registry answer this app
 *     receives, so a name that was unique when it was generated may collide
 *     with something learned since — and asking costs no network and no time.
 *
 * The networked tiers are left alone: three registries and an npm search for
 * every candidate on every session open is not free. They refresh on a recheck.
 *
 * Wording is not a reason to be here. That is re-derived on every read.
 */
export async function fillMissingChecks(
  candidateId: string,
  name: string,
  opts: RunOpts,
): Promise<CheckResult[]> {
  const rows = getDb()
    .prepare('SELECT checkId FROM checks WHERE candidateId = ?')
    .all(candidateId) as { checkId: string }[]
  const have = new Set(rows.map(r => r.checkId))
  const wanted = CHECKS.filter(c => (c.when === 'always' && !have.has(c.id)) || c.tier === 'local')
  if (wanted.length === 0) return []
  return run(candidateId, name, wanted, opts.signal, opts.onResult, opts.onGone)
}

async function run(
  candidateId: string,
  name: string,
  wanted: Check[],
  signal: AbortSignal,
  onResult?: (r: CheckResult) => void,
  onGone?: (checkId: string) => void,
): Promise<CheckResult[]> {
  const out: CheckResult[] = []
  await Promise.all(
    wanted.map(async check => {
      try {
        const data = await check.run({ name, deep: check.when === 'after-upvote', signal })
        const r = describeCheck(check, data ?? undefined, name)
        // Null means "nothing to say". On a re-run that has to erase what the
        // last run said, or the card keeps a finding this build no longer makes.
        if (!r) {
          const { changes } = getDb()
            .prepare('DELETE FROM checks WHERE candidateId = ? AND checkId = ?')
            .run(candidateId, check.id)
          if (changes > 0) onGone?.(check.id)
          return
        }
        persistCheck(candidateId, r)
        out.push(r)
        onResult?.(r)
      } catch (err) {
        const r: CheckResult = {
          checkId: check.id,
          label: check.label,
          tier: check.tier,
          status: 'error',
          headline: '检查失败',
          detail: err instanceof Error ? err.message : String(err),
        }
        persistCheck(candidateId, r)
        out.push(r)
        onResult?.(r)
      }
    }),
  )
  return out
}

export type { Check, CheckResult, CheckStatus, CheckTier } from './types.ts'
export { TIER_LABEL } from './types.ts'
