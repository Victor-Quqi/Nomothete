import type { ClaimFinding, Verification } from './types.ts'

/** A fixed public engine. The query is the claim's own search terms or the name; never the brief or a note. */
const SEARCH_URL = 'https://www.bing.com/search?q='
/** A URL-length limit, not an edit: the query is cut, never rewritten. */
const MAX_QUERY = 120

/** The claim's search terms as the model wrote them, or the name with a neutral term. */
export function browserQuery(name: string, claim?: ClaimFinding): string {
  return (claim?.query ? claim.query : `${name} etymology`).slice(0, MAX_QUERY)
}

export function searchUrl(query: string): string {
  return SEARCH_URL + encodeURIComponent(query)
}

export function browserSearchUrl(name: string, claim?: ClaimFinding): string {
  return searchUrl(browserQuery(name, claim))
}

/**
 * What a card says about the rationale: only a discrepancy with a cited
 * source. Progress, failures and inconclusive claims live in the details, so
 * the card is not a second status row next to the registry seals.
 */
export function discrepancyLine(v: Verification | null | undefined): string | null {
  if (v?.state !== 'done') return null
  const n = v.claims.filter(c => c.verdict === 'contradicted').length
  if (!n) return null
  return n === 1 ? '取义说明与资料不符' : `取义说明有 ${n} 处与资料不符`
}

/** Source host for a link label. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}
