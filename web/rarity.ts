import { tr } from './i18n.ts'

/**
 * The session stores a threshold: the highest self-reported "someone else would
 * think of this too" probability a name may have and still be kept. What the
 * user is actually choosing is the other side of that number — how rare the
 * names have to be — so that is what the dial shows and what it reads out.
 *
 * Keeping the conversion here means the two sliders (opening screen and priors
 * drawer) cannot drift apart on which direction the number runs.
 */
export const rarityPercent = (threshold: number) => Math.round((1 - threshold) * 100)

export const thresholdForRarity = (percent: number) => (100 - percent) / 100

/** Slider bounds, in rarity percent. */
export const RARITY_MIN = 10
export const RARITY_MAX = 85

export function rarityWord(percent: number): string {
  if (percent >= 70) return tr('尽量冷僻', 'Very rare')
  if (percent >= 40) return tr('中等', 'Medium')
  return tr('不挑', 'Any')
}
