import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Prior, Strength } from '../types.ts'

const STRENGTH_LABEL: Record<Strength, string> = {
  strong: 'strong',
  moderate: 'moderate',
  thin: 'thin',
  contradicted: 'contradicted',
}

/**
 * Every Prior is displayable, carries its evidence strength, and is overridable
 * (CONTEXT.md). The ones with no instruction never reach the model at all —
 * they are in here because the reason a rule is *absent* is also evidence.
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
      {priors.map(p => {
        const steerable = !!p.instruction
        const on = enabled.includes(p.id)
        const expanded = open === p.id
        return (
          <div key={p.id} className={`prior${on && steerable ? ' prior--on' : ''}`}>
            <div className="prior__top">
              <span className="prior__id">{p.id}</span>
              <span className="prior__statement">{p.statement}</span>
              <button
                className="toggle"
                data-on={on && steerable}
                disabled={!steerable}
                aria-label={steerable ? `${p.id} 开关` : `${p.id} 不进入生成`}
                title={steerable ? undefined : '这一条不进入 prompt，只作说明'}
                onClick={() => onChange(on ? enabled.filter(x => x !== p.id) : [...enabled, p.id])}
              />
            </div>
            <div className="prior__row">
              <span className={`strength strength--${p.strength}`}>{STRENGTH_LABEL[p.strength]}</span>
              {!steerable && (
                <span style={{ fontSize: 11.5, color: 'var(--vellum-4)' }}>
                  {p.strength === 'contradicted' ? '被语料推翻，写在这里是为了说明为什么没有这条规则' : '只提醒你，不进 prompt'}
                </span>
              )}
              <button className="prior__more" onClick={() => setOpen(expanded ? null : p.id)}>
                {expanded ? '收起证据 ▴' : '证据 ▾'}
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
                  <h5>证据</h5>
                  {p.evidence}
                  <h5>什么情况下它对你不成立</h5>
                  {p.overturnedBy}
                  {steerable && (
                    <>
                      <h5>开着的时候，进 prompt 的原话</h5>
                      <code style={{ fontSize: 11.5, color: 'var(--vellum-4)' }}>{p.instruction}</code>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
