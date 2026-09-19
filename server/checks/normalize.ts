/**
 * Registry name normalisation.
 *
 * This is the file that separates Availability from Publishability. A registry
 * does not compare the string you typed against the strings it stores — it
 * normalises both sides first, and rejects you on the normalised form. A 404 on
 * the exact name therefore proves nothing on its own.
 *
 * Each registry's rule, with the consequence spelled out:
 *
 *   npm    strip everything that is not alphanumeric, lowercase.
 *          `react-native` exists ⇒ `reactnative` and `react.native` are refused.
 *
 *   PyPI   PEP 503 normalisation, then fold the confusable glyphs: o→0, l→1,
 *          i→1. `lion` exists ⇒ `l10n` is refused, because both become `110n`.
 *
 *   crates hyphen and underscore are the same character, lowercase.
 *          `serde_json` exists ⇒ `serde-json` is refused.
 */

export type RegistryId = 'npm' | 'pypi' | 'crates'

export const REGISTRIES: { id: RegistryId; label: string }[] = [
  { id: 'npm', label: 'npm' },
  { id: 'pypi', label: 'PyPI' },
  { id: 'crates', label: 'crates.io' },
]

/** npm: the registry compares names with all punctuation removed. */
export function npmNormalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** PyPI, step one: PEP 503. Runs of `-`, `_`, `.` collapse to a single `-`. */
export function pep503(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-').replace(/^-|-$/g, '')
}

/** PyPI, step two: the confusable fold that makes `lion` block `l10n`. */
export function pypiUltraNormalize(name: string): string {
  return pep503(name)
    .replace(/-/g, '')
    .replace(/[li]/g, '1')
    .replace(/o/g, '0')
}

/** crates.io: `-` and `_` are interchangeable. */
export function cratesNormalize(name: string): string {
  return name.toLowerCase().replace(/-/g, '_')
}

export const NORMALIZERS: Record<RegistryId, (n: string) => string> = {
  npm: npmNormalize,
  pypi: pypiUltraNormalize,
  crates: cratesNormalize,
}

/** Whether a string is even a legal name on a given registry. */
export function validateForRegistry(
  registry: RegistryId,
  name: string,
): { ok: true } | { ok: false; reason: string } {
  if (name.length === 0) return { ok: false, reason: '空名字' }
  switch (registry) {
    case 'npm':
      if (name.length > 214) return { ok: false, reason: '超过 214 字符' }
      if (/^[._]/.test(name)) return { ok: false, reason: '不能以 . 或 _ 开头' }
      if (name !== name.toLowerCase()) return { ok: false, reason: 'npm 不接受大写' }
      if (!/^[a-z0-9._~-]+$/.test(name)) return { ok: false, reason: '含 npm 不接受的字符' }
      return { ok: true }
    case 'pypi':
      if (!/^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(name))
        return { ok: false, reason: '不符合 PEP 508 名字格式' }
      return { ok: true }
    case 'crates':
      if (name.length > 64) return { ok: false, reason: '超过 64 字符' }
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) return { ok: false, reason: '必须以字母开头，只含字母数字与 -_' }
      return { ok: true }
  }
}

/**
 * Names that would collide with `name` on a given registry, i.e. every string
 * whose normalised form equals this one's. The set is infinite in principle, so
 * we enumerate the two shapes that actually occur in registries: separators
 * inserted at morpheme boundaries, and — on PyPI — the confusable glyphs.
 *
 * This is what a full local index would answer in 0 ms. Probing the enumeration
 * over the network is the bounded stand-in; see docs/architecture.md.
 */
export function collisionCandidates(registry: RegistryId, name: string, limit = 64): string[] {
  const out = new Set<string>()
  const base = name.toLowerCase()

  if (registry === 'npm' || registry === 'pypi') {
    const core = base.replace(/[^a-z0-9]/g, '')
    const separators = registry === 'npm' ? ['-', '.', '_'] : ['-', '_', '.']
    // One separator, at each interior position. `reactnative` → `react-native`.
    for (let i = 1; i < core.length && out.size < limit; i++) {
      for (const sep of separators) {
        out.add(core.slice(0, i) + sep + core.slice(i))
      }
    }
    // Two separators, only for names long enough that compounds are plausible.
    if (core.length >= 8) {
      outer: for (let i = 2; i < core.length - 2; i++) {
        for (let j = i + 2; j < core.length; j++) {
          out.add(core.slice(0, i) + '-' + core.slice(i, j) + '-' + core.slice(j))
          if (out.size >= limit) break outer
        }
      }
    }
  }

  if (registry === 'pypi') {
    // Fold-inverse: every string mapping to the same ultranormalised form.
    const core = pep503(base).replace(/-/g, '')
    const alternatives: string[][] = [...core].map(ch => {
      if (ch === '1' || ch === 'l' || ch === 'i') return ['1', 'l', 'i']
      if (ch === '0' || ch === 'o') return ['0', 'o']
      return [ch]
    })
    const total = alternatives.reduce((n, a) => n * a.length, 1)
    if (total > 1 && total <= 512) {
      let acc: string[] = ['']
      for (const opts of alternatives) {
        acc = acc.flatMap(prefix => opts.map(o => prefix + o))
      }
      for (const v of acc) {
        if (v !== core) out.add(v)
        if (out.size >= limit * 2) break
      }
    }
  }

  if (registry === 'crates') {
    const positions = [...base].flatMap((ch, i) => (ch === '-' || ch === '_' ? [i] : []))
    if (positions.length > 0 && positions.length <= 8) {
      let acc: string[] = ['']
      let cursor = 0
      for (const pos of positions) {
        const chunk = base.slice(cursor, pos)
        acc = acc.flatMap(prefix => ['-', '_'].map(s => prefix + chunk + s))
        cursor = pos + 1
      }
      const tail = base.slice(cursor)
      for (const v of acc.map(a => a + tail)) if (v !== base) out.add(v)
    } else {
      for (let i = 1; i < base.length; i++) {
        out.add(base.slice(0, i) + '-' + base.slice(i))
        out.add(base.slice(0, i) + '_' + base.slice(i))
        if (out.size >= limit) break
      }
    }
  }

  out.delete(base)
  return [...out].slice(0, limit)
}

/** Rough syllable count — descriptive only, never a filter (see Prior P4/P5). */
export function syllables(name: string): number {
  const w = name.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  const groups = w.match(/[aeiouy]+/g)
  let n = groups ? groups.length : 1
  if (/[^aeiouy]e$/.test(w) && n > 1) n -= 1
  return Math.max(1, n)
}
