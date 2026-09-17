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
import { CHECK_MANIFEST, TIER_LABEL } from './checks/index.ts'
import { DB_PATH, getDb } from './db.ts'
import { env } from './env.ts'
import { channel } from './events.ts'
import { providerStatus } from './llm.ts'
import { cancel, isRunning, startDeepChecks, startGeneration } from './naming/generate.ts'
import { PRIORS } from './naming/priors.ts'
import { FAMILIES, STRATEGIES } from './naming/strategies.ts'
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

const app = express()
app.use(express.json({ limit: '256kb' }))

// Never log request bodies or Authorization headers (provider-adapters.md §4).
app.use((req, _res, next) => {
  if (process.env.NOMOTHETE_VERBOSE) console.log(`${req.method} ${req.path}`)
  next()
})

const api = express.Router()

api.get('/bootstrap', (_req, res) => {
  res.json({
    strategies: STRATEGIES.map(s => ({ id: s.id, label: s.label, family: s.family, brief: s.brief })),
    families: FAMILIES,
    priors: PRIORS,
    checks: CHECK_MANIFEST.map(c => ({ ...c, tierLabel: TIER_LABEL[c.tier] })),
    provider: providerStatus(),
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
 * A model that claims to have learned your taste should be willing to show the
 * sentence it learned, word for word. Without it the drawer is an assertion;
 * with it, it is checkable.
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
  }
}

api.get('/sessions/:id', (req, res) => {
  const payload = sessionPayload(req.params.id)
  if (!payload) {
    res.status(404).json({ error: '会话不存在' })
    return
  }
  res.json(payload)
})

api.patch('/sessions/:id', (req, res) => {
  const { title, priors, threshold, brief } = req.body ?? {}
  const session = updateSession(req.params.id, { title, priors, threshold, brief })
  if (!session) {
    res.status(404).json({ error: '会话不存在' })
    return
  }
  res.json({ session })
})

api.delete('/sessions/:id', (req, res) => {
  cancel(req.params.id)
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

  const beat = setInterval(() => res.write(': beat\n\n'), 20_000)
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

  res.json({ candidate })
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
  startDeepChecks(candidate.sessionId, candidate.id, candidate.name)
  res.json({ ok: true })
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
    `# ${session.title}`,
    '',
    session.brief,
    '',
    `共 ${candidates.length} 个候选，${candidates.filter(c => c.verdict > 0).length} 个正面 Verdict。`,
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
      if (c.note) lines.push(`> ${c.note}`, '')
    }
  }
  // The drawer can afford to leave the traits as rows and the names as bars; a
  // file that leaves the session behind cannot, so spell them out here.
  lines.push('## Taste Profile', '', profile.statement, '')
  if (profile.loved.length) lines.push(`- 往这边走：${profile.loved.map(l => l.name).join('、')}`)
  if (profile.rejected.length) lines.push(`- 离这边远一点：${profile.rejected.map(l => l.name).join('、')}`)
  for (const t of profile.traits) lines.push(`- ${t.statement}`)
  if (profile.loved.length || profile.rejected.length || profile.traits.length) lines.push('')
  if (profile.injected) lines.push('下一批会收到这段：', '', '```', profile.injected, '```', '')
  res.setHeader('content-type', 'text/markdown; charset=utf-8')
  res.setHeader('content-disposition', `attachment; filename="${session.id}.md"`)
  res.send(lines.join('\n'))
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

app.listen(PORT, () => {
  const status = providerStatus()
  console.log(`\n  nomothete  ·  http://localhost:${PORT}`)
  console.log(`  数据       ·  ${DB_PATH}`)
  console.log(
    status.configured
      ? `  模型       ·  ${status.model} @ ${status.host}（${status.kind}）`
      : `  模型       ·  未配置 —— ${status.problem}`,
  )
  console.log('')
})
