/**
 * Fill the local index from a full registry dump.
 *
 * The index answers one question in 0 ms: *is there already a name that
 * normalises to this one?* — which is Publishability, the thing a 404 on the
 * exact string cannot tell you. The running app feeds the table opportunistically
 * with every registry answer it receives; this script front-loads it.
 *
 * Sources, and why each one is shaped the way it is:
 *
 *   npm     https://replicate.npmjs.com/_all_docs — the CouchDB all-docs view,
 *           one JSON row per line. ~3.5M rows, roughly 300 MB of text.
 *
 *   pypi    https://pypi.org/simple/ — the PEP 503 index, one anchor per line.
 *           ~600k rows.
 *
 *   crates  no plain listing exists. Download https://static.crates.io/db-dump.tar.gz,
 *           extract it, and point this script at `data/crates.csv`.
 *
 * Usage
 *   node --experimental-strip-types scripts/build-index.ts npm
 *   node --experimental-strip-types scripts/build-index.ts pypi
 *   node --experimental-strip-types scripts/build-index.ts crates data/crates.csv
 *   node --experimental-strip-types scripts/build-index.ts all
 *
 * Any source also accepts a local path (optionally `.gz`) as the second
 * argument, so a dump can be fetched once with curl and re-ingested offline.
 */
import fs from 'node:fs'
import readline from 'node:readline'
import { Readable } from 'node:stream'
import zlib from 'node:zlib'
import { getDb } from '../server/db.ts'
import { NORMALIZERS, type RegistryId } from '../server/checks/normalize.ts'

interface Source {
  id: RegistryId
  url: string
  /** Pull the name out of one line, or null when the line carries none. */
  extract: (line: string) => string | null
  note: string
}

const SOURCES: Record<RegistryId, Source> = {
  npm: {
    id: 'npm',
    url: 'https://replicate.npmjs.com/_all_docs',
    // Rows look like {"id":"react","key":"react","value":{"rev":"…"}}, one per
    // line, wrapped in an object whose first and last lines carry no id.
    extract: line => {
      const m = /^\s*\{"id":"((?:[^"\\]|\\.)*)"/.exec(line)
      if (!m) return null
      const name = JSON.parse(`"${m[1]}"`)
      // CouchDB design documents are not packages.
      return name.startsWith('_design/') ? null : name
    },
    note: '约 350 万行，300 MB 上下',
  },
  pypi: {
    id: 'pypi',
    url: 'https://pypi.org/simple/',
    extract: line => {
      const m = /<a [^>]*>([^<]+)<\/a>/.exec(line)
      return m ? m[1].trim() : null
    },
    note: '约 60 万行',
  },
  crates: {
    id: 'crates',
    // Nothing to stream: the dump is a tarball, so this one wants a local file.
    url: '',
    extract: line => {
      // data/crates.csv from the official dump. The header names the columns;
      // `name` is quoted CSV, and the column order has changed across dumps, so
      // resolve it from the header rather than assuming a position.
      return line
    },
    note: '需要先解开 db-dump.tar.gz，再指向 data/crates.csv',
  },
}

async function openLines(source: Source, file: string | undefined) {
  if (file) {
    const raw = fs.createReadStream(file)
    return file.endsWith('.gz') ? raw.pipe(zlib.createGunzip()) : raw
  }
  if (!source.url) {
    throw new Error(`${source.id} 没有可直接流式读取的源 —— ${source.note}`)
  }
  const res = await fetch(source.url, { headers: { accept: 'text/html, application/json' } })
  if (!res.ok || !res.body) throw new Error(`${source.url} 返回 ${res.status}`)
  return Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
}

async function ingest(registry: RegistryId, file?: string): Promise<number> {
  const source = SOURCES[registry]
  const normalize = NORMALIZERS[registry]
  const db = getDb()
  const insert = db.prepare(
    'INSERT OR IGNORE INTO name_index (registry, normalized, actual) VALUES (?, ?, ?)',
  )

  const stream = await openLines(source, file)
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity })

  // CSV needs the header to find its column; every other source ignores this.
  let nameColumn = -1
  let isHeader = registry === 'crates'

  let seen = 0
  let written = 0
  let sinceCommit = 0
  db.exec('BEGIN')

  const commit = () => {
    db.exec('COMMIT')
    db.exec('BEGIN')
    sinceCommit = 0
  }

  try {
    for await (const line of lines) {
      let name: string | null
      if (registry === 'crates') {
        const cells = parseCsvRow(line)
        if (isHeader) {
          nameColumn = cells.indexOf('name')
          isHeader = false
          if (nameColumn === -1) throw new Error('crates.csv 的表头里没有 name 列')
          continue
        }
        name = cells[nameColumn] ?? null
      } else {
        name = source.extract(line)
      }
      if (!name) continue

      seen++
      const norm = normalize(name)
      if (!norm) continue
      const r = insert.run(registry, norm, name)
      if (r.changes > 0) written++
      if (++sinceCommit >= 20_000) {
        commit()
        process.stdout.write(`\r  ${registry}  读 ${seen.toLocaleString()} · 入库 ${written.toLocaleString()}`)
      }
    }
  } finally {
    db.exec('COMMIT')
    lines.close()
  }

  process.stdout.write(`\r  ${registry}  读 ${seen.toLocaleString()} · 入库 ${written.toLocaleString()}\n`)
  return written
}

/** Minimal RFC 4180 row parser — enough for the crates dump. */
function parseCsvRow(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else quoted = false
      } else cur += ch
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

async function main() {
  const [which, file] = process.argv.slice(2)
  if (!which || which === '-h' || which === '--help') {
    console.log(`
  build-index — 把注册表全量 dump 灌进本地索引

  用法
    build-index npm|pypi|crates|all [本地文件]

  说明
    npm     ${SOURCES.npm.note}
    pypi    ${SOURCES.pypi.note}
    crates  ${SOURCES.crates.note}

    第二个参数给了就读本地文件（.gz 会自动解压），没给就直接从网上流式读。
    全量索引是可选的：不灌也能跑，应用会在使用中把每次注册表回答折回同一张表，
    并用 collisionCandidates() 的有界探测代替全量比对。
`)
    return
  }

  const targets: RegistryId[] =
    which === 'all' ? ['npm', 'pypi', 'crates'] : [which as RegistryId]
  for (const t of targets) {
    if (!SOURCES[t]) throw new Error(`不认识的注册表：${t}`)
  }

  const started = Date.now()
  let total = 0
  for (const t of targets) {
    try {
      total += await ingest(t, targets.length === 1 ? file : undefined)
    } catch (err) {
      // `all` should not die because crates needs a local file.
      console.error(`  ${t}  跳过：${(err as Error).message}`)
    }
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`\n  新增 ${total.toLocaleString()} 条，用时 ${secs}s`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
