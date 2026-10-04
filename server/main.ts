/**
 * HTTP surface.
 *
 * The browser talks only to this process; API keys never cross the boundary.
 * State lives here, the frontend renders and reports events (docs/design.md →
 * 数据模型).
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { CHECK_MANIFEST, TIER_LABEL, fillMissingChecks } from './checks/index.ts'
import { DB_PATH, getDb } from './db.ts'
import { env } from './env.ts'
import { applyEnv, writeEnv } from './envfile.ts'
import { channel, publish } from './events.ts'
import {
  configSource,
  configuredProfiles,
  DEFAULTS,
  forgetEffortRefusal,
  keyHint,
  loadProfiles,
  probeEndpoint,
  providerStatus,
  resolveReasoningEffort,
  type ProviderKind,
} from './llm.ts'
import { cancel, deepRunning, isRunning, startDeepChecks, startGeneration } from './naming/generate.ts'
import { PRIORS } from './naming/priors.ts'
import { FAMILIES, STRATEGIES } from './naming/strategies.ts'
import { nameSession } from './naming/title.ts'
import { getSettings, setAutoVerify } from './settings.ts'
import { buildProfile, profileForPrompt } from './naming/taste.ts'
import {
  createSession,
  deleteSession,
  getCandidate,
  getSession,
  listBatches,
  listCandidates,
  listSessions,
  reconcileBatches,
  setNote,
  setVerdict,
  updateSession,
  type Candidate,
  type Session,
  type Verdict,
} from './store.ts'
import { cancelAllVerifications, cancelSessionVerifications, requestVerification } from './verify/index.ts'
import { verificationLines } from './verify/report.ts'

const app = express()
app.use(express.json({ limit: '256kb' }))

// This process holds an API key and answers without authentication, so it binds
// to loopback. `NOMOTHETE_HOST=0.0.0.0` exists for the container case and is
// deliberately something you have to type on purpose.
const HOST = env('HOST') ?? '127.0.0.1'
const LOOPBACK_BIND = /^(127\.|::1$|localhost$)/i.test(HOST)

// Never log request bodies or Authorization headers (provider-adapters.md §4).
app.use((req, _res, next) => {
  if (process.env.NOMOTHETE_VERBOSE) console.log(`${req.method} ${req.path}`)
  next()
})

const api = express.Router()

// Binding to loopback keeps the LAN out. It cannot keep out the one thing that
// reaches loopback anyway: a public hostname that resolves to 127.0.0.1, which
// lets a page the user merely visited drive this API from their own browser.
// Checking the Host header closes that, and only matters while we are in fact
// loopback-only.
const LOOPBACK_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i
if (LOOPBACK_BIND) {
  api.use((req, res, next) => {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '')
    if (host && !LOOPBACK_HOST.test(host)) {
      res.status(403).json({ error: '只接受来自本机的请求。' })
      return
    }
    next()
  })
}

api.get('/bootstrap', (_req, res) => {
  res.json({
    strategies: STRATEGIES.map(s => ({ id: s.id, label: s.label, family: s.family, brief: s.brief })),
    families: FAMILIES,
    priors: PRIORS,
    checks: CHECK_MANIFEST.map(c => ({ ...c, tierLabel: TIER_LABEL[c.tier] })),
    provider: providerStatus(),
    settings: getSettings(),
    sessions: listSessions(),
    dbPath: DB_PATH,
  })
})

api.get('/sessions', (_req, res) => {
  res.json({ sessions: listSessions() })
})

api.post('/sessions', (req, res) => {
  const { brief, title, seeds, priors, threshold, autostart = true } = req.body ?? {}
  if (typeof brief !== 'string' || brief.trim().length < 4) {
    res.status(400).json({ error: '先写一句项目描述。' })
    return
  }
  const session = createSession({ brief: brief.trim(), title, seeds, priors, threshold })
  // Runs alongside the first batch and arrives over the event stream. Nobody
  // waits on a label.
  if (!session.title) void nameSession(session.id)
  let started: { generation: number; strategies: string[] } | null = null
  if (autostart) {
    try {
      started = startGeneration(session.id)
    } catch (err) {
      res.status(201).json({ session, started: null, error: (err as Error).message })
      return
    }
  }
  res.status(201).json({ session, started })
})

/**
 * The profile as the browser sees it, plus `injected` — the literal paragraph
 * that goes into the next prompt.
 *
 * The UI does not render `injected`: a prompt fragment is not something a user
 * came here to read. It stays in the payload for the JSON export, where someone
 * debugging their own session can check what the model was actually told.
 */
