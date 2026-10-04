import { tr } from './i18n.ts'
import type { CheckResult } from './types.ts'
import { REGISTRIES } from './normalize.ts'
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
  if (c.checkId === 'github' && c.data?.rateLimited) return { ...c, headline: tr('暂时限流', 'Temporarily rate limited'), detail: undefined }
  if (c.checkId === 'neighbourhood' && c.data && name) {
    const { status, headline } = npmNeighbourhood(c.data, name, tr)
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
 * What the wall can be narrowed to by what the checks found. Worded the way the
 * cards word it — 查无记录, never "available" — because a filter is one more
 * place the same fact is stated.
 */
export const CHECK_CONDITIONS: { id: string; label: string; /** Inside 没有…的名字, where the label does not read. */ phrase?: string }[] = [
  { id: 'quiet', label: tr('没有发现', 'No findings'), phrase: tr('查重没有发现', 'No findings') },
  ...REGISTRIES.map(r => ({ id: r.id, label: tr(`${r.label} 查无记录`, `${r.label}: no record`) })),
  { id: 'com', label: tr('.com 查无注册记录', '.com: no record') },
]

/**
 * Which conditions hold for one name, and which have been asked at all. A
 * condition whose check has not answered does not hold: an unchecked name is
 * not one the checks found nothing on.
 *
 * A registry holds only if nothing on it shares the name, which is more than
 * the exact form being free: a writing that normalises to the same thing, from
 * the local index or the slow probe, refuses the name just the same.
 */
export function conditionsOf(checks: CheckResult[], name: string): { held: Set<string>; asked: Set<string> } {
  const held = new Set<string>()
  const asked = new Set<string>()
  const by = new Map(checks.map(c => [c.checkId, c]))

  const availability = by.get('availability')
  const answers: { id: string; state: string }[] = availability?.data?.registries ?? []
  if (answers.length > 0) {
    asked.add('quiet')
    if (availability!.status === 'clear' && groupChecks(checks, name).findings.length === 0) held.add('quiet')
  }
  const local: { registry: string }[] = by.get('local-index')?.data?.hits ?? []
  const probed: { id: string; collisions: string[] }[] = by.get('publishability')?.data?.perRegistry ?? []
  for (const r of REGISTRIES) {
    const state = answers.find(x => x.id === r.id)?.state
    if (!state) continue
    asked.add(r.id)
    if (
      state === 'clear' &&
      !local.some(h => h.registry === r.id) &&
      !probed.find(p => p.id === r.id)?.collisions.length
    )
      held.add(r.id)
  }

  const com = (by.get('domain')?.data?.results as { tld: string; state: string }[] | undefined)?.find(
    d => d.tld === 'com' && d.state !== 'unknown',
  )
  if (com) {
    asked.add('com')
    if (com.state === 'free') held.add('com')
  }
  return { held, asked }
}
