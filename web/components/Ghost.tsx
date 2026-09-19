import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import type { Batch, Family, StrategyInfo } from '../types.ts'

/**
 * Seconds since the batch went out, ticking.
 *
 * A reasoning model can think for a minute before writing anything. Silence for
 * a minute reads as broken; a number going up reads as work.
 */
function useElapsed(since: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return Math.max(0, Math.round((now - since) / 1000))
}

const PHASE_NOTE: Record<string, string> = {
  waiting: '已发出请求',
  thinking: '正在推理',
  writing: '正在写',
}

/**
 * The plate a name has not arrived in yet — one per running batch.
 *
 * It stands where that batch's names will land and says which strategy is out,
 * what it is doing and how long it has been doing it. Waiting is reported in
 * the place the result appears, so nothing above the canvas has to report it a
 * second time.
 */
export function Ghost({
  batch,
  strategy,
  family,
}: {
  batch: Batch
  strategy: StrategyInfo | undefined
  family: Family | undefined
}) {
  const elapsed = useElapsed(batch.createdAt)
  const phase = batch.phase ?? 'waiting'

  return (
    <motion.div
      layout
      className="ghost"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
    >
      <div className="ghost__line ghost__line--title" />
      <div className="ghost__line" style={{ width: '92%' }} />
      <div className="ghost__line" style={{ width: '78%' }} />
      <div className="ghost__strategy">
        <i className="ghost__dot" style={{ background: `hsl(${family?.hue ?? 38} 55% 55%)` }} />
        {strategy?.label ?? batch.strategyId}
        <span className="ghost__phase">
          {PHASE_NOTE[phase]}
          <i className="ghost__ellipsis" />
        </span>
        <b className="ghost__elapsed">{elapsed}s</b>
      </div>
    </motion.div>
  )
}
