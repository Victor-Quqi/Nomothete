import type { CheckResult } from './types.ts'

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
  'dictionary',
]

function rank(c: CheckResult): number {
  const i = ORDER.indexOf(c.checkId)
  return i < 0 ? ORDER.length : i
}

export function byCheckOrder(a: CheckResult, b: CheckResult): number {
  return rank(a) - rank(b)
}
