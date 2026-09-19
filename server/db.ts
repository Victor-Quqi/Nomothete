/**
 * SQLite, single file, written to the current working directory alongside the
 * config and the local index (docs/design.md → 形态与分发).
 *
 * Node 24 ships `node:sqlite`, so there is no native module to build — the
 * whole thing survives `npx` on a machine with no toolchain.
 */
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'

let db: DatabaseSync | null = null

export const DB_PATH = process.env.NOMOTHETE_DB ?? path.resolve(process.cwd(), 'nomothete.db')

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  brief       TEXT NOT NULL,
  seeds       TEXT NOT NULL DEFAULT '[]',   -- pre-filled Verdicts, as JSON
  priors      TEXT NOT NULL DEFAULT '[]',   -- active Prior ids
  threshold   REAL NOT NULL DEFAULT 0.5,
  generation  INTEGER NOT NULL DEFAULT 0,
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL
);

-- A Candidate is a node with a parentId. MVP leaves parentId null, which makes
-- the set a depth-1 tree that happens to render as a flat list. Preference is
-- an attribute of the node; rating never moves it.
CREATE TABLE IF NOT EXISTS candidates (
  id          TEXT PRIMARY KEY,
  sessionId   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  parentId    TEXT REFERENCES candidates(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  probability REAL NOT NULL,
  rationale   TEXT NOT NULL,
  strategyId  TEXT NOT NULL,
  generation  INTEGER NOT NULL,
  verdict     INTEGER NOT NULL DEFAULT 0,   -- -2 .. +2, 0 is the neutral rest
  note        TEXT,
  createdAt   INTEGER NOT NULL,
  verdictAt   INTEGER
);
CREATE INDEX IF NOT EXISTS candidates_session ON candidates(sessionId, createdAt);
CREATE UNIQUE INDEX IF NOT EXISTS candidates_unique_name ON candidates(sessionId, lower(name));

CREATE TABLE IF NOT EXISTS checks (
  candidateId TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  checkId     TEXT NOT NULL,
  label       TEXT NOT NULL,
  tier        TEXT NOT NULL,
  status      TEXT NOT NULL,
  headline    TEXT NOT NULL,
  detail      TEXT,
  data        TEXT,
  checkedAt   INTEGER NOT NULL,
  PRIMARY KEY (candidateId, checkId)
);

CREATE TABLE IF NOT EXISTS batches (
  id          TEXT PRIMARY KEY,
  sessionId   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  generation  INTEGER NOT NULL,
  strategyId  TEXT NOT NULL,
  state       TEXT NOT NULL,               -- running | done | failed
  kept        INTEGER NOT NULL DEFAULT 0,
  discarded   INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  createdAt   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS batches_session ON batches(sessionId, createdAt);

-- The local index. Every registry answer we ever receive is folded in here, so
-- the second question about a normalised form is answered in 0 ms. A full dump
-- can be ingested into the same table; see scripts/build-index.ts.
CREATE TABLE IF NOT EXISTS name_index (
  registry   TEXT NOT NULL,
  normalized TEXT NOT NULL,
  actual     TEXT NOT NULL,
  PRIMARY KEY (registry, normalized, actual)
);
CREATE INDEX IF NOT EXISTS name_index_lookup ON name_index(registry, normalized);

CREATE TABLE IF NOT EXISTS http_cache (
  url       TEXT PRIMARY KEY,
  status    INTEGER NOT NULL,
  body      TEXT NOT NULL,
  fetchedAt INTEGER NOT NULL
);

-- Sessions used to be handed a title cut from the first 20 characters of their
-- own brief, which is not a title but the same sentence again, one line up and
-- often mid-word. Clear those: an unnamed session shows its brief, once.
UPDATE sessions SET title = ''
 WHERE title <> ''
   AND (title = brief OR (title LIKE '%…' AND instr(brief, rtrim(title, '…')) = 1));

`

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH)
    db.exec(SCHEMA)
  }
  return db
}

export function closeDb() {
  db?.close()
  db = null
}

export function nowMs() {
  return Date.now()
}

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}
