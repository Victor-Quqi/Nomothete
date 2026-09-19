import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { CandidatePlate, type PlateAction } from './CandidatePlate.tsx'
import { Ghost } from './Ghost.tsx'
import { Tip } from './Tip.tsx'
import type { Atelier } from '../store.ts'
import type { Candidate, Verdict } from '../types.ts'

export type DrawerKind = 'detail' | 'priors' | 'taste' | 'brief' | 'keys' | 'settings'

type Lane = 'all' | 'open' | 'up' | 'down'
type Sort = 'arrival' | 'rare' | 'clean'

const LANES: { id: Lane; label: string; test: (c: Candidate) => boolean }[] = [
  { id: 'all', label: '全部', test: () => true },
  { id: 'open', label: '待定', test: c => c.verdict === 0 },
  { id: 'up', label: '心动', test: c => c.verdict > 0 },
  { id: 'down', label: '已弃', test: c => c.verdict < 0 },
]

const SORTS: { id: Sort; label: string }[] = [
  { id: 'arrival', label: '最新在前' },
  { id: 'rare', label: '越罕见越前' },
  { id: 'clean', label: '越干净越前' },
]

function trouble(c: Candidate): number {
  return (c.checks ?? []).filter(k => k.status !== 'clear' && k.status !== 'error').length
}

