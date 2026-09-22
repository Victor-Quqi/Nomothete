/**
 * Generation.
 *
 * Every rule here traces to docs/design.md:
 *
 *   One Strategy per call, stated as a positive constraint. Negative
 *   instructions get ignored in practice, so the Strategy is what the batch is
 *   *for*, not what it must avoid.
 *
 *   Ask for k candidates with a self-reported probability and keep the
 *   improbable ones. Self-reported probability fights with streaming — sorting
 *   a batch means waiting for all of it. So the threshold is absolute and
 *   applied on arrival: each element is judged as it lands and either goes
 *   straight to the screen or is dropped on the floor. How many survive a batch
 *   is therefore not fixed.
 *
 *   An ordinary persona. "You are a world-class brand strategist" measurably
 *   reduces diversity, and raising temperature does not fix homogeneity.
 *
 *   Count goes in the prompt, never in the schema: the Anthropic adapter moves
 *   minItems/maxItems into a description string and Google drops them outright.
 */
import { streamObject } from 'ai'
import { z } from 'zod'
import { runChecks } from '../checks/index.ts'
import { publish } from '../events.ts'
import { activeProfile, resolveModel } from '../llm.ts'
import {
  createBatch,
  existingNames,
  finishBatch,
  getSession,
  insertCandidate,
  listCandidates,
  bumpGeneration,
  touchSession,
  type Session,
} from '../store.ts'
import { PRIOR_BY_ID } from './priors.ts'
import { STRATEGY_BY_ID, type Strategy } from './strategies.ts'
import { buildProfile, pickStrategies, profileForPrompt, seedStrategies } from './taste.ts'

const CandidateSchema = z.object({
  name: z.string().describe('the name itself, one word if at all possible'),
  probability: z
    .number()
    .describe('0..1, how likely another assistant given the same brief would also produce this exact name'),
  rationale: z.string().describe('where it comes from, what it means, how it connects to this project'),
})

const PER_STRATEGY = 3

/** Generation runs are per-session and cancellable; the browser is optional. */
const running = new Map<string, AbortController>()

export function isRunning(sessionId: string) {
  return running.has(sessionId)
}

export function cancel(sessionId: string) {
  running.get(sessionId)?.abort()
  running.delete(sessionId)
}

function hasCJK(s: string) {
  return /[㐀-鿿豈-﫿]/.test(s)
}

function sampleLexicon(s: Strategy, n: number): string[] {
  const pool = [...s.lexicon]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(n, pool.length))
}

