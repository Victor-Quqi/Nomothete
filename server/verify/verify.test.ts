import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'nomothete-verify-'))
process.env.NOMOTHETE_DB = join(dir, 'test.db')

const { closeDb } = await import('../db.ts')
const store = await import('../store.ts')
const settings = await import('../settings.ts')
const verify = await import('./index.ts')
const { loadOutcome, loadTrace, isPending } = await import('./store.ts')
const { KeenableError, resetKeenableLimits, search, fetchPage } = await import('./keenable.ts')
const { bindFindings } = await import('./judge.ts')
const { researchTools } = await import('./research.ts')
const { verificationLines } = await import('./report.ts')
const { buildProfile, profileForPrompt } = await import('../naming/taste.ts')

type Claim = { text: string; query: string }

const events: { sessionId: string; event: any }[] = []
const calls = { extract: 0, search: 0, fetch: 0, judge: 0 }
let active = 0
let maxActive = 0

const CLAIM: Claim = { text: 'sennit 源自古英语', query: 'sennit etymology' }
const PAGE = 'noun. a flat braided cordage. Word origin: C17: of uncertain origin.'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}

async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out waiting')
    await new Promise(r => setTimeout(r, 5))
  }
}

function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    p.then(resolve, reject)
  })
}

/** Deterministic network and model. Individual tests override pieces. */
function baseline() {
  calls.extract = calls.search = calls.fetch = calls.judge = 0
  events.length = 0
  settings.setAutoVerify(true)
  verify.configureVerifier({
    enabled: settings.autoVerifyEnabled,
    research: async (input, io, signal, trace) => {
      const state = researchTools(io, signal, trace)
      const opts = { toolCallId: 'test', messages: [] }
      const results = await state.tools.search.execute!({ query: input.claims[0].query, site: '' }, opts) as any
      for (const hit of results.results ?? []) await state.tools.read.execute!({ url: hit.url, offset: 0 }, opts)
      return { evidence: state.evidence, errors: state.errors, notes: 'test research' }
    },
    publish: (sessionId, event) => events.push({ sessionId, event }),
    extract: async () => {
      calls.extract++
      return [CLAIM]
    },
    search: async input => {
      calls.search++
      return [{ url: `https://example.org/${encodeURIComponent(input.query)}/${input.site ?? 'web'}`, title: 'Entry', snippet: 'sennit' }]
    },
    fetchPage: async input => {
      calls.fetch++
      return { url: input.url, title: 'Entry', content: PAGE }
    },
    judge: async () => {
      calls.judge++
      return [{ claim: 1, verdict: 'contradicted', citations: [{ source: 'E1', quote: 'of uncertain origin' }], note: '词典记为来源不明。' }]
    },
  })
}

const session = store.createSession({ brief: 'secret project brief' })
let seq = 0
function candidate(name = `name${++seq}`) {
  const c = store.insertCandidate({
    sessionId: session.id,
    name,
    probability: 0.1,
    rationale: `${name} 源自古英语，意为编绳。`,
    strategyId: 'weaving',
    generation: 1,
  })!
  return c
}

const lastFor = (id: string) => [...events].reverse().find(e => e.event.type === 'verification' && e.event.candidateId === id)?.event.verification

test('binding preserves model wording and verdicts, and uses retrieved source URLs', () => {
  const evidence = [{ id: 'E1', url: 'https://dictionary.example/deixis', title: 'deixis', text: 'From *Greek* meaning “pointing”.' }]
  const bound = bindFindings([CLAIM], [{ claim: 1, verdict: 'supported', citations: [{ source: 'E1', quote: 'From Greek meaning "pointing".' }], note: 'Translation confirmed' }], evidence)
  assert.equal(bound[0].verdict, 'supported')
  assert.equal(bound[0].sources[0].excerpt, 'From Greek meaning "pointing".')
  assert.equal(bound[0].sources[0].url, evidence[0].url)
  const missing = bindFindings([CLAIM], [{ claim: 1, verdict: 'supported', citations: [{ source: 'missing', quote: 'x' }], note: '' }], evidence)
  assert.equal(missing[0].verdict, 'failed')
  assert.equal(missing[0].reason, '模型未关联到已读取的来源')
})

