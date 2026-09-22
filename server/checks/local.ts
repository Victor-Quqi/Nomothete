/**
 * The 0 ms tier: everything answerable without leaving the machine.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb } from '../db.ts'
import { NORMALIZERS, REGISTRIES, registryForm, syllables, validateForRegistry } from './normalize.ts'
import type { Check } from './types.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const WORDS_PATH = path.resolve(here, '../../data/common-english.txt')

/** word → frequency rank (1 = most common word in the corpus). */
let ranks: Map<string, number> | null = null

function wordRanks(): Map<string, number> {
  if (!ranks) {
    ranks = new Map()
    try {
      const lines = fs.readFileSync(WORDS_PATH, 'utf8').split('\n')
      lines.forEach((w, i) => {
        const t = w.trim()
        if (t) ranks!.set(t, i + 1)
      })
    } catch {
      // Ship without it rather than fail to start; the check reports as much.
    }
  }
  return ranks
}

export function lookupWordRank(name: string): number | null {
  const r = wordRanks().get(name.toLowerCase().replace(/[^a-z]/g, ''))
  return r ?? null
}

/**
 * Prior P1, the one prior with three independent evidence lines behind it. This
 * check reports; it never rejects. A rare real word (scoria, apricity) does not
 * trip it — only frequency of everyday use does.
 */
export const dictionaryCheck: Check = {
  id: 'dictionary',
  label: '常用词',
  tier: 'local',
  when: 'always',

  async run({ name }) {
    const total = wordRanks().size
    if (total === 0) return { missing: true }
    return { rank: lookupWordRank(name), total, length: name.length, syllables: syllables(name) }
  },

  // Say where the line is, and stop. "常用词" on its own invites the reader to
  // wonder what counts; the answer is a place in a frequency list. Everything
  // after that — that a common word is hard to search for — the headline
  // already said.
  describe(data) {
    const { missing, rank, total } = data as { missing?: boolean; rank: number | null; total: number }
    if (missing) return { status: 'error', headline: '词表未载入', detail: '找不到 data/common-english.txt。' }
    if (rank === null) {
      return { status: 'clear', headline: '不是常用英语词', detail: `不在最常用的 ${total} 个英语词里。` }
    }
    return {
      status: 'caution',
      headline: rank <= 2000 ? '高频英语词' : '常见英语词',
      detail: `英语词频第 ${rank} 名（共 ${total}）。`,
    }
  },
}

/**
 * The local index. It starts empty and is fed by every registry answer the app
 * ever receives, so it gets sharper with use; a full dump can be ingested into
 * the same table. Answering from here costs nothing and needs no network.
 */
export const localIndexCheck: Check = {
  id: 'local-index',
  label: '重名',
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
      headline: `归一化后与 ${hits[0].actual} 同名`,
      detail:
        `${hits.map(h => `${h.actual}（${h.registry}）`).join('、')} 已存在；` +
        `注册表不区分连字符、下划线与大小写。`,
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
  label: '名字合法性',
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
      headline: `${failures.map(who).join('、')} 不接受`,
      detail: failures.map(f => `${who(f)}：${f.reason}`).join('；') + '。',
    }
  },
}
