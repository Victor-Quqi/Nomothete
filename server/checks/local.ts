/**
 * The 0 ms tier: everything answerable without leaving the machine.
 */
import { getDb } from '../db.ts'
import { tr } from '../i18n.ts'
import { NORMALIZERS, REGISTRIES, registryForm, validateForRegistry } from './normalize.ts'
import type { Check } from './types.ts'

/**
 * The local index. It starts empty and is fed by every registry answer the app
 * ever receives, so it gets sharper with use; a full dump can be ingested into
 * the same table. Answering from here costs nothing and needs no network.
 */
export const localIndexCheck: Check = {
  id: 'local-index',
  get label() { return tr('重名', 'Seen before') },
  tier: 'local',
  when: 'always',

  async run({ name }) {
    const db = getDb()
    const hits: { registry: string; actual: string }[] = []
    for (const { id } of REGISTRIES) {
      const norm = NORMALIZERS[id](name)
      const rows = db
        .prepare('SELECT actual FROM name_index WHERE registry = ? AND normalized = ? LIMIT 5')
        .all(id, norm) as { actual: string }[]
      for (const r of rows) {
        if (r.actual.toLowerCase() !== name.toLowerCase()) hits.push({ registry: id, actual: r.actual })
      }
    }
    return hits.length > 0 ? { hits } : null // nothing to say; stay out of the UI
  },

  describe(data) {
    const { hits } = data as { hits: { registry: string; actual: string }[] }
    if (!hits?.length) return null
    return {
      status: 'blocked',
      headline: tr(`按注册表规则与 ${hits[0].actual} 同名`, `Same name as ${hits[0].actual} after registry rules`),
      detail:
        tr(
          `${hits.map(h => `${h.actual}（${h.registry}）`).join('、')} 已存在；注册表不区分连字符、下划线与大小写。`,
          `${hits.map(h => `${h.actual} (${h.registry})`).join(', ')} already exist; registries ignore hyphens, underscores, and case.`,
        ),
    }
  },
}

/** Feed an answer back into the local index. */
export function rememberName(registry: string, actual: string) {
  const norm = NORMALIZERS[registry as keyof typeof NORMALIZERS]?.(actual)
  if (!norm) return
  getDb()
    .prepare('INSERT OR IGNORE INTO name_index (registry, normalized, actual) VALUES (?, ?, ?)')
    .run(registry, norm, actual)
}

/**
 * Legality on each registry, before any network call is worth making.
 *
 * Judged on the form each registry would receive, not on the name as displayed:
 * every name here has a capital, and npm's id for it is simply the lowercase
 * one. A capital is a fact about how the name is written, not a defect.
 */
export const validityCheck: Check = {
  id: 'validity',
  get label() { return tr('名字合法性', 'Valid name') },
  tier: 'local',
  when: 'always',

  async run({ name }) {
    const bad = REGISTRIES.map(r => {
      const form = registryForm(r.id, name)
      return { r, form, v: validateForRegistry(r.id, form) }
    }).filter(x => !x.v.ok)
    if (bad.length === 0) return null
    return {
      failures: bad.map(b => ({
        registry: b.r.id,
        label: b.r.label,
        form: b.form,
        reason: (b.v as { reason: string }).reason,
      })),
    }
  },

  describe(data) {
    const { failures } = data as { failures: { registry: string; label?: string; reason: string }[] }
    if (!failures?.length) return null
    // `label` was added after some rows were written; fall back to the id.
    const who = (f: { registry: string; label?: string }) =>
      f.label ?? REGISTRIES.find(r => r.id === f.registry)?.label ?? f.registry
    return {
      status: 'invalid',
      headline: tr(`${failures.map(who).join('、')} 不接受`, `${failures.map(who).join(', ')}: rejected`),
      detail: tr(
        failures.map(f => `${who(f)}：${f.reason}`).join('；') + '。',
        failures.map(f => `${who(f)}: ${f.reason}`).join('; ') + '.',
      ),
    }
  },
}
