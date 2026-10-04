import { useId, useState, type ReactNode } from 'react'
import { browserQuery, browserSearchUrl, searchUrl, sourceHost } from '../verify.ts'
import { tr } from '../i18n.ts'
import type { Candidate, ClaimFinding } from '../types.ts'

function SearchLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {tr('浏览器搜索 ↗', 'Search in browser ↗')}
    </a>
  )
}

function SourceLink({ url, title }: { url: string; title: string }) {
  return (
    <a className="verify__src" href={url} target="_blank" rel="noreferrer noopener" title={title || url}>
      {sourceHost(url)} ↗
    </a>
  )
}

/** A line of quiet parts, dot-separated, with the search link last. */
function Meta({ parts, search }: { parts: string[]; search?: string }) {
  if (!parts.length && !search) return null
  return (
    <p className="verify__meta">
      {parts.join(' · ')}
      {parts.length > 0 && search && ' · '}
      {search && <SearchLink href={search} />}
    </p>
  )
}

/** Quoted excerpts, each with its source link. One page can supply several excerpts, so the URL alone is not a key. */
function Citations({ sources, against }: { sources: ClaimFinding['sources']; against?: boolean }) {
  return (
    <>
      {sources.map((s, j) => (
        <figure className={against ? 'verify__cite verify__cite--against' : 'verify__cite'} key={`${j}:${s.url}`}>
          <blockquote>{s.excerpt}</blockquote>
          <figcaption>
            <SourceLink url={s.url} title={s.title} />
          </figcaption>
        </figure>
      ))}
    </>
  )
}

/** A claim the evidence disagrees with: what the rationale says, what the source says, and the source. */
function Discrepancy({ claim }: { claim: ClaimFinding }) {
  return (
    <div className="verify__item">
      <p className="verify__claim">
        <b>{tr('说法', 'Claim')}</b>
        {claim.text}
      </p>
      {claim.note && (
        <p className="verify__note">
          <b>{tr('资料', 'Source')}</b>
          {claim.note}
        </p>
      )}
      <Citations sources={claim.sources} against />
    </div>
  )
}

/**
 * A short toggle with its useful action beside it, so the collapsed state is
 * something to act on rather than a sentence about an absence. Starts closed;
 * the panel keys on the candidate, so opening one name never opens the next.
 */
function Disclosure({ label, aside, children, compact = false }: { label: ReactNode; aside?: ReactNode; children: ReactNode; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className={`verify__fold${compact ? ' verify__fold--compact' : ''}`}>
      <p className="verify__line">
        <button type="button" className="verify__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
          {label}
        </button>
        {aside}
      </p>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  )
}

/**
 * What web sources say about the rationale's factual claims.
 *
 * A discrepancy is the one thing worth reading unprompted, so it is printed in
 * full with its evidence. Claims still to be checked get one line with a
 * search link, and each expands to what is still unestablished and whatever
 * excerpts were found for it. Supporting sources stay collapsed until opened.
 * Nothing here speaks to whether the name is good
 * or taken; that is the registry section below, kept apart on purpose.
 */