export function Workspace({
  a,
  openDrawer,
  focusId,
  setFocusId,
}: {
  a: Atelier
  openDrawer: (kind: DrawerKind, id?: string) => void
  focusId: string | null
  setFocusId: (id: string | null) => void
}) {
  const [lane, setLane] = useState<Lane>('all')
  const [family, setFamily] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('arrival')
  const [find, setFind] = useState('')
  const [kbd, setKbd] = useState(false)
  const findRef = useRef<HTMLInputElement>(null)

  // The focused plate owns its own name, note box and voice; the keyboard just
  // names the verb and lets it answer.
  const plateAction = (action: PlateAction) =>
    window.dispatchEvent(new CustomEvent<PlateAction>('plate:action', { detail: action }))

  const { candidates, session, batches, running } = a

  const laneCounts = useMemo(() => {
    const m = new Map<Lane, number>()
    for (const l of LANES) m.set(l.id, candidates.filter(l.test).length)
    return m
  }, [candidates])

  const familiesPresent = useMemo(() => {
    const seen = new Map<string, number>()
    for (const c of candidates) {
      const fam = a.strategyById.get(c.strategyId)?.family
      if (fam) seen.set(fam, (seen.get(fam) ?? 0) + 1)
    }
    return [...seen.entries()]
  }, [candidates, a.strategyById])

  const visible = useMemo(() => {
    const laneTest = LANES.find(l => l.id === lane)!.test
    const needle = find.trim().toLowerCase()
    let list = candidates.filter(c => {
      if (!laneTest(c)) return false
      if (family && a.strategyById.get(c.strategyId)?.family !== family) return false
      if (needle && !`${c.name} ${c.rationale}`.toLowerCase().includes(needle)) return false
      return true
    })
    list = [...list]
    if (sort === 'arrival') {
      list.sort((x, y) => y.generation - x.generation || x.createdAt - y.createdAt)
    } else if (sort === 'rare') {
      list.sort((x, y) => x.probability - y.probability)
    } else {
      list.sort((x, y) => trouble(x) - trouble(y) || x.probability - y.probability)
    }
    return list
  }, [candidates, lane, family, find, sort, a.strategyById])

  const latestGeneration = session?.generation ?? 0
  const liveBatches = useMemo(
    () => batches.filter(b => b.generation === latestGeneration),
    [batches, latestGeneration],
  )
  const ghosts = useMemo(() => liveBatches.filter(b => b.state === 'running'), [liveBatches])

  // ── keyboard ──────────────────────────────────────────────────────────────
  const move = useCallback(
    (delta: number) => {
      if (visible.length === 0) return
      const idx = visible.findIndex(c => c.id === focusId)
      const next = idx < 0 ? (delta > 0 ? 0 : visible.length - 1) : (idx + delta + visible.length) % visible.length
      setKbd(true)
      setFocusId(visible[next].id)
    },
    [visible, focusId, setFocusId],
  )

  // Wrapping from the current position rather than the top: the unjudged ones
  // you skipped are usually behind you, and starting over at the first plate
  // every time turns one keystroke into a loop.
  const jumpUnjudged = useCallback(() => {
    if (visible.length === 0) return
    const idx = visible.findIndex(c => c.id === focusId)
    const after = visible.slice(idx + 1)
    const target = [...after, ...visible.slice(0, idx + 1)].find(c => c.verdict === 0)
    if (!target) return
    setKbd(true)
    setFocusId(target.id)
  }, [visible, focusId, setFocusId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (typing) {
        if (e.key === 'Escape') (el as HTMLElement).blur()
        return
      }
      if (document.querySelector('.drawer') || document.querySelector('.palette')) return

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          move(1)
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          move(-1)
          break
        case '1':
        case '2':
        case '3':
        case '4':
        case '5': {
          if (!focusId) return
          e.preventDefault()
          const v = (Number(e.key) - 3) as Verdict
          a.setVerdict(focusId, v)
          // Reading order carries on by itself after a judgement.
          setTimeout(() => move(1), 130)
          break
        }
        case 'J':
          e.preventDefault()
          jumpUnjudged()
          break
        case 'Enter':
          if (focusId) {
            e.preventDefault()
            openDrawer('detail', focusId)
          }
          break
        case 'n':
          if (focusId) {
            e.preventDefault()
            plateAction('note')
          }
          break
        case 's':
          if (focusId) {
            e.preventDefault()
            plateAction('speak')
          }
          break
        case 'c':
          if (focusId) {
            e.preventDefault()
            plateAction('copy')
          }
          break
        case 'u':
          e.preventDefault()
          a.undo()
          break
        case 'e':
          e.preventDefault()
          if (session) window.open(`/api/sessions/${session.id}/export?format=md`, '_blank')
          break
        case 'g':
          e.preventDefault()
          if (!running) a.generate()
          break
        case '/':
          e.preventDefault()
          findRef.current?.focus()
          break
        case 'p':
          e.preventDefault()
          openDrawer('priors')
          break
        case 't':
          e.preventDefault()
          openDrawer('taste')
          break
        case '?':
          e.preventDefault()
          openDrawer('keys')
          break
        case 'Escape':
          setFocusId(null)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move, jumpUnjudged, focusId, a, openDrawer, running, session, setFocusId])

  if (!session) return null

  return (
    <div className="work">
      <div className="topbar">
        {/* Two lines only when there are two things to say. A session nobody
            named has one sentence, and it goes on the top line. */}
        <div className="topbar__title">
          <div className="topbar__h" onClick={() => openDrawer('brief')} title="看完整简介">
            {session.title || session.brief}
          </div>
          {session.title && (
            <div className="topbar__brief" onClick={() => openDrawer('brief')} title="看完整简介">
              {session.brief}
            </div>
          )}
        </div>
        <div className="topbar__acts">
          <button className="btn btn--ghost btn--sm" onClick={() => openDrawer('taste')}>
            口味 <kbd>T</kbd>
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => openDrawer('priors')}>
            规则 <kbd>P</kbd>
          </button>
          <a
            className="btn btn--ghost btn--sm"
            href={`/api/sessions/${session.id}/export?format=md`}
            style={{ textDecoration: 'none' }}
          >
            导出
          </a>
        </div>
      </div>

      <div className="filters">
        {LANES.map(l => (
          <button
            key={l.id}
            className={`chip${lane === l.id ? ' chip--on' : ''}`}
            onClick={() => setLane(l.id)}
          >
            {l.label}
            <span className="chip__n">{laneCounts.get(l.id) ?? 0}</span>
          </button>
        ))}
        {familiesPresent.length > 1 && <span style={{ width: 8 }} />}
        {familiesPresent.length > 1 &&
          familiesPresent.map(([id, n]) => {
            const f = a.familyById.get(id)
            return (
              <button
                key={id}
                className={`chip${family === id ? ' chip--on' : ''}`}
                onClick={() => setFamily(family === id ? null : id)}
              >
                <i
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 99,
                    background: `hsl(${f?.hue ?? 38} 55% 55%)`,
                    display: 'inline-block',
                  }}
                />
                {f?.label ?? id}
                <span className="chip__n">{n}</span>
              </button>
            )
          })}

        <span className="filters__spacer" />

        <input
          ref={findRef}
          className="filters__find"
          value={find}
          placeholder="搜索 /"
          onChange={e => setFind(e.target.value)}
        />

        <div className="filters__sort">
          {SORTS.map(s => (
            <button key={s.id} data-on={sort === s.id} onClick={() => setSort(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="canvas">
        <div className="plates">
          <AnimatePresence initial={false}>
            {ghosts.map(b => {
              const s = a.strategyById.get(b.strategyId)
              return (
                <Ghost
                  key={`ghost-${b.id}`}
                  batch={b}
                  strategy={s}
                  family={s ? a.familyById.get(s.family) : undefined}
                />
              )
            })}

            {visible.map(c => (
              <CandidatePlate
                key={c.id}
                candidate={c}
                strategy={a.strategyById.get(c.strategyId)}
                family={a.familyById.get(a.strategyById.get(c.strategyId)?.family ?? '')}
                focused={focusId === c.id}
                autoScroll={kbd}
                onFocus={() => {
                  setKbd(false)
                  setFocusId(c.id)
                }}
                onVerdict={v => a.setVerdict(c.id, v)}
                onNote={note => a.setNote(c.id, note)}
                onOpen={() => openDrawer('detail', c.id)}
                onMore={() => {
                  if (!running) a.generate({ strategyIds: [c.strategyId] })
                }}
              />
            ))}
          </AnimatePresence>
        </div>

        {visible.length === 0 && ghosts.length === 0 && (
          <div className="empty">
            <div className="empty__g">{candidates.length === 0 ? 'ν' : '∅'}</div>
            <p>{candidates.length === 0 ? '第一批正在生成。' : '没有符合的名字。'}</p>
          </div>
        )}
      </div>

      <div className="dock">
        <span className="dock__hint">
          {candidates.length} 个候选 · <b>{candidates.filter(c => c.verdict > 0).length}</b> 个心动
        </span>
        {/* What the threshold ate is a footnote to the count, not a filter, so
            it sits with the count rather than in a row of its own. */}
        {a.discards.length > 0 && (
          <Tip
            className="dock__discards"
            content={
              <>
                <b>丢掉的 {a.discards.length} 个</b>
                <p>{a.discards.slice(-14).map(d => d.name).join('　')}</p>
                <em>自报罕见度低于阈值。</em>
              </>
            }
          >
            · 丢掉 <s>{a.discards.length}</s> 个
          </Tip>
        )}
        {running ? (
          <button className="btn btn--sm" onClick={() => a.cancel()}>
            停止
          </button>
        ) : (
          <button className="btn btn--primary btn--sm" onClick={() => a.generate()}>
            再来一批 <kbd style={{ borderColor: 'rgba(26,19,5,0.25)', color: '#3a2c0c' }}>G</kbd>
          </button>
        )}
      </div>
    </div>
  )
}
