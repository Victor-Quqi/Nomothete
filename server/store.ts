import { getDb, newId, nowMs } from './db.ts'
import { tr } from './i18n.ts'
import { loadChecks, readCheckRow } from './checks/index.ts'
import type { CheckResult } from './checks/types.ts'
import { DEFAULT_PRIOR_IDS } from './naming/priors.ts'
import { readSessionVerifications, readVerification, transientState, type Verification } from './verify/store.ts'

export type Verdict = -2 | -1 | 0 | 1 | 2

export interface Seed {
  text: string
  verdict: Verdict
  note?: string
}

export interface Session {
  id: string
  title: string
  pinned: boolean
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
  /** Rationale verification. Separate from `checks`, which are registry answers. */
  verification?: Verification | null
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
  /** What the user typed for this batch, if anything. */
  direction: string | null
  /** The Candidate this batch follows, if it was asked for from one. */
  parentId: string | null
}

/** A name the rarity floor turned away: a Candidate's facts, minus all it gathers later. */
export interface Discard {
  id: string
  sessionId: string
  parentId: string | null
  name: string
  probability: number
  rationale: string
  strategyId: string
  generation: number
  createdAt: number
}

// ── sessions ────────────────────────────────────────────────────────────────

function rowToSession(r: any): Session {
  return {
    id: r.id,
    title: r.title,
    pinned: Boolean(r.pinned),
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
      // Empty unless someone named it. A title cut from the brief's own opening
      // is not a title — it is the same sentence again, one line up.
      input.title?.trim() ?? '',
      input.brief,
      JSON.stringify(input.seeds ?? []),
      JSON.stringify(input.priors ?? DEFAULT_PRIOR_IDS),
      input.threshold ?? 0.5,
      t,
      t,
    )
  return getSession(id)!
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
       FROM sessions s ORDER BY s.pinned DESC, s.updatedAt DESC`,
    )
    .all() as any[]
  return rows.map(r => ({ ...rowToSession(r), candidateCount: r.candidateCount, lovedCount: r.lovedCount }))
}

export function touchSession(id: string) {
  getDb().prepare('UPDATE sessions SET updatedAt = ? WHERE id = ?').run(nowMs(), id)
}

export function updateSession(id: string, patch: Partial<Pick<Session, 'title' | 'priors' | 'threshold' | 'brief' | 'pinned'>>) {
  const s = getSession(id)
  if (!s) return null
  getDb()
    .prepare('UPDATE sessions SET title = ?, brief = ?, priors = ?, threshold = ?, pinned = ?, updatedAt = ? WHERE id = ?')
    .run(
      patch.title ?? s.title,
      patch.brief ?? s.brief,
      JSON.stringify(patch.priors ?? s.priors),
      patch.threshold ?? s.threshold,
      Number(patch.pinned ?? s.pinned),
      Object.keys(patch).some(key => key !== 'pinned' && patch[key as keyof typeof patch] !== undefined) ? nowMs() : s.updatedAt,
      id,
    )
  return getSession(id)
}

/**
 * The model's label for a session. Deliberately not `updateSession`: that
 * stamps updatedAt, and a session being labelled is not the user touching it —
 * the rail would reorder itself under the pointer for nothing.
 */
export function setSessionTitle(id: string, title: string) {
  getDb().prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, id)
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
  c.checks = loadChecks(c.id, c.name)
  c.verification = readVerification(c.id)
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
  // One query for the whole wall, then the same re-reading loadChecks does for
  // a single candidate: the row supplies the facts, this build supplies the
  // words. Reword a check and all two hundred cards agree on the next render.
  const nameById = new Map(all.map(c => [c.id, c.name]))
  const byCandidate = new Map<string, CheckResult[]>()
  for (const r of checkRows) {
    const result = readCheckRow(r, nameById.get(r.candidateId) ?? '')
    if (!result) continue
    byCandidate.set(r.candidateId, [...(byCandidate.get(r.candidateId) ?? []), result])
  }
  const verifications = readSessionVerifications(sessionId)
  for (const c of all) {
    c.checks = byCandidate.get(c.id) ?? []
    c.verification = transientState(c.id) ?? verifications.get(c.id) ?? null
  }
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

/**
 * Two names that differ only in case or punctuation are one name: every
 * registry folds them together, and the prompt already asks for no respellings.
 */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Every name this session has seen, kept or turned away, as keys. */
export function seenKeys(sessionId: string): Set<string> {
  const rows = getDb()
    .prepare('SELECT name FROM candidates WHERE sessionId = ? UNION ALL SELECT name FROM discards WHERE sessionId = ?')
    .all(sessionId, sessionId) as { name: string }[]
  return new Set(rows.map(r => nameKey(r.name)))
}

const EXCLUSION_CAP = 300

/**
 * The names a batch is told not to offer. Repeats come mostly from the same
 * Strategy, which hands the model the same word material each time, so all of
 * its own names go first, kept or turned away. Then every name the user rated,
 * then the most recent of the rest.
 */
export function exclusionsFor(sessionId: string, strategyId: string): string[] {
  const db = getDb()
  const own = db
    .prepare(
      'SELECT name, createdAt FROM candidates WHERE sessionId = ? AND strategyId = ? ' +
        'UNION ALL SELECT name, createdAt FROM discards WHERE sessionId = ? AND strategyId = ? ORDER BY createdAt DESC',
    )
    .all(sessionId, strategyId, sessionId, strategyId) as { name: string }[]
  const rated = db
    .prepare('SELECT name FROM candidates WHERE sessionId = ? AND verdict != 0 ORDER BY verdictAt DESC')
    .all(sessionId) as { name: string }[]
  const recent = db
    .prepare(
      'SELECT name, createdAt FROM candidates WHERE sessionId = ? ' +
        'UNION ALL SELECT name, createdAt FROM discards WHERE sessionId = ? ORDER BY createdAt DESC',
    )
    .all(sessionId, sessionId) as { name: string }[]
  const out = new Map<string, string>()
  for (const { name } of [...own, ...rated, ...recent]) {
    if (out.size >= EXCLUSION_CAP) break
    const key = nameKey(name)
    if (!out.has(key)) out.set(key, name)
  }
  return [...out.values()]
}

// ── discards ────────────────────────────────────────────────────────────────

export function insertDiscard(input: Omit<Discard, 'id' | 'createdAt'>): Discard | null {
  const discard: Discard = { ...input, id: newId('d'), createdAt: nowMs() }
  try {
    getDb()
      .prepare(
        'INSERT INTO discards (id, sessionId, parentId, name, probability, rationale, strategyId, generation, createdAt) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        discard.id,
        discard.sessionId,
        discard.parentId,
        discard.name,
        discard.probability,
        discard.rationale,
        discard.strategyId,
        discard.generation,
        discard.createdAt,
      )
  } catch {
    return null // unique index on (sessionId, lower(name))
  }
  return discard
}

export function listDiscards(sessionId: string): Discard[] {
  return getDb()
    .prepare('SELECT * FROM discards WHERE sessionId = ? ORDER BY createdAt ASC')
    .all(sessionId) as any as Discard[]
}

/** Move a turned-away name onto the wall, where it starts unrated like any other. */
export function keepDiscard(id: string): Candidate | null {
  const db = getDb()
  const d = db.prepare('SELECT * FROM discards WHERE id = ?').get(id) as any as Discard | undefined
  if (!d) return null
  const candidate = insertCandidate({
    sessionId: d.sessionId,
    parentId: d.parentId && getCandidate(d.parentId) ? d.parentId : null,
    name: d.name,
    probability: d.probability,
    rationale: d.rationale,
    strategyId: d.strategyId,
    generation: d.generation,
  })
  if (!candidate) return null
  db.prepare('DELETE FROM discards WHERE id = ?').run(id)
  touchSession(d.sessionId)
  return candidate
}

// ── batches ─────────────────────────────────────────────────────────────────

export function createBatch(
  sessionId: string,
  generation: number,
  strategyId: string,
  ask: { direction?: string | null; parentId?: string | null } = {},
): Batch {
  const id = newId('b')
  getDb()
    .prepare(
      'INSERT INTO batches (id, sessionId, generation, strategyId, state, kept, discarded, createdAt, direction, parentId) ' +
        "VALUES (?, ?, ?, ?, 'running', 0, 0, ?, ?, ?)",
    )
    .run(id, sessionId, generation, strategyId, nowMs(), ask.direction ?? null, ask.parentId ?? null)
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
    .prepare("UPDATE batches SET state = 'failed', error = ? WHERE state = 'running'")
    .run(tr('服务重启，这一批被中断', 'The server restarted, so this batch was interrupted.'))
}