function profilePayload(candidates: Candidate[], seeds: Session['seeds']) {
  const profile = buildProfile(candidates, seeds)
  return { ...profile, injected: profileForPrompt(profile) }
}

function sessionPayload(id: string) {
  const session = getSession(id)
  if (!session) return null
  const candidates = listCandidates(id)
  return {
    session,
    candidates,
    batches: listBatches(id),
    running: isRunning(id),
    profile: profilePayload(candidates, session.seeds),
    // Slow tiers out right now. A page that lost the stream cannot tell a run
    // still going from one that stopped with the last process; this can.
    asking: candidates.filter(c => deepRunning(c.id)).map(c => c.id),
  }
}

api.get('/sessions/:id', (req, res) => {
  const payload = sessionPayload(req.params.id)
  if (!payload) {
    res.status(404).json({ error: '会话不存在' })
    return
  }
  // Sessions made before there was a label, and sessions whose label was asked
  // for while the model was unreachable. Once per process, then it stops.
  if (!payload.session.title) void nameSession(payload.session.id)
  void backfillChecks(payload.session.id, payload.candidates)
  res.json(payload)
})

/**
 * Ask the checks that never got an answer for these names, one candidate at a
 * time so that opening a session with thirty names is not thirty simultaneous
 * requests to npm. Answers arrive on the event stream, like any other check.
 */
async function backfillChecks(sessionId: string, candidates: Candidate[]) {
  const signal = AbortSignal.timeout(120_000)
  for (const c of candidates) {
    if (signal.aborted) return
    await fillMissingChecks(c.id, c.name, {
      signal,
      onResult: result => publish(sessionId, { type: 'check', candidateId: c.id, result }),
      onGone: checkId => publish(sessionId, { type: 'check:gone', candidateId: c.id, checkId }),
    }).catch(() => {})
    // An upvote buys the slow tier. One whose run never answered — the process
    // running it stopped — is asked again rather than left saying 正在查.
    const deepAnswered = (c.checks ?? []).some(k => k.tier === 'ratelimited')
    if (c.verdict > 0 && !deepAnswered) startDeepChecks(sessionId, c.id, c.name)
  }
}

api.patch('/sessions/:id', (req, res) => {
  const { title, priors, threshold, brief, pinned } = req.body ?? {}
  if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
    res.status(400).json({ error: '请填写会话名' })
    return
  }
  if (pinned !== undefined && typeof pinned !== 'boolean') {
    res.status(400).json({ error: '置顶状态无效' })
    return
  }
  const session = updateSession(req.params.id, { title: title?.trim(), priors, threshold, brief, pinned })
  if (!session) {
    res.status(404).json({ error: '会话不存在' })
    return
  }
  res.json({ session })
})

api.delete('/sessions/:id', (req, res) => {
  cancel(req.params.id)
  cancelSessionVerifications(req.params.id)
  deleteSession(req.params.id)
  res.json({ ok: true })
})

api.post('/sessions/:id/generate', (req, res) => {
  const { width, strategyIds } = req.body ?? {}
  try {
    const started = startGeneration(req.params.id, { width, strategyIds })
    res.json(started)
  } catch (err) {
    res.status(409).json({ error: (err as Error).message })
  }
})

