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
import type { Check, CheckContext, CheckResult } from './types.ts'

/** How crowded the npm namespace already is around this word. Free, one call. */
export const npmNeighbourhoodCheck: Check = {
  id: 'neighbourhood',
  label: '有多挤',
  tier: 'free',
  when: 'always',
  async run({ name, signal }: CheckContext): Promise<CheckResult | null> {
    let payload: { total?: number; objects?: { package: { name: string; description?: string } }[] }
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
    const nearMisses = objects
      .map(o => o.package.name)
      .filter(n => {
        const norm = npmNormalize(n)
        return norm !== target && (norm.includes(target) || target.includes(norm))
      })
    const exactNorm = objects.map(o => o.package.name).filter(n => npmNormalize(n) === target)

    const total = payload.total ?? objects.length
    if (exactNorm.length === 0 && nearMisses.length === 0 && total < 30) {
      return {
        checkId: 'neighbourhood', label: '有多挤', tier: 'free', status: 'clear',
        headline: `npm 上 ${total} 个相关结果`,
        detail: `在 npm 上搜「${name}」只有 ${total} 个结果，没有一个和它重名或长得像。这一片基本是空的。`,
        data: { total, nearMisses, exactNorm },
      }
    }

    const crowded = total >= 200 || nearMisses.length >= 6
    return {
      checkId: 'neighbourhood', label: '有多挤', tier: 'free',
      status: crowded || exactNorm.length > 0 ? 'caution' : 'clear',
      // Always phrase this one as crowding. The exact collision is the
      // availability check's sentence to say; repeating it here would put two
      // seals with the same message side by side.
      headline: `npm 上 ${total} 个相关结果`,
      detail:
        (exactNorm.length > 0 ? `npm 上已经有 ${exactNorm.join('、')}。` : '') +
        (nearMisses.length > 0
          ? `还有长得很像的 ${nearMisses.slice(0, 6).join('、')}${nearMisses.length > 6 ? ' 等' : ''}。`
          : '') +
        `这不拦着你用 —— 只是以后别人搜的时候，你要和这 ${total} 个结果挤在一起。`,
      data: { total, nearMisses, exactNorm },
    }
  },
}

/** How many repositories already carry this name. Rate limited; upvote first. */
export const githubCheck: Check = {
  id: 'github',
  label: 'GitHub',
  tier: 'ratelimited',
  when: 'after-upvote',
  async run({ name, signal }: CheckContext): Promise<CheckResult | null> {
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
      if (r.status === 403 || r.status === 429) {
        return {
          checkId: 'github', label: 'GitHub', tier: 'ratelimited', status: 'error',
          headline: '被 GitHub 限流了',
          detail: '过一会儿再试。配一个 NOMOTHETE_GITHUB_TOKEN 可以查得更频繁。',
        }
      }
      if (r.status < 200 || r.status >= 300) return null
      const payload = JSON.parse(r.body) as {
        total_count: number
        items: { full_name: string; stargazers_count: number; html_url: string; description: string | null }[]
      }
      const top = (payload.items ?? []).slice(0, 5)
      const notable = top.filter(i => i.stargazers_count >= 100)
      const exact = top.filter(i => i.full_name.split('/')[1]?.toLowerCase() === name.toLowerCase())

      if (payload.total_count === 0) {
        return {
          checkId: 'github', label: 'GitHub', tier: 'ratelimited', status: 'clear',
          headline: '没有同名仓库',
          detail: `GitHub 上没有仓库名里含有「${name}」。`,
          data: { total: 0, top: [] },
        }
      }
      // Sheer volume is a Searchability signal on its own: even if every hit is
      // tiny, a thousand of them still swallow the search results.
      const crowded = payload.total_count >= 400
      return {
        checkId: 'github', label: 'GitHub', tier: 'ratelimited',
        status: notable.length > 0 || exact.length > 0 || crowded ? 'caution' : 'clear',
        headline: `${payload.total_count} 个仓库带这个词`,
        detail:
          (exact.length > 0 ? `其中 ${exact.map(e => e.full_name).join('、')} 与它完全同名。` : '') +
          (notable.length > 0
            ? `最显眼的是 ${notable.map(i => `${i.full_name}（★${i.stargazers_count.toLocaleString()}）`).join('、')}。`
            : '命中的仓库都很小' + (crowded ? '，但数量摆在这里。' : '。')) +
          '星数高的同名项目会长期占住搜索结果。',
        data: {
          total: payload.total_count,
          top: top.map(i => ({ name: i.full_name, stars: i.stargazers_count, url: i.html_url, description: i.description })),
        },
      }
    } catch {
      return null
    }
  },
}

/** .com and .dev, via RDAP. Rate limited; upvote first. */
export const domainCheck: Check = {
  id: 'domain',
  label: '域名',
  tier: 'ratelimited',
  when: 'after-upvote',
  async run({ name, signal }: CheckContext): Promise<CheckResult | null> {
    const label = name.toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (!label || label.length < 2) return null
    const tlds = ['com', 'dev', 'io']
    const results = await Promise.all(
      tlds.map(async tld => {
        try {
          const r = await probe(`https://rdap.org/domain/${label}.${tld}`, { signal, ttlMs: 1000 * 60 * 60 * 24 * 3 })
          if (r.status === 404) return { tld, state: 'free' as const }
          if (r.status >= 200 && r.status < 300) return { tld, state: 'registered' as const }
          return { tld, state: 'unknown' as const }
        } catch {
          return { tld, state: 'unknown' as const }
        }
      }),
    )
    const free = results.filter(r => r.state === 'free')
    const known = results.filter(r => r.state !== 'unknown')
    if (known.length === 0) return null
    return {
      checkId: 'domain', label: '域名', tier: 'ratelimited',
      status: free.length > 0 ? 'clear' : 'caution',
      headline: free.length > 0 ? `${free.map(f => `.${f.tld}`).join(' ')} 还没被注册` : '.com .dev .io 都被注册了',
      detail:
        results
          .map(r => `${label}.${r.tld}：${r.state === 'free' ? '没查到' : r.state === 'registered' ? '已注册' : '没查成'}`)
          .join('　') + '。只查了域名有没有被注册，没查商标。',
      data: { label, results },
    }
  },
}
