/**
 * Registry checks.
 *
 * Two tiers, deliberately separated, because they answer two different
 * questions (CONTEXT.md):
 *
 *   Availability   — is there a record under this exact name? One cheap GET per
 *                    registry, run for every Candidate.
 *   Publishability — would the registry actually accept it? Requires asking
 *                    about the normalised neighbourhood, which costs many
 *                    requests, so it waits for a positive Verdict.
 */
import { probe, probeAll } from './http.ts'
import { collisionCandidates, registryForm, validateForRegistry, type RegistryId } from './normalize.ts'
import { rememberName } from './local.ts'
import type { Check, CheckContext, CheckResult } from './types.ts'

interface RegistrySpec {
  id: RegistryId
  label: string
  url: (name: string) => string
  page: (name: string) => string
}

const SPECS: RegistrySpec[] = [
  {
    id: 'npm',
    label: 'npm',
    url: n => `https://registry.npmjs.org/${encodeURIComponent(n.toLowerCase())}`,
    page: n => `https://www.npmjs.com/package/${encodeURIComponent(n.toLowerCase())}`,
  },
  {
    id: 'pypi',
    label: 'PyPI',
    url: n => `https://pypi.org/pypi/${encodeURIComponent(n)}/json`,
    page: n => `https://pypi.org/project/${encodeURIComponent(n)}/`,
  },
  {
    id: 'crates',
    label: 'crates.io',
    url: n => `https://crates.io/api/v1/crates/${encodeURIComponent(n.toLowerCase())}`,
    page: n => `https://crates.io/crates/${encodeURIComponent(n.toLowerCase())}`,
  },
]

async function exists(spec: RegistrySpec, name: string, signal: AbortSignal): Promise<boolean | null> {
  try {
    const r = await probe(spec.url(name), { signal, method: 'GET' })
    if (r.status === 404) return false
    if (r.status >= 200 && r.status < 300) {
      // crates.io answers 200 with an error envelope for unknown crates.
      if (spec.id === 'crates' && r.body.includes('"errors"')) return false
      return true
    }
    return null
  } catch {
    return null
  }
}

/** Availability across the three registries, in one badge. */
export const availabilityCheck: Check = {
  id: 'availability',
  label: '注册表',
  tier: 'free',
  when: 'always',
  async run({ name, signal }: CheckContext): Promise<CheckResult> {
    // Each registry is asked about the string it would be given, which on npm is
    // the lowercase one. Asking about `Agemux` there answers nothing: npm has no
    // such package and never will, because npm has no uppercase packages.
    const results = await Promise.all(
      SPECS.map(async spec => {
        const form = registryForm(spec.id, name)
        if (!validateForRegistry(spec.id, form).ok) return { spec, form, state: 'invalid' as const }
        const e = await exists(spec, form, signal)
        if (e === null) return { spec, form, state: 'error' as const }
        if (e) {
          rememberName(spec.id, form.toLowerCase())
          return { spec, form, state: 'taken' as const }
        }
        return { spec, form, state: 'clear' as const }
      }),
    )

    const taken = results.filter(r => r.state === 'taken')
    const clear = results.filter(r => r.state === 'clear')
    const failed = results.filter(r => r.state === 'error')

    const status = taken.length > 0 ? 'taken' : clear.length > 0 ? 'clear' : 'error'
    const headline =
      taken.length > 0
        ? `${taken.map(t => t.spec.label).join('、')} 已有同名`
        : failed.length === SPECS.length
          ? '注册表未答复'
          : `${clear.map(c => c.spec.label).join('、')} 查无记录`

    return {
      checkId: 'availability',
      label: '注册表',
      tier: 'free',
      status,
      headline,
      // Just the per-registry breakdown. That a ▲ buys a deeper search is one
      // fact with one home, and the drawer is it — repeating it on every card
      // also means repeating it long after the deeper search has already run.
      detail:
        results
          .map(r => {
            // Say which string was asked about when it is not the one on the card.
            const as = r.form === name ? '' : `（作 ${r.form}）`
            switch (r.state) {
              case 'taken': return `${r.spec.label}${as}：已有同名`
              case 'clear': return `${r.spec.label}${as}：查无记录`
              case 'invalid': return `${r.spec.label}：名字不合法`
              default: return `${r.spec.label}：查询失败`
            }
          })
          .join('　') + '。这是按原样搜的。',
      data: {
        registries: results.map(r => ({
          id: r.spec.id,
          label: r.spec.label,
          form: r.form,
          state: r.state,
          url: r.state === 'taken' ? r.spec.page(r.form) : null,
        })),
      },
    }
  },
}

/**
 * Publishability. Enumerate the strings that normalise to the same form as this
 * name and ask the registry about each one. `reactnative` is refused because
 * `react-native` exists; `l10n` is refused because `lion` does. Nothing but
 * this enumeration will surface either.
 *
 * Bounded on purpose: a full local dump answers this in 0 ms and is the real
 * destination (see scripts/build-index.ts). The probe is what works on first
 * run, on a laptop, with no 50 MB download.
 */
export const publishabilityCheck: Check = {
  id: 'publishability',
  label: '可注册性',
  tier: 'ratelimited',
  when: 'after-upvote',
  async run({ name, signal }: CheckContext): Promise<CheckResult> {
    const perRegistry = await Promise.all(
      SPECS.map(async spec => {
        const variants = collisionCandidates(spec.id, name, spec.id === 'pypi' ? 40 : 28)
        const legal = variants.filter(v => validateForRegistry(spec.id, v).ok)
        const probes = await probeAll(legal.map(v => spec.url(v)), { signal })
        const collisions: string[] = []
        probes.forEach((p, i) => {
          if (!p) return
          if (p.status >= 200 && p.status < 300) {
            if (spec.id === 'crates' && p.body.includes('"errors"')) return
            collisions.push(legal[i])
            rememberName(spec.id, legal[i])
          }
        })
        return { spec, probed: legal.length, collisions }
      }),
    )

    const blocked = perRegistry.filter(r => r.collisions.length > 0)
    const probedTotal = perRegistry.reduce((n, r) => n + r.probed, 0)

    if (blocked.length === 0) {
      return {
        checkId: 'publishability', label: '可注册性', tier: 'ratelimited', status: 'clear',
        headline: '三个注册表均查无记录',
        detail:
          `「${name}」的 ${probedTotal} 种归一化等价写法逐个查询，均无记录。这是最强的一项检查。`,
        data: { probed: probedTotal, perRegistry: perRegistry.map(r => ({ id: r.spec.id, probed: r.probed, collisions: r.collisions })) },
      }
    }

    return {
      checkId: 'publishability', label: '可注册性', tier: 'ratelimited', status: 'blocked',
      headline: `${blocked[0].spec.label} 上无法注册`,
      detail: blocked
        .map(b => `${b.spec.label}：已存在 ${b.collisions.slice(0, 4).join('、')}，归一化后视作同一名字。`)
        .join(''),
      data: { probed: probedTotal, perRegistry: perRegistry.map(r => ({ id: r.spec.id, probed: r.probed, collisions: r.collisions })) },
    }
  },
}