api.post('/sessions/:id/cancel', (req, res) => {
  cancel(req.params.id)
  res.json({ ok: true })
})

api.get('/sessions/:id/taste', (req, res) => {
  const session = getSession(req.params.id)
  if (!session) {
    res.status(404).json({ error: '会话不存在' })
    return
  }
  res.json({ profile: profilePayload(listCandidates(session.id), session.seeds) })
})

api.get('/sessions/:id/stream', (req, res) => {
  const session = getSession(req.params.id)
  if (!session) {
    res.status(404).end()
    return
  }
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.write('retry: 1500\n\n')

  const ch = channel(session.id)
  const lastId = Number(req.headers['last-event-id'] ?? req.query.lastEventId ?? 0)
  for (const env of ch.since(Number.isFinite(lastId) ? lastId : 0)) {
    res.write(`id: ${env.id}\ndata: ${JSON.stringify(env.event)}\n\n`)
  }

  const onEvent = (env: { id: number; event: unknown }) => {
    res.write(`id: ${env.id}\ndata: ${JSON.stringify(env.event)}\n\n`)
  }
  ch.on('event', onEvent)

  // An event, not a comment: a page cannot see comments, and it has to hear
  // something regularly to notice a stream that died without saying so.
  const beat = setInterval(() => res.write('event: beat\ndata: 1\n\n'), 10_000)
  req.on('close', () => {
    clearInterval(beat)
    ch.off('event', onEvent)
  })
})

api.post('/candidates/:id/verdict', (req, res) => {
  const raw = Number(req.body?.verdict)
  if (![-2, -1, 0, 1, 2].includes(raw)) {
    res.status(400).json({ error: 'verdict 只能是 -2、-1、0、1、2' })
    return
  }
  const note = typeof req.body?.note === 'string' ? req.body.note : undefined
  const before = getCandidate(req.params.id)
  if (!before) {
    res.status(404).json({ error: '候选不存在' })
    return
  }
  const candidate = setVerdict(req.params.id, raw as Verdict, note)!

  // A positive Verdict is what buys the rate-limited tier.
  const alreadyDeep = (candidate.checks ?? []).some(c => c.tier === 'ratelimited')
  if (raw > 0 && !alreadyDeep) startDeepChecks(candidate.sessionId, candidate.id, candidate.name)
  // Reuses a finished result; a like is not a request to search again.
  if (raw > 0) requestVerification(candidate)

  // Read again so the reply carries the pending mark the request just set.
  res.json({ candidate: getCandidate(candidate.id) ?? candidate })
})

api.post('/candidates/:id/note', (req, res) => {
  const note = typeof req.body?.note === 'string' ? req.body.note : ''
  const candidate = setNote(req.params.id, note)
  if (!candidate) {
    res.status(404).json({ error: '候选不存在' })
    return
  }
  res.json({ candidate })
})

api.post('/candidates/:id/recheck', (req, res) => {
  const candidate = getCandidate(req.params.id)
  if (!candidate) {
    res.status(404).json({ error: '候选不存在' })
    return
  }
  startDeepChecks(candidate.sessionId, candidate.id, candidate.name, true)
  // `busy` also arrives as a notice and, without a stored result, on the card.
  const verification = requestVerification(candidate, { refresh: true })
  res.json({ ok: true, verification })
})

