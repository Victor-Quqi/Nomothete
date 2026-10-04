import { tr } from '../i18n.ts'
import { motion } from 'motion/react'
import type { Verdict } from '../types.ts'

const STOPS: { v: Verdict; glyph: string; label: string }[] = [
  { v: -2, glyph: '▼▼', label: tr('不行（1）', 'No (1)') },
  { v: -1, glyph: '▼', label: tr('偏弱（2）', 'Not quite (2)') },
  { v: 0, glyph: '·', label: tr('未定（3）', 'Undecided (3)') },
  { v: 1, glyph: '▲', label: tr('有点意思（4）', 'Interested (4)') },
  { v: 2, glyph: '▲▲', label: tr('就它了（5）', 'This one (5)') },
]

const STEP = 33 // button width 32 + 1px gap

/**
 * The only input in the product that matters. Verdict is the single standard of
 * name quality (CONTEXT.md), so it is one control, five stops, and the knob
 * moves under the finger before the request comes back.
 */
export function VerdictDial({
  verdict,
  onChange,
  compact,
}: {
  verdict: Verdict
  onChange: (v: Verdict) => void
  compact?: boolean
}) {
  const index = STOPS.findIndex(s => s.v === verdict)
  return (
    <div className="dial" data-v={verdict} role="radiogroup" aria-label={tr('评价', 'Mark')}>
      <motion.div
        className="dial__knob"
        initial={false}
        animate={{ left: 3 + index * STEP, width: 32, opacity: verdict === 0 ? 0.45 : 1 }}
        transition={{ type: 'spring', stiffness: 620, damping: 38, mass: 0.6 }}
      />
      {STOPS.map(s => (
        <button
          key={s.v}
          data-v={s.v}
          data-on={s.v === verdict}
          role="radio"
          aria-checked={s.v === verdict}
          aria-label={s.label}
          title={compact ? s.label : undefined}
          onClick={e => {
            e.stopPropagation()
            onChange(s.v)
          }}
        >
          {s.glyph}
        </button>
      ))}
    </div>
  )
}
