/**
 * The 0 ms tier: everything answerable without leaving the machine.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb } from '../db.ts'
import { NORMALIZERS, REGISTRIES, syllables, validateForRegistry } from './normalize.ts'
import type { Check, CheckResult } from './types.ts'

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
  async run({ name }): Promise<CheckResult> {
    if (wordRanks().size === 0) {
      return {
        checkId: 'dictionary', label: '常用词', tier: 'local', status: 'error',
        headline: '词表未载入', detail: '找不到 data/common-english.txt。',
      }
    }
    const rank = lookupWordRank(name)
    const syl = syllables(name)
    const shape = `${name.length} 字符 · ${syl} 音节`

    if (rank === null) {
      return {
        checkId: 'dictionary', label: '常用词', tier: 'local', status: 'clear',
        headline: '不是常用英语词',
        detail: `在 8000 词的常用英语词频表里查无记录 —— 这正是 Prior P1 想要的形状。${shape}。`,
        data: { rank: null, length: name.length, syllables: syl },
      }
    }
    const severe = rank <= 2000
    return {
      checkId: 'dictionary', label: '常用词', tier: 'local',
      status: 'caution',
      headline: severe ? `英语常用词 #${rank}` : `英语词 #${rank}`,
      detail: severe
        ? `这是英语里第 ${rank} 常用的词。Prior P1（strong）：可搜索性抱怨在 HN 上合计 1075 条，高于 "terrible name" 的 924 条；标注集里 generic 档在被骂的名字中占 9/37、被夸的中占 0/47。用它，你就要一直和这个词的日常用法抢搜索结果。${shape}。`
        : `出现在常用词频表第 ${rank} 位，属于普通但不高频的词。撞搜索的代价比 #${rank <= 2000 ? rank : '2000'} 以内的词小得多。${shape}。`,
      data: { rank, severe, length: name.length, syllables: syl },
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
  label: '本地索引',
  tier: 'local',
  when: 'always',
  async run({ name }): Promise<CheckResult | null> {
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
    if (hits.length === 0) return null // nothing to say; stay out of the UI
    return {
      checkId: 'local-index', label: '本地索引', tier: 'local', status: 'blocked',
      headline: `归一化撞上 ${hits[0].actual}`,
      detail:
        `本地索引里已有 ${hits.map(h => `${h.actual}（${h.registry}）`).join('、')}，` +
        `归一化之后与这个名字相同。注册表比对的是归一化形式，所以精确查询返回 404 也不代表能注册成功。`,
      data: { hits },
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

/** Legality on each registry, before any network call is worth making. */
export const validityCheck: Check = {
  id: 'validity',
  label: '名字合法性',
  tier: 'local',
  when: 'always',
  async run({ name }): Promise<CheckResult | null> {
    const bad = REGISTRIES.map(r => ({ r, v: validateForRegistry(r.id, name) })).filter(x => !x.v.ok)
    if (bad.length === 0) return null
    return {
      checkId: 'validity', label: '名字合法性', tier: 'local', status: 'invalid',
      headline: `${bad.map(b => b.r.label).join('、')} 不接受`,
      detail: bad.map(b => `${b.r.label}：${(b.v as { reason: string }).reason}`).join('；') +
        '。小写化或去掉标点后通常就合法了。',
      data: { failures: bad.map(b => ({ registry: b.r.id, reason: (b.v as { reason: string }).reason })) },
    }
  },
}
