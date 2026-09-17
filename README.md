# Nomothete

> ὄνομα … ὄργανόν ἐστι διδασκαλικόν τι καὶ διακριτικὸν τῆς οὐσίας
> 名字是一种工具，用来教人，也用来把事物彼此分开。制作名字的那位匠人，就是立法者 —— 在所有匠人当中，他是最少见的一个。
> —— 柏拉图《克拉底鲁篇》388b–389a

自托管的软件项目命名工具。你写一句这个项目是什么，它给出候选名；每个名字带着取义，
并且已经查过能不能注册、会不会搜不到。你给候选打档，下一批据此调整。

**唯一的判准是你的判断。** 系统不会替你打分，也不会声称某个名字「好」。
它只负责把足够多、足够不同的候选摆到你面前，把每个名字的事实查清楚，
然后从你的点击里学会下一批该往哪边走。

---

## 跑起来

需要 **Node 24+**（`node:sqlite` 与原生 TypeScript 类型剥离都在这一版落地）。

```bash
npm install
cp .env.example .env     # 填上 BASE_URL / API_KEY / MODEL
npm run build            # 构建前端到 dist/
npm start                # → http://localhost:5179
```

或者直接用 CLI 入口（缺 `dist/` 会自动补一次构建）：

```bash
node bin/nomothete.js --open
node bin/nomothete.js --port 7000 --verbose
```

开发时前后端分开跑，Vite 把 `/api` 代理到服务端并关掉 SSE 的缓冲：

```bash
npm run dev              # tsx watch server/main.ts + vite
npm run typecheck        # 两个 tsconfig 都过一遍
```

数据落在工作目录的 `nomothete.db`（SQLite，WAL）。删掉它就是全部重置。

### `.env`

```
BASE_URL=https://api.openai.com/v1     # 任何 OpenAI 兼容端点
API_KEY=sk-...
MODEL=gpt-5
REASONING_EFFORT=none                  # 可选，见下
```

- 钥匙**只在服务端进程里存在**。它不进日志（中间件只打 method 与 path，
  且要 `NOMOTHETE_VERBOSE=1` 才打）、不进 `/api/bootstrap` 的返回
  （`providerStatus()` 只序列化 host / model / kind）、不会以任何形式到达浏览器。
- 三种线格式都支持：`BASE_URL` 指向 Anthropic 或 Google 的地址时自动识别，
  也可以用 `PROVIDER_KIND=openai-chat|openai-responses|anthropic|google` 明写。
- 要同时配多个 provider，在工作目录放 `nomothete.config.json`：

  ```json
  { "providers": [
    { "id": "main", "kind": "openai-chat", "baseURL": "...", "apiKeyEnv": "API_KEY",
      "model": "gpt-5", "structuredOutput": "json_schema" }
  ] }
  ```

- 可选：`GITHUB_TOKEN` 把 GitHub 搜索限速从 10 次/分提到 30 次/分。

#### 关于 `REASONING_EFFORT`

命名是一个**广度**任务，不是推理任务。名字的差异来自 Strategy 约束和温度，
而不是模型对着六个候选反复权衡 —— 它想得更久，给的是同样的名字，只是更慢。
在推理型端点上这个差别不小：同一批名字，`reasoning_effort=none` 三秒回来，
用端点的默认值要四分钟以上，而 [docs/design.md](./docs/design.md) 给生成定的
预算是 3–10 秒。所以 OpenAI 线路默认发 `none`。

这个参数在 `llm.ts` 的 fetch 层注入，不走 `providerOptions`，因为重试要紧挨着它：
端点如果没听说过这个参数，整个进程只浪费一次请求就不再发送，而不是让你先去发现
有这么个设置。Anthropic 与 Google 线路有各自的 thinking 开关，不会被注入。
想要慢而深，写 `REASONING_EFFORT=default`（或留空）即可完全不发。

---

## 它怎么工作

### 生成

一次「来一批」会同时发起 **6 条互不相干的 Strategy**（可以改成 8 条）。
每条 Strategy 是一个**正向约束**，不是一个禁令 —— 库里 29 条，分成六族：
词根 / 手艺 / 自然 / 器械 / 构词 / 语言。「玻璃与窑火」「钟表机械」「刻意错拼」
「废弃英语词」各自是一条。一次调用只跑一条，因为一个 prompt 里塞两种取向，
模型会取它们的平均数，而平均数是最没有意思的那个名字。

