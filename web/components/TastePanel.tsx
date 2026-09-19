import { motion } from 'motion/react'
import type { Family, TasteProfile } from '../types.ts'

function Bar({ label, score, n, hue }: { label: string; score: number; n: number; hue: number }) {
  // Scores are shrunk sums in roughly [-2, 2.6]; clamp for display only.
  const pct = Math.max(-1, Math.min(1, score / 2))
  const width = Math.abs(pct) * 50
  return (
    <div className="bar">
      <span className="bar__label">{label}</span>
      <span className="bar__track">
        <span className="bar__mid" />
        <motion.span
          className="bar__fill"
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 28 }}
          style={{
            left: pct >= 0 ? '50%' : undefined,
            right: pct < 0 ? '50%' : undefined,
            background: pct >= 0 ? `hsl(${hue} 60% 55%)` : 'var(--rust)',
          }}
        />
      </span>
      <span className="bar__n">{n}</span>
    </div>
  )
}

/**
 * The Taste Profile is inferred from Verdicts, scoped to this session, and
 * hidden until asked for. Every line is phrased as an observation of clicks —
 * it never says a name is good.
 */
export function TastePanel({ profile, familyById }: { profile: TasteProfile; familyById: Map<string, Family> }) {
  if (profile.observations === 0) {
    return (
      <div className="empty">
        <div className="empty__g">·</div>
        <p>评价几个名字后，这里会列出推断。</p>
      </div>
    )
  }

  return (
    <>
      <div className="taste__stat">
        <div className="taste__num taste__num--up">
          {profile.positives}
          <small>喜欢</small>
        </div>
        <div className="taste__num taste__num--down">
          {profile.negatives}
          <small>不喜欢</small>
        </div>
      </div>

      {profile.traits.length > 0 && (
        <>
          <div className="section-h">推断</div>
          {profile.traits.map(t => (
            <div className="trait" key={t.id}>
              <span className="trait__arrow" data-dir={t.direction}>
                {t.direction === 'toward' ? '→' : '←'}
              </span>
              <span>
                {t.statement} <span className="trait__n">（依据 {t.n} 次评价）</span>
              </span>
            </div>
          ))}
        </>
      )}

      {profile.familyScores.length > 0 && (
        <>
          <div className="section-h">词族倾向</div>
          <div className="bars">
            {profile.familyScores.map(f => (
              <Bar key={f.id} label={f.label} score={f.score} n={f.n} hue={familyById.get(f.id)?.hue ?? 38} />
            ))}
          </div>
        </>
      )}

      {profile.strategyScores.length > 0 && (
        <>
          <div className="section-h">思路倾向</div>
          <div className="bars">
            {profile.strategyScores.map(s => (
              <Bar key={s.id} label={s.label} score={s.score} n={s.n} hue={familyById.get(s.family)?.hue ?? 38} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
