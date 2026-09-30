import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'dotenv'

test('reasoning effort reads the active profile and preserves an empty value across restart', { timeout: 30_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nomothete-config-'))
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const address = listener.address()
  assert.ok(address && typeof address !== 'string')
  const port = address.port
  await new Promise<void>(resolve => listener.close(() => resolve()))

  // The child reads only the test directory's settings.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(NOMOTHETE_|DOTENV_)/i.test(key) &&
    !/^(BASE_URL|MODEL|API_KEY|REASONING_EFFORT|PROVIDER_KIND|HOST|PORT)$/i.test(key),
  ))
  const endpoint = `http://127.0.0.1:${port}/api/config`
  let child: ChildProcess | undefined
  const stop = async () => {
    if (!child || child.exitCode !== null) return
    const exited = once(child, 'exit')
    child.kill()
    await exited
  }
  const start = async () => {
    child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./main.ts', import.meta.url))], {
      cwd: dir,
      env: { ...env, NOMOTHETE_HOST: '127.0.0.1', NOMOTHETE_PORT: String(port) },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Test server did not start')), 10_000)
      let output = ''
      child!.once('error', error => { clearTimeout(timer); reject(error) })
      child!.once('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited: ${code}`)) })
      child!.stdout!.on('data', chunk => {
        output += String(chunk)
        if (output.includes(`http://localhost:${port}`)) { clearTimeout(timer); resolve() }
      })
      child!.stderr!.resume()
    })
  }
  const read = async () => {
    const response = await fetch(endpoint)
    assert.equal(response.status, 200)
    return response.json() as Promise<{ reasoningEffort: string; writable: boolean }>
  }
  const save = async (reasoningEffort: string) => {
    const response = await fetch(endpoint, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reasoningEffort }),
    })
    assert.equal(response.status, 200)
    return response.json() as Promise<{ reasoningEffort: string }>
  }

  try {
    await writeFile(join(dir, '.env'), 'NOMOTHETE_MODEL=test-model\nNOMOTHETE_API_KEY=test-key\n')
    await start()
    assert.equal((await read()).reasoningEffort, 'none')
    assert.equal((await save('')).reasoningEffort, '')
    assert.equal(parse(await readFile(join(dir, '.env'))).NOMOTHETE_REASONING_EFFORT, '')
    assert.equal((await read()).reasoningEffort, '')
    await stop()
    await start()
    assert.equal((await read()).reasoningEffort, '')
    assert.equal((await save('none')).reasoningEffort, 'none')
    assert.equal((await save('default')).reasoningEffort, '')
    assert.equal((await save('high')).reasoningEffort, 'high')

    const config = join(dir, 'nomothete.config.json')
    for (const [effort, expected] of [[null, ''], ['low', 'low'], [undefined, 'none']] as const) {
      await writeFile(config, JSON.stringify({ providers: [{ id: 'test', kind: 'openai-chat', model: 'test-model', reasoningEffort: effort }] }))
      const response = await read()
      assert.equal(response.reasoningEffort, expected)
      assert.equal(response.writable, false)
    }
    await writeFile(config, JSON.stringify({ providers: [{ id: 'test', kind: 'google', model: 'test-model' }] }))
    assert.equal((await read()).reasoningEffort, '')
  } finally {
    await stop()
    await rm(dir, { recursive: true, force: true })
  }
})
