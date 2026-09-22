/**
 * Taste Profile — what the system infers about this user from their Verdicts.
 *
 * Contract from CONTEXT.md: inferred from behaviour, belongs to this session
 * only, not displayed unless asked for. It is a description of what the user
 * did, never a judgement about names. Every trait below is phrased as a fact
 * about their clicks, because that is all it is.
 *
 * It does two jobs: it weights which Strategy runs next, and it becomes a
 * paragraph in the next prompt.
 */
import { syllables } from '../checks/normalize.ts'
import type { Candidate, Seed, Verdict } from '../store.ts'
import { FAMILY_BY_ID, STRATEGIES, STRATEGY_BY_ID, type FamilyId } from './strategies.ts'

export interface Trait {
  id: string
  /** Stated as an observation of behaviour, with its own sample size. */
  statement: string
  /** How many Verdicts it rests on. Shown next to it, always. */
  n: number
  direction: 'toward' | 'away'
}

export interface TasteProfile {
  observations: number
  positives: number
  negatives: number
  strategyScores: { id: string; label: string; family: FamilyId; score: number; n: number }[]
  familyScores: { id: FamilyId; label: string; score: number; n: number }[]
  traits: Trait[]
  loved: { name: string; strategy: string; note?: string }[]
  rejected: { name: string; strategy: string; note?: string }[]
  /** Prose, for the drawer and for the prompt. */
  statement: string
}

const WEIGHT: Record<Verdict, number> = { [-2]: -2, [-1]: -1, 0: 0, 1: 1.4, 2: 2.6 } as Record<Verdict, number>

interface Rated {
  name: string
  verdict: Verdict
  strategyId: string
  note?: string | null
}

