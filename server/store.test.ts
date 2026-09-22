import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

test('session migration, pin ordering, rename persistence and deletion', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nomothete-sessions-'))
  process.env.NOMOTHETE_DB = join(dir, 'test.db')
  const legacy = new DatabaseSync(process.env.NOMOTHETE_DB)
  legacy.exec(`CREATE TABLE sessions (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, brief TEXT NOT NULL,
    seeds TEXT NOT NULL DEFAULT '[]', priors TEXT NOT NULL DEFAULT '[]',
    threshold REAL NOT NULL DEFAULT 0.5, generation INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
  ); INSERT INTO sessions VALUES ('legacy', 'old', 'old', '[]', '[]', 0.5, 0, 1, 1);`)
  legacy.close()
  const { closeDb, getDb } = await import('./db.ts')
  const { createSession, getSession, listSessions, updateSession, deleteSession } = await import('./store.ts')
  try {
    assert.equal(getSession('legacy')?.pinned, false)
    assert.equal(getSession('legacy')?.title, '')
    const recent = createSession({ brief: 'New project' })
    updateSession('legacy', { pinned: true })
    assert.equal(listSessions()[0].id, 'legacy')
    assert.equal(getSession('legacy')?.updatedAt, 1)
    closeDb()
    assert.equal(getSession('legacy')?.pinned, true)
    updateSession('legacy', { pinned: false })
    assert.equal(listSessions()[0].id, recent.id)
    updateSession('legacy', { title: 'old' })
    closeDb()
    assert.equal(getSession('legacy')?.title, 'old')
    getDb().prepare(`INSERT INTO candidates
      (id, sessionId, name, probability, rationale, strategyId, generation, createdAt)
      VALUES ('candidate', 'legacy', 'Example', 0.1, '', 'root', 1, 1)`).run()
    deleteSession('legacy')
    assert.equal(getSession('legacy'), null)
    assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM candidates').get()?.n, 0)
    assert.ok(getSession(recent.id))
  } finally {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  }
})