export function RationaleCheck({ candidate, autoVerify }: { candidate: Candidate; autoVerify: boolean }) {
  const v = candidate.verification
  if (!v && autoVerify) return null

  const fallback = browserSearchUrl(candidate.name)
  const claims = v?.state === 'done' ? v.claims : []
  const against = claims.filter(c => c.verdict === 'contradicted')
  const backed = claims.filter(c => c.verdict === 'supported')
  const open = claims.filter(c => c.verdict === 'insufficient' || c.verdict === 'failed')

  const status =
    v?.state === 'pending'
      ? tr('正在联网查找资料…', 'Searching sources…')
      : v?.state === 'failed'
        ? tr('未能核查', 'Unable to check')
        : v?.state === 'done' && claims.length === 0
          ? tr('没有可查证的来源说法', 'No source claims to check')
          : against.length
            ? tr(`${against.length} 处与资料不符`, `${against.length} mismatch${against.length === 1 ? '' : 'es'} with sources`)
            : null

  // Reasons can be long model prose, so they stay in the expanded claims. The
  // collapsed line only counts how many of the open claims could not be checked.
  const failedCount = open.filter(c => c.verdict === 'failed').length
  const openSearch = open.length === 1 ? browserSearchUrl(candidate.name, open[0]) : fallback
  const sourceCount = new Set(backed.flatMap(c => c.sources.map(s => s.url))).size
  const sources = backed.map((claim, i) => (
    <div className="verify__item" key={i}>
      <p className="verify__claim">{claim.text}</p>
      <Citations sources={claim.sources} />
    </div>
  ))

  if (sourceCount > 0 && !status && open.length === 0) {
    return (
      <section className="verify">
        <Disclosure compact label={<><span>{tr('取义核查', 'Source check')}</span><span className="verify__source-count">· {sourceCount} {tr('个来源', sourceCount === 1 ? 'source' : 'sources')}</span></>}>
          {!autoVerify && <Meta parts={[tr('自动联网核查已关闭，下面是之前的结果', 'Automatic source checks are off; showing the previous result.')]} search={fallback} />}
          {sources}
        </Disclosure>
      </section>
    )
  }

  return (
    <section className="verify" aria-busy={v?.state === 'pending'}>
      <div className="section-h">
        {tr('取义核查', 'Source check')}
        {status && <span className={against.length ? 'verify__status verify__status--against' : 'verify__status'}>{status}</span>}
      </div>

      {!autoVerify && (
        <Meta
          parts={[v && v.state !== 'pending' ? tr('自动联网核查已关闭，下面是之前的结果', 'Automatic source checks are off; showing the previous result.') : tr('自动联网核查已关闭', 'Automatic source checks are off.')]}
          // The 待查证 line below carries its own search link.
          search={open.length ? undefined : fallback}
        />
      )}

      {v?.state === 'failed' && <Meta parts={[v.reason]} search={autoVerify ? fallback : undefined} />}

      {against.map((claim, i) => (
        <Discrepancy key={i} claim={claim} />
      ))}

      {open.length > 0 && (
        <Disclosure
          label={tr(`待查证 ${open.length}`, `Unconfirmed ${open.length}`)}
          aside={
            <>
              {failedCount > 0 && <span>{failedCount === open.length ? tr('未能核查', 'Unable to check') : tr(`${failedCount} 项未能核查`, `${failedCount} item${failedCount === 1 ? '' : 's'} could not be checked`)}</span>}
              <span>
                <SearchLink href={openSearch} />
              </span>
            </>
          }
        >
          {open.map((claim, i) => {
            const query = browserQuery(candidate.name, claim)
            return (
              <div className="verify__item" key={i}>
                <p className="verify__claim">{claim.text}</p>
                {/* The reason says what is still unestablished; an open claim is not a false one. */}
                <p className="verify__note">
                  <b>{claim.verdict === 'failed' ? tr('未能核查', 'Unable to check') : tr('未找到足够依据', 'Insufficient evidence')}</b>
                  {claim.reason}
                </p>
                {/* What was found for part of the claim, e.g. one meaning confirmed while another is not. */}
                <Citations sources={claim.sources} />
                <p className="verify__line verify__line--item">
                  <span>
                    <a href={searchUrl(query)} target="_blank" rel="noreferrer noopener">
                      {query} ↗
                    </a>
                  </span>
                </p>
              </div>
            )
          })}
        </Disclosure>
      )}

      {sourceCount > 0 && (
        <Disclosure label={tr(`查看来源 ${sourceCount}`, `View ${sourceCount} source${sourceCount === 1 ? '' : 's'}`)}>
          {sources}
        </Disclosure>
      )}
    </section>
  )
}
