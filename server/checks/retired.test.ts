import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('retired word checks are removed from storage, candidate payloads and taste', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nomothete-checks-'))
  process.env.NOMOTHETE_DB = join(dir, 'test.db')
  const { closeDb, getDb } = await import('../db.ts')
  const { createSession, getCandidate, listCandidates } = await import('../store.ts')
  const { checkManifest, persistCheck } = await import('./index.ts')
  const { buildProfile } = await import('../naming/taste.ts')
  try {
    const session = createSession({ brief: 'Migration test' })
    getDb().prepare(`INSERT INTO candidates
      (id, sessionId, name, probability, rationale, strategyId, generation, createdAt)
      VALUES ('candidate', ?, 'Example', 0.1, '', 'root', 1, 1)`).run(session.id)
    persistCheck('candidate', {
      checkId: 'dictionary', label: 'Retired', tier: 'local', status: 'clear',
      headline: 'Legacy result', data: { rank: null, total: 8000 },
    })
    persistCheck('candidate', {
      checkId: 'availability', label: 'Registry', tier: 'free', status: 'error',
      headline: 'Preserve this result',
    })
    closeDb()
    assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM checks WHERE checkId = 'dictionary'").get()?.n, 0)
    assert.deepEqual(getCandidate('candidate')?.checks?.map(c => c.checkId), ['availability'])
    assert.deepEqual(listCandidates(session.id)[0].checks?.map(c => c.checkId), ['availability'])
    assert.ok(!checkManifest().some(c => c.id === 'dictionary'))
    const profile = buildProfile([], ['time', 'work', 'world', 'home'].map(text => ({ text, verdict: 2 })))
    assert.ok(!profile.traits.some(t => t.id === 'realword'))
    assert.equal(profile.positives, 4)
    assert.ok(profile.traits.some(t => t.id === 'length'))
    closeDb()
    assert.equal(getCandidate('candidate')?.checks?.length, 1)
  } finally {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  }
})
