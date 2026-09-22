/**
 * A client-side echo of server/checks/normalize.ts's `registryForm`.
 *
 * Duplicated on purpose: the drawer shows what each registry will be given the
 * moment it opens, with no round trip. The server remains the only thing that
 * decides anything — this is display.
 *
 * Only this form belongs on screen. The normalisation that decides collisions
 * folds `o` to `0` and `l` to `1`, so `Allelarch` becomes `a11e1arch` — a lookup
 * key, not a string anyone types. Printing it next to the word 写法 invites
 * somebody to paste it into pyproject.toml. It stays on the server.
 */

export type RegistryId = 'npm' | 'pypi' | 'crates'

export const REGISTRIES: { id: RegistryId; label: string }[] = [
  { id: 'npm', label: 'npm' },
  { id: 'pypi', label: 'PyPI' },
  { id: 'crates', label: 'crates.io' },
]

/**
 * The string that would be typed into package.json or Cargo.toml. A candidate is
 * written the way it is said — Agemux — and npm is the only registry that lowers
 * it; PyPI and crates.io keep the capital (Flask, Inflector).
 */
export function registryForm(registry: RegistryId, name: string): string {
  return registry === 'npm' ? name.toLowerCase() : name
}
