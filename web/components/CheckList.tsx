import type { ReactNode } from 'react'
import { deepDone, presentCheck } from '../checks.ts'
import type { Bootstrap, CheckResult } from '../types.ts'

/**
 * How a check reports, on a card and in the drawer alike.
 *
 * One form, two widths. A check is a label and the sentence it came back with;
 * when it found something, that sentence gets the room to say what, and links
 * to whatever it found. The drawer has more space than a plate, but not a
 * different story to tell, so there is no second rendering for it to drift from.
 */

/**
 * Somewhere to click through to. Three at most: GitHub hands back its five
 * top-starred repositories, and the tail of that list is a ★1 fork with a
 * forty-character name — a line of noise under a sentence that already said the
 * hits are small.
 */
export function linksOf(check: CheckResult): { href: string; text: string }[] {
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

/**
 * GitHub's own repository search: name matches, most stars first. Built from
 * the candidate's name rather than stored check data, so rows from older
 * builds get it too, and so do zero-hit and rate-limited rows.
 */
function githubSearchUrl(name: string): string {
  const q = encodeURIComponent(`${name} in:name`)
  return `https://github.com/search?q=${q}&type=repositories&s=stars&o=desc`
}

/**
 * One line: the label, and the sentence the check came back with. An action
 * that belongs to the sentence follows it inline, after a comma, and wraps
 * with it.
 */
function CheckRow({
  check,
  headline,
  action,
  children,
}: {
  check: CheckResult
  headline: string
  action?: { href: string; text: string }
  children?: ReactNode
}) {
  return (
    <div className="found">
      <div className="found__line">
        <span className={`dot dot--${check.status}`} />
        <span className="found__label">{check.label}</span>
        <span className="found__what">
          {headline}
          {action && (
            <>
              ，
              <a href={action.href} target="_blank" rel="noreferrer noopener" onClick={e => e.stopPropagation()}>
                {action.text} ↗
              </a>
            </>
          )}
        </span>
      </div>
      {children}
    </div>
  )
}

/** The line, plus what was found and where to go look at it. */
export function CheckFinding({ check, name }: { check: CheckResult; name?: string }) {
  const { headline, detail } = presentCheck(check)
  const links = linksOf(check)
  const action = check.checkId === 'github' && name ? { href: githubSearchUrl(name), text: '搜索仓库' } : undefined
  return (
    <CheckRow check={check} headline={headline} action={action}>
      {detail && <p className="found__why">{detail}</p>}
      {links.length > 0 && (
        <div className="found__links">
          {links.map(l => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={e => e.stopPropagation()}
            >
              {l.text} ↗
            </a>
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
    .join('、')
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
          正在查…
        </button>
      </div>
    )
  }

  return (
    <div className="recheck">
      {deepDone(checks) ? (
        <button className="btn btn--ghost btn--sm" onClick={onRecheck}>
          重新检查 ↻
        </button>
      ) : (
        <>
          <span>{waiting ? `${waiting} 还没查，▲ 之后自动开始。` : '还有几项慢的没查。'}</span>
          <button className="btn btn--ghost btn--sm" onClick={onRecheck}>
            现在查 →
          </button>
        </>
      )}
    </div>
  )
}
