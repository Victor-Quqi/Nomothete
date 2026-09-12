# 自托管 BYOK 的供应商适配

源码阅读日期 2026-09-11。文中 file:line 相对下列 HEAD：

| 仓库 | SHA |
|---|---|
| [vercel/ai](https://github.com/vercel/ai) | [`615ac892b4b1`](https://github.com/vercel/ai/tree/615ac892b4b1) |
| [BerriAI/litellm](https://github.com/BerriAI/litellm) | [`8e4f2abb4015`](https://github.com/BerriAI/litellm/tree/8e4f2abb4015) |
| [continuedev/continue](https://github.com/continuedev/continue) | [`5522c6f44ca0`](https://github.com/continuedev/continue/tree/5522c6f44ca0) |
| [cline/cline](https://github.com/cline/cline) | [`cfe9cadab996`](https://github.com/cline/cline/tree/cfe9cadab996) |
| [Aider-AI/aider](https://github.com/Aider-AI/aider) | [`5dc9490bb35f`](https://github.com/Aider-AI/aider/tree/5dc9490bb35f) |
| [danny-avila/LibreChat](https://github.com/danny-avila/LibreChat) | [`e2f5772961d2`](https://github.com/danny-avila/LibreChat/tree/e2f5772961d2) |
| [open-webui/open-webui](https://github.com/open-webui/open-webui) | [`0a7c15832fb3`](https://github.com/open-webui/open-webui/tree/0a7c15832fb3) |

OpenRouter 数据同日从 `/api/v1/models` 现场拉取。

## 1. 配置形状

共识是**具名 model profile 列表**。各项目都收敛到同一组五个字段：显示名、供应商标签、model id、`apiKey`、`apiBase`/`baseURL`。

continue.dev 的 `config.yaml`（`docs/reference.mdx`）：

```yaml
models:
  - name: GPT-4o
    provider: openai
    model: gpt-4o
    roles: [chat, edit, apply]
  - name: My Model - OpenAI-Compatible
    provider: openai
    apiBase: http://my-endpoint/v1
    model: my-custom-model
    capabilities:
      - tool_use
      - image_input
    roles: [chat, edit]
```

背后的 zod schema（`packages/config-yaml/src/schemas/models.ts`）正好是 `{name, model, provider, apiKey?, apiBase?, capabilities?, roles?, requestOptions?, useResponsesApi?}`。注意 `useResponsesApi: z.boolean().optional()`。Continue 放弃了自动推断 Responses 还是 Chat Completions，改成用户可见的开关。

LibreChat 用同样的列表形状，对非 OpenAI 线格式加显式 `provider` 判别：

```yaml
endpoints:
  custom:
    - name: 'Claude-Compatible'
      provider: 'anthropic'
      apiKey: '${ANTHROPIC_API_KEY}'
      baseURL: 'https://api.anthropic.com'
      headers:
        anthropic-version: '2023-06-01'
      models:
        default: ['claude-sonnet-4-5', 'claude-opus-4-5']
        fetch: false
```

两处值得抄。`apiKey` 吃 `${ENV_VAR}` 占位，配置文件里不放密钥。`models.fetch: false` 存在是因为模型自动发现假定 OpenAI 的 `/models` 约定，Anthropic 和 Google 不提供这个接口。

open-webui 是例外。它只带两个路由（`backend/open_webui/routers/openai.py` 和 `ollama.py`），配成平行的分号分隔列表，`OPENAI_API_BASE_URLS=urlA;urlB` 配 `OPENAI_API_KEYS=keyA;keyB`。没有 Anthropic 或 Google 客户端，用户被预期在前面跑 LiteLLM 代理。

## 2. 四种形态上的结构化输出

四条线格式：

| 形态 | 字段 | 根级数组 |
|---|---|---|
| Chat Completions | `response_format: {type: 'json_schema', json_schema: {schema, strict, name}}` | 不行，根必须是对象 |
| Responses | `text: {format: {type: 'json_schema', strict, name, schema}}` | 不行 |
| Anthropic Messages | `output_config: {format: {type: 'json_schema', schema}}`，否则强制工具 | 可以 |
| Google | `generationConfig: {responseMimeType: 'application/json', responseSchema}` | 可以 |

AI SDK 把这些收成一个 `responseFormat` 调用选项。Anthropic 有两条代码路径（`packages/anthropic/src/anthropic-language-model.ts:415`）：

```ts
const useStructuredOutput =
  structureOutputMode === 'outputFormat' ||
  (structureOutputMode === 'auto' && supportsStructuredOutput);

const jsonResponseTool = responseFormat?.type === 'json' &&
  responseFormat.schema != null && !useStructuredOutput
    ? { type: 'function', name: 'json',
        description: 'Respond with a JSON object.',
        inputSchema: responseFormat.schema }
    : undefined;
```

工具路径强制 `toolChoice: {type: 'required'}` 且 `disableParallelToolUse: true`，再把工具调用转回文本（`content.push({type: 'text', text: JSON.stringify(part.input)})`）。流式时 `input_json_delta` 块被重新发成 `text-delta`。这就是统一手法：每一种形态最后都变成一串 JSON 文本增量，喂给部分 JSON 解析器。

**漏出来的地方。**

schema 关键字支持不一致，SDK 会悄悄改写。`packages/anthropic/src/sanitize-json-schema.ts` 把 `minItems`、`maxItems`、`minLength`、`maxLength`、`pattern`、`uniqueItems` 挪进 `description` 字符串，因为 Anthropic 的约束解码器不接受它们。Google 的转换器保留 `minItems`/`maxItems`，丢掉 OpenAPI 3.0 子集以外的一切。未关闭 issue vercel/ai#19662："convertJSONSchemaToOpenAPISchema drops constraint keywords silently, widening the accepted value set"。对我们的后果：**条数写在 prompt 里。**

`createOpenAICompatible` 默认关闭结构化输出（`openai-compatible-chat-language-model.ts:145`）：

```ts
this.supportsStructuredOutputs = config.supportsStructuredOutputs ?? false;
```

然后悄悄降级：

```ts
response_format: responseFormat?.type === 'json'
  ? this.supportsStructuredOutputs === true && responseFormat.schema != null
    ? { type: 'json_schema', json_schema: {...} }
    : { type: 'json_object' }
  : undefined,
```

它会推一条 warning，`generateObject` 照样返回。除非显式打开，拿到的是不受 schema 约束的 JSON 团。`createOpenAICompatible` 也没有 `.responses()` 方法（未关闭 issue vercel/ai#11970），到不了 `/v1/responses`。

对我们的工作负载，`streamObject` 加 `output: 'array'` 是对的原语（`packages/ai/src/generate-object/output-strategy.ts:133`）：

```ts
// wrap in object that contains array of elements, since most LLMs will not
// be able to generate an array directly:
jsonSchema: async () => ({
  type: 'object',
  properties: { elements: { type: 'array', items: itemSchema } },
  required: ['elements'],
  additionalProperties: false,
})
```

这层包装让它能在 OpenAI strict 模式上工作：文档要求根必须是 object（[Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs#supported-schemas)）。`elementStream` 随后在每个元素解析完成时吐出它。

## 3. 能力检测

能力检测有两条路：

**按 model id 索引的静态表。** LiteLLM 的 `model_prices_and_context_window.json` 2.3 MB、3885 条，其中 1422 条有 `supports_response_schema`，139 条有 `supports_native_structured_output`。未知模型默认 `False`（`litellm/utils.py:2463`，"Does not raise error. Defaults to 'False'"）。调用时 `get_supported_openai_params(model)` 卡住每个参数，要么抛 `UnsupportedParamsError`，要么在 `drop_params: true` 时丢掉。拿结果对 schema 做校验是另一个默认关闭的开关，`enable_json_schema_validation`。

**对 model id 做正则。** AI SDK 走这条。`packages/google/src/google-model-capabilities.ts` 匹配 `/(^|\/)gemini-2\.5(?:[.-]|$)/i`，注释："Google model IDs are open-ended, so unrecognized Gemini IDs and aliases intentionally inherit the newest supported behavior。" `packages/openai/src/openai-language-model-capabilities.ts` 解析 `o(\d+)` 和 GPT 主/次版本。两者都向最新能力失败开放。

OpenRouter 把表当数据发布。`GET /api/v1/models` 每个模型返回 `supported_parameters` 字符串数组。现场拉了 437+ 个模型：346 个同时宣称 `response_format` 和 `structured_outputs`，31 个只有 `response_format`，8 个只有 `structured_outputs`。这个分裂就是我们要的区分。前者是 `json_object`，后者是带真约束的 `json_schema`。

面向用户的答案各家一样：**先自动识别，再让用户在配置里覆盖。** Continue 文档："Continue automatically detects these capabilities for most models, but you can override this when using custom deployments or if autodetection isn't working correctly." cline 的 `ModelInfo.capabilities` 带同样的注："Absent means capabilities unknown, which SDK checks fail open on."

Aider 是反例。它带 `aider/resources/model-settings.yml`（3128 行），按模型名索引，从不用结构化输出。它降级的是*任务编码*，从 `edit_format: udiff` 到 `diff` 再到 `whole`。

## 4. 密钥存放

对 npx/docker、服务器和浏览器同一台机器的应用，常规是 **环境变量优先，配置文件其次，密钥不到浏览器**。

LibreChat 的形状最有参考价值。`.env` 用 `ANTHROPIC_API_KEY=user_provided` 当哨兵，意思是「向用户要」。用户键入的密钥在服务端用 `CREDS_KEY`/`CREDS_IV` 做 AES 加密（`packages/data-schemas/src/crypto/index.ts`，webcrypto AES-CBC，IV 前置成 `iv:ciphertext`）再进 Mongo。

open-webui 把服务端密钥放在 PersistentConfig 库里，管理界面可改。`ENABLE_DIRECT_CONNECTIONS` 默认关（`backend/open_webui/config.py:229`）；打开后浏览器带着用户 settings 里的 key 直接 `fetch` 上游 `/chat/completions`（`src/lib/apis/openai/index.ts:392`），上游要开 CORS。

坑：

- 密钥进浏览器。浏览器打上游，密钥出现在 devtools。上游调用放服务端。
- 密钥进 docker 日志。不打请求体和 `Authorization` 头。结构化日志行之前先打码。
- CORS。Anthropic 要从浏览器调用，必须带 `anthropic-dangerous-direct-browser-access: true`。服务端调用绕开这个。
- 文件模式。写 `~/.config/<app>/config.json`，权限 `0600`。

## 5. 流式

四种信封：

- **Chat Completions**：SSE，`choices[0].delta.content`，以 `data: [DONE]` 结束。token 计数需要 `stream_options: {include_usage: true}`。Groq 会以 400 拒这个字段（[vercel/ai#1578](https://github.com/vercel/ai/pull/1578#issuecomment-2112345363)）。
- **Responses**：带类型的 SSE 事件。文本是 `response.output_text.delta`；条目生命周期是 `response.output_item.added` / `.done`。事件名不同，没有 `delta` 字段。
- **Anthropic**：`message_start`、`content_block_start`、带着 `text_delta` 或 `input_json_delta` 的 `content_block_delta`，然后 `content_block_stop`、`message_delta`、`message_stop`。
- **Google**：坑在这里。

Google 的 `streamGenerateContent` **默认返回 JSON 数组流**。必须加 `?alt=sse` 才是 SSE。AI SDK 写死了（`google-language-model.ts:696`）：

```ts
url: `${this.config.baseURL}/${getModelPath(this.modelId)}:streamGenerateContent?alt=sse`,
```

第二，chunk 可以没有 candidate。同一文件第 811 行：`// sometimes the API returns an empty candidates array`。如果索引 `candidates[0].content.parts[0].text`，碰到只有 `promptFeedback` 的 chunk 会崩。

第三，`usageMetadata` **每个 chunk 都是累计值**。AI SDK 覆盖（`usage = usageMetadata`）。累加会重复计数。

第四，AI SDK 里鉴权是 `x-goog-api-key` 头，Google 自家文档用 `?key=`。第三方 Gemini 代理常常只认一种。这个头要可配。

## 建议

用 `@ai-sdk/openai` 的 `createOpenAI({baseURL, apiKey, name})`，不用 `createOpenAICompatible`。它对任意 base URL 同时提供 `.chat(id)` 和 `.responses(id)`（`openai-provider.ts:375`，`provider.responses = createResponsesModel`），一个适配器覆盖四种形态里的两种。另外两种加 `@ai-sdk/anthropic` 和 `@ai-sdk/google`，传 `baseURL`。

配置：与 continue.dev 同形的具名 profile 列表，外加 `kind` 判别。

```jsonc
{
  "providers": [
    {
      "id": "local-gpt",
      "kind": "openai-chat",        // openai-chat | openai-responses | anthropic | google
      "baseURL": "http://localhost:8080/v1",
      "apiKeyEnv": "NOMOTHETE_API_KEY",
      "model": "qwen3-32b",
      "structuredOutput": "json_schema"  // json_schema | auto（按 model id 识别，仍解析为 json_schema）
    }
  ]
}
```

`structuredOutput` 默认 `json_schema`。按 model id 做正则自动识别，附一张预期 id 的小静态表，`structuredOutput` 作手动覆盖。上游不支持就失败。

调用 `streamObject({output: 'array', schema: z.object({ name: z.string(), probability: z.number(), rationale: z.string() })})`，消费 `elementStream`。`probability` 用来当场按阈值筛，`rationale` 给用户打档看（见 [`docs/design.md`](../design.md) 生成）。条数写在 prompt 里，不写进 schema，因为 Anthropic 会剥掉 `minItems`/`maxItems`。流结束后再校验条数。

密钥：环境变量优先，然后 `~/.config/nomothete/config.json`、权限 `0600`。浏览器只跟我们自己的服务器说话。
