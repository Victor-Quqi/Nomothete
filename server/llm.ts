/**
 * Provider adapters.
 *
 * Shape follows docs/research/provider-adapters.md: a named profile list with a
 * `kind` discriminator, `@ai-sdk/openai`'s `createOpenAI` rather than
 * `createOpenAICompatible` (which defaults structured output off and silently
 * downgrades json_schema to json_object), and official packages for the other
 * two line formats with `baseURL` passed through.
 *
 * Keys come from the environment and never leave this process.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import { env } from './env.ts'
import { ENV_PATH } from './envfile.ts'

export type ProviderKind = 'openai-chat' | 'openai-responses' | 'anthropic' | 'google'

export interface ProviderProfile {
  id: string
  kind: ProviderKind
  baseURL?: string
  apiKeyEnv?: string
  apiKey?: string
  model: string
  /** `json_schema` demands real constrained decoding; `auto` infers from id. */
  structuredOutput?: 'json_schema' | 'auto'
  /** OpenAI-line only. `null` sends nothing and leaves the endpoint's default. */
  reasoningEffort?: string | null
  /** Google-only: third-party proxies often accept only one of the two. */
  googleAuth?: 'header' | 'query'
}

/**
 * Naming is a breadth task, not a deliberation task. The variety comes from the
 * Strategy constraint and from temperature — a model arguing with itself about
 * which of six names is best produces the same names, slower.
 *
 * On a reasoning endpoint the difference is not subtle. The same batch answers
 * in 2.6s at `none` and takes over four minutes at the endpoint's default, which
 * is the gap between docs/design.md's 3–10s and a workshop that looks hung.
 */
const DEFAULT_REASONING_EFFORT = 'none'

const CONFIG_PATH = path.resolve(process.cwd(), 'nomothete.config.json')

/** Model ids known to constrain decoding to a supplied schema. */
const SCHEMA_CAPABLE = [
  /^gpt-(4o|4\.1|5|6)/i,
  /^o[1-9]/i,
  /^claude-(3-5|3-7|4|opus|sonnet|haiku|fable)/i,
  /^gemini-(1\.5|2|2\.5|3)/i,
  /^deepseek/i,
  /^qwen/i,
  /^glm-4/i,
  /^kimi/i,
  /^mistral-(large|medium)/i,
  /^llama-?3\.[123]/i,
]

export function supportsSchema(model: string): boolean {
  return SCHEMA_CAPABLE.some(re => re.test(model))
}

function inferKind(baseURL: string | undefined): ProviderKind {
  if (!baseURL) return 'openai-chat'
  if (/anthropic\.com/.test(baseURL)) return 'anthropic'
  if (/generativelanguage\.googleapis\.com|\/v1beta\b/.test(baseURL)) return 'google'
  return 'openai-chat'
}

function profilesFromFile(): ProviderProfile[] {
  if (!fs.existsSync(CONFIG_PATH)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as { providers?: ProviderProfile[] }
    return raw.providers?.length ? raw.providers : []
  } catch (err) {
    console.error(`[nomothete] nomothete.config.json 解析失败，回落到环境变量：${(err as Error).message}`)
    return []
  }
}

function profilesFromEnv(): ProviderProfile[] {
  const baseURL = env('BASE_URL')
  const model = env('MODEL')
  if (!model) return []
  const effort = env('REASONING_EFFORT')
  return [
    {
      id: 'default',
      kind: (env('PROVIDER_KIND') as ProviderKind) || inferKind(baseURL),
      baseURL,
      apiKeyEnv: 'NOMOTHETE_API_KEY',
      model,
      structuredOutput: 'auto',
      // `…REASONING_EFFORT=default` (or anything empty) leaves the parameter off.
      reasoningEffort:
        effort === undefined ? DEFAULT_REASONING_EFFORT : /^(default|off|)$/i.test(effort) ? null : effort,
    },
  ]
}

export function loadProfiles(): ProviderProfile[] {
  const fromFile = profilesFromFile()
  return fromFile.length ? fromFile : profilesFromEnv()
}

export interface ConfigSource {
  source: 'config-file' | 'env' | 'none'
  /** Where a write would go, or where the active config came from. */
  path: string
  /**
   * `nomothete.config.json` wins outright — `loadProfiles` never reaches the
   * environment when it has providers. Someone who edits `.env` and sees nothing
   * change deserves to be told why, so the settings drawer needs this flag.
   */
  shadowsEnv: boolean
}

export function configSource(): ConfigSource {
  if (profilesFromFile().length) {
    return { source: 'config-file', path: CONFIG_PATH, shadowsEnv: profilesFromEnv().length > 0 }
  }
  return { source: profilesFromEnv().length ? 'env' : 'none', path: ENV_PATH, shadowsEnv: false }
}

