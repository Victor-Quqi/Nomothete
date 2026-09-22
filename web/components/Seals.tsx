import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { byCheckOrder } from '../checks.ts'
import { Tip } from './Tip.tsx'
import type { CheckResult } from '../types.ts'

/**
 * Seals report what the checks found — and only that.
 *
 * A name with nothing wrong used to stamp five separate seals saying five
 * different ways of "没找到"，挤满一整行、抢走了唯一那条真发现的位置。So the
 * silent checks now collapse into one pill and keep their sentences in the
 * tooltip; only a finding gets a seal of its own.
 *
 * The wording still never says "safe" or "available" — the vocabulary is
 * 查无记录 / 已有同名 (CONTEXT.md). That is the whole of the hedge: say what was
 * searched and what came back, and let the reader draw the conclusion. Adding a
 * line underneath to warn them not to over-read it says nothing the rows did
 * not already say.
 *
 * Three rungs of detail would be one too many: the pill is what was found, the
 * tooltip unpacks it for the price of a hover, and the drawer is everything —
 * evidence, links, the slow tier, the full rationale. A middle rung that cost
 * the same click as the drawer and said less had no reason to exist, so
 * pressing a seal goes straight to the drawer.
 */
export function Seals({
  checks,
  pending,
  onInspect,
  action,
}: {
  checks: CheckResult[]
  /** Text for the one provisional seal, when something is still out. */
  pending?: string | null
  onInspect?: () => void
  /**
   * Something to do about what the seals say, on the same row as them. An
   * action, not a fourth thing to read — it goes where the eye already is.
   */
  action?: ReactNode
}) {
  const findings = checks.filter(c => c.status !== 'clear').sort(byCheckOrder)
  const clear = checks.filter(c => c.status === 'clear').sort(byCheckOrder)

  return (
    <div className="seals">
      <AnimatePresence initial={false}>
        {findings.map(c => (
          <motion.span
            key={c.checkId}
            initial={{ opacity: 0, scale: 0.86, filter: 'blur(3px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            style={{ display: 'inline-flex' }}
          >
            <Tip
              className={`seal seal--${c.status}`}
              onClick={onInspect}
              content={
                <>
                  <b>
                    {c.label} · {c.headline}
                  </b>
                  {c.detail && <p>{c.detail}</p>}
                  <em>点开看证据和链接</em>
                </>
              }
            >
              <i />
              <span>{c.headline}</span>
            </Tip>
          </motion.span>
        ))}

        {clear.length > 0 && (
          <motion.span
            key="clear"
            initial={{ opacity: 0, scale: 0.86, filter: 'blur(3px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            style={{ display: 'inline-flex' }}
          >
            <Tip
              className="seal seal--clear"
              onClick={onInspect}
              content={
                <>
                  <b>{clear.length} 项检查没发现冲突</b>
                  {clear.map(c => (
                    <p key={c.checkId} className="tip__row">
                      <span>{c.label}</span>
                      {c.headline}
                    </p>
                  ))}
                </>
              }
            >
              <i />
              <span>{clear.length} 项检查没发现冲突</span>
            </Tip>
          </motion.span>
        )}

        {pending && (
          <motion.span
            key="pending"
            className="seal seal--pending"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <i />
            <span>{pending}</span>
          </motion.span>
        )}
      </AnimatePresence>

      {action}
    </div>
  )
}
