/**
 * All client state in one hook.
 *
 * The backend owns the truth (docs/design.md → 数据模型: the frontend renders
 * and reports events). This file holds a projection of it, kept current by the
 * session's event stream, plus the two things that are genuinely local: which
 * session is open, and an optimistic copy of a Verdict while its POST is in
 * flight. Nothing here decides anything about a name.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.ts'
import type {
  Batch,
  Bootstrap,
  Candidate,
  CheckResult,
  Family,
  ServerEvent,
  Session,
  SessionSummary,
  StrategyInfo,
  TasteProfile,
  Verdict,
} from './types.ts'

export interface Toast {
  id: number
  message: string
  tone: 'plain' | 'good' | 'error'
}

export interface Discard {
  name: string
  probability: number
  at: number
}

function hashSessionId(): string | null {
  const m = /^#\/s\/([A-Za-z0-9_-]+)/.exec(window.location.hash)
  return m ? m[1] : null
}

function mergeCheck(list: CheckResult[] | undefined, result: CheckResult): CheckResult[] {
  const next = (list ?? []).filter(c => c.checkId !== result.checkId)
  next.push(result)
  return next
}

export function useAtelier() {
  const [boot, setBoot] = useState<Bootstrap | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])

  const [sessionId, setSessionId] = useState<string | null>(hashSessionId)
  const [session, setSession] = useState<Session | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [profile, setProfile] = useState<TasteProfile | null>(null)
  const [running, setRunning] = useState(false)
  const [discards, setDiscards] = useState<Discard[]>([])
  const [loadingSession, setLoadingSession] = useState(false)
  const [connected, setConnected] = useState(false)

  const [toasts, setToasts] = useState<Toast[]>([])
  const toastSeq = useRef(0)

  const toast = useCallback((message: string, tone: Toast['tone'] = 'plain') => {
    const id = ++toastSeq.current
    setToasts(t => [...t.slice(-3), { id, message, tone }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'error' ? 6000 : 3200)
  }, [])

  // ── bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    api
      .bootstrap()
      .then(b => {
        setBoot(b)
        setSessions(b.sessions)
      })
      .catch(err => setBootError(err.message))
  }, [])

  // ── hash is the address bar; a reload lands back where you were ───────────
  useEffect(() => {
    const onHash = () => setSessionId(hashSessionId())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const open = useCallback((id: string | null) => {
    window.location.hash = id ? `#/s/${id}` : ''
    setSessionId(id)
  }, [])

  // ── session payload ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      setSession(null)
      setCandidates([])
      setBatches([])
      setProfile(null)
      setRunning(false)
      setDiscards([])
      return
    }
    let alive = true
    setLoadingSession(true)
    api
      .session(sessionId)
      .then(p => {
        if (!alive) return
        setSession(p.session)
        setCandidates(p.candidates)
        setBatches(p.batches)
        setProfile(p.profile)
        setRunning(p.running)
        setDiscards([])
      })
      .catch(err => {
        if (!alive) return
        toast(err.message, 'error')
        open(null)
      })
      .finally(() => alive && setLoadingSession(false))
    return () => {
      alive = false
    }
  }, [sessionId, open, toast])

  // ── the stream ────────────────────────────────────────────────────────────
  const refreshProfileSoon = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleProfile = useCallback((id: string) => {
    if (refreshProfileSoon.current) clearTimeout(refreshProfileSoon.current)
    refreshProfileSoon.current = setTimeout(() => {
      fetch(`/api/sessions/${id}/taste`)
        .then(r => (r.ok ? r.json() : null))
        .then(p => p && setProfile(p.profile))
        .catch(() => {})
    }, 500)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    const source = new EventSource(`/api/sessions/${sessionId}/stream`)

    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)

    source.onmessage = ev => {
      let event: ServerEvent
      try {
        event = JSON.parse(ev.data)
      } catch {
        return
      }
      switch (event.type) {
        case 'generation:start':
          setRunning(true)
          setDiscards([])
          break

        case 'batch:start':
          setBatches(bs =>
            bs.some(b => b.id === event.batchId)
              ? bs
              : [
                  ...bs,
                  {
                    id: event.batchId,
                    sessionId,
                    generation: event.generation,
                    strategyId: event.strategyId,
                    state: 'running',
                    kept: 0,
                    discarded: 0,
                    error: null,
                    createdAt: Date.now(),
                    phase: 'waiting',
                  },
                ],
          )
          break

        case 'batch:phase':
          setBatches(bs => bs.map(b => (b.id === event.batchId ? { ...b, phase: event.phase } : b)))
          break

        case 'batch:done':
          setBatches(bs =>
            bs.map(b =>
              b.id === event.batchId
                ? { ...b, state: 'done', kept: event.kept, discarded: event.discarded }
                : b,
            ),
          )
          break

        case 'batch:failed':
          setBatches(bs => bs.map(b => (b.id === event.batchId ? { ...b, state: 'failed', error: event.error } : b)))
          if (event.error !== '已取消') toast(`一批失败了：${event.error}`, 'error')
          break

        case 'candidate':
          setCandidates(cs => (cs.some(c => c.id === event.candidate.id) ? cs : [...cs, event.candidate]))
          break

        case 'candidate:discarded':
          setDiscards(d => [...d.slice(-49), { name: event.name, probability: event.probability, at: Date.now() }])
          break

        case 'check':
          setCandidates(cs =>
            cs.map(c => (c.id === event.candidateId ? { ...c, checks: mergeCheck(c.checks, event.result) } : c)),
          )
          break

        case 'verdict':
          setCandidates(cs =>
            cs.map(c => (c.id === event.candidateId ? { ...c, verdict: event.verdict as Verdict } : c)),
          )
          break

        case 'generation:done':
          setRunning(false)
          scheduleProfile(sessionId)
          break

        case 'notice':
          toast(event.message, event.level === 'error' ? 'error' : 'plain')
          break
      }
    }

    return () => source.close()
  }, [sessionId, toast, scheduleProfile])

  // ── actions ───────────────────────────────────────────────────────────────
  const reloadSessions = useCallback(() => {
    api.sessions().then(r => setSessions(r.sessions)).catch(() => {})
  }, [])

  const createSession = useCallback(
    async (input: {
      brief: string
      title?: string
      seeds?: { text: string; verdict: Verdict }[]
      priors?: string[]
      threshold?: number
    }) => {
      const r = await api.createSession({ ...input, autostart: true })
      setSessions(s => [{ ...r.session, candidateCount: 0, lovedCount: 0 }, ...s])
      open(r.session.id)
      if (r.error) toast(r.error, 'error')
      return r.session
    },
    [open, toast],
  )

  const generate = useCallback(
    async (opts: { width?: number; strategyIds?: string[] } = {}) => {
      if (!sessionId) return
      setRunning(true)
      try {
        await api.generate(sessionId, opts)
      } catch (err) {
        setRunning(false)
        toast((err as Error).message, 'error')
      }
    },
    [sessionId, toast],
  )

  const cancel = useCallback(async () => {
    if (!sessionId) return
    await api.cancel(sessionId).catch(() => {})
    setRunning(false)
  }, [sessionId])

  // Actions read the current list through a ref so their identity stays stable
  // while candidates stream in — otherwise every arrival re-renders every plate.
  const candidatesRef = useRef<Candidate[]>(candidates)
  candidatesRef.current = candidates

  const setVerdict = useCallback(
    async (candidateId: string, verdict: Verdict) => {
      const before = candidatesRef.current.find(c => c.id === candidateId)
      if (!before) return
      const next = before.verdict === verdict ? (0 as Verdict) : verdict
      // Optimistic: the dial must move under the finger, not after a round trip.
      setCandidates(cs => cs.map(c => (c.id === candidateId ? { ...c, verdict: next } : c)))
      try {
        const r = await api.verdict(candidateId, next)
        setCandidates(cs => cs.map(c => (c.id === candidateId ? { ...r.candidate, checks: r.candidate.checks } : c)))
        if (sessionId) scheduleProfile(sessionId)
      } catch (err) {
        setCandidates(cs => cs.map(c => (c.id === candidateId ? { ...c, verdict: before.verdict } : c)))
        toast((err as Error).message, 'error')
      }
    },
    [sessionId, scheduleProfile, toast],
  )

  const setNote = useCallback(
    async (candidateId: string, note: string) => {
      setCandidates(cs => cs.map(c => (c.id === candidateId ? { ...c, note } : c)))
      try {
        await api.note(candidateId, note)
        if (sessionId) scheduleProfile(sessionId)
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    },
    [sessionId, scheduleProfile, toast],
  )

  const recheck = useCallback(
    async (candidateId: string) => {
      try {
        await api.recheck(candidateId)
        toast('深度检查已排队', 'plain')
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    },
    [toast],
  )

  const setPriors = useCallback(
    async (priors: string[]) => {
      if (!sessionId) return
      setSession(s => (s ? { ...s, priors } : s))
      try {
        await api.patchSession(sessionId, { priors })
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    },
    [sessionId, toast],
  )

  const setThreshold = useCallback(
    async (threshold: number) => {
      if (!sessionId) return
      setSession(s => (s ? { ...s, threshold } : s))
      try {
        await api.patchSession(sessionId, { threshold })
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    },
    [sessionId, toast],
  )

  const rename = useCallback(
    async (title: string) => {
      if (!sessionId) return
      setSession(s => (s ? { ...s, title } : s))
      setSessions(ss => ss.map(s => (s.id === sessionId ? { ...s, title } : s)))
      await api.patchSession(sessionId, { title }).catch(() => {})
    },
    [sessionId],
  )

  const removeSession = useCallback(
    async (id: string) => {
      await api.deleteSession(id).catch(() => {})
      setSessions(ss => ss.filter(s => s.id !== id))
      if (id === sessionId) open(null)
      toast('会话已删除', 'plain')
    },
    [sessionId, open, toast],
  )

  // Keep the rail's counts honest without polling.
  useEffect(() => {
    if (!session) return
    setSessions(ss =>
      ss.map(s =>
        s.id === session.id
          ? {
              ...s,
              ...session,
              candidateCount: candidates.length,
              lovedCount: candidates.filter(c => c.verdict > 0).length,
            }
          : s,
      ),
    )
  }, [session, candidates])

  const lookups = useMemo(() => {
    const strategyById = new Map<string, StrategyInfo>((boot?.strategies ?? []).map(s => [s.id, s]))
    const familyById = new Map<string, Family>((boot?.families ?? []).map(f => [f.id, f]))
    return { strategyById, familyById }
  }, [boot])

  return {
    boot,
    bootError,
    sessions,
    sessionId,
    session,
    candidates,
    batches,
    profile,
    running,
    discards,
    connected,
    loadingSession,
    toasts,
    ...lookups,
    open,
    reloadSessions,
    createSession,
    generate,
    cancel,
    setVerdict,
    setNote,
    recheck,
    setPriors,
    setThreshold,
    rename,
    removeSession,
    toast,
  }
}

export type Atelier = ReturnType<typeof useAtelier>