function keyFor(p: ProviderProfile): string | undefined {
  return p.apiKey ?? (p.apiKeyEnv ? process.env[p.apiKeyEnv] : undefined) ?? env('API_KEY')
}

/** Set once, when an endpoint turns out not to know the parameter. */
let effortRefused = false

/**
 * The latch above is about one endpoint, so changing endpoints has to clear it.
 * Otherwise a proxy that refused `reasoning_effort` once silently costs every
 * later provider the parameter as well — and the symptom (four-minute batches)
 * looks nothing like its cause.
 */
export function forgetEffortRefusal(): void {
  effortRefused = false
}

/**
 * The wire layer: liveness tap, plus the reasoning-effort request.
 *
 * The tap exists because a reasoning model spends its first minute emitting
 * `reasoning_content` deltas with an empty `content` — real traffic that no
 * layer above this one can see, since the SDK has no text to hand up yet.
 * Liveness has to be measured where the bytes are. Nothing is read or retained:
 * each chunk is counted and passed straight through, so request bodies and
 * Authorization headers stay as unreachable as ever.
 *
 * `reasoning_effort` is injected here rather than through `providerOptions`
 * because the retry belongs next to it: an endpoint that has never heard of the
 * parameter should cost one wasted request for the whole process, not a
 * configuration step the user has to discover.
 */
function wireFetch(onChunk: (() => void) | undefined, effort: string | null): typeof fetch {
  return async (input, init) => {
    const url = input as Parameters<typeof fetch>[0]

    let body = init?.body
    let injected = false
    if (effort && !effortRefused && typeof body === 'string') {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>
        if (parsed.reasoning_effort === undefined) {
          parsed.reasoning_effort = effort
          body = JSON.stringify(parsed)
          injected = true
        }
      } catch {
        // Not a JSON body. Leave it exactly as it was.
      }
    }

    let res = await fetch(url, { ...init, body })

    if (injected && res.status === 400) {
      const text = await res.text().catch(() => '')
      if (/reasoning|unsupported|unrecognized|unknown|invalid/i.test(text)) {
        effortRefused = true
        console.warn('[nomothete] 端点不接受 reasoning_effort，之后不再发送。')
        res = await fetch(url, init)
      } else {
        // A real 400. Hand the body back intact so the SDK can report it.
        return new Response(text, { status: 400, statusText: res.statusText, headers: res.headers })
      }
    }

    if (!onChunk || !res.body || !res.ok) return res
    const tap = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        onChunk()
        controller.enqueue(chunk)
      },
    })
    return new Response(res.body.pipeThrough(tap), {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  }
}

export function resolveReasoningEffort(p: ProviderProfile): string | null {
  if (p.kind !== 'openai-chat' && p.kind !== 'openai-responses') return null
  return p.reasoningEffort === undefined ? DEFAULT_REASONING_EFFORT : p.reasoningEffort
}

export function resolveModel(p: ProviderProfile, onChunk?: () => void): LanguageModel {
  const apiKey = keyFor(p)
  const effort = resolveReasoningEffort(p)
  switch (p.kind) {
    case 'openai-chat': {
      const provider = createOpenAI({ baseURL: p.baseURL, apiKey, name: p.id, fetch: wireFetch(onChunk, effort) })
      return provider.chat(p.model)
    }
    case 'openai-responses': {
      const provider = createOpenAI({ baseURL: p.baseURL, apiKey, name: p.id, fetch: wireFetch(onChunk, effort) })
      return provider.responses(p.model)
    }
    case 'anthropic': {
      // The other two lines carry their own thinking controls; injecting an
      // OpenAI parameter into their bodies would just be a malformed request.
      const provider = createAnthropic({ baseURL: p.baseURL, apiKey, fetch: wireFetch(onChunk, null) })
      return provider(p.model)
    }
    case 'google': {
      const provider = createGoogleGenerativeAI({
        baseURL: p.baseURL,
        apiKey,
        fetch: wireFetch(onChunk, null),
        ...(p.googleAuth === 'query' ? { headers: {} } : {}),
      })
      return provider(p.model)
    }
  }
}

export interface ProviderStatus {
  configured: boolean
  id?: string
  kind?: ProviderKind
  model?: string
  /** Host only. The key is never serialised, anywhere. */
  host?: string
  structuredOutput?: string
  hasKey: boolean
  problem?: string
}

export function providerStatus(): ProviderStatus {
  const profiles = loadProfiles()
  if (profiles.length === 0) {
    return {
      configured: false,
      hasKey: false,
      problem:
        '没有配置模型。在工作目录放一个 .env，写上 NOMOTHETE_BASE_URL、NOMOTHETE_API_KEY、NOMOTHETE_MODEL 三行即可。',
    }
  }
  const p = profiles[0]
  const key = keyFor(p)
  let host: string | undefined
  try {
    host = p.baseURL ? new URL(p.baseURL).host : `${p.kind} 默认端点`
  } catch {
    host = p.baseURL
  }
  const mode = p.structuredOutput === 'json_schema' || supportsSchema(p.model) ? 'json_schema' : 'json_schema（未识别的 model id，仍按 schema 请求）'
  return {
    configured: Boolean(key),
    id: p.id,
    kind: p.kind,
    model: p.model,
    host,
    structuredOutput: mode,
    hasKey: Boolean(key),
    problem: key ? undefined : `找不到 API key。设置环境变量 ${p.apiKeyEnv ?? 'NOMOTHETE_API_KEY'}。`,
  }
}

