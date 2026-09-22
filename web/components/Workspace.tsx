import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { CandidatePlate, type PlateAction } from './CandidatePlate.tsx'
import { Ghost } from './Ghost.tsx'
import { Picker, type PickerOption } from './Picker.tsx'
import { Tip } from './Tip.tsx'
import { useGridTransition } from './useGridTransition.ts'
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
  const gridRef = useRef<HTMLDivElement>(null)

  // The focused plate owns its own name, note box and voice; the keyboard just
  // names the verb and lets it answer.
  const plateAction = (action: PlateAction) =>
    window.dispatchEvent(new CustomEvent<PlateAction>('plate:action', { detail: action }))

  const { candidates, session, batches, running, generate } = a

  // Pointing at a plate gives it focus — and a plate that slid under a parked
  // cursor has not been pointed at. Keyboard navigation scrolls the canvas and
  // a filter re-lays the grid; either way the browser re-runs hover for
  // whatever is now under the pointer and synthesises a move to announce it.
  // Taking that as pointing handed focus to a plate nobody chose, so ArrowDown
  // could land above where it started. The synthetic move repeats the last
  // coordinates, so "the pointer actually travelled" is the whole test. The
  // listener runs in the capture phase, which puts it ahead of the plate's own
  // handler for the very same event.
  const travelled = useRef(false)
  const pointerAt = useRef({ x: -1, y: -1 })
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      travelled.current = e.clientX !== pointerAt.current.x || e.clientY !== pointerAt.current.y
      pointerAt.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('pointermove', onMove, { capture: true, passive: true })
    return () => window.removeEventListener('pointermove', onMove, { capture: true })
  }, [])

  const focusPlate = useCallback((id: string) => {
    if (!travelled.current) return
    setKbd(false)
    setFocusId(id)
  }, [setFocusId])

  const openPlate = useCallback((id: string) => openDrawer('detail', id), [openDrawer])

  const generateMore = useCallback((strategyId: string) => {
    if (!running) generate({ strategyIds: [strategyId] })
  }, [running, generate])

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

  const familyOptions = useMemo<PickerOption[]>(
    () =>
      familiesPresent.map(([id, n]) => {
        const f = a.familyById.get(id)
        return { id, label: f?.label ?? id, hue: f?.hue ?? 38, n }
      }),
    [familiesPresent, a.familyById],
  )
  const familyTotal = useMemo(
    () => familiesPresent.reduce((t, [, n]) => t + n, 0),
    [familiesPresent],
  )

  // A family that stops being represented stops being a filter — otherwise an
  // undo can leave the wall empty with no chip left to say why.
  useEffect(() => {
    if (family && !familiesPresent.some(([id]) => id === family)) setFamily(null)
  }, [family, familiesPresent])

  const ordered = useMemo(() => {
    const list = [...candidates]
    if (sort === 'arrival') {
      list.sort((x, y) => y.generation - x.generation || x.createdAt - y.createdAt)
    } else if (sort === 'rare') {
      list.sort((x, y) => x.probability - y.probability)
    } else {
      list.sort((x, y) => trouble(x) - trouble(y) || x.probability - y.probability)
    }
    return list
  }, [candidates, sort])

  const visible = useMemo(() => {
    const laneTest = LANES.find(l => l.id === lane)!.test
    const needle = find.trim().toLowerCase()
    return ordered.filter(c => {
      if (!laneTest(c)) return false
      if (family && a.strategyById.get(c.strategyId)?.family !== family) return false
      if (needle && !`${c.name} ${c.rationale}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [ordered, lane, family, find, a.strategyById])
  const visibleIds = useMemo(() => new Set(visible.map(c => c.id)), [visible])
  const capturePositions = useGridTransition(gridRef, visible)
  const captureGrid = () => {
    capturePositions()
    setKbd(false)
  }

  useEffect(() => {
    if (focusId && !visibleIds.has(focusId)) setFocusId(null)
  }, [focusId, visibleIds, setFocusId])

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
      if (
        document.querySelector('.drawer') ||
        document.querySelector('.palette') ||
        document.querySelector('.picker__menu')
      )
        return

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
            onClick={() => {
              if (lane === l.id) return
              captureGrid()
              setLane(l.id)
            }}
          >
            {l.label}
            <span className="chip__n">{laneCounts.get(l.id) ?? 0}</span>
          </button>
        ))}
        {/* The four verdicts are the reading position and stay in the open. The
            word families are a detour most sessions never take, so they fold
            into one chip that says which detour you are on. */}
        {familiesPresent.length > 1 && (
          <>
            <span style={{ width: 8 }} />
            <Picker
              options={familyOptions}
              value={family}
              onPick={id => {
                if (family === id) return
                captureGrid()
                setFamily(id)
              }}
              clearLabel="全部词族"
              clearN={familyTotal}
              title="按词族筛选"
            />
          </>
        )}

        <span className="filters__spacer" />

        {/* The field grows when it takes focus, but the slot it sits in does
            not: a row that re-wraps under the cursor is a row that moves the
            card you were about to click. */}
        <span className="filters__findslot">
          <input
            ref={findRef}
            className="filters__find"
            value={find}
            placeholder="搜索 /"
            onChange={e => {
              captureGrid()
              setFind(e.target.value)
            }}
          />
        </span>

        {/* Three orderings, one of which is always in force: the chip wears the
            one in force, which is the only one worth a whole word on the bar. */}
        <Picker
          options={SORTS}
          value={sort}
          onPick={id => {
            if (id && id !== sort) {
              captureGrid()
              setSort(id as Sort)
            }
          }}
          align="right"
          title="排序"
        />
      </div>

      <div className="canvas">
        <div className="plates" ref={gridRef}>
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
          </AnimatePresence>

          {ordered.map(c => (
            <div key={c.id} className="plate-slot" data-candidate={c.id} hidden={!visibleIds.has(c.id)}>
              <CandidatePlate
                candidate={c}
                strategy={a.strategyById.get(c.strategyId)}
                family={a.familyById.get(a.strategyById.get(c.strategyId)?.family ?? '')}
                focused={visibleIds.has(c.id) && focusId === c.id}
                autoScroll={visibleIds.has(c.id) && kbd && focusId === c.id}
                onFocus={focusPlate}
                onVerdict={a.setVerdict}
                onNote={a.setNote}
                onOpen={openPlate}
                onMore={generateMore}
              />
            </div>
          ))}
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
