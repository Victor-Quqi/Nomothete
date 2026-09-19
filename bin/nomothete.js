#!/usr/bin/env node
/**
 * `nomothete` — start the workshop.
 *
 * Everything this process needs lives next to it: the SQLite file is written to
 * the working directory, the key is read from `.env`, and the frontend is served
 * from `dist/` by the same server that answers `/api`. So the only jobs here are
 * to parse two flags, make sure `dist/` exists, and hand over to server/main.ts.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
// Loaded here as well as in the server, so that a port set in `.env` is the port
// `--open` opens. Nothing else in this file reads the file's contents.
import 'dotenv/config'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)

function flagValue(...names) {
  for (const name of names) {
    const exact = argv.indexOf(name)
    if (exact !== -1 && argv[exact + 1]) return argv[exact + 1]
    const joined = argv.find(a => a.startsWith(`${name}=`))
    if (joined) return joined.slice(name.length + 1)
  }
  return undefined
}

if (argv.includes('-h') || argv.includes('--help')) {
  console.log(`
  nomothete — 给软件项目取名字

  用法
    nomothete [选项]

  选项
    -p, --port <n>   监听端口（默认 5179，或环境变量 NOMOTHETE_PORT）
        --open       启动后用默认浏览器打开
        --setup      重新询问端点、模型与 API key，改写 .env 中对应的三行
        --verbose    打印请求方法与路径（不含请求体与鉴权头）
    -h, --help       显示本帮助

  配置
    三个入口，写入同一个文件：首次启动时询问；启动后在界面左下角「模型」中修改；
    或直接编辑工作目录的 .env：
      NOMOTHETE_BASE_URL / NOMOTHETE_API_KEY / NOMOTHETE_MODEL
    未加前缀的同名变量同样生效，仅在不存在带前缀变量时采用。
    服务默认绑定 127.0.0.1，可用 NOMOTHETE_HOST 更改。
`)
  process.exit(0)
}

// Same precedence as server/env.ts: prefixed first, bare name only as a fallback.
const port = flagValue('-p', '--port') ?? process.env.NOMOTHETE_PORT ?? process.env.PORT ?? '5179'

// Node 24 strips types from .ts on its own; tsx is only a fallback for older
// runtimes that still choke on the annotations.
const major = Number(process.versions.node.split('.')[0])

/** Arguments for running one of the server's .ts files as a script. */
function tsCommand(file, args) {
  return major >= 23
    ? [process.execPath, ['--experimental-strip-types', '--no-warnings', file, ...args]]
    : ['npx', ['tsx', file, ...args]]
}

// Ask before building rather than after: someone who has just cloned this should
// not sit through a Vite build to find out the next thing wanted was a key.
// server/setup.ts returns 0 when it is satisfied, which includes the ordinary
// case of there being nothing to ask.
{
  const [cmd, args] = tsCommand(path.join(root, 'server', 'setup.ts'), argv.includes('--setup') ? ['--force'] : [])
  const setup = spawnSync(cmd, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: cmd === 'npx' && process.platform === 'win32',
  })
  if (setup.status !== 0) process.exit(setup.status ?? 1)
}

// The server serves dist/ when it is there and falls back to an API-only mode
// when it is not. An API-only mode is not what anyone typing `nomothete` wants,
// so build it once instead of letting them find a blank page.
if (!existsSync(path.join(root, 'dist', 'index.html'))) {
  console.log('[nomothete] 未找到 dist/，正在构建前端…')
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (build.status !== 0) {
    console.error('[nomothete] 构建失败。请先执行 npm install，再执行 npm run build。')
    process.exit(build.status ?? 1)
  }
}

const env = { ...process.env, NOMOTHETE_PORT: String(port) }
if (argv.includes('--verbose')) env.NOMOTHETE_VERBOSE = '1'

const [cmd, args] = tsCommand(path.join(root, 'server', 'main.ts'), [])
const child = spawn(cmd, args, {
  cwd: process.cwd(),
  stdio: 'inherit',
  env,
  shell: cmd === 'npx' && process.platform === 'win32',
})

if (argv.includes('--open')) {
  const url = `http://localhost:${port}`
  // Give the listener a moment so the browser does not land on a refused port.
  setTimeout(() => {
    const cmd =
      process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]]
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref()
  }, 900)
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    child.kill(sig)
    process.exit(0)
  })
}
child.on('exit', code => process.exit(code ?? 0))
