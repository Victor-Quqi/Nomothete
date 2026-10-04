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

-- Rationale verification. Kept apart from checks: a supported etymology says
-- nothing about registries, and must never count as a registry answer.
-- Only finished outcomes are stored; pending lives in memory, so a restart
-- cannot leave a card waiting forever.
CREATE TABLE IF NOT EXISTS verifications (
  candidateId TEXT PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  state       TEXT NOT NULL,               -- done | failed
  data        TEXT NOT NULL,
  checkedAt   INTEGER NOT NULL
);

-- Global switches the UI edits. Not .env: these must stay editable when the
-- model configuration comes from nomothete.config.json.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Latest bounded verification trace, for diagnosing retrieval and citation failures.
-- Kept out of candidate payloads and generation context.
CREATE TABLE IF NOT EXISTS verification_traces (
  candidateId TEXT PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  data TEXT NOT NULL
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

-- Names the rarity floor turned away. Kept so that later batches are told not
-- to offer them again, and so that one can be taken back onto the wall.
CREATE TABLE IF NOT EXISTS discards (
  id          TEXT PRIMARY KEY,
  sessionId   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  parentId    TEXT,
  name        TEXT NOT NULL,
  probability REAL NOT NULL,
  rationale   TEXT NOT NULL,
  strategyId  TEXT NOT NULL,
  generation  INTEGER NOT NULL,
  createdAt   INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS discards_unique_name ON discards(sessionId, lower(name));

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

-- Every name here has a capital and npm has no uppercase packages, so the old
-- checks judged Agemux by npm's rules, marked it illegal, and skipped the one
-- request that would have said whether agemux is free. Drop both answers.
-- Opening the session asks again, about the string npm would actually be given.
DELETE FROM checks
 WHERE checkId = 'validity'
   AND data LIKE '%npm 不接受大写%'
   AND data NOT LIKE '%},{%';
DELETE FROM checks
 WHERE checkId = 'availability'
   AND data LIKE '%"id":"npm","label":"npm","state":"invalid"%';

-- Rate-limit and server-error responses were cached for a day alongside real
-- answers, so half the npm searches stayed unasked until tomorrow. They are not
-- stored any more; drop the ones already in here.
DELETE FROM http_cache WHERE status >= 400 AND status <> 404;

-- Remove stored results for the retired word-frequency check.
DELETE FROM checks WHERE checkId = 'dictionary';
`

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH)
    db.exec(SCHEMA)
    const columns = db.prepare('PRAGMA table_info(sessions)').all()
    if (!columns.some(column => column.name === 'pinned')) {
      // Clear legacy generated labels once, preserving later manual renames.
      db.exec(`
        BEGIN;
        UPDATE sessions SET title = ''
          WHERE title <> ''
            AND (title = brief OR (title LIKE '%…' AND instr(brief, rtrim(title, '…')) = 1));
        ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
        COMMIT;
      `)
    }
    // What a batch was asked for beyond its Strategy: a direction typed for it,
    // or the name it follows.
    const batchColumns = db.prepare('PRAGMA table_info(batches)').all()
    if (!batchColumns.some(column => column.name === 'direction')) {
      db.exec('ALTER TABLE batches ADD COLUMN direction TEXT; ALTER TABLE batches ADD COLUMN parentId TEXT;')
    }
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
