import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Prior, Strength } from '../types.ts'

const STRENGTH_LABEL: Record<Strength, string> = {
  strong: '证据充分',
  moderate: '证据一般',
  thin: '证据很弱',
  contradicted: '已被推翻',
}

/**
 * Every Prior is displayable, carries its evidence strength, and is overridable
 * (CONTEXT.md). Only the ones that actually reach the model are listed — a rule
 * the system decided *not* to have is a note for the README, not a row here.
 */
export function PriorDossier({
  priors,
  enabled,
  onChange,
}: {
  priors: Prior[]
  enabled: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div>
      {priors
        .filter(p => p.instruction)
        .map(p => {
          const on = enabled.includes(p.id)
          const expanded = open === p.id
          return (
            <div key={p.id} className={`prior${on ? ' prior--on' : ''}`}>
              <div className="prior__top">
                <span className="prior__statement">{p.statement}</span>
                <button
                  className="toggle"
                  data-on={on}
                  aria-label={p.statement}
                  onClick={() => onChange(on ? enabled.filter(x => x !== p.id) : [...enabled, p.id])}
                />
              </div>
              <div className="prior__row">
                <span className={`strength strength--${p.strength}`}>{STRENGTH_LABEL[p.strength]}</span>
                <button className="prior__more" onClick={() => setOpen(expanded ? null : p.id)}>
                  {expanded ? '收起 ▴' : '为什么 ▾'}
                </button>
              </div>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    className="prior__evidence"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {p.evidence}
                    <h5>什么时候不用管它</h5>
                    {p.overturnedBy}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
    </div>
  )
}