test('research tools expose all search results and paginate page text without semantic filters', async () => {
  const trace = { version: 2, startedAt: Date.now(), steps: [] }
  let fetches = 0
  let searches = 0
  const content = 'A'.repeat(8000) + 'The definition is after the examples.'
  const state = researchTools({
    search: async () => { searches++; return [{ url: 'https://example.org/unexpected', title: 'Different transliteration', snippet: 'Relevant or irrelevant: model decides' }] },
    fetchPage: async input => { fetches++; return { url: input.url, title: 'Entry', content } },
  }, new AbortController().signal, trace)
  const opts = { toolCallId: 'test', messages: [] }
  const found = await state.tools.search.execute!({ query: 'χορδή', site: '' }, opts) as any
  assert.equal(found.results.length, 1)
  const first = await state.tools.read.execute!({ url: 'https://example.org/entry', offset: 0 }, opts) as any
  const second = await state.tools.read.execute!({ url: 'https://example.org/entry', offset: first.nextOffset }, opts) as any
  assert.equal(second.text, 'The definition is after the examples.')
  assert.equal(fetches, 1)
  for (let i = 0; i < 12; i++) await state.tools.search.execute!({ query: 'q', site: '' }, opts)
  assert.equal(searches, 8)
  for (let i = 0; i < 12; i++) await state.tools.read.execute!({ url: 'https://example.org/entry', offset: 0 }, opts)
  assert.ok(state.evidence.reduce((sum, e) => sum + e.text.length, 0) <= 48000)
  assert.ok(state.evidence.length <= 8)
})

test('rate limiting stops subsequent research requests and records the failure', async () => {
  let calls = 0
  const trace = { version: 2, startedAt: Date.now(), steps: [] }
  const state = researchTools({
    search: async () => { calls++; throw new KeenableError('rate-limited', '限流') },
    fetchPage: async () => { throw new Error('must not run') },
  }, new AbortController().signal, trace)
  const opts = { toolCallId: 'test', messages: [] }
  await state.tools.search.execute!({ query: 'q', site: '' }, opts)
  await state.tools.search.execute!({ query: 'q', site: '' }, opts)
  const read = await state.tools.read.execute!({ url: 'https://example.org', offset: 0 }, opts) as any
  assert.equal(calls, 1)
  assert.equal(read.error, '限流')
  assert.deepEqual(state.errors, ['限流'])
})

test('the switch defaults on, persists, and stops new and in-flight work', async () => {
  baseline()
  assert.equal(settings.autoVerifyEnabled(), true)

  settings.setAutoVerify(false)
  closeDb()
  assert.equal(settings.autoVerifyEnabled(), false)
  const off = candidate()
  assert.equal(verify.requestVerification(off), 'off')
  assert.equal(calls.extract, 0)
  assert.equal(store.getCandidate(off.id)?.verification, null)

  // In flight when the switch goes off: aborted, nothing written, not left pending.
  settings.setAutoVerify(true)
  const gate = deferred<Claim[]>()
  let aborted = false
  verify.configureVerifier({
    extract: async (_i, signal) => {
      calls.extract++
      signal.addEventListener('abort', () => (aborted = true))
      return abortable(gate.promise, signal)
    },
  })
  const c = candidate()
  assert.equal(verify.requestVerification(c), 'pending')
  assert.deepEqual(store.getCandidate(c.id)?.verification, { state: 'pending' })
  settings.setAutoVerify(false)
  verify.cancelAllVerifications()
  assert.equal(aborted, true)
  assert.equal(isPending(c.id), false)
  assert.equal(lastFor(c.id), null)
  gate.resolve([CLAIM])
  await new Promise(r => setTimeout(r, 30))
  assert.equal(loadOutcome(c.id), null)
  assert.equal(calls.search, 0)
})

