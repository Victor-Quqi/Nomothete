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
  /** Client-side only, and only while running. The server does not store it. */
  phase?: 'waiting' | 'thinking' | 'writing'
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

export interface Bootstrap {
  strategies: StrategyInfo[]
  families: Family[]
  priors: Prior[]
  checks: { id: string; label: string; tier: CheckTier; when: string; tierLabel: string }[]
  provider: { configured: boolean; kind?: string; model?: string; host?: string; problem?: string }
  sessions: SessionSummary[]
  dbPath: string
}

export interface SessionPayload {
  session: Session
  candidates: Candidate[]
  batches: Batch[]
  running: boolean
  profile: TasteProfile
}

export type ServerEvent =
  | { type: 'generation:start'; generation: number; strategies: string[] }
  | { type: 'batch:start'; batchId: string; strategyId: string; generation: number }
  | { type: 'batch:phase'; batchId: string; strategyId: string; phase: 'thinking' | 'writing' }
  | { type: 'batch:done'; batchId: string; strategyId: string; kept: number; discarded: number }
  | { type: 'batch:failed'; batchId: string; strategyId: string; error: string }
  | { type: 'candidate'; candidate: Candidate }
  | { type: 'candidate:discarded'; batchId: string; name: string; probability: number }
  | { type: 'check'; candidateId: string; result: CheckResult }
  | { type: 'verdict'; candidateId: string; verdict: number }
  | { type: 'generation:done'; generation: number }
  | { type: 'notice'; level: 'info' | 'error'; message: string }
