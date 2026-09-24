/**
 * Rationale verification: does the evidence on the web back what a rationale
 * says about where a word comes from and what it means?
 *
 * It runs only when asked (a positive Verdict, or a recheck), never for every
 * new name, and never holds up generation. It reports findings per claim and
 * changes nothing else: not the name, not the rationale, not the order, not
 * the Verdict. A claim with no support found is insufficient, not false.
 *
 * Work is bounded everywhere: two jobs at a time, a short queue, a handful of
 * searches and page fetches per job, capped evidence text, and a timeout on
 * every network and model call. One job per candidate at a time; a finished
 * result is reused until someone asks for a recheck.
 */
import { publish as publishEvent } from '../events.ts'
import { autoVerifyEnabled } from '../settings.ts'
import { STRATEGIES } from '../naming/strategies.ts'
import {
  type RationaleInput,
  extractClaims,
  judgeClaims,
  bindFindings,
} from './judge.ts'
import { type Page, type SearchHit, KeenableError, fetchPage, search } from './keenable.ts'
import { type ClaimFinding, type Outcome, type VerificationTrace, loadOutcome, markBusy, markPending, saveOutcome, saveTrace } from './store.ts'
import { researchClaims } from './research.ts'

const MAX_RUNNING = 2
const MAX_QUEUED = 20
const JOB_TIMEOUT_MS = 180_000

export interface VerifierDeps {
  research: typeof researchClaims
  search: (input: { query: string; site?: string; maxResults: number; snippetChars: number }, signal: AbortSignal) => Promise<SearchHit[]>
  fetchPage: (input: { url: string; maxChars: number }, signal: AbortSignal) => Promise<Page>
  extract: typeof extractClaims
  judge: typeof judgeClaims
  enabled: () => boolean
  publish: typeof publishEvent
}

let deps: VerifierDeps = {
  research: researchClaims,
  search,
  fetchPage,
  extract: extractClaims,
  judge: judgeClaims,
  enabled: autoVerifyEnabled,
  publish: publishEvent,
}

/** Tests replace the network and the model here. */
export function configureVerifier(over: Partial<VerifierDeps>) {
  deps = { ...deps, ...over }
}

interface Job {
  candidateId: string
  sessionId: string
  name: string
  rationale: string
  strategy?: RationaleInput['strategy']
  controller: AbortController
  trace: VerificationTrace
}

const jobs = new Map<string, Job>()
const queue: Job[] = []
let running = 0

export type RequestResult = 'off' | 'pending' | 'reused' | 'busy'

/**
 * Start verification unless it is off, already running, or already done.
 * `refresh` (an explicit recheck) replaces a finished result.
 */
export function requestVerification(
  candidate: { id: string; sessionId: string; name: string; rationale: string; strategyId?: string },
  opts: { refresh?: boolean } = {},
): RequestResult {
  if (!deps.enabled()) return 'off'
  if (jobs.has(candidate.id)) return 'pending'
  if (!opts.refresh && loadOutcome(candidate.id)?.state === 'done') return 'reused'
  if (queue.length >= MAX_QUEUED) {
    // Say so rather than drop the request. A card with a stored result keeps
    // it; one without shows the refusal, which carries the browser search link.
    const reason = '核查排队已满，稍后重新检查'
    if (!loadOutcome(candidate.id)) {
      markBusy(candidate.id, reason)
      deps.publish(candidate.sessionId, {
        type: 'verification',
        candidateId: candidate.id,
        verification: { state: 'failed', reason, checkedAt: Date.now() },
      })
    }
    deps.publish(candidate.sessionId, {
      type: 'notice',
      level: 'error',
      message: `${candidate.name}：联网核查排队已满，这次没有核查。稍后重新检查，或在详情里用浏览器搜索。`,
    })
    return 'busy'
  }

  const strategy = STRATEGIES.find(s => s.id === candidate.strategyId)
  const job: Job = {
    candidateId: candidate.id,
    sessionId: candidate.sessionId,
    name: candidate.name,
    rationale: candidate.rationale,
    strategy: strategy && { label: strategy.label, brief: strategy.brief },
    controller: new AbortController(),
    trace: { version: 2, startedAt: Date.now(), steps: [] },
  }
  jobs.set(job.candidateId, job)
  markPending(job.candidateId, true)
  queue.push(job)
  deps.publish(job.sessionId, { type: 'verification', candidateId: job.candidateId, verification: { state: 'pending' } })
  pump()
  return 'pending'
}