export function buildProfile(candidates: Candidate[], seeds: Seed[] = []): TasteProfile {
  const rated: Rated[] = [
    ...candidates
      .filter(c => c.verdict !== 0)
      .map(c => ({ name: c.name, verdict: c.verdict, strategyId: c.strategyId, note: c.note })),
    ...seeds
      .filter(s => s.verdict !== 0)
      .map(s => ({ name: s.text, verdict: s.verdict, strategyId: 'seed', note: s.note })),
  ]

  const positives = rated.filter(r => r.verdict > 0)
  const negatives = rated.filter(r => r.verdict < 0)

  // ── strategy and family affinity ──────────────────────────────────────────
  const sAcc = new Map<string, { sum: number; n: number }>()
  const fAcc = new Map<FamilyId, { sum: number; n: number }>()
  for (const r of rated) {
    if (r.strategyId === 'seed') continue
    const w = WEIGHT[r.verdict]
    const s = sAcc.get(r.strategyId) ?? { sum: 0, n: 0 }
    s.sum += w
    s.n += 1
    sAcc.set(r.strategyId, s)
    const fam = STRATEGY_BY_ID.get(r.strategyId)?.family
    if (fam) {
      const f = fAcc.get(fam) ?? { sum: 0, n: 0 }
      f.sum += w
      f.n += 1
      fAcc.set(fam, f)
    }
  }

  const strategyScores = STRATEGIES.map(s => {
    const a = sAcc.get(s.id)
    return {
      id: s.id,
      label: s.label,
      family: s.family,
      // Shrunk toward zero so one click never dominates.
      score: a ? a.sum / (a.n + 1.5) : 0,
      n: a?.n ?? 0,
    }
  }).filter(s => s.n > 0)

  const familyScores = [...fAcc.entries()].map(([id, a]) => ({
    id,
    label: FAMILY_BY_ID.get(id)?.label ?? id,
    score: a.sum / (a.n + 1.5),
    n: a.n,
  }))

  // ── morphological traits, always with n attached ──────────────────────────
  const traits: Trait[] = []
  const posNames = positives.map(p => p.name)
  const negNames = negatives.map(p => p.name)

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

  if (posNames.length >= 3) {
    const pSyl = mean(posNames.map(syllables))
    const nSyl = negNames.length >= 2 ? mean(negNames.map(syllables)) : null
    if (nSyl !== null && Math.abs(pSyl - nSyl) >= 0.6) {
      traits.push({
        id: 'syllables',
        n: posNames.length + negNames.length,
        direction: pSyl < nSyl ? 'toward' : 'away',
        statement:
          pSyl < nSyl
            ? `你在往更短的名字走：喜欢的平均 ${pSyl.toFixed(1)} 音节，不喜欢的 ${nSyl.toFixed(1)} 音节。`
            : `你不怕长词：喜欢的平均 ${pSyl.toFixed(1)} 音节，不喜欢的 ${nSyl.toFixed(1)} 音节。`,
      })
    }

    const plosive = (n: string) => /^[ptkbdg]/i.test(n)
    const pPlos = posNames.filter(plosive).length
    if (posNames.length >= 5 && pPlos / posNames.length >= 0.6) {
      traits.push({
        id: 'plosive',
        n: posNames.length,
        direction: 'toward',
        statement: `你喜欢的 ${posNames.length} 个名字里有 ${pPlos} 个以爆破音开头（p t k b d g）。`,
      })
    }

    const pLen = mean(posNames.map(n => n.length))
    traits.push({
      id: 'length',
      n: posNames.length,
      direction: 'toward',
      statement: `你喜欢的名字平均 ${pLen.toFixed(1)} 个字符。`,
    })
  }

  const topFam = [...familyScores].sort((a, b) => b.score - a.score)[0]
  const botFam = [...familyScores].sort((a, b) => a.score - b.score)[0]
  if (topFam && topFam.n >= 2 && topFam.score > 0.4) {
    traits.push({
      id: `family-${topFam.id}`,
      n: topFam.n,
      direction: 'toward',
      statement: `「${topFam.label}」这个方向你偏正面，后面会多出一些。`,
    })
  }
  if (botFam && botFam.n >= 2 && botFam.score < -0.4 && botFam.id !== topFam?.id) {
    traits.push({
      id: `family-neg-${botFam.id}`,
      n: botFam.n,
      direction: 'away',
      statement: `「${botFam.label}」这个方向你偏负面，后面会少出一些，但不会完全不出。`,
    })
  }

  const statement = composeStatement({ positives, negatives })

  return {
    observations: rated.length,
    positives: positives.length,
    negatives: negatives.length,
    strategyScores: strategyScores.sort((a, b) => b.score - a.score),
    familyScores: familyScores.sort((a, b) => b.score - a.score),
    traits,
    loved: positives.map(p => ({
      name: p.name,
      strategy: STRATEGY_BY_ID.get(p.strategyId)?.label ?? '你自己给的种子',
      note: p.note ?? undefined,
    })),
    rejected: negatives.map(p => ({
      name: p.name,
      strategy: STRATEGY_BY_ID.get(p.strategyId)?.label ?? '你自己给的种子',
      note: p.note ?? undefined,
    })),
    statement,
  }
}

/**
 * The lead sentence of the drawer — and only that.
 *
 * It used to restate every trait, every liked name and every note, which the
 * panel then rendered again as rows and bars directly underneath. One paragraph
 * of framing, and the structured parts speak for themselves.
 */
function composeStatement(x: { positives: Rated[]; negatives: Rated[] }): string {
  if (x.positives.length === 0 && x.negatives.length === 0) return ''
  return `来自你的 ${x.positives.length} 个喜欢、${x.negatives.length} 个不喜欢。`
}

/**
 * The paragraph handed to the model. English, because the rest of the prompt is
 * — the user's own words are passed through verbatim.
 */
