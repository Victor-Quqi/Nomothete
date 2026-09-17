/**
 * A client-side echo of server/checks/normalize.ts.
 *
 * Duplicated on purpose: the detail panel shows what each registry will *see*
 * the moment the drawer opens, with no round trip. The server remains the only
 * thing that decides anything — this is display.
 */

export function npmNormalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function pep503(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-').replace(/^-|-$/g, '')
}

export function pypiUltraNormalize(name: string): string {
  return pep503(name).replace(/-/g, '').replace(/[li]/g, '1').replace(/o/g, '0')
}

export function cratesNormalize(name: string): string {
  return name.toLowerCase().replace(/-/g, '_')
}

export function syllables(name: string): number {
  const w = name.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  const groups = w.match(/[aeiouy]+/g)
  let n = groups ? groups.length : 1
  if (/[^aeiouy]e$/.test(w) && n > 1) n--
  return Math.max(1, n)
}

/**
 * Whether Project Name, Repo Name and Package Name can be the same string.
 *
 * CONTEXT.md keeps the three apart because they usually diverge — "Slow Loris"
 * becomes `slow-loris` becomes `@acme/slowloris`, and now there are three things
 * to remember. A single alphanumeric token starting with a letter collapses all
 * three, which is worth one short badge and no explanation.
 */
export function oneToken(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(name)
}

export const REGISTRY_FORMS = [
  { id: 'npm', label: 'npm', note: '去掉所有非字母数字后比对', fn: npmNormalize },
  { id: 'pypi', label: 'PyPI', note: 'PEP 503，再折叠 o→0 l→1 i→1', fn: pypiUltraNormalize },
  { id: 'crates', label: 'crates.io', note: '- 与 _ 视为同一个字符', fn: cratesNormalize },
] as const
