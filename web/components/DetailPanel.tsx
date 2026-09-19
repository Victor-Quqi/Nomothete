import { useEffect, useState } from 'react'
import { REGISTRY_FORMS } from '../normalize.ts'
import { speakName } from '../speak.ts'
import { VerdictDial } from './VerdictDial.tsx'
import type { Candidate, CheckResult, Family, StrategyInfo, Verdict } from '../types.ts'

function CheckCard({ check }: { check: CheckResult }) {
  const links: { href: string; text: string }[] = []
  const d = check.data
  if (d?.registries) {
    for (const r of d.registries) if (r.url) links.push({ href: r.url, text: `${r.label} 上的同名` })
  }
  if (d?.top) {
    for (const r of d.top) links.push({ href: r.url, text: `${r.name} ★${r.stars.toLocaleString()}` })
  }
  return (
    <div className="check">
      <div className="check__top">
        <span className={`seal seal--${check.status}`} style={{ padding: '2px 8px 2px 6px' }}>
          <i />
        </span>
        <span className="check__label">{check.label}</span>
      </div>
      <div className="check__detail">
        <b style={{ color: 'var(--vellum)', fontWeight: 500 }}>{check.headline}。</b> {check.detail}
      </div>
      {links.length > 0 && (
        <div className="check__links">
          {links.map(l => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer noopener">
              {l.text} ↗
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export function DetailPanel({
  candidate,
  strategy,
  family,
  onVerdict,
  onNote,
  onRecheck,
}: {
  candidate: Candidate
  strategy?: StrategyInfo
  family?: Family
  onVerdict: (v: Verdict) => void
  onNote: (note: string) => void
  onRecheck: () => void
}) {
  const [draft, setDraft] = useState(candidate.note ?? '')
  useEffect(() => setDraft(candidate.note ?? ''), [candidate.id, candidate.note])

  const checks = candidate.checks ?? []
  const deep = checks.filter(c => c.tier === 'ratelimited')
  const shallow = checks.filter(c => c.tier !== 'ratelimited')

  return (
    <>
      <h2 className="detail__name" onClick={() => speakName(candidate.name)} title="念一遍">
        {candidate.name}
      </h2>
      <div className="plate__meta" style={{ marginBottom: 14 }}>
        {strategy && (
          <span className="plate__strategy" style={{ ['--fam-hue' as string]: family?.hue ?? 38 }}>
            <i />
            {strategy.label}
            {family ? ` · ${family.label}` : ''}
          </span>
        )}
      </div>

      <VerdictDial verdict={candidate.verdict} onChange={onVerdict} />

      <p className="plate__rationale" style={{ marginTop: 16 }}>
        {candidate.rationale}
      </p>

      <div className="section-h">各处该写成什么</div>
      <div className="detail__forms">
        {REGISTRY_FORMS.map(f => (
          <button
            className="detail__form detail__form--copy"
            key={f.id}
            title="复制"
            onClick={() => navigator.clipboard?.writeText(f.fn(candidate.name)).catch(() => {})}
          >
            <b>{f.label}</b>
            <code>{f.fn(candidate.name)}</code>
          </button>
        ))}
      </div>

      <div className="section-h">检查</div>
      {shallow.map(c => (
        <CheckCard key={c.checkId} check={c} />
      ))}

      <div className="section-h">更慢的检查</div>
      {deep.length > 0 ? (
        deep.map(c => <CheckCard key={c.checkId} check={c} />)
      ) : (
        <p className="check__detail">
          给它一个 ▲ 就会自动开始。
          <br />
          <button className="btn btn--ghost btn--sm" style={{ marginTop: 8, paddingLeft: 0 }} onClick={onRecheck}>
            也可以现在就跑 →
          </button>
        </p>
      )}
      {deep.length > 0 && (
        <button className="btn btn--ghost btn--sm" style={{ paddingLeft: 0 }} onClick={onRecheck}>
          重新查一遍 ↻
        </button>
      )}

      <div className="section-h">备注</div>
      <textarea
        value={draft}
        placeholder="为什么喜欢 / 不喜欢它。下一批会参考这句话。"
        onChange={e => setDraft(e.target.value)}
        onBlur={() => draft !== (candidate.note ?? '') && onNote(draft)}
        style={{
          width: '100%',
          minHeight: 84,
          background: 'rgba(8,9,12,0.5)',
          border: '1px solid var(--hair)',
          borderRadius: 10,
          padding: '10px 12px',
          fontSize: 13,
          lineHeight: 1.7,
          resize: 'vertical',
        }}
      />
    </>
  )
}