/**
 * The last four characters, and nothing else.
 *
 * Enough to tell two keys apart when you are wondering which one is loaded;
 * useless to anyone who intercepts it. `keyFor` stays private so that this is
 * the only shape a key can leave this module in.
 */
export function keyHint(): string | null {
  const profiles = loadProfiles()
  if (!profiles.length) return null
  const key = keyFor(profiles[0])
  return key ? key.slice(-4) : null
}

export function activeProfile(): ProviderProfile {
  const profiles = loadProfiles()
  if (profiles.length === 0)
    throw new Error('没有配置模型：请在工作目录的 .env 里设置 NOMOTHETE_BASE_URL、NOMOTHETE_API_KEY、NOMOTHETE_MODEL。')
  const p = profiles[0]
  if (!keyFor(p)) throw new Error(`找不到 API key：请设置环境变量 ${p.apiKeyEnv ?? 'NOMOTHETE_API_KEY'}。`)
  return p
}

/** Where each line format answers when no `baseURL` was given. */
const DEFAULT_BASE: Record<ProviderKind, string> = {
  'openai-chat': 'https://api.openai.com/v1',
  'openai-responses': 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
}

export interface ProbeResult {
  ok: boolean
  /** Undefined when the listing could not be read — absent is not the same as no. */
  modelListed?: boolean
  count?: number
  /** A few ids, so a typo can be fixed against the real list rather than guessed at. */
  sample?: string[]
  message: string
}

/**
 * Ask the endpoint what it has, before anyone waits on a generation to find out.
 *
 * A wrong key, a wrong base URL and a mistyped model id all surface today as the
 * same thing: a batch that fails a minute after you hit 开始取名. `/models` costs
 * one cheap request and separates the three.
 *
 * It can only ever advise. Plenty of proxies route chat completions perfectly
 * well and do not implement `/models` at all, so a failure here is reported and
 * never blocks a save.
 */
export async function probeEndpoint(p: ProviderProfile, timeoutMs = 8000): Promise<ProbeResult> {
  const key = keyFor(p)
  if (!key) return { ok: false, message: '没有 API key。' }

  const base = (p.baseURL ?? DEFAULT_BASE[p.kind]).replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(`${base}/models`)
  } catch {
    return { ok: false, message: `端点地址不合法：${base}` }
  }

  const headers: Record<string, string> = {}
  if (p.kind === 'anthropic') {
    headers['x-api-key'] = key
    headers['anthropic-version'] = '2023-06-01'
  } else if (p.kind === 'google') {
    url.searchParams.set('key', key)
  } else {
    headers.authorization = `Bearer ${key}`
  }

  const timer = AbortSignal.timeout(timeoutMs)
  let res: Response
  try {
    res = await fetch(url, { headers, signal: timer })
  } catch (err) {
    const reason = timer.aborted ? `${timeoutMs / 1000} 秒内没有响应` : (err as Error).message
    return { ok: false, message: `连不上 ${url.host}：${reason}` }
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: `${url.host} 拒绝了这个 API key（${res.status}）。` }
  }
  if (!res.ok) {
    // A 404 here usually means "this proxy only does chat completions", which is
    // a perfectly good proxy. Say so rather than crying wolf.
    const aside = res.status === 404 ? '，部分端点不提供该列表' : ''
    return { ok: false, message: `${url.host} 的 /models 返回 ${res.status}${aside}。` }
  }

  let ids: string[] = []
  try {
    const body = (await res.json()) as { data?: unknown[]; models?: unknown[] }
    const rows = (body.data ?? body.models ?? []) as { id?: string; name?: string }[]
    ids = rows.map(m => String(m.id ?? m.name ?? '').replace(/^models\//, '')).filter(Boolean)
  } catch {
    return { ok: false, message: `${url.host} 返回的不是模型列表。` }
  }

  if (!ids.length) return { ok: true, message: `${url.host} 连接成功，未列出任何模型。` }

  const listed = ids.includes(p.model)
  return {
    ok: true,
    modelListed: listed,
    count: ids.length,
    sample: ids.slice(0, 8),
    message: listed
      ? `${url.host} 连接成功，列出 ${ids.length} 个模型，含 ${p.model}。`
      : `${url.host} 连接成功，列出 ${ids.length} 个模型，其中没有 ${p.model}。`,
  }
}
