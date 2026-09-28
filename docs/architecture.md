# 代码地图与线上契约

代码在哪、接口长什么样。**为什么**这么设计在 [`design.md`](./design.md)，
术语在 [`CONTEXT.md`](../CONTEXT.md)，开关在 [`configuration.md`](./configuration.md)。

## 地图

```
server/
  main.ts              Express 5，/api 之下的全部路由 + dist/ 静态托管与 SPA 回退
  db.ts                node:sqlite，建表语句就是数据模型
  store.ts             Session / Candidate / Batch 的读写
  events.ts            SSE 事件联合类型 + 400 条重放缓冲（Last-Event-ID）
  llm.ts               provider 适配；createOpenAI 而不是 createOpenAICompatible
  env.ts               NOMOTHETE_ 前缀优先，无前缀兜底
  envfile.ts           .env 的合并写入（只动自己那几行），三个配置入口共用
  setup.ts             首次启动的三个问题；无 TTY 时跳过而不是卡住
  settings.ts          界面可改的全局开关（存 SQLite，不受模型配置锁定）
  naming/
    strategies.ts      29 条 Strategy，六族
    priors.ts          P1–P9，连证据一起
    generate.ts        streamObject({output:'array'}) → elementStream，到达即判阈值
    taste.ts           从 Verdict 推 Taste Profile
  checks/
    index.ts           CHECKS 清单与调度
    normalize.ts       三家注册表的归一化规则与 collisionCandidates()
    local.ts           0 ms 档：合法性 / 本地索引
    registry.ts        Availability 与 Publishability
    reach.ts           同名邻域 / GitHub / 域名
  verify/              取义说明核查，与 checks/ 分开存、分开显示
    index.ts           队列、去重、取消与核查流程
    research.ts        模型选择搜索、阅读和翻页；工具记录来源与用量
    keenable.ts        Keenable 免 key 的 search / fetch，自带限速
    judge.ts           提取事实、对照证据判断；来源 ID 关联
    store.ts           结果与检索过程持久化；进行中只记在内存
web/
  store.ts             useAtelier()：全部状态 + EventSource + hash 路由
  api.ts  types.ts     线上契约的客户端镜像
  normalize.ts         归一化规则的客户端回声（详情面板里展示用）
  components/          Workspace / CandidatePlate / Drawer / CommandPalette / …
    Settings.tsx       端点 / 模型 / 钥匙；钥匙那格只写不读
  styles.css           设计系统：token、氛围层、印章、刻度盘、抽屉
scripts/
  build-index.ts       全量 dump → 本地索引
bin/nomothete.js       CLI 入口：定数据目录，先问（setup.ts），缺 dist/ 就构建，再起 main.ts
```

加一项检查 = 往 `server/checks/index.ts` 的 `CHECKS` 里 push 一个对象。
UI 不需要改：印章、颜色、档位说明、详情卡片都是从这个清单渲染出来的。

## HTTP

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
POST   /api/candidates/:id/verdict       {verdict: -2..2}；正档同时请求取义核查（已有结果则复用）
POST   /api/candidates/:id/note
POST   /api/candidates/:id/recheck       限速档检查 + 重新核查取义说明
GET    /api/sessions/:id/export?format=json|md
GET    /api/config                       当前来源与去向；钥匙只回末四位
PUT    /api/config                       {baseURL?, model, apiKey?, reasoningEffort?}
                                         写 .env 并即时生效；apiKey 留空 = 不动原来那把