test('a stale job from before a disable and re-enable cannot overwrite the new one', async () => {
  baseline()
  const first = deferred<Claim[]>()
  verify.configureVerifier({ extract: () => first.promise })
  const c = candidate()
  verify.requestVerification(c)
  await until(() => verify.verificationLoad().running === 1)
  settings.setAutoVerify(false)
  verify.cancelAllVerifications()
  settings.setAutoVerify(true)

  const second = deferred<Claim[]>()
  verify.configureVerifier({ extract: () => second.promise })
  assert.equal(verify.requestVerification(c), 'pending')
  first.resolve([]) // the old job would record "no claims"
  await new Promise(r => setTimeout(r, 20))
  assert.equal(loadOutcome(c.id), null)
  assert.equal(isPending(c.id), true)
  second.resolve([CLAIM])
  await until(() => !isPending(c.id))
  const out = loadOutcome(c.id)
  assert.equal(out?.state, 'done')
  assert.equal(out?.state === 'done' && out.claims.length, 1)
})

test('no support found is insufficient; service and model failures are failed', async () => {
  baseline()
  verify.configureVerifier({
    judge: async () => { calls.judge++; return [{ claim: 1, verdict: 'insufficient', citations: [], note: 'No reference evidence found' }] },
    search: async () => {
      calls.search++
      return []
    },
  })
  const empty = candidate()
  verify.requestVerification(empty)
  await until(() => !isPending(empty.id))
  const insufficient = loadOutcome(empty.id)
  assert.equal(insufficient?.state, 'done')
  assert.equal(insufficient?.state === 'done' && insufficient.claims[0].verdict, 'insufficient')
  assert.equal(calls.judge, 1, 'the model receives the research outcome')
  assert.equal(calls.search, 1)

  baseline()
  verify.configureVerifier({
    search: async () => {
      throw new KeenableError('unavailable', '联网搜索没有响应')
    },
  })
  const down = candidate()
  verify.requestVerification(down)
  await until(() => !isPending(down.id))
  assert.deepEqual(
    { ...loadOutcome(down.id), checkedAt: 0 },
    { state: 'failed', reason: '联网搜索没有响应', checkedAt: 0 },
  )

  baseline()
  verify.configureVerifier({
    extract: async () => {
      throw new Error('upstream 500 with body that must not leak')
    },
  })
  const model = candidate()
  verify.requestVerification(model)
  await until(() => !isPending(model.id))
  const f = loadOutcome(model.id)
  assert.equal(f?.state, 'failed')
  assert.equal(f?.state === 'failed' && f.reason, '模型没有给出可用的结果')
  assert.equal(lastFor(model.id)?.state, 'failed')

  // A failure is retried on the next like; it is not a finished result.
  baseline()
  assert.equal(verify.requestVerification(model), 'pending')
  await until(() => !isPending(model.id))
  assert.equal(loadOutcome(model.id)?.state, 'done')
})

test('work is deduplicated, reused, refreshable and bounded', async () => {
  baseline()
  const gate = deferred<void>()
  verify.configureVerifier({
    extract: async () => {
      calls.extract++
      active++
      maxActive = Math.max(maxActive, active)
      await gate.promise
      active--
      return [CLAIM, { ...CLAIM, query: 'sennit meaning' }, { ...CLAIM, query: 'sennit rope' }, { ...CLAIM, query: 'fourth' }]
    },
    fetchPage: async input => {
      calls.fetch++
      return { url: input.url, title: 'Big', content: `sennit ${'x'.repeat(50_000)} sennit ${'y'.repeat(50_000)}` }
    },
  })
  let evidenceSeen: { text: string }[] = []
  verify.configureVerifier({
    judge: async input => {
      calls.judge++
      evidenceSeen = input.evidence
      assert.equal(input.claims.length, 4)
      return []
    },
  })
  maxActive = 0
  const many = Array.from({ length: 5 }, () => candidate())
  for (const c of many) verify.requestVerification(c)
  assert.equal(verify.requestVerification(many[0]), 'pending')
  assert.equal(verify.requestVerification(many[0], { refresh: true }), 'pending')
  await until(() => verify.verificationLoad().running === 2)
  assert.equal(verify.verificationLoad().queued, 3)
  gate.resolve()
  await until(() => many.every(c => !isPending(c.id)))
  assert.equal(maxActive, 2)
  assert.equal(calls.extract, 5)
  assert.ok(calls.search <= 5 * 8)
  assert.ok(calls.fetch <= 5 * 8)
  assert.ok(evidenceSeen.every(e => e.text.length <= 8000))
  assert.ok(evidenceSeen.reduce((n, e) => n + e.text.length, 0) <= 48000)

  // A repeated like reuses the finished result; an explicit recheck refreshes it.
  const before = calls.extract
  assert.equal(verify.requestVerification(many[0]), 'reused')
  assert.equal(calls.extract, before)
  assert.equal(verify.requestVerification(many[0], { refresh: true }), 'pending')
  await until(() => !isPending(many[0].id))
  assert.equal(calls.extract, before + 1)
})

