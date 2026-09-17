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
  waiting: '已经发出去了，还没有第一个字。',
  thinking: '模型在推敲这一批。它要先想完，才会开始写名字。',
  writing: '名字正在到达，到一个贴一个。',
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
              留下 {batch.kept} 个，阈值当场丢掉 {batch.discarded} 个。
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
          推敲 {elapsed}s<i className="thread__ellipsis" />
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
  threshold,
}: {
  batches: Batch[]
  strategyById: Map<string, StrategyInfo>
  familyById: Map<string, Family>
  discards: Discard[]
  threshold: number
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
          {live ? '织机上' : '这一代'}
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
                    <b>被阈值当场丢掉的 {discards.length} 个</b>
                    <p>
                      {discards
                        .slice(-14)
                        .map(d => `${d.name} ${(d.probability * 100).toFixed(0)}%`)
                        .join('　')}
                    </p>
                    <em>
                      自报概率高于 {(threshold * 100).toFixed(0)}% 的名字在到达那一刻就被丢弃 ——
                      不排序、不回收，这样流式才不用等整批跑完。
                    </em>
                  </>
                }
              >
                <s>{discards.length}</s> 个太典型，已丢
              </Tip>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