/** Trim the shapes models reliably wrap names in. */
function cleanName(raw: string): string | null {
  let n = raw.trim().replace(/^[`'"“”‘’\[(]+|[`'"“”‘’\])]+$/g, '').trim()
  n = n.replace(/\s+/g, ' ')
  if (!n) return null
  if (n.length > 40) return null
  if (!/^[A-Za-z][A-Za-z0-9]*([ ._-][A-Za-z0-9]+)*$/.test(n)) return null
  return n
}

function systemPrompt(chinese: boolean): string {
  return [
    'You are helping one person pick a name for a software project. Write plainly.',
    'Do not adopt a persona, do not use marketing register, and do not praise the names you produce.',
    '',
    'Rules for every name you output:',
    '- It must work as a repo name and as a package name: ASCII, no more than two words, and typeable.',
    '- It must not appear in the exclusion list you are given, and must not be a near-variant of anything there.',
    '- It must not be two items from the supplied word list bolted end to end. That is the one shape to avoid.',
    '- The rationale says where the name comes from, what it literally means, and how it connects to this specific project. Two sentences at most.',
    chinese
      ? '- Write the rationale in Simplified Chinese. Keep the name itself, and any source word you quote, in the original Latin script.'
      : '- Write the rationale in English.',
    '',
    'About `probability`. It is your honest estimate, between 0 and 1, of how likely a different assistant',
    'given this same brief would land on this exact name. Obvious, near-at-hand names are high. A name that',
    'only exists because of the specific constraint you were handed is low. Calibrate against yourself: if you',
    'would have offered this name without the strategy constraint, it is above 0.5. Do not flatter yourself by',
    'reporting everything as 0.01 — spread the estimates out honestly across the batch.',
  ].join('\n')
}

function userPrompt(session: Session, strategy: Strategy, taste: string, exclusions: string[]): string {
  const priorLines = session.priors
    .map(id => PRIOR_BY_ID.get(id))
    .filter(p => p && p.instruction)
    .map(p => `- [${p!.strength}] ${p!.instruction}`)

  const blocks: string[] = []
  blocks.push(`THE PROJECT\n${session.brief.trim()}`)

  blocks.push(
    `THE APPROACH FOR THIS BATCH — use this one and nothing else\n` +
      `${strategy.label} · ${strategy.device}\n\n` +
      `Word material. This is a way into the field, not a menu to order from. Welding two entries from this ` +
      `list together is the failure mode — use one as a starting point and reach past it, into the rest of the ` +
      `same vocabulary, or into what the word actually denotes:\n` +
      sampleLexicon(strategy, 12).map(l => `  · ${l}`).join('\n'),
  )

  if (priorLines.length) {
    blocks.push(
      `LEANINGS THE USER HAS LEFT SWITCHED ON\nThese come from a study of what developers actually praise and complain about. ` +
        `They are soft; the user's own reactions override them.\n${priorLines.join('\n')}`,
    )
  }

  if (taste) blocks.push(`WHAT THIS USER HAS REACTED TO SO FAR\n${taste}`)

  if (exclusions.length) {
    blocks.push(`ALREADY SHOWN — none of these, and nothing that is merely a respelling of one\n${exclusions.join(', ')}`)
  }

  blocks.push(
    `Produce exactly ${PER_STRATEGY} names under the approach above. Make them genuinely different from one another — ` +
      `${PER_STRATEGY} variations on one idea is a wasted batch.`,
  )

  return blocks.join('\n\n')
}

interface BatchOutcome {
  kept: number
  discarded: number
}

/**
 * Liveness, not patience.
 *
 * A reasoning model can stream for a minute before the first character of the
 * first name, and cutting it off at a fixed elapsed time throws away work that
 * was arriving perfectly normally. So the clock measures *silence*: any byte off
 * the wire resets it. The ceiling exists only so that a stream which dribbles
 * forever still ends.
 */
const STALL_MS = 90_000
const CEILING_MS = 600_000

/**
 * An endpoint that answers 200 with an empty array is common enough to plan for
 * — it is what a proxy does when structured output half-works. A batch is a few
 * seconds, so asking again costs less than showing the user an empty canvas and
 * a thread that claims to be done.
 */
const MAX_ATTEMPTS = 3

async function runBatch(
  session: Session,
  strategy: Strategy,
  generation: number,
  taste: string,
  sessionSignal: AbortSignal,
): Promise<BatchOutcome> {
  const batch = createBatch(session.id, generation, strategy.id)
  publish(session.id, { type: 'batch:start', batchId: batch.id, strategyId: strategy.id, generation })

  const stall = new AbortController()
  const ceiling = AbortSignal.timeout(CEILING_MS)
  const signal = AbortSignal.any([sessionSignal, stall.signal, ceiling])

  let lastChunkAt = Date.now()
  let stalled = false
  const watchdog = setInterval(() => {
    if (Date.now() - lastChunkAt < STALL_MS) return
    stalled = true
    stall.abort()
  }, 5_000)

  // The loom shows one thread per batch. Without this the thread sits still for
  // the whole of a reasoning model's first minute and reads as hung.
  let phase: 'waiting' | 'thinking' | 'writing' = 'waiting'
  const enter = (next: 'thinking' | 'writing') => {
    if (phase === next || phase === 'writing') return
    phase = next
    publish(session.id, { type: 'batch:phase', batchId: batch.id, strategyId: strategy.id, phase: next })
  }

  const stalledReason = `停住了 —— ${STALL_MS / 1000}s 内没有收到任何数据`
  const ceilingReason = `太久了 —— ${CEILING_MS / 60_000} 分钟还没写完`

  let kept = 0
  let discarded = 0
  const profile = activeProfile()

  /** One request. Returns how many elements the model actually produced. */
  async function attempt(): Promise<number> {
    const exclusions = existingNames(session.id).slice(-120)
    const stream = streamObject({
      model: resolveModel(profile, () => {
        lastChunkAt = Date.now()
        enter('thinking')
      }),
      output: 'array',
      schema: CandidateSchema,
      system: systemPrompt(hasCJK(session.brief) || session.brief.trim() === ''),
      prompt: userPrompt(session, strategy, taste, exclusions),
      temperature: 1,
      abortSignal: signal,
      // The SDK's default onError dumps the whole DOMException to the terminal.
      // The catch below already turns this into a failed batch with a reason,
      // so all that is wanted here is one line, and nothing at all on abort.
      onError: ({ error }) => {
        if (signal.aborted) return
        console.error(`[nomothete] ${strategy.id} 生成出错：`, error instanceof Error ? error.message : error)
      },
    })

    // We only ever read the element stream, but the SDK also hands back
    // `object` and `usage` promises. On abort those reject, and a rejection
    // nobody awaited is an unhandled one — which would take the process down.
    void stream.object.catch(() => {})
    void stream.usage.catch(() => {})

    let seen = 0
    for await (const element of stream.elementStream) {
      if (signal.aborted) break
      seen++
      enter('writing')
      const name = cleanName(element.name ?? '')
      if (!name) continue

      const probability = Number.isFinite(element.probability)
        ? Math.min(1, Math.max(0, element.probability))
        : 0.5

      // The absolute threshold, applied the moment the element lands. No
      // waiting for the batch, no re-ranking — that is the whole point.
      if (probability > session.threshold) {
        discarded++
        publish(session.id, { type: 'candidate:discarded', batchId: batch.id, name, probability })
        continue
      }

      const candidate = insertCandidate({
        sessionId: session.id,
        name,
        probability,
        rationale: (element.rationale ?? '').trim(),
        strategyId: strategy.id,
        generation,
      })
      if (!candidate) continue // already in this session

      kept++
      publish(session.id, { type: 'candidate', candidate })

      // Checks are part of generation, not a separate step the user asks for.
      // They ride the session signal, not the batch one — a slow batch timing
      // out should not cancel the checks on the names it already produced.
      void runChecks(candidate.id, candidate.name, {
        deep: false,
        signal: sessionSignal,
        onResult: result => publish(session.id, { type: 'check', candidateId: candidate.id, result }),
      }).catch(() => {})
    }
    return seen
  }

  try {
    let seen = 0
    for (let i = 0; i < MAX_ATTEMPTS && seen === 0 && !signal.aborted; i++) {
      seen = await attempt()
      // Back to waiting, so the thread reads as a fresh request rather than
      // freezing on whatever the empty attempt left behind.
      if (seen === 0) phase = 'waiting'
    }

    const cut = sessionSignal.aborted
      ? '已取消'
      : stalled
        ? stalledReason
        : ceiling.aborted
          ? ceilingReason
          : seen === 0
            ? `${MAX_ATTEMPTS} 次都只回来一个空数组 —— 是模型端的问题，不是这条策略`
            : null
    if (cut) {
      // Whatever arrived before the cut is kept; the thread just says why it stopped.
      finishBatch(batch.id, 'failed', kept, discarded, cut)
      publish(session.id, { type: 'batch:failed', batchId: batch.id, strategyId: strategy.id, error: cut })
    } else {
      finishBatch(batch.id, 'done', kept, discarded)
      publish(session.id, { type: 'batch:done', batchId: batch.id, strategyId: strategy.id, kept, discarded })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const reason = sessionSignal.aborted
      ? '已取消'
      : stalled
        ? stalledReason
        : ceiling.aborted
          ? ceilingReason
          : message
    finishBatch(batch.id, 'failed', kept, discarded, reason)
    publish(session.id, { type: 'batch:failed', batchId: batch.id, strategyId: strategy.id, error: reason })
  } finally {
    clearInterval(watchdog)
  }
  return { kept, discarded }
}

export interface GenerateOptions {
  /** How many Strategies run in parallel. */
  width?: number
  /** Force a specific set, e.g. when the user asks for one more of a kind. */
  strategyIds?: string[]
}

/**
 * Starts a generation and returns immediately. Progress arrives on the session
 * channel; the caller is not expected to wait, and neither is the browser.
 */
export function startGeneration(sessionId: string, opts: GenerateOptions = {}): { generation: number; strategies: string[] } {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')
  if (running.has(sessionId)) throw new Error('这个会话已经有一批在跑了')

  const candidates = listCandidates(sessionId)
  const profile = buildProfile(candidates, session.seeds)
  const width = Math.max(1, Math.min(8, opts.width ?? (profile.observations === 0 ? 6 : 4)))

  const recentlyUsed = candidates.slice(-30).map(c => c.strategyId)
  const strategyIds =
    opts.strategyIds?.length
      ? opts.strategyIds
      : profile.observations === 0 && candidates.length === 0
        ? seedStrategies(width)
        : pickStrategies(profile, width, recentlyUsed)

  const generation = bumpGeneration(sessionId)
  const fresh = getSession(sessionId)!
  const taste = profileForPrompt(profile)

  const controller = new AbortController()
  running.set(sessionId, controller)
  publish(sessionId, { type: 'generation:start', generation, strategies: strategyIds })

  void (async () => {
    let outcomes: BatchOutcome[] = []
    try {
      outcomes = await Promise.all(
        strategyIds.map(id => {
          const strategy = STRATEGY_BY_ID.get(id)
          if (!strategy) return Promise.resolve({ kept: 0, discarded: 0 })
          return runBatch(fresh, strategy, generation, taste, controller.signal)
        }),
      )
    } finally {
      running.delete(sessionId)
      touchSession(sessionId)
      // A generation that produced nothing at all is almost always the provider,
      // not the prompt. Say so, rather than leaving an empty canvas to interpret.
      const kept = outcomes.reduce((n, o) => n + o.kept, 0)
      const discarded = outcomes.reduce((n, o) => n + o.discarded, 0)
      if (!controller.signal.aborted && kept === 0 && discarded === 0) {
        publish(sessionId, {
          type: 'notice',
          level: 'error',
          message: '这一代一个名字都没回来。多半是模型端的问题 —— 再来一批通常就好了。',
        })
      }
      publish(sessionId, { type: 'generation:done', generation })
    }
  })()

  return { generation, strategies: strategyIds }
}

/**
 * The rate-limited tier, triggered by a positive Verdict.
 *
 * `all` asks every tier again instead, which is what a reader pressing 重新检查
 * means: the registries may have moved since the name was generated, and so may
 * the sentence this build would use to report them.
 */
export function startDeepChecks(sessionId: string, candidateId: string, name: string, all = false) {
  const controller = new AbortController()
  void runChecks(candidateId, name, {
    deep: true,
    all,
    signal: controller.signal,
    onResult: result => publish(sessionId, { type: 'check', candidateId, result }),
    onGone: checkId => publish(sessionId, { type: 'check:gone', candidateId, checkId }),
  }).catch(() => {})
}
