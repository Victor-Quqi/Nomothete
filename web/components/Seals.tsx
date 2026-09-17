import { AnimatePresence, motion } from 'motion/react'
import { Tip } from './Tip.tsx'
import type { CheckResult } from '../types.ts'

const ORDER = ['validity', 'availability', 'publishability', 'neighbourhood', 'dictionary', 'local-index', 'github', 'domain']

const TIER_NOTE: Record<string, string> = {
  local: '本地，0 请求',
  free: '免费接口',
  ratelimited: '限流接口 · 正面 Verdict 后才跑',
  paid: '付费接口',
}

function sortChecks(checks: CheckResult[]): CheckResult[] {
  return [...checks].sort((a, b) => {
    const rank = (c: CheckResult) => (c.status === 'clear' ? 1 : 0)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return ORDER.indexOf(a.checkId) - ORDER.indexOf(b.checkId)
  })
}

/**
 * Each check stamps one seal. The wording never says "safe" or "available" —
 * the vocabulary is 查无记录 / 已有同名 (CONTEXT.md), and the seal only carries
 * what the check itself reported.
 */
export function Seals({
  checks,
  pending,
  onOpen,
}: {
  checks: CheckResult[]
  /** Text for the one provisional seal, when something is still out. */
  pending?: string | null
  onOpen?: () => void
}) {
  const sorted = sortChecks(checks)
  return (
    <div className="seals">
      <AnimatePresence initial={false}>
        {sorted.map(c => (
          <motion.span
            key={c.checkId}
            layout
            initial={{ opacity: 0, scale: 0.86, filter: 'blur(3px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            style={{ display: 'inline-flex' }}
          >
            <Tip
              className={`seal seal--${c.status}`}
              onClick={onOpen}
              content={
                <>
                  <b>
                    {c.label} · {c.headline}
                  </b>
                  {c.detail && <p>{c.detail}</p>}
                  <em>{TIER_NOTE[c.tier] ?? c.tier}</em>
                </>
              }
            >
              <i />
              <span>{c.headline}</span>
            </Tip>
          </motion.span>
        ))}
        {pending && (
          <motion.span
            key="pending"
            layout
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
