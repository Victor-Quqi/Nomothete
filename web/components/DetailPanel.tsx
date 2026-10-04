import { useEffect, useMemo, useState } from 'react'
import { NO_CHECKS, groupChecks } from '../checks.ts'
import { REGISTRIES, registryForm } from '../normalize.ts'
import { isMute, speakName } from '../speak.ts'
import { CheckFinding, RecheckLine } from './CheckList.tsx'
import { RationaleCheck } from './RationaleCheck.tsx'
import { SayButton } from './SayButton.tsx'
import { VerdictDial } from './VerdictDial.tsx'
import type { Bootstrap, Candidate, Family, StrategyInfo, Verdict } from '../types.ts'

export function DetailPanel({
  candidate,
  strategy,
  family,
  manifest,
  checking,
  autoVerify,
  onVerdict,
  onNote,
  onRecheck,
}: {
  candidate: Candidate
  strategy?: StrategyInfo
  family?: Family
  /** What the server can check, so the drawer can name what it has not done yet. */
  manifest?: Bootstrap['checks']
  /** The server is running its slow tier. */
  checking: boolean
  /** Whether rationale verification runs on its own; off shows a browser search instead. */
  autoVerify: boolean
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
  const { findings, quiet, failed } = useMemo(() => groupChecks(checks, candidate.name), [checks, candidate.name])

  return (
    <div className="detail">
      <div className="detail__head">
        <h2 className={`detail__name${saying ? ' detail__name--speaking' : ''}`} onClick={speak}>
          {candidate.name}
        </h2>
        <SayButton state={saying ? 'on' : isMute() ? 'mute' : 'idle'} onClick={speak} />
      </div>

      <div className="plate__meta detail__meta">
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
            <button className="detail__form" key={f.form} aria-label={`复制 ${f.who} 上的写法 ${f.form}`} title="复制" onClick={() => copy(f.form)}>
              <b>{f.who}</b>
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

      <RationaleCheck key={candidate.id} candidate={candidate} autoVerify={autoVerify} />

      <div className="detail__checks">
        {[...findings, ...quiet, ...failed].map(c => (
          <CheckFinding key={`${candidate.id}:${c.checkId}`} check={c} name={candidate.name} />
        ))}
        <RecheckLine
          checks={checks}
          manifest={manifest}
          running={checking}
          onRecheck={onRecheck}
        />
      </div>

      <label className="detail__note-label" htmlFor="candidate-note">备注</label>
      <textarea
        id="candidate-note"
        className="detail__note"
        value={draft}
        placeholder="为什么喜欢 / 不喜欢。下一批会参考这句话。"
        onChange={e => setDraft(e.target.value)}
        onBlur={() => draft !== (candidate.note ?? '') && onNote(draft)}
      />
    </div>
  )
}