POST   /api/config/test                  向端点要一次 /models，确认钥匙与模型 id
GET    /api/settings                     {autoVerify}
PUT    /api/settings                     {autoVerify: boolean}；关掉时取消排队和进行中的核查
```

候选的 `verification` 字段是取义核查的结果，`null` 表示没核查过：
`pending`、`done`（逐条 `supported` / `contradicted` / `insufficient` / `failed`，附来源 URL 与原文摘录）、
`failed`（没有一条说法检索成功，或模型没答上来）。排队已满时返回一个不入库的 `failed`，
同时发 `notice`；候选已有结果时保留原结果，只发 `notice`。状态变化走 SSE 的 `verification` 事件。
Markdown 导出带上每条核查结论和来源链接。

绑在回环上时，所有 `/api` 请求都要带本机的 `Host`
（见 [`configuration.md` § 监听地址](./configuration.md)）。

## 运行期的几个数字

**一批的生死由沉默判定，不由时长判定。** 线上每来一个字节，计时就重置。
推理模型可以先想一分钟再写第一个字，按经过时间砍它等于扔掉正在正常到达的东西。
只有 90 秒一个字节都没有才算停住，另有 10 分钟的上限兜底。
一批要是回来一个空数组（代理的结构化输出半残时的常见症状），
会重试至多三次，仍然空才报失败 —— 空画布和一句「+0」是两回事。

**SSE 重放缓冲 400 条。** 断线重连带 `Last-Event-ID`，中间漏掉的事件补发。

**限速档的检查只在正面 Verdict 之后跑。** 归一化撞名一次要几十个 HEAD 请求，
对每个到达的候选都跑一遍会在第一批就撞上注册表的限速。

**取义核查只在请求时跑，每一步都有上限。** 触发点是正面 Verdict 或重新检查，新生成的名字不核查。
同时最多跑 2 个，队列最多 20 个；每次至多 8 次搜索、8 次页面读取、10 轮研究调用。
页面按偏移量读取，每段至多 8,000 字符、合计 48,000 字符；一次抓取至多 40,000 字符。
每个网络请求 12 秒、提取和判定各 60 秒、整次 3 分钟超时。
同一个候选同时只有一个任务，已完成的结果在再次点赞时复用，重新检查才刷新。

模型提取独立的事实说法，自行选择查询、词典、原文拼写、转写和页面读取。
命名手法的名称与简介随说明传入，供模型识别语言和语境。
研究结束后，判定模型依据已读取的正文逐条判断支持、矛盾或尚未确认，并写出具体原因。
提示词要求区分同形词和不同词义，保留影响真假判断的细节，优先引用词典、学术和机构资料。
搜索摘要只供研究使用；引文来自已读取正文。代码按来源 ID 关联检索返回的 URL，缺少有效来源的确定结论记为 `failed`。
不匹配模型的文字来筛选搜索结果、截取语义段落、判断引用或改写结论。

工具失败会交给模型判断影响范围；完全没有读到资料且工具报错时，整次核查记为 `failed`。
模型中途返回空响应时保留已有工具结果续接一次，共用原来的时间和次数额度；再次为空则记录调用失败。
提取结果、搜索、阅读、研究笔记和最终判定存入 `verification_traces`，随候选删除，供复查具体遗漏。
核查结果和检索过程不进 Taste Profile，也不进生成 prompt。

## 本地索引的取舍

要真正回答 Publishability，需要一份注册表全量名字的本地索引 —— 归一化之后建表，
0 ms 就能答「有没有别的名字折叠到同一个形式」。全量 dump 是几百 MB 的下载，
对一个「装上就能用」的工具来说太重，所以默认不下。

代替它的是**有界探测**：`collisionCandidates()` 枚举实际会发生的两种撞名形状
—— 在词素边界插分隔符，以及 PyPI 的混淆字形折叠 —— 每家注册表取前 28 个变体
（PyPI 取 40，因为字形折叠的组合更多），滤掉本来就不合法的，剩下的逐个问过去。
这不是完备的，但它覆盖了真实世界里几乎所有的撞名。

同时，应用**每收到一次注册表回答就折回本地索引**，所以它越用越快、越用越准。
想要完备性可以随时补上全量：

```bash
node --experimental-strip-types scripts/build-index.ts npm
node --experimental-strip-types scripts/build-index.ts pypi
node --experimental-strip-types scripts/build-index.ts crates data/crates.csv
```
