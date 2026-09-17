import { getDb, newId, nowMs } from './db.ts'
import { loadChecks } from './checks/index.ts'
import type { CheckResult } from './checks/types.ts'
import { DEFAULT_PRIOR_IDS } from './naming/priors.ts'

export type Verdict = -2 | -1 | 0 | 1 | 2

export interface Seed {
  text: string
  verdict: Verdict
  note?: string
}

export interface Session {
  id: string
  title: string
  brief: string
  seeds: Seed[]
  priors: string[]
  threshold: number
  generation: number
  createdAt: number
  updatedAt: number
}

export interface Candidate {
  id: string
  sessionId: string
  parentId: string | null
  name: string
  probability: number
  rationale: string
  strategyId: string
  generation: number
  verdict: Verdict
  note: string | null
  createdAt: number
  verdictAt: number | null
  checks?: CheckResult[]
}

export interface Batch {
  id: string
  sessionId: string
  generation: number
  strategyId: string
  state: 'running' | 'done' | 'failed'
  kept: number
  discarded: number
  error: string | null
  createdAt: number
}

// ── sessions ────────────────────────────────────────────────────────────────

function rowToSession(r: any): Session {
  return {
    id: r.id,
    title: r.title,
    brief: r.brief,
    seeds: JSON.parse(r.seeds),
    priors: JSON.parse(r.priors),
    threshold: r.threshold,
    generation: r.generation,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export function createSession(input: {
  brief: string
  title?: string
  seeds?: Seed[]
  priors?: string[]
  threshold?: number
}): Session {
  const id = newId('s')
  const t = nowMs()
  getDb()
    .prepare(
      'INSERT INTO sessions (id, title, brief, seeds, priors, threshold, generation, createdAt, updatedAt) ' +
        'VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
    )
    .run(
      id,
      input.title?.trim() || deriveTitle(input.brief),
      input.brief,
      JSON.stringify(input.seeds ?? []),
      JSON.stringify(input.priors ?? DEFAULT_PRIOR_IDS),
      input.threshold ?? 0.5,
      t,
      t,
    )
  return getSession(id)!
}

function deriveTitle(brief: string): string {
  // The title sits directly above the brief in the UI. If it is merely the
  // brief's opening again the two lines read as a stutter, so cut at the first
  // clause — usually the noun phrase that says what the thing is.
  const flat = brief.trim().replace(/\s+/g, ' ')
  const clause = flat.split(/[\n。.!?？！，,;；:：]/).find(s => s.trim().length > 0) ?? flat
  const t = clause.trim()
  if (!t) return '未命名会话'
  return t.length > 20 ? t.slice(0, 20) + '…' : t
}

export function getSession(id: string): Session | null {
  const r = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  return r ? rowToSession(r) : null
}

export function listSessions(): (Session & { candidateCount: number; lovedCount: number })[] {
  const rows = getDb()
    .prepare(
      `SELECT s.*,
              (SELECT COUNT(*) FROM candidates c WHERE c.sessionId = s.id) AS candidateCount,
              (SELECT COUNT(*) FROM candidates c WHERE c.sessionId = s.id AND c.verdict > 0) AS lovedCount
       FROM sessions s ORDER BY s.updatedAt DESC`,
    )
    .all() as any[]
  return rows.map(r => ({ ...rowToSession(r), candidateCount: r.candidateCount, lovedCount: r.lovedCount }))
}

export function touchSession(id: string) {
  getDb().prepare('UPDATE sessions SET updatedAt = ? WHERE id = ?').run(nowMs(), id)
}

export function updateSession(id: string, patch: Partial<Pick<Session, 'title' | 'priors' | 'threshold' | 'brief'>>) {
  const s = getSession(id)
  if (!s) return null
  getDb()
    .prepare('UPDATE sessions SET title = ?, brief = ?, priors = ?, threshold = ?, updatedAt = ? WHERE id = ?')
    .run(
      patch.title ?? s.title,
      patch.brief ?? s.brief,
      JSON.stringify(patch.priors ?? s.priors),
      patch.threshold ?? s.threshold,
      nowMs(),
      id,
    )
  return getSession(id)
}

export function deleteSession(id: string) {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

export function bumpGeneration(id: string): number {
  const db = getDb()
  db.prepare('UPDATE sessions SET generation = generation + 1, updatedAt = ? WHERE id = ?').run(nowMs(), id)
  const r = db.prepare('SELECT generation FROM sessions WHERE id = ?').get(id) as { generation: number }
  return r.generation
}

// ── candidates ──────────────────────────────────────────────────────────────

function rowToCandidate(r: any): Candidate {
  return {
    id: r.id,
    sessionId: r.sessionId,
    parentId: r.parentId,
    name: r.name,
    probability: r.probability,
    rationale: r.rationale,
    strategyId: r.strategyId,
    generation: r.generation,
    verdict: r.verdict as Verdict,
    note: r.note,
    createdAt: r.createdAt,
    verdictAt: r.verdictAt,
  }
}

/** Returns null when this session already holds the name — dedup is a unique index. */
export function insertCandidate(input: {
  sessionId: string
  name: string
  probability: number
  rationale: string
  strategyId: string
  generation: number
  parentId?: string | null
}): Candidate | null {
  const id = newId('c')
  try {
    getDb()
      .prepare(
        'INSERT INTO candidates (id, sessionId, parentId, name, probability, rationale, strategyId, generation, verdict, createdAt) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
      )
      .run(
        id,
        input.sessionId,
        input.parentId ?? null,
        input.name,
        input.probability,
        input.rationale,
        input.strategyId,
        input.generation,
        nowMs(),
      )
  } catch {
    return null // unique index on (sessionId, lower(name))
  }
  return getCandidate(id)
}

export function getCandidate(id: string): Candidate | null {
  const r = getDb().prepare('SELECT * FROM candidates WHERE id = ?').get(id)
  if (!r) return null
  const c = rowToCandidate(r)
  c.checks = loadChecks(c.id)
  return c
}

export function listCandidates(sessionId: string): Candidate[] {
  const rows = getDb()
    .prepare('SELECT * FROM candidates WHERE sessionId = ? ORDER BY createdAt ASC')
    .all(sessionId) as any[]
  const all = rows.map(rowToCandidate)
  const checkRows = getDb()
    .prepare(
      'SELECT c.* FROM checks c JOIN candidates n ON n.id = c.candidateId WHERE n.sessionId = ?',
    )
    .all(sessionId) as any[]
  const byCandidate = new Map<string, CheckResult[]>()
  for (const r of checkRows) {
    const list = byCandidate.get(r.candidateId) ?? []
    list.push({
      checkId: r.checkId,
      label: r.label,
      tier: r.tier,
      status: r.status,
      headline: r.headline,
      detail: r.detail ?? undefined,
      data: r.data ? JSON.parse(r.data) : undefined,
    })
    byCandidate.set(r.candidateId, list)
  }
  for (const c of all) c.checks = byCandidate.get(c.id) ?? []
  return all
}

export function setVerdict(id: string, verdict: Verdict, note?: string | null): Candidate | null {
  getDb()
    .prepare('UPDATE candidates SET verdict = ?, note = COALESCE(?, note), verdictAt = ? WHERE id = ?')
    .run(verdict, note ?? null, verdict === 0 ? null : nowMs(), id)
  const c = getCandidate(id)
  if (c) touchSession(c.sessionId)
  return c
}

export function setNote(id: string, note: string): Candidate | null {
  getDb().prepare('UPDATE candidates SET note = ? WHERE id = ?').run(note, id)
  return getCandidate(id)
}

export function existingNames(sessionId: string): string[] {
  const rows = getDb().prepare('SELECT name FROM candidates WHERE sessionId = ?').all(sessionId) as { name: string }[]
  return rows.map(r => r.name)
}

// ── batches ─────────────────────────────────────────────────────────────────

export function createBatch(sessionId: string, generation: number, strategyId: string): Batch {
  const id = newId('b')
  getDb()
    .prepare(
      'INSERT INTO batches (id, sessionId, generation, strategyId, state, kept, discarded, createdAt) ' +
        "VALUES (?, ?, ?, ?, 'running', 0, 0, ?)",
    )
    .run(id, sessionId, generation, strategyId, nowMs())
  return getBatch(id)!
}

export function getBatch(id: string): Batch | null {
  const r = getDb().prepare('SELECT * FROM batches WHERE id = ?').get(id) as any
  return r ? (r as Batch) : null
}

export function finishBatch(id: string, state: 'done' | 'failed', kept: number, discarded: number, error?: string) {
  getDb()
    .prepare('UPDATE batches SET state = ?, kept = ?, discarded = ?, error = ? WHERE id = ?')
    .run(state, kept, discarded, error ?? null, id)
}

export function listBatches(sessionId: string): Batch[] {
  return getDb()
    .prepare('SELECT * FROM batches WHERE sessionId = ? ORDER BY createdAt ASC')
    .all(sessionId) as any as Batch[]
}

/** Anything left `running` when the process died is not running any more. */
export function reconcileBatches() {
  getDb()
    .prepare("UPDATE batches SET state = 'failed', error = '服务重启，这一批被中断' WHERE state = 'running'")
    .run()
}