api.get('/sessions/:id/export', (req, res) => {
  const session = getSession(req.params.id)
  if (!session) {
    res.status(404).end()
    return
  }
  const candidates = listCandidates(session.id)
  const profile = profilePayload(candidates, session.seeds)
  if (req.query.format === 'json') {
    res.setHeader('content-disposition', `attachment; filename="${session.id}.json"`)
    res.json({ session, candidates, profile })
    return
  }
  const tierName = (v: number) => ['▼▼', '▼', '·', '▲', '▲▲'][v + 2]
  const lines: string[] = [
    `# ${session.title || session.brief}`,
    '',
    // An unnamed session's heading is already the brief; do not print it twice.
    ...(session.title ? [session.brief, ''] : []),
    `共 ${candidates.length} 个候选，${candidates.filter(c => c.verdict > 0).length} 个心动。`,
    '',
  ]
  for (const group of [2, 1, 0, -1, -2]) {
    const inGroup = candidates.filter(c => c.verdict === group)
    if (!inGroup.length) continue
    lines.push(`## ${tierName(group)}`, '')
    for (const c of inGroup) {
      lines.push(`### ${c.name}`)
      lines.push('', c.rationale, '')
      const checks = (c.checks ?? []).filter(k => k.status !== 'clear' || k.tier !== 'local')
      if (checks.length) lines.push(checks.map(k => `- ${k.label}：${k.headline}`).join('\n'), '')
      const verified = verificationLines(c.verification)
      if (verified.length) lines.push(verified.join('\n'), '')
      if (c.note) lines.push(`> ${c.note}`, '')
    }
  }
  // The drawer can afford to leave the traits as rows and the names as bars; a
  // file that leaves the session behind cannot, so spell them out here.
  if (profile.observations > 0) {
    lines.push('## 你的口味', '', profile.statement, '')
    if (profile.loved.length) lines.push(`- 喜欢：${profile.loved.map(l => l.name).join('、')}`)
    if (profile.rejected.length) lines.push(`- 不喜欢：${profile.rejected.map(l => l.name).join('、')}`)
    for (const t of profile.traits) lines.push(`- ${t.statement}`)
    lines.push('')
  }
  res.setHeader('content-type', 'text/markdown; charset=utf-8')
  res.setHeader('content-disposition', `attachment; filename="${session.id}.md"`)
  res.send(lines.join('\n'))
})

// ── configuration ─────────────────────────────────────────────────────────
//
// The key goes in and never comes back out. This endpoint answers with the host,
// the model and the last four characters — enough to see what is loaded and to
// tell two keys apart, and nothing a hostile script in the page could spend
// elsewhere. The field in the drawer is write-only for the same reason: changing
// the model must not require handing the browser the key to redisplay it.

function configPayload() {
  const source = configSource()
  // As written, so a field left empty shows empty over the default it stands for.
  const profile = configuredProfiles()[0]
  return {
    provider: providerStatus(),
    source: source.source,
    path: source.path,
    shadowsEnv: source.shadowsEnv,
    // A config file wins outright, so writing `.env` would succeed and change
    // nothing. Refusing is kinder than that.
    writable: source.source !== 'config-file',
    baseURL: profile?.baseURL ?? '',
    model: profile?.model ?? '',
    defaults: DEFAULTS,
    kind: profile?.kind ?? null,
    reasoningEffort: profile ? resolveReasoningEffort(profile) ?? '' : '',
    keyHint: keyHint(),
  }
}

api.get('/config', (_req, res) => {
  res.json(configPayload())
})

const KINDS: ProviderKind[] = ['openai-chat', 'openai-responses', 'anthropic', 'google']