/** The switch went off. Stop everything and put each card back to its last finished state. */
export function cancelAllVerifications() {
  const cancelled = [...jobs.values()]
  jobs.clear()
  queue.length = 0
  for (const job of cancelled) {
    job.controller.abort()
    markPending(job.candidateId, false)
    let previous: Outcome | null = null
    try {
      previous = loadOutcome(job.candidateId)
    } catch {
      // Nothing to restore.
    }
    deps.publish(job.sessionId, { type: 'verification', candidateId: job.candidateId, verification: previous })
  }
}

/** The session is being deleted; its jobs have nowhere to write. */
export function cancelSessionVerifications(sessionId: string) {
  for (const job of [...jobs.values()]) {
    if (job.sessionId !== sessionId) continue
    job.controller.abort()
    jobs.delete(job.candidateId)
    markPending(job.candidateId, false)
  }
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].sessionId === sessionId) queue.splice(i, 1)
}

/** Tests only: how many jobs are queued or running. */
export function verificationLoad() {
  return { running, queued: queue.length, jobs: jobs.size }
}

function pump() {
  while (running < MAX_RUNNING && queue.length) {
    const job = queue.shift()!
    if (job.controller.signal.aborted) continue
    running++
    void execute(job).finally(() => {
      running--
      pump()
    })
  }
}

class Failure extends Error {}

async function execute(job: Job) {
  const timeout = AbortSignal.timeout(JOB_TIMEOUT_MS)
  const signal = AbortSignal.any([job.controller.signal, timeout])
  let outcome: Outcome | null
  try {
    outcome = await verify(job, signal)
  } catch (err) {
    outcome = job.controller.signal.aborted
      ? null
      : failed(timeout.aborted ? '核查超时' : err instanceof Failure || err instanceof KeenableError ? err.message : '核查出错')
  }
  settle(job, outcome)
}

function settle(job: Job, outcome: Outcome | null) {
  // Cancelled, or replaced by a newer job for the same candidate.
  if (jobs.get(job.candidateId) !== job) return
  jobs.delete(job.candidateId)
  markPending(job.candidateId, false)
  let shown: Outcome | null = null
  try {
    if (outcome && deps.enabled()) {
      saveOutcome(job.candidateId, outcome)
      job.trace.elapsedMs = Date.now() - job.trace.startedAt
      job.trace.steps.push({ stage: 'outcome', data: outcome })
      saveTrace(job.candidateId, job.trace)
      shown = outcome
    } else {
      shown = loadOutcome(job.candidateId)
    }
  } catch {
    // The candidate is gone. Nothing to write and nobody to tell.
    return
  }
  deps.publish(job.sessionId, { type: 'verification', candidateId: job.candidateId, verification: shown })
}

function failed(reason: string): Outcome {
  return { state: 'failed', reason, checkedAt: Date.now() }
}

function modelFailure(err: unknown): Failure {
  const message = err instanceof Error ? err.message : ''
  if (message.startsWith('没有配置模型')) return new Failure('没有配置模型')
  if (message.startsWith('找不到 API key')) return new Failure('模型缺少 API key')
  return new Failure('模型没有给出可用的结果')
}

async function viaModel<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (signal.aborted) throw err
    throw modelFailure(err)
  }
}

async function verify(job: Job, signal: AbortSignal): Promise<Outcome> {
  const done = (claims: ClaimFinding[]): Outcome => ({ state: 'done', claims, checkedAt: Date.now() })
  if (!job.rationale.trim()) return done([])
  const context = { name: job.name, rationale: job.rationale, strategy: job.strategy }
  job.trace.steps.push({ stage: 'input', data: context })
  const claims = await viaModel(() => deps.extract(context, signal), signal)
  job.trace.steps.push({ stage: 'claims', data: claims })
  if (!claims.length) return done([])
  const research = await viaModel(() => deps.research({ ...context, claims }, deps, signal, job.trace), signal)
  if (!research.evidence.length && research.errors.length) throw new Failure(research.errors[0])
  const judgements = await viaModel(() => deps.judge({ claims, evidence: research.evidence, rationale: job.rationale, strategy: job.strategy, research: research.notes + '\n' + research.errors.join('\n') }, signal), signal)
  job.trace.steps.push({ stage: 'judgement', data: { claims, judgements } })
  return done(bindFindings(claims, judgements, research.evidence))
}
