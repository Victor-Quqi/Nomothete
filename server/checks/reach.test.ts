import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setLang } from '../i18n.ts'
import { npmNeighbourhood } from '../../shared/npmNeighbourhood.ts'
import { groupChecks, presentCheck } from '../../web/checks.ts'
import { tr } from '../../web/i18n.ts'

const zh = (text: string) => text

test('npm package matches exclude owner-only hits in both current and legacy data', () => {
  const names = [
    '@symbio/headless', '@symbio/cms-datocms', 'create-symbio-app',
    '@symbio/cms-elasticsearch-datocms', '@symbio/cms', '@symbio/dotcoms-mcp',
    'kentico-cloud-delivery-sdk-symbio',
  ]
  for (const data of [{ total: 7, names }, { total: 7, nearMisses: names, exactNorm: [] }]) {
    const result = npmNeighbourhood(data, 'Symbio', zh)
    assert.deepEqual(result.names, ['create-symbio-app', 'kentico-cloud-delivery-sdk-symbio'])
    assert.equal(result.headline, 'npm 结果中有 2 个相近包名')
    const stale = {
      checkId: 'neighbourhood', label: '同名邻域', tier: 'free' as const, status: 'caution' as const,
      headline: 'npm 上 7 个相关结果', detail: '形近的有 @symbio/headless……', data,
    }
    assert.equal(presentCheck(stale, 'Symbio').detail, undefined)
    const groups = groupChecks([stale], 'Symbio')
    assert.equal(groups.findings.length, 0)
    // The page words it in its own language, from the same facts.
    assert.equal(groups.quiet[0].headline, npmNeighbourhood(data, 'Symbio', tr).headline)
  }
  assert.deepEqual(npmNeighbourhood({ names: ['@owner/symbio', 'symbio', 'symbio'] }, 'Symbio', zh).names,
    ['@owner/symbio', 'symbio'])
  assert.deepEqual(npmNeighbourhood({ total: 500, names: ['@symbio/headless'] }, 'Symbio', zh), {
    names: [], status: 'clear', headline: 'npm 返回结果中无相近包名',
  })
})

test('npm search retains all returned packages through storage, including non-name matches', async t => {
  setLang('zh')
  const dir = mkdtempSync(join(tmpdir(), 'nomothete-neighbourhood-'))
  process.env.NOMOTHETE_DB = join(dir, 'test.db')
  const { closeDb } = await import('../db.ts')
  const { createSession, insertCandidate, getCandidate } = await import('../store.ts')
  const { describeCheck, persistCheck, readCheckRow } = await import('./index.ts')
  const { npmNeighbourhoodCheck } = await import('./reach.ts')
  const names = ['symbio', '@symbio/headless', 'unrelated-package']
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    assert.equal(String(input), 'https://registry.npmjs.org/-/v1/search?text=Symbio&size=20')
    return Response.json({ total: 24, objects: names.map(name => ({ package: { name } })) })
  })
  try {
    const data = await npmNeighbourhoodCheck.run({ name: 'Symbio', deep: false, signal: new AbortController().signal })
    assert.ok(data)
    assert.deepEqual(data.names, names)
    assert.equal(data.total, 24)
    const session = createSession({ brief: 'Search result test' })
    const candidate = insertCandidate({
      sessionId: session.id, name: 'Symbio', probability: 0.1, rationale: '', strategyId: 'root', generation: 1,
    })!
    persistCheck(candidate.id, describeCheck(npmNeighbourhoodCheck, data, candidate.name)!)
    closeDb()
    const saved = getCandidate(candidate.id)!.checks!.find(c => c.checkId === 'neighbourhood')!
    assert.deepEqual(saved.data?.names, names)
    assert.equal(saved.headline, 'npm 结果中有 1 个相近包名')

    // Old rows must keep the package names that the UI can recover without a new search.
    for (const legacy of [
      { total: 1, exactNorm: ['symbio'], nearMisses: [] },
      { total: 7, exactNorm: [], nearMisses: Array.from({ length: 7 }, (_, i) => `@symbio/package-${i}`) },
    ]) {
      const reread = readCheckRow({
        checkId: 'neighbourhood', label: '同名邻域', tier: 'free', status: 'caution',
        headline: 'Old count', detail: 'Old package list', data: JSON.stringify(legacy),
      }, 'Symbio')!
      assert.deepEqual(reread.data, legacy)
      assert.equal(reread.headline, legacy.total === 1 ? 'npm 结果中有 1 个相近包名' : 'npm 返回结果中无相近包名')
      assert.equal(reread.detail, undefined)
    }
  } finally {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  }
})
