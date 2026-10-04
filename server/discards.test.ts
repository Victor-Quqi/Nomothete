import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('turned-away names are excluded, deduplicated and can be kept', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nomothete-discards-'))
  process.env.NOMOTHETE_DB = join(dir, 'test.db')
  const { closeDb } = await import('./db.ts')
  const store = await import('./store.ts')
  try {
    const s = store.createSession({ brief: 'A tool' })
    const base = { sessionId: s.id, parentId: null, probability: 0.1, rationale: 'why', generation: 1 }
    const other = store.insertCandidate({ ...base, name: 'Ashlar', strategyId: 'masonry' })!
    store.insertCandidate({ ...base, name: 'Lumen', strategyId: 'optics' })
    store.setVerdict(other.id, 2)
    const turned = store.insertDiscard({ ...base, name: 'Prism', probability: 0.9, strategyId: 'optics' })!
    assert.equal(store.insertDiscard({ ...base, name: 'prism', probability: 0.9, strategyId: 'optics' }), null)

    // The batch's own Strategy first, discards included; then rated; then the rest.
    const ex = store.exclusionsFor(s.id, 'optics')
    assert.deepEqual(ex.slice(0, 3), ['Prism', 'Lumen', 'Ashlar'])

    // Case and punctuation do not make a new name.
    const seen = store.seenKeys(s.id)
    assert.ok(seen.has(store.nameKey('Lu-men')) && seen.has(store.nameKey('PRISM')))

    const kept = store.keepDiscard(turned.id)!
    assert.equal(kept.name, 'Prism')
    assert.equal(kept.verdict, 0)
    assert.equal(store.listDiscards(s.id).length, 0)
    assert.equal(store.keepDiscard(turned.id), null)
  } finally {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  }
})
