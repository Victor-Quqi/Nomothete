import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { byCheckOrder, presentCheck } from '../checks.ts'
import { linksOf } from './CheckList.tsx'
import { Tip } from './Tip.tsx'
import type { CheckResult } from '../types.ts'

/**
 * Seals report what the checks found — and only that.
 *
 * Nothing found prints nothing. A pill reading "5 项检查没发现冲突" sat on very
 * nearly every card, the same size and colour and place as the one pill that
 * meant something — so the wall could not be scanned for trouble. Quiet is the
 * signal now: seals on a card mean something is wrong with that name. What was
 * searched, and what each search said, is in the pane.
 *
 * The wording never says "safe" or "available" — the vocabulary is
 * 查无记录 / 已有同名 (CONTEXT.md).
 */
function tipFor(c: CheckResult): ReactNode {
  const links = linksOf(c).length
  const { detail } = presentCheck(c)
  if (!detail && links === 0) return null
  // The headline is on the pill, an inch under the pointer. All the title line
  // can add is which check said it.
  return (
    <>
      <b>{c.label}</b>
      {detail && <p>{detail}</p>}
      {links > 0 && <em>点开看 {links} 条链接</em>}
    </>
  )
}

export function Seals({
  checks,
  pending,
  onInspect,
}: {
  checks: CheckResult[]
  /** Text for the one provisional seal, when something is still out. */
  pending?: string | null
  onInspect?: () => void
}) {
  const findings = checks.filter(c => c.status !== 'clear').sort(byCheckOrder)

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
              // A hover that repeats the pill is worse than no hover: it costs
              // a wait and a glance and hands back the words already on screen.
              // So it opens only when the check found something the pill has no
              // room for, and it promises links only when there are links.
              content={tipFor(c)}
            >
              <i />
              <span>{c.headline}</span>
            </Tip>
          </motion.span>
        ))}

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
    </div>
  )
}