test('results persist, stay out of registry checks and taste, and deletion drops in-flight work', async () => {
  baseline()
  const c = candidate('sennit')
  verify.requestVerification(c)
  await until(() => !isPending(c.id))
  closeDb()
  const reloaded = store.getCandidate(c.id)!
  assert.equal(reloaded.verification?.state, 'done')
  assert.ok(loadTrace(c.id)?.steps.some(step => step.stage === 'judgement'))
  assert.ok(!JSON.stringify(reloaded).includes('startedAt'))
  const claim = reloaded.verification?.state === 'done' ? reloaded.verification.claims[0] : null
  assert.equal(claim?.verdict, 'contradicted')
  assert.ok(claim?.sources[0].url.startsWith('https://example.org/'))
  assert.equal(store.listCandidates(session.id).find(x => x.id === c.id)?.verification?.state, 'done')
  assert.ok(!(reloaded.checks ?? []).some(k => /verif|取义/.test(k.checkId + k.label)))

  store.setVerdict(c.id, 2, '喜欢这个')
  const profile = buildProfile(store.listCandidates(session.id), [])
  const prompt = profileForPrompt(profile) + JSON.stringify(profile)
  assert.ok(!prompt.includes('uncertain origin'))
  assert.ok(!prompt.includes('example.org'))

  const doomedSession = store.createSession({ brief: 'to delete' })
  const doomed = store.insertCandidate({
    sessionId: doomedSession.id, name: 'doomed', probability: 0.1, rationale: 'doomed 源自拉丁语。', strategyId: 'x', generation: 1,
  })!
  const gate = deferred<Claim[]>()
  verify.configureVerifier({ extract: () => gate.promise })
  verify.requestVerification(doomed)
  await until(() => verify.verificationLoad().running === 1)
  events.length = 0
  verify.cancelSessionVerifications(doomedSession.id)
  store.deleteSession(doomedSession.id)
  gate.resolve([CLAIM])
  await new Promise(r => setTimeout(r, 30))
  assert.equal(events.length, 0)
  assert.equal(verify.verificationLoad().jobs, 0)
})

test('language context reaches extraction, research and judgement, and traces follow deletion', async () => {
  baseline()
  const session = store.createSession({ brief: 'language context' })
  const c = store.insertCandidate({ sessionId: session.id, name: 'Chordeix', rationale: 'chorde 表示琴弦。', strategyId: 'greek-root', generation: 1, probability: 0.1 })!
  const seen: string[] = []
  verify.configureVerifier({
    extract: async input => { seen.push(input.strategy!.label); return [CLAIM] },
    research: async input => { seen.push(input.strategy!.label); return { evidence: [], errors: [], notes: 'No references' } },
    judge: async input => { seen.push(input.strategy!.label); return [{ claim: 1, verdict: 'insufficient', citations: [], note: 'No references' }] },
  })
  verify.requestVerification(c)
  await until(() => !isPending(c.id))
  assert.deepEqual(seen, ['希腊词根复合', '希腊词根复合', '希腊词根复合'])
  assert.ok(loadTrace(c.id))
  store.deleteSession(session.id)
  assert.equal(loadTrace(c.id), null)
})

