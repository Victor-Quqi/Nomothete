import { useEffect, useMemo, useState } from 'react'
import { byCheckOrder } from '../checks.ts'
import { REGISTRIES, registryForm } from '../normalize.ts'
import { isMute, speakName } from '../speak.ts'
import { SayButton } from './SayButton.tsx'
import { VerdictDial } from './VerdictDial.tsx'
import type { Bootstrap, Candidate, CheckResult, Family, StrategyInfo, Verdict } from '../types.ts'

/**
 * Somewhere to click through to. Three at most: GitHub hands back its five
 * top-starred repositories, and the tail of that list is a ★1 fork with a
 * forty-character name — a line of noise under a sentence that already said the
 * hits are small.
 */
function linksOf(check: CheckResult): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = []
  const d = check.data
  if (d?.registries) {
    for (const r of d.registries) if (r.url) out.push({ href: r.url, text: `${r.label} 上的同名` })
  }
  if (d?.top) {
    for (const r of d.top.slice(0, 3)) {
      const name = r.name.length > 34 ? `${r.name.slice(0, 33)}…` : r.name
      out.push({ href: r.url, text: `${name} ★${r.stars.toLocaleString()}` })
    }
  }
  return out
}

/** A check that found something. It gets room to say what, and where to look. */
function CheckCard({ check }: { check: CheckResult }) {
  const links = linksOf(check)
  return (
    <div className="check">
      <div className="check__top">
        <span className={`dot dot--${check.status}`} />
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

/**
 * A check that found nothing. It still gets said — a search that came back empty
 * is a fact — but one line is the whole of it, and every one of these sentences
 * restates its own headline, so the headline is all that shows.
 */
function CheckRow({ check }: { check: CheckResult }) {
  return (
    <div className="found">
      <span className={`dot dot--${check.status}`} />
      <span className="found__label">{check.label}</span>
      <span className="found__what">{check.headline}</span>
    </div>
  )
}

export function DetailPanel({
  candidate,
  strategy,
  family,
  manifest,
  onVerdict,
  onNote,
  onRecheck,
}: {
  candidate: Candidate
  strategy?: StrategyInfo
  family?: Family
  /** What the server can check, so the drawer can name what it has not done yet. */
  manifest?: Bootstrap['checks']
  onVerdict: (v: Verdict) => void
  onNote: (note: string) => void
  onRecheck: () => void
}) {
  const [draft, setDraft] = useState(candidate.note ?? '')
  const [saying, setSaying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState('')
  useEffect(() => setDraft(candidate.note ?? ''), [candidate.id, candidate.note])
  useEffect(() => setExpanded(false), [candidate.id])

  const speak = () => {
    setSaying(true)
    speakName(candidate.name, () => setSaying(false))
  }

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(text)
        setTimeout(() => setCopied(c => (c === text ? '' : c)), 1300)
      },
      () => {},
    )
  }

  // Only the registries that will store the name under a different string have
  // anything to say. For a lowercase one-word name that is none of them, and the
  // whole block disappears rather than printing the name back three times.
  const forms = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const r of REGISTRIES) {
      const form = registryForm(r.id, candidate.name)
      if (form === candidate.name) continue
      groups.set(form, [...(groups.get(form) ?? []), r.label])
    }
    return [...groups].map(([form, labels]) => ({ form, who: labels.join('、') }))
  }, [candidate.name])

  const checks = useMemo(() => (candidate.checks ?? []).slice().sort(byCheckOrder), [candidate.checks])
  const findings = checks.filter(c => c.status !== 'clear' && c.status !== 'error' && c.status !== 'pending')
  const quiet = checks.filter(c => c.status === 'clear')
  const failed = checks.filter(c => c.status === 'error')

  const deepDone = checks.some(c => c.tier === 'ratelimited')
  const deepLabels = (manifest ?? [])
    .filter(c => c.when === 'after-upvote')
    .map(c => c.label)
    .join('、')

  return (
    <>
      <div className="detail__head">
        <h2 className={`detail__name${saying ? ' detail__name--speaking' : ''}`} onClick={speak}>
          {candidate.name}
        </h2>
        <SayButton state={saying ? 'on' : isMute() ? 'mute' : 'idle'} onClick={speak} />
      </div>

      <div className="plate__meta" style={{ marginBottom: 14 }}>
        {strategy && (
          <span className="plate__strategy" style={{ ['--fam-hue' as string]: family?.hue ?? 38 }}>
            <i />
            {strategy.label}
            {family ? ` · ${family.label}` : ''}
          </span>
        )}
      </div>

      {forms.length > 0 && (
        <div className="detail__forms">
          {forms.map(f => (
            <button className="detail__form" key={f.form} title="复制" onClick={() => copy(f.form)}>
              <b>{f.who} 上写作</b>
              <code>{f.form}</code>
              <span className="detail__form-copy">{copied === f.form ? '✓' : '⧉'}</span>
            </button>
          ))}
        </div>
      )}

      <p className="plate__rationale" style={{ marginBottom: 18 }}>
        {candidate.rationale}
      </p>

      <VerdictDial verdict={candidate.verdict} onChange={onVerdict} />

      {findings.length > 0 && (
        <>
          <div className="section-h">检查发现</div>
          {findings.map(c => (
            <CheckCard key={c.checkId} check={c} />
          ))}
        </>
      )}

      {quiet.length > 0 && (
        <>
          <div className="section-h section-h--tail">
            {findings.length > 0 ? `其余 ${quiet.length} 项没发现冲突` : `${quiet.length} 项检查没发现冲突`}
            <i className="section-h__rule" />
            <button className="btn btn--ghost btn--sm" onClick={() => setExpanded(e => !e)}>
              {expanded ? '收起' : '每项细说'}
            </button>
          </div>
          {quiet.map(c =>
            expanded ? <CheckCard key={c.checkId} check={c} /> : <CheckRow key={c.checkId} check={c} />,
          )}
        </>
      )}

      {failed.length > 0 && (
        <>
          <div className="section-h">没查成</div>
          {failed.map(c => (
            <div key={c.checkId}>
              <CheckRow check={c} />
              {c.detail && <p className="found__why">{c.detail}</p>}
            </div>
          ))}
        </>
      )}

      <div className="detail__more">
        {deepDone ? (
          <button className="btn btn--ghost btn--sm" style={{ paddingLeft: 0 }} onClick={onRecheck}>
            重新检查 ↻
          </button>
        ) : (
          <>
            <span>{deepLabels ? `还没查 ${deepLabels}。这几项慢，打出 ▲ 后自动开始。` : '更慢的几项，打出 ▲ 后自动开始。'}</span>
            <button className="btn btn--ghost btn--sm" onClick={onRecheck}>
              现在执行 →
            </button>
          </>
        )}
      </div>

      <div className="section-h">备注</div>
      <textarea
        className="detail__note"
        value={draft}
        placeholder="为什么喜欢 / 不喜欢。下一批会参考这句话。"
        onChange={e => setDraft(e.target.value)}
        onBlur={() => draft !== (candidate.note ?? '') && onNote(draft)}
      />
    </>
  )
}
