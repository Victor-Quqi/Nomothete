/**
 * Rationale verification: the stored outcome, plus in-memory transient states.
 *
 * Pending and "queue full" are never written. A job that dies with the
 * process leaves the last finished outcome (or nothing) behind, not a spinner
 * that never stops.
 */
import { getDb, nowMs } from '../db.ts'

/** `failed`: this claim's search or page reading failed, so it was not judged. */
export type ClaimVerdict = 'supported' | 'contradicted' | 'insufficient' | 'failed'

/** A cited source. The URL and title come from retrieval, never from the model. */
export interface SourceRef {
  url: string
  title: string
  /** A passage selected by the model from the retrieved text. */
  excerpt: string
}

export interface ClaimFinding {
  /** The factual claim as the rationale states it. */
  text: string
  /** Search terms, for the retrieval step and the browser search link. */
  query: string
  verdict: ClaimVerdict
  /** What the evidence shows. Absent for insufficient and failed. */
  note?: string
  /** Why retrieval failed or why the available evidence left the claim unresolved. */
  reason?: string
  sources: SourceRef[]
}

export type Verification =
  | { state: 'pending' }
  /** `claims` is empty when the rationale makes no checkable factual claim. */
  | { state: 'done'; claims: ClaimFinding[]; checkedAt: number }
  /** The search service or the model did not answer. Says nothing about the claims. */
  | { state: 'failed'; reason: string; checkedAt: number }

export type Outcome = Exclude<Verification, { state: 'pending' }>

export interface VerificationTrace {
  version: number
  startedAt: number
  elapsedMs?: number
  steps: { stage: string; data: unknown }[]
}

export function saveTrace(candidateId: string, trace: VerificationTrace) {
  getDb().prepare('INSERT INTO verification_traces (candidateId, data) VALUES (?, ?) ON CONFLICT(candidateId) DO UPDATE SET data=excluded.data')
    .run(candidateId, JSON.stringify(trace))
}

export function loadTrace(candidateId: string): VerificationTrace | null {
  const row = getDb().prepare('SELECT data FROM verification_traces WHERE candidateId=?').get(candidateId) as { data: string } | undefined
  return row ? JSON.parse(row.data) : null
}

/** Pending, or a request turned away because the queue was full. */
const transient = new Map<string, Verification>()

export function markPending(candidateId: string, on: boolean) {
  if (on) transient.set(candidateId, { state: 'pending' })
  else transient.delete(candidateId)
}

/** Shown until the next request; not stored, so a reload shows the stored outcome. */
export function markBusy(candidateId: string, reason: string) {
  transient.set(candidateId, { state: 'failed', reason, checkedAt: Date.now() })
}

export function isPending(candidateId: string): boolean {
  return transient.get(candidateId)?.state === 'pending'
}

export function transientState(candidateId: string): Verification | undefined {
  return transient.get(candidateId)
}

function parse(row: { state: string; data: string; checkedAt: number }): Outcome | null {
  try {
    const data = JSON.parse(row.data) as Record<string, unknown>
    if (row.state === 'done' && Array.isArray(data.claims)) {
      return { state: 'done', claims: data.claims as ClaimFinding[], checkedAt: row.checkedAt }
    }
    if (row.state === 'failed') {
      return { state: 'failed', reason: String(data.reason ?? ''), checkedAt: row.checkedAt }
    }
  } catch {
    // A row this build cannot read is treated as never checked.
  }
  return null
}

export function loadOutcome(candidateId: string): Outcome | null {
  const row = getDb()
    .prepare('SELECT state, data, checkedAt FROM verifications WHERE candidateId = ?')
    .get(candidateId) as { state: string; data: string; checkedAt: number } | undefined
  return row ? parse(row) : null
}

/** What a reader should see now: in-flight work wins over the stored outcome. */
export function readVerification(candidateId: string): Verification | null {
  return transient.get(candidateId) ?? loadOutcome(candidateId)
}

export function readSessionVerifications(sessionId: string): Map<string, Verification> {
  const rows = getDb()
    .prepare(
      'SELECT v.candidateId, v.state, v.data, v.checkedAt FROM verifications v ' +
        'JOIN candidates c ON c.id = v.candidateId WHERE c.sessionId = ?',
    )
    .all(sessionId) as { candidateId: string; state: string; data: string; checkedAt: number }[]
  const out = new Map<string, Verification>()
  for (const r of rows) {
    const v = parse(r)
    if (v) out.set(r.candidateId, v)
  }
  return out
}

/** Throws when the candidate no longer exists (foreign key). */
export function saveOutcome(candidateId: string, outcome: Outcome) {
  const data = outcome.state === 'done' ? { claims: outcome.claims } : { reason: outcome.reason }
  getDb()
    .prepare(
      'INSERT INTO verifications (candidateId, state, data, checkedAt) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(candidateId) DO UPDATE SET state = excluded.state, data = excluded.data, checkedAt = excluded.checkedAt',
    )
    .run(candidateId, outcome.state, JSON.stringify(data), outcome.checkedAt ?? nowMs())
}
