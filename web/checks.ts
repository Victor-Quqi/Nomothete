import type { CheckResult } from './types.ts'
import { npmNeighbourhood } from '../shared/npmNeighbourhood.ts'

/**
 * The order checks are read in: what makes the name impossible, then what makes
 * it taken, then what makes it hard to find. Shared by the seals on a card and
 * the list in the drawer, so the two never disagree about which finding leads.
 */
const ORDER = [
  'validity',
  'availability',
  'local-index',
  'publishability',
  'neighbourhood',
  'github',
  'domain',
]

function rank(c: CheckResult): number {
  const i = ORDER.indexOf(c.checkId)
  return i < 0 ? ORDER.length : i
}

export function byCheckOrder(a: CheckResult, b: CheckResult): number {
  return rank(a) - rank(b)
}

/**
 * The words a check is shown with. Decided from `checkId` and `data`, never
 * from the stored sentence. A rate-limited GitHub search is a passing state,
 * not a setup task, so it reads as one and carries no configuration advice.
 */
export function presentCheck(c: CheckResult, name?: string): CheckResult {
  if (c.checkId === 'github' && c.data?.rateLimited) return { ...c, headline: '暂时限流', detail: undefined }
  if (c.checkId === 'neighbourhood' && c.data && name) {
    const { status, headline } = npmNeighbourhood(c.data, name)
    return { ...c, status, headline, detail: undefined }
  }
  return c
}

/**
 * One array for every candidate whose checks have not arrived, so `?? NO_CHECKS`
 * keeps a stable identity and the memo downstream of it holds.
 */
export const NO_CHECKS: CheckResult[] = []

export interface CheckGroups {
  /** Found something. This is what a reader opened the list for. */
  findings: CheckResult[]
  /** Came back empty — a fact, but a one-line one. */
  quiet: CheckResult[]
  /** Never got an answer. */
  failed: CheckResult[]
}

export function groupChecks(checks: CheckResult[], name?: string): CheckGroups {
  const sorted = checks.map(c => presentCheck(c, name)).sort(byCheckOrder)
  return {
    findings: sorted.filter(c => c.status !== 'clear' && c.status !== 'error' && c.status !== 'pending'),
    quiet: sorted.filter(c => c.status === 'clear'),
    failed: sorted.filter(c => c.status === 'error'),
  }
}

/** Whether the slow tier has answered for this name yet. */
export function deepDone(checks: CheckResult[]): boolean {
  return checks.some(c => c.tier === 'ratelimited')
}

/**
 * The slow tier is in flight: a ▲ or the button started it, and nothing from it
 * has come back. Both surfaces ask this the same way, so neither offers to start
 * a run that is already running.
 */
export function deepRunning(checks: CheckResult[], verdict: number, asked: boolean): boolean {
  return (verdict > 0 || asked) && !deepDone(checks)
}
