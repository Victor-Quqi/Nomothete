# 配置

术语以 [`CONTEXT.md`](../CONTEXT.md) 为准，为什么这么设计见 [`design.md`](./design.md)。
本文只回答「怎么配、有哪些开关」。

## 三个入口，一个文件

工作目录的 `.env` 是唯一的记录处。三个入口写的是同一个文件，按你当时在哪儿选一个：

| 入口 | 怎么进去 | 适合 |
| --- | --- | --- |
| 首次启动的三个问题 | `npm start`；之后任何时候 `--setup` 再问一遍 | clone 完第一次跑 |
| 界面左下角的「模型」 | 点开就能改，保存后立刻生效，不用重启 | 换端点试速度 |
| 直接编辑 `.env` | 你自己写 | 已经知道要填什么 |

前两个入口都只改自己那几行 —— 你的注释、顺序和别的变量原样留着。钥匙在终端里不回显。
没有 TTY 时（CI、Docker、管道）提问会跳过并打一行提示，不会卡住等输入；
此时可以起服务之后从界面里配。

最少要有的三行：

```
NOMOTHETE_BASE_URL=https://api.openai.com/v1   # 任何 OpenAI 兼容端点
NOMOTHETE_API_KEY=sk-...
NOMOTHETE_MODEL=gpt-5
```

## 变量

| 变量 | 默认 | |
| --- | --- | --- |
| `NOMOTHETE_BASE_URL` | OpenAI | 任何兼容端点 |
| `NOMOTHETE_API_KEY` | — | 必填 |
| `NOMOTHETE_MODEL` | — | 必填 |
| `NOMOTHETE_PROVIDER_KIND` | 从 base URL 推断 | `openai-chat` / `openai-responses` / `anthropic` / `google` |
| `NOMOTHETE_REASONING_EFFORT` | OpenAI 线路发 `none` | 见下 |
| `NOMOTHETE_PORT` | `5179` | `--port` 优先 |
| `NOMOTHETE_HOST` | `127.0.0.1` | 见下 |
| `NOMOTHETE_GITHUB_TOKEN` | — | GitHub 搜索限速 10 次/分 → 30 次/分 |
| `NOMOTHETE_VERBOSE` | — | `1` 打开请求日志（只有 method 与 path） |

**所有变量都带 `NOMOTHETE_` 前缀**，因为 `API_KEY`、`MODEL`、`BASE_URL`、`PORT`
是机器上另外三个工具也会用的名字，shell 里恰好导出过一个，就会把这个工坊悄悄指到
别的端点、或者指到对的端点配错的钥匙上。不带前缀的同名变量仍然认（`server/env.ts`
里一个函数管这件事），但只在没有带前缀的那个时才用 —— 带前缀的永远优先。

## 钥匙

钥匙只在服务端进程里存在。它不进日志，不进 `/api/bootstrap` 的返回
（那里只序列化 host / model / kind）。

设置面板能**写**它，读不回来：`GET /api/config` 只给末四位，用来确认「存的是不是
我以为的那把」。流向是单向的，进得去出不来。所以页面上跑的东西即使被换掉，
也只能花掉本机代理的额度，拿不走一把明天还能用的钥匙。

## 自动联网核查

设置面板底部的开关，默认开。打开时，给名字打 ▲ 或手动重新检查，会用
[Keenable](https://docs.keenable.ai) 的公开接口搜索、抓取资料，再让已配置的模型
核对取义说明里关于来源和词义的说法。发出去的只有名字和取义说明，不含项目简介和备注。

它只管取义核查，注册表那些检查不受影响。关掉后不再发起新的核查，排队和进行中的也会取消。
开关存在 `nomothete.db` 里，不写 `.env`，所以用 `nomothete.config.json` 锁住模型配置时照样能改。

Keenable 的公开接口不需要 key，每个出口 IP 每小时 1,000 次、每秒 10 次，搜索和抓取共用。
被限流、页面读不到或核查排队已满时显示「未能核查」，稍后重新检查即可。
查不成、没找到足够依据，或者开关关着时，详情里有「浏览器搜索」链接，点开在新标签页里自己查。

## 监听地址

默认绑 `127.0.0.1`，只有本机连得上。绑在回环上时还会检查 `Host` 头，挡掉 DNS
rebinding —— 别的域名解析到 127.0.0.1，借你的浏览器来读这台机器上的东西。
既然设置面板能改配置，这条就值得有。

要放给局域网就写 `NOMOTHETE_HOST=0.0.0.0`，但那意味着同网段的任何人都能用你的钥匙。

## 多个 provider

工作目录放 `nomothete.config.json`：

```json
{ "providers": [
  { "id": "main", "kind": "openai-chat", "baseURL": "...", "apiKeyEnv": "NOMOTHETE_API_KEY",
    "model": "gpt-5", "structuredOutput": "json_schema" }
] }
```

这个文件**整个盖住** `.env` 里那三行，不是合并。所以它在的时候，上面三个入口都会说
自己改不了：设置面板变成只读并说明原因，`--setup` 直接不问，`PUT /api/config` 返回
409。移开它就恢复。

profile 的字段含义见 [`design.md` § LLM 适配](./design.md)。

## `REASONING_EFFORT`

命名是一个**广度**任务，不是推理任务。名字的差异来自 Strategy 约束和温度，
而不是模型对着手上这几个候选反复权衡 —— 它想得更久，给的是同样的名字，只是更慢。
在推理型端点上这个差别不小：同一批名字，`reasoning_effort=none` 三秒回来，
用端点的默认值要四分钟以上 —— 远超 [`design.md`](./design.md) 给生成定的预算。
所以 OpenAI 线路默认发 `none`。

这个参数在 `llm.ts` 的 fetch 层注入，不走 `providerOptions`，因为重试要紧挨着它：
端点如果没听说过这个参数，整个进程只浪费一次请求就不再发送，而不是让你先去发现
有这么个设置。Anthropic 与 Google 线路有各自的 thinking 开关，不会被注入。

想要慢而深，写 `NOMOTHETE_REASONING_EFFORT=default`（或留空）即可完全不发。
