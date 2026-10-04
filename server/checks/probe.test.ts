import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collisionCandidates } from './normalize.ts'

test('collision variants skip spellings the registry lookup already folds', () => {
  // crates.io's lookup applies its whole rule; the exact-name query has asked.
  assert.deepEqual(collisionCandidates('crates', 'Pylograph'), [])
  assert.deepEqual(collisionCandidates('crates', 'pylo-graph'), [])

  // PyPI's lookup merges `-`, `_` and `.`, so one separator stands for all.
  const pypi = collisionCandidates('pypi', 'Pylograph', 40)
  assert.ok(pypi.includes('pylo-graph'))
  assert.ok(!pypi.some(v => /[_.]/.test(v)))
  assert.ok(pypi.includes('py1ograph'), 'confusable folds are not crowded out')

  // npm's lookup is exact, so every separator is its own question.
  const npm = collisionCandidates('npm', 'Pylograph', 28)
  for (const v of ['pylo-graph', 'pylo.graph', 'pylo_graph']) assert.ok(npm.includes(v))

  // A name written with a separator collides with the one written without.
  assert.ok(collisionCandidates('npm', 'pylo-graph').includes('pylograph'))
  assert.ok(collisionCandidates('pypi', 'pylo-graph').includes('pylograph'))
})

test('a host waiting out its spacing does not hold up other hosts', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'nomothete-probe-'))
  process.env.NOMOTHETE_DB = join(dir, 'test.db')
  const { closeDb } = await import('../db.ts')
  const { probe, probeAll } = await import('./http.ts')
  const started = new Map<string, number>()
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    started.set(String(input), Date.now())
    return new Response('{}', { status: 404 })
  })
  try {
    const t0 = Date.now()
    const slow = probeAll(Array.from({ length: 12 }, (_, i) => `https://slow.test/${i}`))
    const other = await probe('https://other.test/x')
    assert.equal(other.status, 404)
    assert.ok(started.get('https://other.test/x')! - t0 < 200, 'other host started at once')
    await slow
    const times = Array.from({ length: 12 }, (_, i) => started.get(`https://slow.test/${i}`)!)
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 300, 'same host stays spaced')

    // Answered from the cache: no turn to wait for.
    const t1 = Date.now()
    assert.equal((await probe('https://slow.test/0')).cached, true)
    assert.ok(Date.now() - t1 < 100)
  } finally {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  }
})
