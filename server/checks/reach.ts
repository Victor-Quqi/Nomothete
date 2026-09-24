/**
 * Searchability and the rate-limited tier.
 *
 * Searchability is orthogonal to Publishability: a name can be perfectly
 * registrable and still be impossible to find. The corpus puts this at the top
 * of what developers actually complain about — 1075 hits across unsearchable /
 * hard to google / ungoogleable / impossible to google, against 924 for
 * "terrible name". So it gets its own checks rather than a footnote.
 */
import { env } from '../env.ts'
import { probe } from './http.ts'
import { npmNormalize } from './normalize.ts'
import { npmNeighbourhood } from '../../shared/npmNeighbourhood.ts'
import type { Check, CheckContext } from './types.ts'

/** How crowded the npm namespace already is around this word. Free, one call. */
export const npmNeighbourhoodCheck: Check = {
  id: 'neighbourhood',
  label: '同名邻域',
  tier: 'free',
  when: 'always',

  async run({ name, signal }: CheckContext) {
    let payload: { total?: number; objects?: { package: { name: string } }[] }
    try {
      const r = await probe(
        `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(name)}&size=20`,
        { signal },
      )
      if (r.status < 200 || r.status >= 300) return null
      payload = JSON.parse(r.body)
    } catch {
      return null
    }

    const objects = payload.objects ?? []
    const target = npmNormalize(name)
    const names = objects.map(o => o.package.name)
    return {
      total: payload.total ?? objects.length,
      names,
      nearMisses: names.filter(n => {
        const norm = npmNormalize(n)
        return norm !== target && (norm.includes(target) || target.includes(norm))
      }),
      exactNorm: names.filter(n => npmNormalize(n) === target),
    }
  },

  describe(data, name) {
    const { status, headline } = npmNeighbourhood(data, name)
    return { status, headline }
  },
}

/** How many repositories already carry this name. Rate limited; upvote first. */
export const githubCheck: Check = {
  id: 'github',
  label: 'GitHub',
  tier: 'ratelimited',
  when: 'after-upvote',

  async run({ name, signal }: CheckContext) {
    const token = env('GITHUB_TOKEN')
    try {
      const r = await probe(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(`${name} in:name`)}&per_page=5&sort=stars`,
        {
          signal,
          ttlMs: 1000 * 60 * 60 * 6,
          headers: {
            accept: 'application/vnd.github+json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
        },
      )
      if (r.status === 403 || r.status === 429) return { rateLimited: true }
      if (r.status < 200 || r.status >= 300) return null
      const payload = JSON.parse(r.body) as {
        total_count: number
        items: { full_name: string; stargazers_count: number; html_url: string; description: string | null }[]
      }
      return {
        total: payload.total_count,
        top: (payload.items ?? []).slice(0, 5).map(i => ({
          name: i.full_name,
          stars: i.stargazers_count,
          url: i.html_url,
          description: i.description,
        })),
      }
    } catch {
      return null
    }
  },

  describe(data, name) {
    const { rateLimited, total, top } = data as {
      rateLimited?: boolean
      total: number
      top?: { name: string; stars: number }[]
    }
    if (rateLimited) {
      return { status: 'error', headline: 'GitHub 限流', detail: '设置 NOMOTHETE_GITHUB_TOKEN 可提高频率上限。' }
    }
    if (total === 0) return { status: 'clear', headline: '没有同名仓库' }

    const hits = top ?? []
    const notable = hits.filter(i => i.stars >= 100)
    const exact = hits.filter(i => i.name.split('/')[1]?.toLowerCase() === name.toLowerCase())
    // Sheer volume is a Searchability signal on its own: even if every hit is
    // tiny, a thousand of them still swallow the search results.
    const crowded = total >= 400

    return {
      status: notable.length > 0 || exact.length > 0 || crowded ? 'caution' : 'clear',
      headline: `${total} 个仓库名包含这个词`,
      detail:
        (exact.length > 0 ? `${exact.map(e => e.name).join('、')} 与它完全同名。` : '') +
        (notable.length > 0
          ? `最大的是 ${notable.map(i => `${i.name}（★${i.stars.toLocaleString()}）`).join('、')}。`
          : '命中的仓库都很小。'),
    }
  },
}

/** .com, .dev and .io, via RDAP. Rate limited; upvote first. */
export const domainCheck: Check = {
  id: 'domain',
  label: '域名',
  tier: 'ratelimited',
  when: 'after-upvote',

  async run({ name, signal }: CheckContext) {
    const label = name.toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (!label || label.length < 2) return null
    const results = await Promise.all(
      ['com', 'dev', 'io'].map(async tld => {
        try {
          const r = await probe(`https://rdap.org/domain/${label}.${tld}`, {
            signal,
            ttlMs: 1000 * 60 * 60 * 24 * 3,
          })
          if (r.status === 404) return { tld, state: 'free' as const }
          if (r.status >= 200 && r.status < 300) return { tld, state: 'registered' as const }
          return { tld, state: 'unknown' as const }
        } catch {
          return { tld, state: 'unknown' as const }
        }
      }),
    )
    // Nothing answered at all: no facts, so nothing to store and nothing to say.
    return results.some(r => r.state !== 'unknown') ? { label, results } : null
  },

  describe(data) {
    const { label, results } = data as {
      label: string
      results?: { tld: string; state: 'free' | 'registered' | 'unknown' }[]
    }
    const all = results ?? []
    if (all.length === 0) return null
    const free = all.filter(r => r.state === 'free')

    // .com is the only one of the three that is actually scarce, so it decides
    // the status on its own. Reporting "clear" because .dev happened to be free
    // buried the one fact a reader wanted, and buried it under a green dot.
    const taken = all.find(r => r.tld === 'com')?.state === 'registered'

    // Say only what the headline left out. It names .com when .com is gone, and
    // names every free tld otherwise — so in the ordinary case (.com taken,
    // .dev and .io free, as they nearly always are) there is nothing left, and
    // the check hands back no sentence rather than a longer copy of its own pill.
    const unsaid = all.filter(r => r.state !== 'free' && !(taken && r.tld === 'com'))

    return {
      status: taken ? 'caution' : free.length > 0 ? 'clear' : 'caution',
      headline: taken
        ? `${label}.com 已注册`
        : free.length > 0
          ? `${free.map(f => `.${f.tld}`).join(' ')} 查无注册记录`
          : '.com .dev .io 均已注册',
      detail:
        unsaid.length > 0
          ? unsaid
              .map(r => `${label}.${r.tld}：${r.state === 'registered' ? '已注册' : '查询失败'}`)
              .join('　')
          : undefined,
    }
  },
}
