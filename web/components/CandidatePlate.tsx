import { memo, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Seals } from './Seals.tsx'
import { Tip } from './Tip.tsx'
import { VerdictDial } from './VerdictDial.tsx'
import { syllables } from '../normalize.ts'
import type { Candidate, Family, StrategyInfo, Verdict } from '../types.ts'

const VERDICT_CLASS: Record<number, string> = {
  2: ' plate--up2',
  1: ' plate--up1',
  0: '',
  [-1]: ' plate--down1',
  [-2]: ' plate--down2',
}

interface Props {
  candidate: Candidate
  strategy?: StrategyInfo
  family?: Family
  threshold: number
  focused: boolean
  /** Only keyboard navigation drags the viewport around; hover never does. */
  autoScroll: boolean
  onFocus: () => void
  onVerdict: (v: Verdict) => void
  onNote: (note: string) => void
  onOpen: () => void
}

function PlateInner({
  candidate,
  strategy,
  family,
  threshold,
  focused,
  autoScroll,
  onFocus,
  onVerdict,
  onNote,
  onOpen,
}: Props) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [draft, setDraft] = useState(candidate.note ?? '')
  const [copied, setCopied] = useState(false)
  const [sweep, setSweep] = useState(0)
  const lastVerdict = useRef(candidate.verdict)
  const el = useRef<HTMLDivElement>(null)

  // A top Verdict is worth a small piece of theatre: the plate gets gilded.
  useEffect(() => {
    if (candidate.verdict === 2 && lastVerdict.current !== 2) setSweep(s => s + 1)
    lastVerdict.current = candidate.verdict
  }, [candidate.verdict])

  useEffect(() => {
    if (focused && autoScroll) el.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focused, autoScroll])

  useEffect(() => setDraft(candidate.note ?? ''), [candidate.note])

  const checks = candidate.checks ?? []
  const deepPending = candidate.verdict > 0 && !checks.some(c => c.tier === 'ratelimited')
  const pending = checks.length === 0 ? '检查进行中' : deepPending ? '正在跑归一化撞名与 GitHub' : null

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

  return (
    <motion.div
      ref={el}
      layout="position"
      className={`plate${VERDICT_CLASS[candidate.verdict] ?? ''}${focused ? ' plate--focus' : ''}`}
      style={{ ['--fam-hue' as string]: family?.hue ?? 38 }}
      initial={{ opacity: 0, y: 18, filter: 'blur(6px)', scale: 0.985 }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 30, mass: 0.8 }}
      onMouseEnter={onFocus}
      onDoubleClick={onOpen}
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
        <h3 className="plate__name">{candidate.name}</h3>
        <button className="plate__copy" onClick={copy} title="复制名字" aria-label="复制名字">
          {copied ? '✓' : '⧉'}
        </button>
      </div>

      <div className="plate__meta">
        {strategy && (
          <Tip
            className="plate__strategy"
            content={
              <>
                <b>
                  {strategy.label}
                  {family ? ` · ${family.label}` : ''}
                </b>
                <p>{strategy.brief}</p>
                <em>整批只用这一条路数，作为正向约束写进 prompt。</em>
              </>
            }
          >
            <i />
            {strategy.label}
          </Tip>
        )}
        <Tip
          className="rarity"
          content={
            <>
              <b>自报概率 {(candidate.probability * 100).toFixed(0)}%</b>
              <p>
                模型自己估计，换一个助手拿到同一份简介、有多大可能也想出这个名字。数字越低越是这条路数逼出来的东西。
                本次会话的阈值是 {(threshold * 100).toFixed(0)}%，高过它的名字在流式到达的那一刻就被丢掉，不排序、不回收。
              </p>
              <em>这是自评，不是测量。</em>
            </>
          }
        >
          <span className="rarity__bars">
            {[0, 1, 2, 3, 4].map(i => (
              <i key={i} data-on={i < bars} style={{ height: 3 + i * 1.6 }} />
            ))}
          </span>
          {(candidate.probability * 100).toFixed(0)}%
        </Tip>
        <span className="plate__shape">
          {candidate.name.length}c · {syllables(candidate.name)}syl
        </span>
      </div>

      <p className="plate__rationale">{candidate.rationale}</p>

      <Seals checks={checks} pending={pending} onOpen={onOpen} />

      <div className="plate__foot">
        <VerdictDial verdict={candidate.verdict} onChange={onVerdict} />
        <button className="btn btn--ghost btn--sm" onClick={onOpen}>
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
              placeholder="为什么喜欢它、为什么不喜欢 —— 这句话会进下一批的 prompt。"
              onChange={e => setDraft(e.target.value)}
              onBlur={() => {
                if (draft !== (candidate.note ?? '')) onNote(draft)
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setNoteOpen(false)
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  onNote(draft)
                  setNoteOpen(false)
                }
              }}
            />
            <div className="plate__note-saved">失焦即存，⌘/Ctrl + Enter 收起。</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export const CandidatePlate = memo(PlateInner)
