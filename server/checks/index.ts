/**
 * The check pipeline.
 *
 * Adding a check is pushing one object into this array. Nothing downstream
 * changes — not the runner, not the persistence, not the UI, which renders
 * whatever badges come back.
 */
import { getDb, nowMs } from '../db.ts'
import { dictionaryCheck, localIndexCheck, validityCheck } from './local.ts'
import { availabilityCheck, publishabilityCheck } from './registry.ts'
import { domainCheck, githubCheck, npmNeighbourhoodCheck } from './reach.ts'
import type { Check, CheckResult } from './types.ts'

export const CHECKS: Check[] = [
  validityCheck,
  dictionaryCheck,
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

export function loadChecks(candidateId: string): CheckResult[] {
  const rows = getDb()
    .prepare('SELECT checkId, label, tier, status, headline, detail, data FROM checks WHERE candidateId = ?')
    .all(candidateId) as {
    checkId: string; label: string; tier: string; status: string
    headline: string; detail: string | null; data: string | null
  }[]
  return rows.map(r => ({
    checkId: r.checkId,
    label: r.label,
    tier: r.tier as CheckResult['tier'],
    status: r.status as CheckResult['status'],
    headline: r.headline,
    detail: r.detail ?? undefined,
    data: r.data ? JSON.parse(r.data) : undefined,
  }))
}

/**
 * Run one tier's worth of checks for a name and hand each result back as it
 * lands. Checks never block one another and never throw into the caller.
 */
export async function runChecks(
  candidateId: string,
  name: string,
  opts: { deep: boolean; signal: AbortSignal; onResult?: (r: CheckResult) => void },
): Promise<CheckResult[]> {
  const wanted = CHECKS.filter(c => (opts.deep ? c.when === 'after-upvote' : c.when === 'always'))
  return run(candidateId, name, wanted, opts.signal, opts.onResult)
}

/**
 * Run the always-checks this candidate has no stored answer for.
 *
 * A check writes its row once, when the name is generated. Add a check later,
 * or delete an answer that a newer build knows was wrong, and the card keeps
 * showing the old set until something asks again. This is that something.
 */
export async function fillMissingChecks(
  candidateId: string,
  name: string,
  opts: { signal: AbortSignal; onResult?: (r: CheckResult) => void },
): Promise<CheckResult[]> {
  const rows = getDb()
    .prepare('SELECT checkId FROM checks WHERE candidateId = ?')
    .all(candidateId) as { checkId: string }[]
  const have = new Set(rows.map(r => r.checkId))
  const missing = CHECKS.filter(c => c.when === 'always' && !have.has(c.id))
  if (missing.length === 0) return []
  return run(candidateId, name, missing, opts.signal, opts.onResult)
}

async function run(
  candidateId: string,
  name: string,
  wanted: Check[],
  signal: AbortSignal,
  onResult?: (r: CheckResult) => void,
): Promise<CheckResult[]> {
  const out: CheckResult[] = []
  await Promise.all(
    wanted.map(async check => {
      try {
        const r = await check.run({ name, deep: check.when === 'after-upvote', signal })
        if (!r) return
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
