/** Run explicit fixtures through production verification without touching user data. */
import 'dotenv/config'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Usage: node scripts/evaluate-verification.ts fixtures.json output.json')
const fixtures = JSON.parse(fs.readFileSync(input, 'utf8')) as { id: string; name: string; rationale: string; strategyId?: string; expected?: unknown }[]
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomothete-verification-eval-'))
process.env.NOMOTHETE_DB = path.join(dir, 'test.db')
const store = await import('../server/store.ts')
const pipeline = await import('../server/verify/index.ts')
const persistence = await import('../server/verify/store.ts')
const { closeDb } = await import('../server/db.ts')
const { activeProfile } = await import('../server/llm.ts')
const results: unknown[] = []
pipeline.configureVerifier({ publish: () => {} })
try {
  for (const fixture of fixtures) {
    const session = store.createSession({ brief: 'verification evaluation' })
    const candidate = store.insertCandidate({ sessionId: session.id, ...fixture, strategyId: fixture.strategyId ?? 'evaluation', probability: 0.1, generation: 1 })!
    const start = Date.now()
    pipeline.requestVerification(candidate)
    while (persistence.isPending(candidate.id)) await new Promise(resolve => setTimeout(resolve, 100))
    const outcome = persistence.loadOutcome(candidate.id)
    const result = { ...fixture, elapsedMs: Date.now() - start, outcome, trace: persistence.loadTrace(candidate.id) }
    results.push(result)
    fs.writeFileSync(output, JSON.stringify({ date: new Date().toISOString(), model: activeProfile().model, cases: results }, null, 2) + '\n')
    console.log(JSON.stringify({ id: fixture.id, ms: result.elapsedMs, outcome }))
  }
} finally {
  pipeline.cancelAllVerifications()
  closeDb()
  for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file))
  fs.rmdirSync(dir)
}
