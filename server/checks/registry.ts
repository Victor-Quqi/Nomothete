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
import { tr } from '../i18n.ts'
import { collisionCandidates, registryForm, validateForRegistry, type RegistryId } from './normalize.ts'
import { rememberName } from './local.ts'
import type { Check, CheckContext } from './types.ts'

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

interface RegistryAnswer {
  id: RegistryId
  label: string
  form: string
  state: 'taken' | 'clear' | 'invalid' | 'error'
  url: string | null
}

/** Availability across the three registries, in one badge. */
export const availabilityCheck: Check = {
  id: 'availability',
  get label() { return tr('注册表', 'Registries') },
  tier: 'free',
  when: 'always',

  // Each registry is asked about the string it would be given, which on npm is
  // the lowercase one. Asking about `Agemux` there answers nothing: npm has no
  // such package and never will, because npm has no uppercase packages.
  async run({ name, signal }: CheckContext) {
    const registries = await Promise.all(
      SPECS.map(async (spec): Promise<RegistryAnswer> => {
        const base = { id: spec.id, label: spec.label, form: registryForm(spec.id, name) }
        if (!validateForRegistry(spec.id, base.form).ok) return { ...base, state: 'invalid', url: null }
        const e = await exists(spec, base.form, signal)
        if (e === null) return { ...base, state: 'error', url: null }
        if (e) {
          rememberName(spec.id, base.form.toLowerCase())
          return { ...base, state: 'taken', url: spec.page(base.form) }
        }
        return { ...base, state: 'clear', url: null }
      }),
    )
    return { registries }
  },

  describe(data, name) {
    const stored = (data as { registries?: Partial<RegistryAnswer>[] }).registries ?? []
    if (stored.length === 0) return null
    // `form` was added to the row shape after most of these were written, and
    // it is a pure function of the name and the registry, so recompute it
    // rather than making every line below defend against its absence.
    const all = stored.map(r => ({
      ...r,
      form: r.form ?? (r.id ? registryForm(r.id, name) : name),
    })) as RegistryAnswer[]
    const taken = all.filter(r => r.state === 'taken')
    const clear = all.filter(r => r.state === 'clear')
    const failed = all.filter(r => r.state === 'error')

    const headline =
      taken.length > 0
        ? tr(
            `${taken.map(t => t.label).join('、')} 已有同名`,
            `${taken.map(t => t.label).join(', ')}: name taken`,
          )
        : failed.length === all.length
          ? tr('注册表未答复', 'Registries did not reply')
          : tr(
              `${clear.map(c => c.label).join('、')} 查无记录`,
              `${clear.map(c => c.label).join(', ')}: no record`,
            )

    // Case alone is not a different string worth reporting: every name here has
    // a capital and npm's id for it is simply the lowercase one, so `（作 …）`
    // keyed on exact equality printed a row on literally every candidate.
    const restated = (r: RegistryAnswer) => r.form.toLowerCase() !== name.toLowerCase()

    // The headline already names some of the three. The breakdown says the rest
    // — plus any registry that was asked about a different string than the one
    // on the card, which the headline has no room for and the reader needs.
    const named = new Set(
      (taken.length > 0 ? taken : failed.length === all.length ? all : clear).map(r => r.id),
    )
    const unsaid = all.filter(r => !named.has(r.id) || restated(r))
    const details = unsaid.map(r => {
      const as = restated(r) ? `（作 ${r.form}）` : ''
      const asEn = restated(r) ? ` (as ${r.form})` : ''
      switch (r.state) {
        case 'taken': return { zh: `${r.label}${as}：已有同名`, en: `${r.label}${asEn}: name taken` }
        case 'clear': return { zh: `${r.label}${as}：查无记录`, en: `${r.label}${asEn}: no record` }
        case 'invalid': return { zh: `${r.label}：名字不合法`, en: `${r.label}: invalid name` }
        default: return { zh: `${r.label}：查询失败`, en: `${r.label}: check failed` }
      }
    })

    return {
      status: taken.length > 0 ? 'taken' : clear.length > 0 ? 'clear' : 'error',
      headline,
      detail:
        details.length > 0
          ? tr(details.map(d => d.zh).join('　'), details.map(d => d.en).join(' '))
          : undefined,
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
  get label() { return tr('可注册性', 'Lookalikes') },
  tier: 'ratelimited',
  when: 'after-upvote',

  async run({ name, signal }: CheckContext) {
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
        return { id: spec.id, label: spec.label, probed: legal.length, collisions }
      }),
    )
    return { probed: perRegistry.reduce((n, r) => n + r.probed, 0), perRegistry }
  },

  describe(data) {
    const { perRegistry } = data as {
      perRegistry: { id: RegistryId; label?: string; probed: number; collisions: string[] }[]
    }
    if (!perRegistry?.length) return null
    const who = (r: { id: RegistryId; label?: string }) =>
      r.label ?? SPECS.find(s => s.id === r.id)?.label ?? r.id
    const blocked = perRegistry.filter(r => r.collisions.length > 0)
    const probedTotal = perRegistry.reduce((n, r) => n + r.probed, 0)

    if (blocked.length === 0) {
      return {
        status: 'clear',
        // 另外: collisionCandidates never returns the name itself, so this
        // check is only ever about the other writings. Without that word a name
        // whose exact form is taken shows 「已有同名」 and 「N 种写法均查无记录」
        // side by side and reads as a contradiction.
        headline: tr(
          `另外 ${probedTotal} 种写法也查无记录`,
          `${probedTotal} other spellings: no record either`,
        ),
        // What "写法" means, in the two examples that make it obvious. The
        // headline cannot carry it, and without it the pill is a number about
        // nothing.
        detail: tr(
          'npm 把 react-native 和 reactnative、PyPI 把 lion 和 l10n 当成同一个名字。',
          'npm treats react-native and reactnative, and PyPI treats lion and l10n, as the same name.',
        ),
      }
    }

    const details = blocked.map(b => ({
      zh: `${who(b)} 上已存在 ${b.collisions.slice(0, 4).join('、')}，注册表视为同一个名字。`,
      en: `${who(b)}: ${b.collisions.slice(0, 4).join(', ')} already exist and map to the same name.`,
    }))
    return {
      status: 'blocked',
      headline: tr(`${who(blocked[0])} 上无法注册`, `Blocked on ${who(blocked[0])}`),
      detail: tr(details.map(d => d.zh).join(''), details.map(d => d.en).join(' ')),
    }
  },
}