test('a full queue says so on the card and in a notice instead of dropping the request', async () => {
  baseline()
  const gate = deferred<Claim[]>()
  verify.configureVerifier({ extract: () => gate.promise })
  const accepted = Array.from({ length: 22 }, () => candidate())
  for (const c of accepted) assert.equal(verify.requestVerification(c), 'pending')
  await until(() => verify.verificationLoad().running === 2)

  const turned = candidate()
  assert.equal(verify.requestVerification(turned), 'busy')
  const shown = store.getCandidate(turned.id)?.verification
  assert.equal(shown?.state, 'failed')
  assert.match(shown?.state === 'failed' ? shown.reason : '', /排队已满/)
  assert.equal(lastFor(turned.id)?.state, 'failed')
  assert.ok(events.some(e => e.event.type === 'notice' && e.event.message.includes(turned.name)))
  assert.equal(loadOutcome(turned.id), null, 'the refusal is not stored')

  gate.resolve([])
  await until(() => verify.verificationLoad().jobs === 0)
  assert.equal(verify.requestVerification(turned), 'pending')
  await until(() => !isPending(turned.id))
  assert.equal(store.getCandidate(turned.id)?.verification?.state, 'done')
})

test('markdown export lines carry findings and source links', () => {
  const lines = verificationLines({
    state: 'done',
    checkedAt: 0,
    claims: [
      { text: 'sennit 源自古英语', query: 'q', verdict: 'contradicted', note: '词典记为来源不明。', sources: [{ url: 'https://mw.example/sennit', title: 'Sennit [MW]', excerpt: 'origin unknown' }] },
      { text: 'B', query: 'q', verdict: 'failed', reason: '联网搜索没有响应', sources: [] },
    ],
  })
  assert.equal(lines[0], '- 取义核查 · 与资料不符：sennit 源自古英语（词典记为来源不明。） 来源：[Sennit MW](https://mw.example/sennit)')
  assert.equal(lines[1], '- 取义核查 · 未能核查：B（联网搜索没有响应）')
  assert.deepEqual(verificationLines({ state: 'pending' }), [])
  assert.deepEqual(verificationLines(null), [])
})

test('keenable client: app header, no prompt, 429 backs off without asking again', async () => {
  resetKeenableLimits()
  const realFetch = globalThis.fetch
  const seen: { url: string; init?: RequestInit }[] = []
  let status = 200
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url: String(url), init })
    if (status === 429) return new Response('slow down', { status: 429, headers: { 'retry-after': '120' } })
    if (String(url).includes('/search/public')) {
      return Response.json({ results: [{ title: 't', url: 'https://ok.example/a', description: 'd', snippet: 's' }, { url: 'javascript:alert(1)' }] })
    }
    return Response.json({ url: 'https://ok.example/a', title: 't', content: 'text' })
  }) as typeof fetch
  try {
    const signal = new AbortController().signal
    const hits = await search({ query: 'sennit etymology', site: 'collinsdictionary.com', maxResults: 3, snippetChars: 300 }, signal)
    assert.deepEqual(hits, [{ url: 'https://ok.example/a', title: 't', snippet: 'd\ns' }])
    const body = JSON.parse(String(seen[0].init?.body))
    assert.deepEqual(body, { query: 'sennit etymology', max_results: 3, snippet_max_length: 300, site: 'collinsdictionary.com' })
    assert.equal((seen[0].init?.headers as Record<string, string>)['X-Keenable-Title'], 'Nomothete')

    await fetchPage({ url: 'https://ok.example/a', maxChars: 500 }, signal)
    const fetchUrl = new URL(seen[1].url)
    assert.equal(fetchUrl.searchParams.get('url'), 'https://ok.example/a')
    assert.equal(fetchUrl.searchParams.get('max_chars'), '500')
    assert.equal(fetchUrl.searchParams.has('prompt'), false)
    await assert.rejects(fetchPage({ url: 'javascript:alert(1)', maxChars: 500 }, signal))
    assert.equal(seen.length, 2, 'non-web URLs never reach retrieval or source links')

    status = 429
    await assert.rejects(search({ query: 'q', maxResults: 1, snippetChars: 10 }, signal), (e: any) => e.kind === 'rate-limited')
    const count = seen.length
    await assert.rejects(fetchPage({ url: 'https://ok.example/a', maxChars: 10 }, signal), (e: any) => e.kind === 'rate-limited')
    assert.equal(seen.length, count, 'blocked calls do not reach the network')
  } finally {
    globalThis.fetch = realFetch
    resetKeenableLimits()
  }
})

test.after(() => {
  closeDb()
  for (const file of readdirSync(dir)) unlinkSync(join(dir, file))
  rmdirSync(dir)
})