每个候选自报一个概率：*另一个助手拿到同一份简介，有多大可能也想出这个名字。*
低于阈值（默认 0.5）的在到达时就被丢掉 —— 丢弃发生在到达那一刻而不是排序之后，
所以结果可以边生成边往画布上贴，不必等一批跑完。被丢掉的那些仍然记在「织机」
的计数里，鼠标移上去能看到它们是什么、概率多少。

**不排序。** 候选按到达顺序排，新的一代在上面。排序会暗示系统对名字好坏有一个判断，
而它没有。

一批的生死由**沉默**判定，不是由时长判定：线上每来一个字节，计时就重置。
推理模型可以先想一分钟再写第一个字，按经过时间砍它等于扔掉正在正常到达的东西；
所以织机上的线会显示「推敲 42s」而不是干等着。只有 90 秒一个字节都没有才算停住，
另有 10 分钟的上限兜底。一批要是回来一个空数组（代理的结构化输出半残时的常见症状），
会重试至多三次，仍然空才报失败 —— 空画布和一句「+0」是两回事。

### 检查

每个名字上跑一条流水线，每项检查自己声明代价档位与触发时机：

| 检查 | 档位 | 何时 | 回答 |
| --- | --- | --- | --- |
| 合法性 | local | 总是 | 这串字符在各注册表是不是合法名字 |
| 常用词 | local | 总是 | 它是不是一个高频英语词（Prior P1） |
| 本地索引 | local | 总是 | 本地索引里有没有归一化撞名 |
| 注册表 | free | 总是 | npm / PyPI / crates.io 精确查询 → **Availability** |
| 同名邻域 | free | 总是 | npm 搜索里有多少相关结果 → **Searchability** |
| 归一化撞名 | ratelimited | 打正档之后 | 枚举归一化等价串逐个查 → **Publishability** |
| GitHub | ratelimited | 打正档之后 | 多少仓库带这个词，最显眼的是谁 |
| 域名 | ratelimited | 打正档之后 | .com / .dev / .io 的 RDAP 记录 |

加一项检查 = 往 `server/checks/index.ts` 的 `CHECKS` 里 push 一个对象。
UI 不需要改：印章、颜色、档位说明、详情卡片都是从这个清单渲染出来的。

**关于结论的措辞。** 精确查询没命中，系统说的是「查无记录」，永远不说「可用」。
注册表比对的是归一化之后的形式：npm 去掉所有非字母数字，所以 `react-native`
存在就意味着 `reactnative` 注册不上；PyPI 先 PEP 503 再折叠 o→0 l→1 i→1，
所以 `lion` 会挡住 `l10n`；crates.io 把 `-` 和 `_` 当同一个字符。
Availability 是弱结论，Publishability 严格强于它，Searchability 与两者正交。

#### 关于本地索引的取舍

要真正回答 Publishability，需要一份注册表全量名字的本地索引 —— 归一化之后建表，
0 ms 就能答「有没有别的名字折叠到同一个形式」。全量 dump 是几百 MB 的下载，
对一个「装上就能用」的工具来说太重，所以默认不下。

代替它的是**有界探测**：`collisionCandidates()` 枚举实际会发生的两种撞名形状
—— 在词素边界插分隔符，以及 PyPI 的混淆字形折叠 —— 每家注册表取前 28 个变体
（PyPI 取 40，因为字形折叠的组合更多），滤掉本来就不合法的，剩下的逐个问过去。
这不是完备的，但它覆盖了真实世界里几乎所有的撞名，代价是几十次 HEAD 请求，
且只在你给出正面 Verdict 之后才跑。

同时，应用**每收到一次注册表回答就折回本地索引**，所以它越用越快、越用越准。
想要完备性可以随时补上全量：

```bash
node --experimental-strip-types scripts/build-index.ts npm
node --experimental-strip-types scripts/build-index.ts pypi
node --experimental-strip-types scripts/build-index.ts crates data/crates.csv
```

### Verdict 与品味

打档是 `▼▼ ▼ · ▲ ▲▲`（-2…+2）。这是**唯一**的信号来源 —— 没有偏好表单，
没有「选择你喜欢的风格」。系统从你的点击里推断一份 **Taste Profile**：
哪一族在起作用、你点赞的名字平均多少音节、是真词还是生造词、你自己写的备注。
每一条都带着它依据的样本量（`n=`），并且默认藏起来 —— 按 `T` 才看得到。

