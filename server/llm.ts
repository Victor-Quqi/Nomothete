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

export function loadProfiles(): ProviderProfile[] {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as { providers?: ProviderProfile[] }
      if (raw.providers?.length) return raw.providers
    } catch (err) {
      console.error(`[nomothete] nomothete.config.json 解析失败，回落到环境变量：${(err as Error).message}`)
    }
  }
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

function keyFor(p: ProviderProfile): string | undefined {
  return p.apiKey ?? (p.apiKeyEnv ? process.env[p.apiKeyEnv] : undefined) ?? env('API_KEY')
}

/** Set once, when an endpoint turns out not to know the parameter. */
let effortRefused = false

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

export function resolveModel(p: ProviderProfile, onChunk?: () => void): LanguageModel {
  const apiKey = keyFor(p)
  const effort = p.reasoningEffort === undefined ? DEFAULT_REASONING_EFFORT : p.reasoningEffort
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

export function activeProfile(): ProviderProfile {
  const profiles = loadProfiles()
  if (profiles.length === 0)
    throw new Error('没有配置模型：请在工作目录的 .env 里设置 NOMOTHETE_BASE_URL、NOMOTHETE_API_KEY、NOMOTHETE_MODEL。')
  const p = profiles[0]
  if (!keyFor(p)) throw new Error(`找不到 API key：请设置环境变量 ${p.apiKeyEnv ?? 'NOMOTHETE_API_KEY'}。`)
  return p
}
