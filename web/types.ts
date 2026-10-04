/** Mirrors of the server's shapes. The wire is JSON; these are the contract. */

export type Verdict = -2 | -1 | 0 | 1 | 2

export type CheckTier = 'local' | 'free' | 'ratelimited' | 'paid'
export type CheckStatus = 'clear' | 'taken' | 'blocked' | 'caution' | 'invalid' | 'error' | 'pending'

export interface CheckResult {
  checkId: string
  label: string
  tier: CheckTier
  status: CheckStatus
  headline: string
  detail?: string
  data?: any
}

export interface Seed {
  text: string
  verdict: Verdict
  note?: string
}

export interface Session {
  id: string
  title: string
  pinned: boolean
  brief: string
  seeds: Seed[]
  priors: string[]
  threshold: number
  generation: number
  createdAt: number
  updatedAt: number
}

export interface SessionSummary extends Session {
  candidateCount: number
  lovedCount: number
}

export interface Candidate {
  id: string
  sessionId: string
  parentId: string | null
  name: string
  probability: number
  rationale: string
  strategyId: string
  generation: number
  verdict: Verdict
  note: string | null
  createdAt: number
  verdictAt: number | null
  checks?: CheckResult[]
  verification?: Verification | null
}

/** `failed`: the search or page reading for this claim failed; it was not judged. */
export type ClaimVerdict = 'supported' | 'contradicted' | 'insufficient' | 'failed'

export interface ClaimFinding {
  text: string
  /** Search terms. Also what the browser search link asks. */
  query: string
  verdict: ClaimVerdict
  note?: string
  /** For failed and insufficient: why the claim is still open, in the model's or the service's words. */
  reason?: string
  sources: { url: string; title: string; excerpt: string }[]
}

/** Rationale verification. Never part of `checks`, which are registry answers. */
export type Verification =
  | { state: 'pending' }
  | { state: 'done'; claims: ClaimFinding[]; checkedAt: number }
  | { state: 'failed'; reason: string; checkedAt: number }

export interface AppSettings {
  autoVerify: boolean
}

export interface Batch {
  id: string
  sessionId: string
  generation: number
  strategyId: string
  state: 'running' | 'done' | 'failed'
  kept: number
  discarded: number
  error: string | null
  createdAt: number
  /** What the user typed for this batch, if anything. */
  direction: string | null
  /** The Candidate this batch follows, if it was asked for from one. */
  parentId: string | null
  /** Client-side only, and only while running. The server does not store it. */
  phase?: 'waiting' | 'thinking' | 'writing'
}

/** What one press of 再来一批 can ask for beyond the default. */
export interface GenerateAsk {
  /** How many Strategies, when none are named. */
  width?: number
  strategyIds?: string[]
  /** A line typed for this batch. */
  direction?: string
  /** A Candidate to ask for more from. */
  parentId?: string
}

/** A name the rarity floor turned away. */
export interface Discard {
  id: string
  sessionId: string
  parentId: string | null
  name: string
  probability: number
  rationale: string
  strategyId: string
  generation: number
  createdAt: number
}

export type FamilyId = 'root' | 'craft' | 'nature' | 'instrument' | 'formation' | 'tongue'

export interface Family {
  id: FamilyId
  label: string
  hue: number
}

export interface StrategyInfo {
  id: string
  label: string
  family: FamilyId
  brief: string
}

export type Strength = 'strong' | 'moderate' | 'thin' | 'contradicted'

export interface Prior {
  id: string
  statement: string
  strength: Strength
  evidence: string
  overturnedBy: string
  defaultOn: boolean
  instruction: string
}

export interface Trait {
  id: string
  statement: string
  n: number
  direction: 'toward' | 'away'
}

export interface TasteProfile {
  observations: number
  positives: number
  negatives: number
  strategyScores: { id: string; label: string; family: FamilyId; score: number; n: number }[]
  familyScores: { id: FamilyId; label: string; score: number; n: number }[]
  traits: Trait[]
  loved: { name: string; strategy: string; note?: string }[]
  rejected: { name: string; strategy: string; note?: string }[]
  statement: string
  /** The literal paragraph this profile becomes in the next prompt. */
  injected: string
}

export type ProviderKind = 'openai-chat' | 'openai-responses' | 'anthropic' | 'google'

export interface ProviderStatus {
  configured: boolean
  kind?: string
  model?: string
  /** Host only. The key is never serialised, anywhere. */
  host?: string
  structuredOutput?: string
  hasKey?: boolean
  problem?: string
}

/**
 * What the settings drawer is allowed to know.
 *
 * Note what is absent: the key. It goes in through PUT and never comes back —
 * `keyHint` is the last four characters, enough to tell two keys apart and
 * useless to anything that scrapes this page.
 */
export interface ProviderConfig {
  provider: ProviderStatus
  source: 'config-file' | 'env' | 'none'
  path: string
  shadowsEnv: boolean
  writable: boolean
  baseURL: string
  model: string
  /** What an empty base URL and model stand for. */
  defaults: { baseURL: string; model: string }
  kind: ProviderKind | null
  reasoningEffort: string
  keyHint: string | null
}

export interface ProbeResult {
  ok: boolean
  modelListed?: boolean
  count?: number
  sample?: string[]
  message: string
}

export interface Bootstrap {
  strategies: StrategyInfo[]
  families: Family[]
  priors: Prior[]
  checks: { id: string; label: string; tier: CheckTier; when: string; tierLabel: string }[]
  provider: ProviderStatus
  settings: AppSettings
  sessions: SessionSummary[]
  dbPath: string
}

export interface SessionPayload {
  session: Session
  candidates: Candidate[]
  batches: Batch[]
  discards: Discard[]
  running: boolean
  profile: TasteProfile
  /** Names whose slow tier the server is running now. */
  checking: string[]
}

export type ServerEvent =
  | { type: 'generation:start'; generation: number; strategies: string[] }
  | { type: 'batch:start'; batchId: string; strategyId: string; generation: number; direction: string | null; parentId: string | null }
  | { type: 'batch:phase'; batchId: string; strategyId: string; phase: 'thinking' | 'writing' }
  | { type: 'batch:done'; batchId: string; strategyId: string; kept: number; discarded: number }
  | { type: 'batch:failed'; batchId: string; strategyId: string; error: string }
  | { type: 'candidate'; candidate: Candidate }
  | { type: 'candidate:discarded'; batchId: string; discard: Discard }
  | { type: 'discard:kept'; discardId: string }
  | { type: 'check'; candidateId: string; result: CheckResult }
  | { type: 'check:gone'; candidateId: string; checkId: string }
  | { type: 'check:running'; candidateId: string; running: boolean }
  | { type: 'verdict'; candidateId: string; verdict: number }
  | { type: 'verification'; candidateId: string; verification: Verification | null }
  | { type: 'generation:done'; generation: number }
  | { type: 'session:title'; title: string }
  | { type: 'notice'; level: 'info' | 'error'; message: string }