api.put('/config', (req, res) => {
  if (configSource().source === 'config-file') {
    res.status(409).json({
      error: '当前配置来自 nomothete.config.json，它优先于 .env。改那个文件，或者把它移开。',
    })
    return
  }

  const { baseURL, model, apiKey, reasoningEffort, providerKind } = req.body ?? {}
  const patch: Record<string, string | null | undefined> = {}

  if (model !== undefined) {
    const value = typeof model === 'string' ? model.trim() : ''
    // Cleared means the default model.
    patch.NOMOTHETE_MODEL = value || null
  }

  if (baseURL !== undefined) {
    const value = typeof baseURL === 'string' ? baseURL.trim() : ''
    if (value) {
      try {
        new URL(value)
      } catch {
        res.status(400).json({ error: `不是一个合法地址：${value}` })
        return
      }
    }
    // Cleared means the line format's default endpoint.
    patch.NOMOTHETE_BASE_URL = value || null
  }

  // Asymmetric with the field above, deliberately. An empty base URL is a real
  // value because you can see the one you are replacing; an empty key can only
  // mean "leave it alone", because the drawer was never given one to show.
  if (apiKey === null) patch.NOMOTHETE_API_KEY = null
  else if (typeof apiKey === 'string' && apiKey.trim()) patch.NOMOTHETE_API_KEY = apiKey.trim()

  if (reasoningEffort !== undefined) {
    const value = typeof reasoningEffort === 'string' ? reasoningEffort.trim() : ''
    // Preserve an explicit empty value; removing it restores the app default.
    patch.NOMOTHETE_REASONING_EFFORT = value
  }

  if (providerKind !== undefined) {
    const value = typeof providerKind === 'string' ? providerKind.trim() : ''
    if (value && !KINDS.includes(value as ProviderKind)) {
      res.status(400).json({ error: `未知的 provider kind：${value}` })
      return
    }
    patch.NOMOTHETE_PROVIDER_KIND = value || null
  }

  try {
    writeEnv(patch)
  } catch (err) {
    res.status(500).json({ error: `写不了 .env：${(err as Error).message}` })
    return
  }
  // `loadProfiles` reads the environment on every call, so the next generation
  // uses the new endpoint without a restart.
  applyEnv(patch)
  forgetEffortRefusal()

  res.json(configPayload())
})

// Not part of the model config: editable even when nomothete.config.json locks it.
api.get('/settings', (_req, res) => {
  res.json(getSettings())
})

api.put('/settings', (req, res) => {
  const { autoVerify } = req.body ?? {}
  if (typeof autoVerify !== 'boolean') {
    res.status(400).json({ error: 'autoVerify 只能是 true 或 false' })
    return
  }
  setAutoVerify(autoVerify)
  if (!autoVerify) cancelAllVerifications()
  res.json(getSettings())
})

api.post('/config/test', async (_req, res) => {
  const profile = loadProfiles()[0]
  if (!profile) {
    res.status(400).json({ error: '还没有配置模型。' })
    return
  }
  res.json(await probeEndpoint(profile))
})

app.use('/api', api)

// Production: serve the built frontend from the same origin. The database
// belongs to the working directory, but dist/ belongs to the install — so look
// next to this file first, and only then fall back to cwd.
const here = path.dirname(fileURLToPath(import.meta.url))
const DIST = [path.resolve(here, '..', 'dist'), path.resolve(process.cwd(), 'dist')].find(d =>
  fs.existsSync(path.join(d, 'index.html')),
)
if (DIST) {
  app.use(express.static(DIST))
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[nomothete]', err instanceof Error ? err.message : err)
  res.status(500).json({ error: '服务端出错' })
})

// A stray rejection — an aborted fetch, a provider that hangs up mid-stream —
// must not take the whole workshop down with a session half finished.
process.on('unhandledRejection', reason => {
  console.error('[nomothete] 未处理的异步错误：', reason instanceof Error ? reason.message : reason)
})

const PORT = Number(env('PORT') ?? 5179)

getDb()
reconcileBatches()

app.listen(PORT, HOST, () => {
  const status = providerStatus()
  console.log(`\n  nomothete  ·  http://localhost:${PORT}`)
  console.log(`  数据       ·  ${DB_PATH}`)
  console.log(
    status.configured
      ? `  模型       ·  ${status.model} @ ${status.host}（${status.kind}）`
      : `  模型       ·  未配置，请在界面左下角的「设置」中填写`,
  )
  if (!LOOPBACK_BIND) {
    console.log(`  注意       ·  监听在 ${HOST}，同网段的人都能用这个端点花你的额度`)
  }
  console.log('')
})
