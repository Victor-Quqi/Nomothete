import { tr } from '../i18n.ts'
import { Fragment, useId, useState, type ReactNode } from 'react'
import { deepDone, presentCheck } from '../checks.ts'
import { npmNeighbourhood } from '../../shared/npmNeighbourhood.ts'
import type { Bootstrap, CheckResult } from '../types.ts'

/**
 * How a check reports, on a card and in the drawer alike.
 *
 * One form, two widths. A check is a label and the sentence it came back with;
 * when it found something, that sentence gets the room to say what, and links
 * to whatever it found. The drawer has more space than a plate, but not a
 * different story to tell, so there is no second rendering for it to drift from.
 */

/** Package results and up to three GitHub repositories, with source links. */
export function linksOf(check: CheckResult, name?: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = []
  const d = check.data
  if (check.checkId === 'neighbourhood' && d && name) {
    for (const pkg of npmNeighbourhood(d, name, tr).names) {
      out.push({ href: `https://www.npmjs.com/package/${encodeURIComponent(pkg)}`, text: pkg })
    }
  }
  if (d?.registries) {
    for (const r of d.registries) if (r.url) out.push({ href: r.url, text: r.label })
  }
  if (d?.top) {
    for (const r of d.top.slice(0, 3)) {
      const name = r.name.length > 34 ? `${r.name.slice(0, 33)}…` : r.name
      out.push({ href: r.url, text: `${name} ★${r.stars.toLocaleString()}` })
    }
  }
  return out
}

/**
 * GitHub's own repository search: name matches, most stars first. Built from
 * the candidate's name rather than stored check data, so rows from older
 * builds get it too, and so do zero-hit and rate-limited rows.
 */
function githubSearchUrl(name: string): string {
  const q = encodeURIComponent(`${name} in:name`)
  return `https://github.com/search?q=${q}&type=repositories&s=stars&o=desc`
}

/** Keep source actions separate from the finding so neither splits mid-link. */
function CheckRow({
  check,
  headline,
  action,
  children,
}: {
  check: CheckResult
  headline: ReactNode
  action?: { href: string; text: string }
  children?: ReactNode
}) {
  return (
    <div className="found" data-status={check.status} data-action={action ? '' : undefined}>
      <div className="found__head">
        <span className="found__source">
          {check.label}
        </span>
        {action && (
          <a className="found__action" aria-label={action.text} title={action.text} href={action.href} target="_blank" rel="noreferrer noopener" onClick={e => e.stopPropagation()}>
            <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
      <div className="found__what">{headline}</div>
      {children}
    </div>
  )
}

/** The line, plus what was found and where to go look at it. */
export function CheckFinding({ check, name }: { check: CheckResult; name?: string }) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const presented = presentCheck(check, name)
  const { headline, detail } = presented
  const links = linksOf(check, name)
  const npm = check.checkId === 'neighbourhood'
  const inlineRegistries = check.checkId === 'availability' && presented.status === 'taken' && links.length > 0
  const shown = npm && !expanded ? links.slice(0, 3) : links
  const action = name
    ? check.checkId === 'github'
      ? { href: githubSearchUrl(name), text: tr('搜索仓库', 'Search repositories') }
      : check.checkId === 'neighbourhood'
        ? { href: `https://www.npmjs.com/search?q=${encodeURIComponent(name)}`, text: tr('搜索 npm', 'Search npm') }
        : undefined
    : undefined
  return (
    <CheckRow check={presented} action={action} headline={
      inlineRegistries ? (
        <>
          {links.map((l, i) => (
            <Fragment key={l.href}>
              {i > 0 && <span className="found__separator"> / </span>}
              <a href={l.href} target="_blank" rel="noreferrer noopener" onClick={e => e.stopPropagation()}>{l.text}</a>
            </Fragment>
          ))}
          <span className="found__registry-state">{tr('已有同名', 'Name taken')}</span>
        </>
      ) : npm && links.length > 0 ? tr(`${links.length} 个相近包名`, `${links.length} similar package${links.length === 1 ? '' : 's'}`) : headline
    }>
      {detail && <p className="found__why">{detail}</p>}
      {links.length > 0 && !inlineRegistries && (
        <div id={listId} className={npm ? 'found__packages' : 'found__links'}>
          {shown.map((l, i) => (
            <span
              key={npm && i === shown.length - 1 ? 'tail' : l.href}
              className={npm && i === shown.length - 1 ? 'found__package-tail' : 'found__link-wrap'}
            >
              <a
                href={l.href}
                target="_blank"
                rel="noreferrer noopener"
                title={npm ? l.text : undefined}
                onClick={e => e.stopPropagation()}
              >
                {npm ? (
                  <span className="found__package-name">
                    {l.text.startsWith('@') ? (
                      <><span className="found__scope">{l.text.slice(0, l.text.indexOf('/') + 1)}</span>{l.text.slice(l.text.indexOf('/') + 1)}</>
                    ) : l.text}
                  </span>
                ) : `${l.text} ↗`}
              </a>
              {npm && i === shown.length - 1 && links.length > 3 && (
                <button
                  className="found__more"
                  aria-label={expanded ? tr('收起包列表', 'Collapse package list') : tr(`展开其余 ${links.length - 3} 个包`, `Show ${links.length - 3} more package${links.length === 4 ? '' : 's'}`)}
                  aria-expanded={expanded}
                  aria-controls={listId}
                  onClick={e => { e.stopPropagation(); setExpanded(!expanded) }}
                >
                  {expanded ? tr('收起', 'Collapse') : `+${links.length - 3}`}
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </CheckRow>
  )
}

/**
 * The checks that are still waiting on a ▲, named.
 *
 * The card and the drawer both offer to start them early, and they have to
 * name the same ones — so the manifest is read here, once, rather than at each
 * place that makes the offer.
 */
export function waitingLabels(manifest?: Bootstrap['checks']): string {
  return (manifest ?? [])
    .filter(c => c.when === 'after-upvote')
    .map(c => c.label)
    .join(tr('、', ', '))
}

/**
 * The slow tier, and how to start it.
 *
 * It runs on its own after a ▲, because that is the point at which a name is
 * worth thirty requests. That is a default, not a toll — anything that can be
 * read can be asked for, so the button is here whatever the Verdict is.
 */
export function RecheckLine({
  checks,
  manifest,
  running,
  onRecheck,
}: {
  checks: CheckResult[]
  manifest?: Bootstrap['checks']
  /** A run is already under way. The button reports it rather than starting a second one. */
  running?: boolean
  onRecheck: () => void
}) {
  const waiting = waitingLabels(manifest)

  if (running) {
    return (
      <div className="recheck">
        <button className="btn btn--ghost btn--sm" disabled>
          {tr('正在查…', 'Checking…')}
        </button>
      </div>
    )
  }

  return (
    <div className="recheck">
      {deepDone(checks) ? (
        <button className="btn btn--ghost btn--sm" onClick={onRecheck}>
          {tr('重新检查 ↻', 'Check again ↻')}
        </button>
      ) : (
        <>
          <div className="recheck__copy">
            <span>{waiting ? tr(`${waiting} 还没查`, `${waiting}: not checked yet`) : tr('还有几项慢的没查', 'Some slower checks are still pending')}</span>
            <span className="recheck__hint">{tr('标记 ▲ 后自动检查', 'Checked automatically after you mark ▲')}</span>
          </div>
          <button className="recheck__start" onClick={onRecheck}>{tr('现在查', 'Check now')}<span aria-hidden="true">→</span></button>
        </>
      )}
    </div>
  )
}