export function profileForPrompt(p: TasteProfile): string {
  if (p.observations === 0) return ''
  const lines: string[] = []
  if (p.loved.length) {
    lines.push(
      `Names this user rated positively: ${p.loved.map(l => (l.note ? `${l.name} ("${l.note}")` : l.name)).join(', ')}.`,
    )
  }
  if (p.rejected.length) {
    lines.push(
      `Names this user rated negatively: ${p.rejected.map(l => (l.note ? `${l.name} ("${l.note}")` : l.name)).join(', ')}.`,
    )
  }
  const strong = p.strategyScores.filter(s => s.score > 0.5).slice(0, 3)
  if (strong.length) lines.push(`Approaches that landed well: ${strong.map(s => s.label).join(', ')}.`)
  const weak = p.strategyScores.filter(s => s.score < -0.5).slice(0, 3)
  if (weak.length) lines.push(`Approaches that landed badly: ${weak.map(s => s.label).join(', ')}.`)
  lines.push(
    'Read those two lists for what they have in common and aim at it. Do not simply produce variations on the liked names — find the property they share and reach it by a different route.',
  )
  return lines.join(' ')
}

/**
 * Weighted sampling over Strategies. Liked strategies get more weight, disliked
 * get less but never zero — the corpus is explicit that a name which lands
 * badly at first is a poor predictor, so nothing is ever permanently closed off.
 * One slot in every batch is reserved for a family the user has not rated yet.
 */
export function pickStrategies(p: TasteProfile, count: number, recentlyUsed: string[] = []): string[] {
  const scoreById = new Map(p.strategyScores.map(s => [s.id, s.score]))
  const recent = new Set(recentlyUsed.slice(-6))
  const picked: string[] = []

  const untouchedFamilies = new Set<FamilyId>(
    STRATEGIES.map(s => s.family).filter(f => !p.familyScores.some(fs => fs.id === f && fs.n > 0)),
  )

  const weightOf = (id: string) => {
    const base = Math.exp((scoreById.get(id) ?? 0) * 0.9)
    const fatigue = recent.has(id) ? 0.25 : 1
    return Math.max(0.05, base * fatigue)
  }

  // Reserve one slot for unexplored territory whenever any is left.
  if (untouchedFamilies.size > 0 && count > 1) {
    const pool = STRATEGIES.filter(s => untouchedFamilies.has(s.family) && !recent.has(s.id))
    const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
    if (pick) picked.push(pick.id)
  }

  const remaining = STRATEGIES.filter(s => !picked.includes(s.id))
  while (picked.length < count && remaining.length > 0) {
    const weights = remaining.map(s => weightOf(s.id))
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    let idx = 0
    for (; idx < weights.length; idx++) {
      r -= weights[idx]
      if (r <= 0) break
    }
    const chosen = remaining.splice(Math.min(idx, remaining.length - 1), 1)[0]
    picked.push(chosen.id)
    // Keep a batch spread across families while there is room to.
    const sameFamily = remaining.filter(s => s.family === chosen.family)
    if (remaining.length - sameFamily.length >= count - picked.length) {
      for (const s of sameFamily) remaining.splice(remaining.indexOf(s), 1)
    }
  }
  return picked
}

/** The very first batch: one Strategy from each family, maximum spread. */
export function seedStrategies(count: number): string[] {
  const byFamily = new Map<FamilyId, typeof STRATEGIES>()
  for (const s of STRATEGIES) {
    const list = byFamily.get(s.family) ?? []
    list.push(s)
    byFamily.set(s.family, list)
  }
  const families = [...byFamily.keys()].sort(() => Math.random() - 0.5)
  const out: string[] = []
  let round = 0
  while (out.length < count) {
    const fam = families[(out.length + round * families.length) % families.length]
    const pool = byFamily.get(fam)!.filter(s => !out.includes(s.id))
    if (pool.length === 0) {
      round++
      if (round > 4) break
      continue
    }
    out.push(pool[Math.floor(Math.random() * pool.length)].id)
    if (out.length % families.length === 0) round++
  }
  return out
}
