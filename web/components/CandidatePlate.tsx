import { memo, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Seals } from './Seals.tsx'
import { Tip } from './Tip.tsx'
import { VerdictDial } from './VerdictDial.tsx'
import { isMute, speakName } from '../speak.ts'
import { SayButton } from './SayButton.tsx'
import type { Candidate, Family, StrategyInfo, Verdict } from '../types.ts'

const VERDICT_CLASS: Record<number, string> = {
  2: ' plate--up2',
  1: ' plate--up1',
  0: '',
  [-1]: ' plate--down1',
  [-2]: ' plate--down2',
}

/**
 * A hard rejection landed this fast is a reflex, not a judgement — the corpus is
 * blunt about first impressions being a poor predictor of good names. The plate
 * still records it immediately; it just offers, once, to park the name instead.
 */
const SECOND_LOOK_MS = 2600

/** Keyboard verbs the focused plate answers to. Dispatched by Workspace. */
export type PlateAction = 'note' | 'speak' | 'copy'

interface Props {
  candidate: Candidate
  strategy?: StrategyInfo
  family?: Family
  focused: boolean
  /** Only keyboard navigation drags the viewport around; hover never does. */
  autoScroll: boolean
  onFocus: (id: string) => void
  onVerdict: (id: string, v: Verdict) => void
  onNote: (id: string, note: string) => void
  onOpen: (id: string) => void
  /** Run another batch down this same strategy. */
  onMore: (strategyId: string) => void
}

