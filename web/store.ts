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
  AppSettings,
  Batch,
  Bootstrap,
  Candidate,
  CheckResult,
  Discard,
  Family,
  GenerateAsk,
  ProviderStatus,
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

/** Same glyphs the dial uses, so an undo toast names what you will see. */
const VERDICT_GLYPH: Record<number, string> = { 2: '▲▲', 1: '▲', 0: '·', [-1]: '▼', [-2]: '▼▼' }

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
  /**
   * Names whose slow tier the server is running. Nothing in the stored checks
   * says so, and the seal on the plate and the button in the drawer have to
   * agree about it, so neither of them is where it can live.
   */
  const [checking, setChecking] = useState<ReadonlySet<string>>(() => new Set())
  const toastSeq = useRef(0)

  // Judging with the keyboard is fast enough to overshoot by one row. The stack
  // holds where each Verdict came from so a miss costs one keystroke, not a hunt
  // back up the wall.
  const undoStack = useRef<{ candidateId: string; name: string; from: Verdict }[]>([])

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
    undoStack.current = []
    api
      .session(sessionId)
      .then(p => {
        if (!alive) return
        setSession(p.session)
        setCandidates(p.candidates)
        setBatches(p.batches)
        setProfile(p.profile)
        setRunning(p.running)
        setChecking(new Set(p.checking))
        setDiscards(p.discards)
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
    let source: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let dropped = false
    let lastId = ''
    let heardAt = Date.now()
    /** Events that land while a snapshot is on its way wait for it; applied first, the snapshot would undo them. */
    let held: ServerEvent[] | null = null

    const apply = (event: ServerEvent) => {
      switch (event.type) {
        case 'generation:start':
          setRunning(true)
          // The batches about to arrive belong to a generation the session
          // object loaded over REST has never heard of. Anything that shows
          // work in progress filters batches down to the current generation,
          // so without this the second batch onwards runs with nothing on
          // screen to say so.
          setSession(s => (s ? { ...s, generation: event.generation } : s))
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
                    direction: event.direction,
                    parentId: event.parentId,
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
          setDiscards(d => (d.some(x => x.id === event.discard.id) ? d : [...d, event.discard]))
          break

        case 'discard:kept':
          setDiscards(d => d.filter(x => x.id !== event.discardId))
          break

        case 'check':
          setCandidates(cs =>
            cs.map(c => (c.id === event.candidateId ? { ...c, checks: mergeCheck(c.checks, event.result) } : c)),
          )
          break

        case 'check:running':
          setChecking(s => {
            if (s.has(event.candidateId) === event.running) return s
            const next = new Set(s)
            if (event.running) next.add(event.candidateId)
            else next.delete(event.candidateId)
            return next
          })
          break

        case 'check:gone':
          setCandidates(cs =>
            cs.map(c =>
              c.id === event.candidateId
                ? { ...c, checks: (c.checks ?? []).filter(k => k.checkId !== event.checkId) }
                : c,
            ),
          )
          break

        case 'verification':
          setCandidates(cs =>
            cs.map(c => (c.id === event.candidateId ? { ...c, verification: event.verification } : c)),
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

        // Written after the session was created, so it arrives here rather
        // than in the payload. Both the topbar and the rail are showing the
        // brief until it does.
        case 'session:title':
          setSession(s => (s ? { ...s, title: event.title } : s))
          setSessions(ss => ss.map(s => (s.id === sessionId ? { ...s, title: event.title } : s)))
          break

        case 'notice':
          toast(event.message, event.level === 'error' ? 'error' : 'plain')
          break
      }
    }

    // What happened while the stream was down is only on the server now: a
    // restart empties the replay buffer, and stops whatever the old process
    // was running. So the page asks for the whole session again.
    const resync = () => {
      held = []
      api
        .session(sessionId)
        .then(p => {
          if (stopped) return
          setSession(p.session)
          setCandidates(p.candidates)
          setBatches(p.batches)
          setProfile(p.profile)
          setRunning(p.running)
          setChecking(new Set(p.checking))
          setDiscards(p.discards)
        })
        .catch(() => {})
        .finally(() => {
          const waiting = held ?? []
          held = null
          if (!stopped) waiting.forEach(apply)
        })
    }

    const connect = () => {
      const from = lastId ? `?lastEventId=${encodeURIComponent(lastId)}` : ''
      source = new EventSource(`/api/sessions/${sessionId}/stream${from}`)
      heardAt = Date.now()
      source.addEventListener('beat', () => (heardAt = Date.now()))
      source.onopen = () => {
        heardAt = Date.now()
        setConnected(true)
        if (dropped) resync()
        dropped = false
      }
      source.onerror = () => {
        setConnected(false)
        dropped = true
        // The browser retries a dropped stream by itself, but an answer that is
        // not a stream — what a proxy says while the server behind it restarts
        // — makes it stop for good. From there, retrying is this page's job.
        if (source?.readyState === EventSource.CLOSED && !stopped) {
          clearTimeout(retry)
          retry = setTimeout(connect, 2000)
        }
      }
      source.onmessage = ev => {
        heardAt = Date.now()
        if (ev.lastEventId) lastId = ev.lastEventId
        let event: ServerEvent
        try {
          event = JSON.parse(ev.data)
        } catch {
          return
        }
        if (held) held.push(event)
        else apply(event)
      }
    }

    // A proxy can hold the page's end of the stream open after the server
    // behind it has gone; then nothing arrives and nothing errors, forever. The
    // server beats every 10s, so silence past 25s is a dead stream.
    const watchdog = setInterval(() => {
      if (source?.readyState !== EventSource.OPEN || Date.now() - heardAt < 25_000) return
      source.close()
      setConnected(false)
      dropped = true
      connect()
    }, 5000)

    connect()
    return () => {
      stopped = true
      clearTimeout(retry)
      clearInterval(watchdog)
      source?.close()
    }
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
    async (opts: GenerateAsk = {}) => {
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

  const keepDiscard = useCallback(
    async (discardId: string) => {
      try {
        await api.keepDiscard(discardId)
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    },
    [toast],
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

  const pushVerdict = useCallback(
    async (candidateId: string, next: Verdict, from: Verdict) => {
      // Optimistic: the dial must move under the finger, not after a round trip.
      setCandidates(cs => cs.map(c => (c.id === candidateId ? { ...c, verdict: next } : c)))
      try {
        const r = await api.verdict(candidateId, next)
        setCandidates(cs => cs.map(c => (c.id === candidateId ? { ...r.candidate, checks: r.candidate.checks } : c)))
        if (sessionId) scheduleProfile(sessionId)
      } catch (err) {
        setCandidates(cs => cs.map(c => (c.id === candidateId ? { ...c, verdict: from } : c)))
        toast((err as Error).message, 'error')
      }
    },
    [sessionId, scheduleProfile, toast],
  )

  const setVerdict = useCallback(
    async (candidateId: string, verdict: Verdict) => {
      const before = candidatesRef.current.find(c => c.id === candidateId)
      if (!before) return
      const next = before.verdict === verdict ? (0 as Verdict) : verdict
      if (next === before.verdict) return
      undoStack.current = [
        ...undoStack.current.slice(-19),
        { candidateId, name: before.name, from: before.verdict },
      ]
      await pushVerdict(candidateId, next, before.verdict)
    },
    [pushVerdict],
  )

  const undo = useCallback(async () => {
    const last = undoStack.current.pop()
    if (!last) {
      toast('没有可以撤回的评价', 'plain')
      return
    }
    const now = candidatesRef.current.find(c => c.id === last.candidateId)
    if (!now) return
    toast(last.from === 0 ? `${last.name} 退回未定` : `${last.name} 改回 ${VERDICT_GLYPH[last.from]}`, 'plain')
    await pushVerdict(last.candidateId, last.from, now.verdict)
  }, [pushVerdict, toast])

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
      // Shown at the press: the server's word that it started follows on the
      // stream, and nothing should flicker back to the button in between.
      setChecking(s => new Set(s).add(candidateId))
      try {
        await api.recheck(candidateId)
      } catch (err) {
        setChecking(s => {
          const next = new Set(s)
          next.delete(candidateId)
          return next
        })
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

  const updateSession = useCallback(
    async (id: string, patch: Partial<Pick<Session, 'title' | 'pinned'>>) => {
      const { session: updated } = await api.patchSession(id, patch)
      setSession(s => (s?.id === id ? { ...s, ...patch, updatedAt: updated.updatedAt } : s))
      setSessions(ss => ss.map(s => (s.id === id ? { ...s, ...patch, updatedAt: updated.updatedAt } : s)))
    },
    [],
  )

  const removeSession = useCallback(
    async (id: string) => {
      await api.deleteSession(id)
      setSessions(ss => ss.filter(s => s.id !== id))
      if (id === hashSessionId()) open(null)
      toast('会话已删除', 'plain')
    },
    [open, toast],
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

  // One save at a time, so the stored value and the switch cannot finish in
  // different orders.
  const [savingSettings, setSavingSettings] = useState(false)
  const savingSettingsRef = useRef(false)
  const bootRef = useRef(boot)
  bootRef.current = boot

  const setAutoVerify = useCallback(
    async (autoVerify: boolean) => {
      const current = bootRef.current?.settings
      if (savingSettingsRef.current || !current) return
      savingSettingsRef.current = true
      setSavingSettings(true)
      setBoot(b => (b ? { ...b, settings: { ...b.settings, autoVerify } } : b))
      try {
        const settings: AppSettings = await api.saveSettings({ autoVerify })
        setBoot(b => (b ? { ...b, settings } : b))
      } catch (err) {
        setBoot(b => (b ? { ...b, settings: current } : b))
        toast((err as Error).message, 'error')
      } finally {
        savingSettingsRef.current = false
        setSavingSettings(false)
      }
    },
    [toast],
  )

  /** Keeps the rail honest after the settings drawer changes the endpoint. */
  const setProvider = useCallback((provider: ProviderStatus) => {
    setBoot(b => (b ? { ...b, provider } : b))
  }, [])

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
    checking,
    ...lookups,
    open,
    reloadSessions,
    createSession,
    generate,
    keepDiscard,
    cancel,
    setVerdict,
    undo,
    setNote,
    recheck,
    setPriors,
    setThreshold,
    updateSession,
    removeSession,
    setProvider,
    setAutoVerify,
    savingSettings,
    toast,
  }
}

export type Atelier = ReturnType<typeof useAtelier>
