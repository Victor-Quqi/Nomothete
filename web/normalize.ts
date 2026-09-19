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

export const REGISTRY_FORMS = [
  { id: 'npm', label: 'npm', fn: npmNormalize },
  { id: 'pypi', label: 'PyPI', fn: pypiUltraNormalize },
  { id: 'crates', label: 'crates.io', fn: cratesNormalize },
] as const