function PlateInner({
  candidate,
  strategy,
  family,
  focused,
  autoScroll,
  onFocus,
  onVerdict,
  onNote,
  onOpen,
  onMore,
}: Props) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [draft, setDraft] = useState(candidate.note ?? '')
  const [copied, setCopied] = useState(false)
  const [saying, setSaying] = useState(false)
  const [sweep, setSweep] = useState(0)
  const [secondLook, setSecondLook] = useState(false)
  const lastVerdict = useRef(candidate.verdict)
  const seenAt = useRef(0)
  const offered = useRef(false)
  const el = useRef<HTMLDivElement>(null)
  const open = () => onOpen(candidate.id)

  // A top Verdict is worth a small piece of theatre: the plate gets gilded.
  useEffect(() => {
    if (candidate.verdict === 2 && lastVerdict.current !== 2) setSweep(s => s + 1)
    if (candidate.verdict === -2 && lastVerdict.current !== -2 && !offered.current) {
      const dwell = seenAt.current ? Date.now() - seenAt.current : Infinity
      if (dwell < SECOND_LOOK_MS) {
        offered.current = true
        setSecondLook(true)
      }
    }
    lastVerdict.current = candidate.verdict
  }, [candidate.verdict])

  // The offer must never become another thing to dismiss.
  useEffect(() => {
    if (!secondLook) return
    const t = setTimeout(() => setSecondLook(false), 9000)
    return () => clearTimeout(t)
  }, [secondLook])

  // When the plate actually entered the reading band — not when it mounted.
  // Cards stream in below the fold, and a name you never looked at cannot have
  // been rejected too quickly.
  useEffect(() => {
    const node = el.current
    if (!node || seenAt.current) return
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting) && !seenAt.current) {
          seenAt.current = Date.now()
          io.disconnect()
        }
      },
      { rootMargin: '-25% 0px -25% 0px' },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  // The keyboard reads from the middle of the canvas rather than from whichever
  // edge you arrived at. 'nearest' parks the plate at the bottom on the way
  // down and at the top on the way up, so one keystroke moves your eye a
  // different distance depending on which way you came, and the row you are
  // reading always has its next row hidden. Centring puts every focused plate
  // in the same band — the reading band the dwell timer above watches — with
  // context on both sides of it. Moving along a row costs no scroll at all,
  // since the plate is already at that height, and the browser clamps at the
  // ends, so the first and last rows stay where they are.
  useEffect(() => {
    if (focused && autoScroll) el.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focused, autoScroll])

  useEffect(() => setDraft(candidate.note ?? ''), [candidate.note])

  const checks = candidate.checks ?? []
  const deepPending = candidate.verdict > 0 && !checks.some(c => c.tier === 'ratelimited')
  const pending = checks.length === 0 ? '正在检查…' : deepPending ? '正在查注册表和 GitHub…' : null

  const rarity = 1 - candidate.probability
  const bars = Math.max(1, Math.min(5, Math.ceil(rarity * 5)))

  const copy = () => {
    navigator.clipboard?.writeText(candidate.name).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1300)
      },
      () => {},
    )
  }

  const speak = () => {
    setSaying(true)
    speakName(candidate.name, () => setSaying(false))
  }

  // Keyboard verbs arrive as one event; only the focused plate answers.
  useEffect(() => {
    if (!focused) return
    const onAction = (e: Event) => {
      switch ((e as CustomEvent<PlateAction>).detail) {
        case 'note':
          setNoteOpen(true)
          break
        case 'speak':
          speak()
          break
        case 'copy':
          copy()
          break
      }
    }
    window.addEventListener('plate:action', onAction)
    return () => window.removeEventListener('plate:action', onAction)
  })

  return (
    <div
      ref={el}
      className={`plate${VERDICT_CLASS[candidate.verdict] ?? ''}${focused ? ' plate--focus' : ''}`}
      style={{ ['--fam-hue' as string]: family?.hue ?? 38 }}
      onMouseEnter={() => onFocus(candidate.id)}
      onDoubleClick={open}
    >
      <AnimatePresence>
        {sweep > 0 && (
          <motion.div
            key={sweep}
            className="plate__gild"
            initial={{ x: '-120%' }}
            animate={{ x: '120%' }}
            transition={{ duration: 0.85, ease: [0.4, 0, 0.2, 1] }}
            onAnimationComplete={() => setSweep(0)}
          />
        )}
      </AnimatePresence>

      <div className="plate__head">
        <h3 className={`plate__name${saying ? ' plate__name--speaking' : ''}`} onClick={speak}>
          {candidate.name}
        </h3>
        <SayButton
          state={saying ? 'on' : isMute() ? 'mute' : 'idle'}
          onClick={speak}
          className="plate__say"
        />
        <button className="plate__copy" onClick={copy} title="复制名字" aria-label="复制名字">
          {copied ? '✓' : '⧉'}
        </button>
      </div>

      <div className="plate__meta">
        {strategy && (
          <Tip
            className="plate__strategy"
            onClick={() => onMore(candidate.strategyId)}
            content={
              <>
                <b>{strategy.label}</b>
                <p>{strategy.brief}</p>
                <em>按这个思路再来一批</em>
              </>
            }
          >
            <i />
            {strategy.label}
            <b className="plate__more">＋</b>
          </Tip>
        )}
        <Tip
          className="rarity"
          content={
            <>
              <b>罕见度</b>
              <p>另一个助手拿到同一份简介，想出同一个名字的可能性越低，这里越满。</p>
            </>
          }
        >
          <span className="rarity__bars">
            {[0, 1, 2, 3, 4].map(i => (
              <i key={i} data-on={i < bars} style={{ height: 3 + i * 1.6 }} />
            ))}
          </span>
        </Tip>
      </div>

      <p className="plate__rationale">{candidate.rationale}</p>

      <Seals checks={checks} pending={pending} onOpen={open} />

      <div className="plate__foot">
        <VerdictDial verdict={candidate.verdict} onChange={v => onVerdict(candidate.id, v)} />
        <button className="btn btn--ghost btn--sm" onClick={open}>
          详情
        </button>
        <button
          className="plate__note-btn"
          data-has={!!candidate.note}
          onClick={() => setNoteOpen(o => !o)}
        >
          {candidate.note ? '备注 ✎' : '写备注'}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {secondLook && (
          <motion.div
            className="plate__second"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          >
            <span>刚看到就否掉了。</span>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => {
                onVerdict(candidate.id, 0)
                setSecondLook(false)
              }}
            >
              改成未定
            </button>
            <button className="plate__second-no" onClick={() => setSecondLook(false)}>
              保持
            </button>
          </motion.div>
        )}

        {noteOpen && (
          <motion.div
            className="plate__note"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          >
            <textarea
              autoFocus
              value={draft}
              placeholder="为什么喜欢 / 不喜欢。下一批会参考这句话。"
              onChange={e => setDraft(e.target.value)}
              onBlur={() => {
                if (draft !== (candidate.note ?? '')) onNote(candidate.id, draft)
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setNoteOpen(false)
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  onNote(candidate.id, draft)
                  setNoteOpen(false)
                }
              }}
            />
            <div className="plate__note-saved">自动保存</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const CandidatePlate = memo(PlateInner)
