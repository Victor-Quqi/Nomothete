/**
 * Per-session event bus with a replay buffer.
 *
 * Generation always runs in the background; the browser is a subscriber that
 * may come and go. Every event carries a monotonic id so a reconnecting client
 * replays from `Last-Event-ID` instead of losing whatever arrived while the
 * laptop lid was shut.
 */
import { EventEmitter } from 'node:events'
import type { Candidate } from './store.ts'
import type { CheckResult } from './checks/types.ts'

export type ServerEvent =
  | { type: 'generation:start'; generation: number; strategies: string[] }
  | { type: 'batch:start'; batchId: string; strategyId: string; generation: number }
  /** Transient, not persisted: what the thread on the loom should be saying. */
  | { type: 'batch:phase'; batchId: string; strategyId: string; phase: 'thinking' | 'writing' }
  | { type: 'batch:done'; batchId: string; strategyId: string; kept: number; discarded: number }
  | { type: 'batch:failed'; batchId: string; strategyId: string; error: string }
  | { type: 'candidate'; candidate: Candidate }
  | { type: 'candidate:discarded'; batchId: string; name: string; probability: number }
  | { type: 'check'; candidateId: string; result: CheckResult }
  /** A re-run found nothing where the stored answer had found something. */
  | { type: 'check:gone'; candidateId: string; checkId: string }
  | { type: 'verdict'; candidateId: string; verdict: number }
  | { type: 'generation:done'; generation: number }
  /** The rail's label for this session, written after the session was. */
  | { type: 'session:title'; title: string }
  | { type: 'notice'; level: 'info' | 'error'; message: string }

export interface Envelope {
  id: number
  event: ServerEvent
}

const BUFFER = 400

class SessionChannel extends EventEmitter {
  private seq = 0
  private buffer: Envelope[] = []

  publish(event: ServerEvent) {
    const env: Envelope = { id: ++this.seq, event }
    this.buffer.push(env)
    if (this.buffer.length > BUFFER) this.buffer.splice(0, this.buffer.length - BUFFER)
    this.emit('event', env)
  }

  since(lastId: number): Envelope[] {
    return this.buffer.filter(e => e.id > lastId)
  }
}

const channels = new Map<string, SessionChannel>()

export function channel(sessionId: string): SessionChannel {
  let c = channels.get(sessionId)
  if (!c) {
    c = new SessionChannel()
    c.setMaxListeners(50)
    channels.set(sessionId, c)
  }
  return c
}

export function publish(sessionId: string, event: ServerEvent) {
  channel(sessionId).publish(event)
}

export function dropChannel(sessionId: string) {
  channels.delete(sessionId)
}
