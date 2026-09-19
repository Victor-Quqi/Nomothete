import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Tip } from './Tip.tsx'
import type { Batch, Family, StrategyInfo } from '../types.ts'
import type { Discard } from '../store.ts'

/**
 * Seconds since the batch went out, ticking.
 *
 * A reasoning model can think for a minute before writing anything. Silence for
 * a minute reads as broken; a number going up reads as work.
 */
function useElapsed(since: number, live: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [live])
  return Math.max(0, Math.round((now - since) / 1000))
}

const PHASE_NOTE: Record<string, string> = {
  waiting: '已经发出去了。',
  thinking: '模型在想，想完才会开始写名字。',
  writing: '名字正在到达。',
}

function Thread({ batch, label, brief, hue }: { batch: Batch; label: string; brief: string; hue: number }) {
  const running = batch.state === 'running'
  const phase = batch.phase ?? 'waiting'
  const elapsed = useElapsed(batch.createdAt, running)

  return (
    <Tip
      className={`thread thread--${running ? 'live' : batch.state}`}
      content={
        <>
          <b>{label}</b>
          <p>{batch.error ? batch.error : brief}</p>
          {batch.state === 'done' && (
            <em>
              留下 {batch.kept} 个，丢掉 {batch.discarded} 个太常见的。
            </em>
          )}
          {running && <em>{PHASE_NOTE[phase]}</em>}
        </>
      }
    >
      <i className="thread__dot" style={{ background: `hsl(${hue} 55% 55%)` }} />
      {label}
      {running && phase !== 'writing' && (
        <b className="thread__n thread__n--wait">
          {elapsed}s<i className="thread__ellipsis" />
        </b>
      )}
      {batch.state === 'done' && <b className="thread__n">+{batch.kept}</b>}
      {batch.state === 'failed' && <b className="thread__n">失败</b>}
    </Tip>
  )
}

/**
 * The loom: one thread per Strategy currently on the frame.
 *
 * Generation takes 3–10s per batch and several batches run at once, so the
 * waiting has to be legible rather than hidden behind a spinner. A thread
 * shimmers while its batch is out and ties off with what it kept and what the
 * threshold ate.
 */
export function Loom({
  batches,
  strategyById,
  familyById,
  discards,
}: {
  batches: Batch[]
  strategyById: Map<string, StrategyInfo>
  familyById: Map<string, Family>
  discards: Discard[]
}) {
  if (batches.length === 0 && discards.length === 0) return null
  const live = batches.some(b => b.state === 'running')

  return (
    <motion.div
      className="loom"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="loom__inner">
        <span className="loom__label">
          {live && <i className="loom__pulse" />}
          {live ? '正在跑' : '这一批'}
        </span>

        <AnimatePresence initial={false}>
          {batches.map(b => {
            const s = strategyById.get(b.strategyId)
            const fam = s ? familyById.get(s.family) : undefined
            return (
              <motion.span
                key={b.id}
                layout
                initial={{ opacity: 0, y: -6, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                style={{ display: 'inline-flex' }}
              >
                <Thread
                  batch={b}
                  label={s?.label ?? b.strategyId}
                  brief={s?.brief ?? ''}
                  hue={fam?.hue ?? 38}
                />
              </motion.span>
            )
          })}
        </AnimatePresence>

        <AnimatePresence>
          {discards.length > 0 && (
            <motion.span
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ display: 'inline-flex' }}
            >
              <Tip
                className="discards"
                content={
                  <>
                    <b>丢掉的 {discards.length} 个</b>
                    <p>{discards.slice(-14).map(d => d.name).join('　')}</p>
                    <em>模型觉得它们太容易被想到。</em>
                  </>
                }
              >
                已丢掉 <s>{discards.length}</s> 个太常见的
              </Tip>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
