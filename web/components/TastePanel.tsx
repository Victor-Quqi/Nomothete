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
      <>
        <p className="drawer__lead">{profile.statement}</p>
        <div className="empty">
          <div className="empty__g">·</div>
          <p>打几个档，这里就会长出东西来。只属于这次会话。</p>
        </div>
      </>
    )
  }

  return (
    <>
      <p className="drawer__lead">{profile.statement}</p>

      <div className="taste__stat">
        <div className="taste__num taste__num--up">
          {profile.positives}
          <small>正面</small>
        </div>
        <div className="taste__num taste__num--down">
          {profile.negatives}
          <small>负面</small>
        </div>
        <div className="taste__num">
          {profile.observations}
          <small>总观测</small>
        </div>
      </div>

      {profile.traits.length > 0 && (
        <>
          <div className="section-h">从点击里读出来的</div>
          {profile.traits.map(t => (
            <div className="trait" key={t.id}>
              <span className="trait__arrow" data-dir={t.direction}>
                {t.direction === 'toward' ? '→' : '←'}
              </span>
              <span>
                {t.statement} <span className="trait__n">n={t.n}</span>
              </span>
            </div>
          ))}
        </>
      )}

      {profile.familyScores.length > 0 && (
        <>
          <div className="section-h">语义场</div>
          <div className="bars">
            {profile.familyScores.map(f => (
              <Bar key={f.id} label={f.label} score={f.score} n={f.n} hue={familyById.get(f.id)?.hue ?? 38} />
            ))}
          </div>
        </>
      )}

      {profile.strategyScores.length > 0 && (
        <>
          <div className="section-h">路数</div>
          <div className="bars">
            {profile.strategyScores.map(s => (
              <Bar key={s.id} label={s.label} score={s.score} n={s.n} hue={familyById.get(s.family)?.hue ?? 38} />
            ))}
          </div>
        </>
      )}

      {profile.injected && (
        <>
          <div className="section-h">下一批会收到这段</div>
          <pre className="injected">{profile.injected}</pre>
        </>
      )}
    </>
  )
}
