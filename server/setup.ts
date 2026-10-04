/**
 * The questions a first run asks.
 *
 * `.env` stays the file of record; this only fills it in for someone who has
 * just cloned the repo and does not yet know which three names to write. So it
 * is allowed to be skipped — and must be. A pipe, a Dockerfile or a CI job has
 * nobody to answer, and blocking there waiting for a keystroke is the worst
 * thing a start-up path can do.
 */
// This runs as its own process, so it has to read `.env` itself — otherwise it
// would find nothing configured and ask the same three questions every start.
import 'dotenv/config'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { env } from './env.ts'
import { applyEnv, ENV_PATH, writeEnv } from './envfile.ts'
import { configSource, DEFAULTS, loadProfiles, probeEndpoint } from './llm.ts'
import { tr } from './i18n.ts'

/** Ctrl-C and backspace, which raw mode hands to us instead of the terminal. */
const ETX = String.fromCharCode(3)
const DEL = String.fromCharCode(127)

/** The one the workshop cannot start without. The base URL and model have defaults. */
function configured(): boolean {
  return Boolean(env('API_KEY'))
}

/**
 * Read a line without echoing it.
 *
 * The key is the only answer here worth hiding, and it is worth hiding: terminal
 * scrollback outlives the session, and these sessions get screen-shared.
 */
function askSecret(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process
    stdout.write(prompt)
    let buf = ''

    const finish = (err?: Error) => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
      stdout.write('\n')
      if (err) reject(err)
      else resolve(buf)
    }

    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') return finish()
        if (ch === ETX) return finish(new Error(tr('已取消', 'Cancelled')))
        if (ch === DEL || ch === '\b') {
          if (buf) {
            buf = buf.slice(0, -1)
            stdout.write('\b \b')
          }
          continue
        }
        if (ch >= ' ') {
          buf += ch
          stdout.write('·')
        }
      }
    }

    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

export async function runSetup(force = false): Promise<void> {
  // A config file supersedes the environment outright (server/llm.ts →
  // loadProfiles), so writing `.env` here would change nothing and claim it did.
  if (configSource().source === 'config-file') return
  if (!force && configured()) return

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    // Nobody to ask — and, since the settings drawer exists, no reason to refuse
    // over it. Say where the three names go and let the browser finish the job.
    console.warn(
      tr('\n[nomothete] 尚未配置模型，当前环境无法交互询问。\n', '\n[nomothete] No model configured. Interactive setup is unavailable in this environment.\n') +
        tr('            启动后在界面左下角「设置」中填写，或\n', '            Enter it in “Settings” at the lower left after startup, or\n') +
        tr(`            在 ${ENV_PATH} 写入 NOMOTHETE_BASE_URL、NOMOTHETE_API_KEY、NOMOTHETE_MODEL。\n`, `            write NOMOTHETE_BASE_URL, NOMOTHETE_API_KEY, and NOMOTHETE_MODEL to ${ENV_PATH}.\n`),
    )
    return
  }

  console.log(tr('\n  配置模型，三个问题。答案写入工作目录的 .env，下次不再询问。\n', '\n  Configure the model with three questions. Answers go into .env in the working directory, and setup will not ask again.\n'))

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  let baseURL: string
  let model: string
  try {
    // Enter keeps what is there, and nothing there means the default — which is
    // left unwritten, so it is the default that answers and not a copy of it.
    const currentBase = env('BASE_URL') ?? ''
    baseURL = (await rl.question(tr(`  端点（OpenAI 兼容）[${currentBase || DEFAULTS.baseURL}]：`, `  Endpoint (OpenAI-compatible) [${currentBase || DEFAULTS.baseURL}]: `))).trim() || currentBase

    const currentModel = env('MODEL') ?? ''
    model = (await rl.question(tr(`  模型 id [${currentModel || DEFAULTS.model}]：`, `  Model ID [${currentModel || DEFAULTS.model}]: `))).trim() || currentModel
  } finally {
    rl.close()
  }

  let apiKey = ''
  while (!apiKey) {
    apiKey = (await askSecret(tr('  API key（不回显）：', '  API key (input hidden): '))).trim()
    if (!apiKey) console.log(tr('  —— API key 不能为空。', '  API key cannot be empty.'))
  }

  const patch = {
    NOMOTHETE_BASE_URL: baseURL || null,
    NOMOTHETE_MODEL: model || null,
    NOMOTHETE_API_KEY: apiKey,
  }
  writeEnv(patch)
  applyEnv(patch)
  console.log(tr(`\n  已写入 · ${ENV_PATH}`, `\n  Written to · ${ENV_PATH}`))

  // Advisory only. A wrong key, a wrong base URL and a mistyped model id all
  // look identical an hour later; one cheap request tells them apart now.
  process.stdout.write(tr('  正在测试连接…', '  Testing connection…'))
  const probe = await probeEndpoint(loadProfiles()[0])
  console.log(`\r  ${probe.ok ? '✓' : '!'} ${probe.message}${' '.repeat(10)}`)
  if (probe.modelListed === false && probe.sample?.length) {
    const more = (probe.count ?? 0) > probe.sample.length ? ' …' : ''
    console.log(tr(`    端点列出：${probe.sample.join('、')}${more}`, `    Endpoint listed: ${probe.sample.join(', ')}${more}`))
    console.log(tr('    如需更改：重跑 nomothete --setup，或启动后在界面左下角「设置」中修改。', '    To change it, rerun nomothete --setup or edit it in “Settings” at the lower left after startup.'))
  }
  console.log('')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runSetup(process.argv.includes('--force'))
  } catch (err) {
    // Ctrl-C at the key prompt lands here. Aborting setup aborts the start-up.
    console.error(`\n[nomothete] ${(err as Error).message}`)
    process.exit(1)
  }
  process.exit(0)
}
