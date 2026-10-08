/**
 * Release notes for one tag, from the Conventional Commits since the tag before it.
 *
 * The publish workflow puts this on the GitHub release. To read it before
 * pushing the tag:
 *
 *   node scripts/release-notes.ts v0.2.0
 *
 * Only what someone running nomothete can notice gets a line. refactor, docs,
 * chore, ci and test commits are left to the full changelog link. In this repo
 * `style` means a visible change to the interface, not code formatting.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const SECTIONS: [type: string, title: string][] = [
  ['feat', 'Features'],
  ['fix', 'Fixes'],
  ['style', 'Interface'],
  ['perf', 'Performance'],
]

const tag = process.argv[2]
if (!tag) throw new Error('Usage: node scripts/release-notes.ts <tag>')

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string
  repository: { url: string }
}
const repo = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

let previous: string | undefined
try {
  previous = git('describe', '--tags', '--abbrev=0', `${tag}^`)
} catch {
  // No earlier tag: this is the first release.
}

const lines = ['```', `npx ${pkg.name}@${tag.replace(/^v/, '')}`, '```', '']

if (!previous) {
  lines.push('First release.')
} else {
  const breaking: string[] = []
  const grouped = new Map<string, string[]>(SECTIONS.map(([type]) => [type, []]))

  const log = git('log', '--no-merges', '--format=%h%x1f%s%x1f%b%x1e', `${previous}..${tag}`)
  for (const entry of log.split('\x1e')) {
    const [hash, subject, body] = entry.trim().split('\x1f')
    const m = subject?.match(/^(\w+)(?:\([^)]*\))?(!)?: (.+)$/)
    if (!m) continue
    const [, type, bang, description] = m
    const line = `- ${description[0].toUpperCase()}${description.slice(1)} (${hash})`
    if (bang || /^BREAKING[ -]CHANGE: /m.test(body ?? '')) breaking.push(line)
    else grouped.get(type)?.push(line)
  }

  for (const [title, items] of [['Breaking changes', breaking] as const, ...SECTIONS.map(([type, title]) => [title, grouped.get(type)!] as const)]) {
    if (items.length) lines.push(`### ${title}`, '', ...items, '')
  }
  lines.push(`**Full changelog**: ${repo}/compare/${previous}...${tag}`)
}

console.log(lines.join('\n'))
