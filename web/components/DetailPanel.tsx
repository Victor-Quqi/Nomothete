import { useEffect, useMemo, useState } from 'react'
import { NO_CHECKS, deepRunning, groupChecks } from '../checks.ts'
import { REGISTRIES, registryForm } from '../normalize.ts'
import { isMute, speakName } from '../speak.ts'
import { CheckFinding, RecheckLine } from './CheckList.tsx'
import { SayButton } from './SayButton.tsx'
import { VerdictDial } from './VerdictDial.tsx'
import type { Bootstrap, Candidate, Family, StrategyInfo, Verdict } from '../types.ts'

export function DetailPanel({
  candidate,
  strategy,
  family,
  manifest,
  asked,
  onVerdict,
  onNote,
  onRecheck,
}: {
  candidate: Candidate
  strategy?: StrategyInfo
  family?: Family
  /** What the server can check, so the drawer can name what it has not done yet. */
  manifest?: Bootstrap['checks']
  /** Its slow tier was started by hand and nothing has come back yet. */
  asked: boolean
  onVerdict: (v: Verdict) => void
  onNote: (note: string) => void
  onRecheck: () => void
}) {
  const [draft, setDraft] = useState(candidate.note ?? '')
  const [saying, setSaying] = useState(false)
  const [copied, setCopied] = useState('')
  useEffect(() => setDraft(candidate.note ?? ''), [candidate.id, candidate.note])

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

  const checks = candidate.checks ?? NO_CHECKS
  const { findings, quiet, failed } = useMemo(() => groupChecks(checks), [checks])

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

      <p className="detail__rationale">
        {candidate.rationale}
      </p>

      <VerdictDial verdict={candidate.verdict} onChange={onVerdict} />

      {findings.length > 0 && (
        <>
          <div className="section-h">检查发现</div>
          {findings.map(c => (
            <CheckFinding key={c.checkId} check={c} />
          ))}
        </>
      )}

      {quiet.length > 0 && (
        <>
          <div className="section-h section-h--tail">
            {findings.length > 0 ? `其余 ${quiet.length} 项没发现冲突` : `${quiet.length} 项检查没发现冲突`}
          </div>
          {/*
            No 每项细说 toggle. It promised to spell each one out and then, for
            half of them, opened to nothing — a check with no more to say has no
            more to say at either size. What is left is short enough to print,
            so every check reads the same here as it does on a card: the line,
            and the sentence underneath it if there is one.
          */}
          {quiet.map(c => (
            <CheckFinding key={c.checkId} check={c} />
          ))}
        </>
      )}

      {failed.length > 0 && (
        <>
          <div className="section-h">没查成</div>
          {failed.map(c => (
            <CheckFinding key={c.checkId} check={c} />
          ))}
        </>
      )}

      <RecheckLine
        checks={checks}
        manifest={manifest}
        running={deepRunning(checks, candidate.verdict, asked)}
        onRecheck={onRecheck}
      />

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