它只属于这次会话，随时会被下一个 Verdict 推翻。负分的 Strategy **不会被封掉**，
只是权重下调：第一眼的反应是好名字的劣质预测器（HN 1523310），
所以任何东西都不能被永久关死。

### 内置倾向（Prior）

九条从命名语料里推出来的软性倾向，按 `P` 打开档案。每一条都摊开给你看：
陈述、证据强度（strong / moderate / thin / contradicted）、原始证据、
**什么情况下它对你不成立**，以及它进 prompt 时的那一句原话。

其中四条默认开启且可关。另外几条是刻意留着的反例 —— 比如
「`-ify` / `-ly` / 去元音这类套路后缀不减分」和「名字长度不作为筛选依据」
被语料推翻了，写在档案里是为了说明系统里为什么**没有**这些规则。
还有一条「系统不对候选名给出好坏结论」是架构约束，关不掉。

---

## 界面

深墨底（`#08090C`），暖羊皮纸字（`#EFE7D8`）。黄铜色（`#D9A441`）只有一个含义：
**你喜欢这个**。铜绿是通过，铁锈是已占用，紫色是概率与罕见度。
Fraunces 写名字，Inter 写界面，JetBrains Mono 写技术事实。

生成要 3–10 秒，所以它永远在后台跑：织机上的线在织，幽灵卡片占着位置，
被丢弃的计数在跳，名字到一个贴一个。没有 loading 遮罩，没有「请稍候」。

### 键盘

| 键 | |
| --- | --- |
| `J` `K` `↑` `↓` | 在候选之间移动 |
| `1`–`5` | 打档 ▼▼ ▼ · ▲ ▲▲，打完自动跳下一个 |
| `↵` | 打开详情 |
| `N` | 写备注 |
| `G` | 再来一批 |
| `/` | 筛选 |
| `T` | 品味档案 |
| `P` | 内置倾向 |
| `⌘K` / `Ctrl+K` | 命令面板 |
| `?` | 快捷键 |
| `Esc` | 取消焦点 / 关掉面板 |

---

## 代码地图

```
server/
  main.ts              Express 5，/api 之下的全部路由 + dist/ 静态托管与 SPA 回退
  db.ts                node:sqlite，建表语句就是数据模型
  store.ts             Session / Candidate / Batch 的读写
  events.ts            SSE 事件联合类型 + 400 条重放缓冲（Last-Event-ID）
  llm.ts               provider 适配；createOpenAI 而不是 createOpenAICompatible
  naming/
    strategies.ts      29 条 Strategy，六族
    priors.ts          P1–P9，连证据一起
    generate.ts        streamObject({output:'array'}) → elementStream，到达即判阈值
    taste.ts           从 Verdict 推 Taste Profile
  checks/
    index.ts           CHECKS 清单与调度
    normalize.ts       三家注册表的归一化规则与 collisionCandidates()
    local.ts           0 ms 档：合法性 / 常用词 / 本地索引
    registry.ts        Availability 与 Publishability
    reach.ts           同名邻域 / GitHub / 域名
web/
  store.ts             useAtelier()：全部状态 + EventSource + hash 路由
  api.ts  types.ts     线上契约的客户端镜像
  normalize.ts         归一化规则的客户端回声（详情面板里展示用）
  components/          Workspace / CandidatePlate / Drawer / CommandPalette / …
  styles.css           设计系统：token、氛围层、印章、刻度盘、抽屉
scripts/
  build-index.ts       全量 dump → 本地索引
bin/nomothete.js       CLI 入口
```

### HTTP

```
GET    /api/bootstrap                    strategies / families / priors / checks / provider / sessions
GET    /api/sessions                     列表（带候选数与心动数）
POST   /api/sessions                     新建，默认立即开跑
GET    /api/sessions/:id                 session + candidates + batches + running + profile
PATCH  /api/sessions/:id                 改标题 / 简介 / priors / 阈值
DELETE /api/sessions/:id
POST   /api/sessions/:id/generate        {width?, strategyId?}
POST   /api/sessions/:id/cancel
GET    /api/sessions/:id/taste
GET    /api/sessions/:id/stream          SSE，支持 Last-Event-ID 重放
POST   /api/candidates/:id/verdict       {verdict: -2..2}
POST   /api/candidates/:id/note
POST   /api/candidates/:id/recheck
GET    /api/sessions/:id/export?format=json|md
```

---

- [CONTEXT.md](./CONTEXT.md) — 范围与术语
- [docs/design.md](./docs/design.md) — 设计决策
