/**
 * `.env` as something the workshop writes, not only reads.
 *
 * Three ways in — the first-run questions, the browser's settings drawer, and a
 * text editor — have to agree on one file, or "我明明填了" becomes the most
 * common bug report. So all three land here, and this module's whole job is to
 * change the three lines it owns while leaving everything else in the file
 * exactly as the person left it: their comments, their ordering, the port they
 * set last month.
 *
 * The key is written to disk in the clear. That is the same trust boundary the
 * file already had — it is the boundary the browser is being kept outside of
 * (docs/design.md → 凭证), not one this module invents.
 */
import fs from 'node:fs'
import path from 'node:path'

export const ENV_PATH = path.resolve(process.cwd(), '.env')

/** Values that would not survive a round trip through dotenv unquoted. */
function serialise(value: string): string {
  return /^\s|\s$|[#"'\n]/.test(value) ? JSON.stringify(value) : value
}

function lineFor(name: string): RegExp {
  return new RegExp(`^\\s*(export\\s+)?${name}\\s*=`)
}

/**
 * Merge `values` into `.env`. A `null` removes the line; anything else replaces
 * it in place, or appends when the name is new.
 */
export function writeEnv(values: Record<string, string | null | undefined>): void {
  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : ''
  const lines = existing ? existing.split(/\r?\n/) : []

  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue
    const at = lines.findIndex(l => lineFor(name).test(l))
    if (value === null) {
      if (at !== -1) lines.splice(at, 1)
      continue
    }
    const line = `${name}=${serialise(value)}`
    if (at === -1) lines.push(line)
    else lines[at] = line
  }

  const body = `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
  fs.writeFileSync(ENV_PATH, body, { mode: 0o600 })
  // Only meaningful on POSIX, and only for a file that already existed with
  // looser bits. Windows ignores it; that is fine, there is nothing to do there.
  try {
    fs.chmodSync(ENV_PATH, 0o600)
  } catch {
    // A permission model that will not take 0600 is not one we can improve on.
  }
}

/**
 * Make the change visible to this process without a restart.
 *
 * `loadProfiles()` reads `process.env` on every call rather than caching, so a
 * settings change takes effect on the next generation — no bounce, no lost
 * session.
 */
export function applyEnv(values: Record<string, string | null | undefined>): void {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue
    if (value === null) delete process.env[name]
    else process.env[name] = value
  }
}
