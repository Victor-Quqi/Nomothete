import { tr } from '../i18n.ts'
import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Fold } from './Fold.tsx'
import type { Prior, Strength } from '../types.ts'

const STRENGTH_LABEL: Record<Strength, string> = {
  strong: tr('证据充分', 'Strong evidence'),
  moderate: tr('证据一般', 'Some evidence'),
  thin: tr('证据很弱', 'Thin evidence'),
  contradicted: tr('已被推翻', 'Overturned'),
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
                  {expanded ? tr('收起 ▴', 'Collapse ▴') : tr('为什么 ▾', 'Why ▾')}
                </button>
              </div>
              <AnimatePresence initial={false}>
                {expanded && (
                  <Fold className="prior__evidence" duration={0.3}>
                    {p.evidence}
                    <h5>{tr('何时不适用', 'When it does not apply')}</h5>
                    {p.overturnedBy}
                  </Fold>
                )}
              </AnimatePresence>
            </div>
          )
        })}
    </div>
  )
}
