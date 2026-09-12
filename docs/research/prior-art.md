# 既有方案调研

> 调研日期 2026-09-11。§4 的端点行为由调研者当场 curl 验证，非抄自文档。
>
> **来源可靠性**：学术引用（arXiv / ACL / ICLR / CHI / LREC）与注册表端点行为可靠。
> 工具评测类多为 SEO 内容农场或竞品自办基准，仅作方向性参考，已在文中标注。
>
> **后续修正**：§2 后缀黑名单与隐喻家族两条，已被 [naming-corpus.md](./naming-corpus.md) 推翻。现行 Prior 以语料研究为准。

## 1. 现有工具 — 失败模式

**Namelix**（namelix.com，约 87.8 万月访问，Brandmark 出品）。输入：关键词 + 风格开关（brandable-invented / compound / alternate-spelling / real-word）+ 长度 + 随机度滑条。方法：在品牌名语料上自训的生成模型（不是通用 LLM）；从你的收藏里学习。输出：名字网格 + 自动 logo 预览 + 行内 .com 检查。

- **F1 Availability 错觉。** 一家竞品用默认设置跑了 138 个 Namelix 名字，精确 .com 已注册占 42%，密集品类最差（47%）；被占的名字集中在*最自然*的那些建议里（namemy.app/blog/we-checked-138-namelix-names — 厂商自办、自利，仅作方向）。另一份对比把 Namelix 的 .com Availability 标在约 30%。
- **F2 零商标筛。** 评测一致确认：Atom、Namelix、Shopify、Wix、Looka 全部跳过商标（gautamkhorana.com/blog/atom-vs-namelix-vs-shopify-business-name-generator-comparison/）。
- **F3 两个字段，没有细度。** 没有语气、行业句子、故事栏。用数量补理解（genname.io/blog/genname-vs-namelix）。
- **F4 同质。** 用户原话："many names suggested felt similar. I expected more variety"（admin.aitools.xyz/tools/namelix/reviews）。
- **F5** 导向付费 Brandmark logo（$25–175）。

**Squadhelp → Atom.com**（2024 年改名）。众包起名竞赛（$299+）+ 精选溢价域名市场（$1k–50k，名字随 .com 走）+ AI 生成器 + 市场上架项的商标筛。失败模式是商业的：竞赛跑了 10 天，买家付了 $645，短名单空的，不能延期；$1,200 花掉，"most basic logos and names possible"；创作者抱怨分成打击投入 → 低质量稿件（smartcustomer.com/reviews/atom.com）。

**Looka** — 名字+logo 打包，不做 Availability 检查。
**Brandroot / BrandBucket** — 精选现成溢价域名市场；买库存，不生成。
**Namechk / Panabee / NameMesh** — 账号名扫一遍；NameMesh 是纯词表重组（SEO/short/new/similar 桶），没有语义。

**namae**（github.com/uetchy/namae，713★，namae.dev）— 典型的*检查器*：一个字符串进去，并行查域名 / GitHub / npm / 注册表 / 社交。完全不生成。

**2026 CLI 浪潮** — dibs、namescout-cli、namera、namescope、availify、name-probe。全部 Availability 优先。值得看的两个：

- **namescope**（github.com/ensp1re/namescope）：确定性*本地*生成（复合、前缀、后缀、混成）→ RDAP / npm / PyPI / crates / GitHub 检查 → 加权维度打分 → 人读 / JSON / Markdown / **MCP** 输出。明确 **不用 LLM**。结构上最接近 Nomothete 的算法半边。
- **namera**（github.com/solozerolabs/namera）：本地带 1270 万条 USPTO 商标，精确+模糊匹配，按行业给打分档案，管道输出自动 JSON（"designed for Claude Code, Codex"）。

**Nomothete 能占住的缺口：** 以上全是一次性生成再检查。没有多轮对话，没有追究一个名字*为什么*成立，也没有检查真正挡住发布的注册表规则（见 §4）。

## 2. 分类与构词策略

**显著性谱系**（Abercrombie v. Hunting World, 537 F.2d 4；TMEP 1209.01(a)，bitlaw.com/source/tmep/1209-01-a.html；inta.org/fact-sheets/trademark-strength/）。最弱 → 最强：

1. **Generic** — 永远不能注册。`database`、`package manager`
2. **Descriptive** — 需要第二含义。`TypeScript`、`SQLite`、`PostgreSQL`
3. **Suggestive** — 需要想象力；本身具有显著性。`Docker`、`Terraform`、`Netflix`
4. **Arbitrary** — 真词，与领域无关。`Python`、`Rust`、`Apache`、`Elm`
5. **Fanciful/coined** — 生造。`Kodak`、`Xerox`、`Hadoop`、`Zig`

开发者工具起名的实用判断：**arbitrary 是最便宜的强档** — 商标强度完整，没有生造的怪感，但 .com 一定没了。**Fanciful 是 Availability 和显著性对齐的唯一一档。**

**构词策略。** 依据 Özbal / Strapparava / Guerini, "Brand Pitt: A Corpus to Explore the Art of Naming," LREC 2012（lrec-conf.org/proceedings/lrec2012/pdf/679_Paper.pdf）— 1000 个名字按语言手法标注；加上标准英语构词（Plag 等）。一份 50 个全球品牌的语料研究给出复合 44%、生造/缩写 26%、混成 24%、纯派生 6%（jurnal-lp2m.umnaw.ac.id — 低档期刊，仅作方向）：

| Strategy | 软件例子 |
|---|---|
| **Compounding** | Firebase, Bitbucket, SoundCloud |
| **Blending / portmanteau**（A 的头 + B 的尾） | Netflix（net+flicks）, Docusaurus（docs+dinosaur）, Pinterest |
| **Clipping** | MongoDB（←humongous）, Vue（←view）— *干净的开发者例子薄* |
| **Affixation / productive splinters** | -ify: Spotify, Shopify, Netlify · -ly: Bitly, Grammarly · -r: Flickr, Tumblr。**已修正**（[naming-corpus.md](./naming-corpus.md) §3(a)、P6）：开发者语料中该禁忌不成立，不能做后缀黑名单。 |
| **Greek/Latin root composition** | Kubernetes（κυβερνήτης, helmsman）, Terraform（terra+form）, Prometheus |
| **Mythological / literary borrowing** | Kafka, Cassandra, Argo, Hydra |
| **Foreign borrowing** | Ubuntu（Nguni）, Anki（暗記, memorization）, Vue（法） |
| **Deliberate misspelling** | Flickr, Lyft, Digg, Nginx（"engine X"） |
| **Acronym→word** | Redis（REmote DIctionary Server）, YAML, LAMP |
| **Anagram / reversal** | Deno（←Node）, Bazel（←Blaze） |
| **Phonestheme / sound symbolism** | zip-、snap-、gl-（glow/glimmer）: Snap, Zip, Swift |
| **Extended metaphor family** | Docker→Helm→Tiller→Harbor（航海）。**已修正**（[naming-corpus.md](./naming-corpus.md) §3(c)、P7）：对多组件生态有协调价值；对单个新项目会加剧撞名。 |
| **Reduplication** | TikTok。**thin** — 开发者工具里几乎没有。 |

## 3. 核心问题 — LLM 套话坍缩

### (a) 有没有文献

*学术上有，作为 mode collapse。*

- **Verbalized Sampling**（arXiv 2510.01171, Zhang/Yu/Chong/Manning/Shi）把根因标成偏好数据里的 **typicality bias**：标注者系统性偏好熟悉文本，RLHF 把模型推向众数。
- **Generative Monoculture**（ICLR 2025, proceedings.iclr.cc/paper_files/paper/2025/file/5178b2f2d7c44aa390c0777dc77b3f0c-Paper-Conference.pdf）— 关键一篇：*"simple countermeasures such as altering sampling or prompting strategies are insufficient."* **调高温度解决不了。**
- Mohammadi, "Creativity Has Left the Chat"（arXiv 2406.05587）：对齐后的模型 token 熵更低，嵌入空间里挤成一团，被吸向 "attractor states"。

*起名本身 — 只有业界证据，没有同行评审研究。*

- Prequel 拿同一份 PE 公司 brief 喂给 ChatGPT / Claude / Gemini 和若干生成器；词库全一样 — Summit, Ridge, Crest, Stone, Apex, Pinnacle, Bridge + "Capital"/"Partners" — 并声称**全部**没过 35/36 类的初步商标筛（prequel.substack.com/p/we-asked-ai-to-name-a-private-equity）。换 HVAC brief 再来一次：每次都是 `[气候词] + [正向修饰] + Solutions`。
- River+Wolf（riverandwolf.com/further-out-and-deeper-in-why-generative-ai-struggles-with-brand-naming/）发现 ChatGPT 和 Corsearch 的生成器强迫症式地吐 **CamelCase 头韵复合**（SynthoMind Solutions, CogniCreate Labs, VirtuVerse AI），并且**两次无视了明确的「不要头韵」指令**。
- Tanj 把机制叫 "linguistic averaging"；输出集 Flux/Pulse/Nexum/Atlas/Axera/Vectra。
- 具体的 `-ly/-ify/Forge/Flow/Hub` 清单：作为有文献记载的发现是 **thin**，从业流程里倒是能见到后缀黑名单。

### (b) 据称有效的做法

1. **Verbalized Sampling** — 要 k 个候选，*每个带模型自报概率*，减轻只吐那个典型答案的压力。创意写作上多样性 1.6–2.1×，安全/准确不掉；**越强的模型收益越大**。用法：要 20 个名字，附 "probability a naming consultant would propose this"，然后**收低概率那截尾巴**。
2. **普通人设**（arXiv 2602.20408, Deng/Brucks/Toubia）。两个机制：*fixation*（先出来的约束后面的）— 用 CoT 解；*knowledge partitioning*（LLM 聚成一个分布，人各自占一块区域）— 用**普通**人设当采样线索。"Creative entrepreneurs such as Steve Jobs" **有害**。两项合起来多样性超过人类。
3. **用生料打破 cold start。** Ghods 等（a-menon.github.io/assets/pdf/LLMHomogenization.pdf）：相对人类语料可测到的同质化，**只要给 LLM 一点点上下文就消失** — 被写成 cold-start 问题。**对混合设计最硬的已发表支持**：算法生成的词料正好是化开坍缩的那点种子。
4. **锚定任务的功能多样性**（Meta FAIR, arXiv 2509.21267）：多样性定义在任务真正在乎的轴上（起名是*构词策略*和*源语义场*），并按这个轴采样。功能多样性提高时，未出现常说的质量折损。
5. **先大量生成再按显式分数重排。** Hiranandani / Maneriker / Jhamtani, "Generating Appealing Brand Names"（arXiv 1706.09335, Adobe/CMU）：按可读、可发音、记忆点、独特性排序；MTurk 评估同时超过先前方法和招募来的人。前 LLM 时代，打分维度仍能用。
6. **正向策略约束优于负向禁止。** 有人拿 HVAC brief 加了 "avoid generic names and the stated formula" 重跑，得到 Plenum, VaneGrid, Dampr（n=1，LinkedIn 评论）。River+Wolf 的机器人无视负向约束。把模型绑到具名策略（「从冶金学取拉丁词根」）。

### (c) LLM 当名字评审

**没有起名专项研究（thin）。相邻文献不乐观：**

- Chakrabarty 等，CHI 2024（TTCW）：**"none of the LLMs positively correlate with the expert assessments."**
- LitBench（EACL 2026）：现成最好的裁判（Claude 3.7 Sonnet）与人类偏好一致率 **73%**；训过的 Bradley-Terry / 生成式奖励模型 78%。
- arXiv 2608.23705（Tutone / Franceschelli / Musolesi）：LLM 裁判**系统性偏好 AI 生成文本超过人类**，偏爱它自己的文体签名。直接后果：**天真的 LLM 裁判会优先给套话名开绿灯。**
- Lyu 等 2026（alphaxiv.org/abs/2607.22218）：LLM 裁判用的人类标准子集*更窄* — 在**新颖性**上与人收敛，在**语境**维（社会/市场/声誉）上分开，对能实测改变人类打分的语境不敏感。适合问新颖、发音；市场落地不可靠。
- 自我偏好偏差（Panickssery 等）：裁判偏爱自己生成的东西。生成和评审用不同模型；成对比较并交换位置。

**两件能直接用的成品：**

- **NAMeGEn**（arXiv 2511.15408）— 多代理抽目标 → 生成 → 评估，给中文起小名，无训练超过六个基线。结构上已发表作品里最接近 Nomothete。
- **Label-Free Distinctiveness**（ACL NLLP 2025, aclanthology.org/2025.nllp-1.8.pdf）— 用合成锚点打连续 Abercrombie 分，相对 95 个专家标注商标 Spearman ρ=0.718，有 Streamlit demo。即插即用的名字打分器。

## 4. Availability API

状态码全部于 **2026-09-11 用 curl 验证**。模式一律 200 = 已占用，404 = 空闲。

| 注册表 | 端点 | 鉴权 / 限额 |
|---|---|---|
| npm | `GET https://registry.npmjs.org/<name>`（scoped: `/@scope%2Fname`） | 无；CDN 前置，无文档化限额；HEAD 可用 |
| PyPI | `GET https://pypi.org/pypi/<name>/json` 或更轻的 `GET https://pypi.org/simple/<name>/` | 无 |
| crates.io | `GET https://crates.io/api/v1/crates/<name>` | **必须带描述性 User-Agent 和联系方式 — 空 UA 返回 403（已验证）**；爬虫政策约 1 req/s |
| RubyGems | `GET https://rubygems.org/api/v1/gems/<name>.json` | 无；按 IP 限速 |
| GitHub repo | `GET https://api.github.com/repos/<owner>/<repo>` | 未认证 60/时/IP，带 token 5000/时 |
| GitHub user/org | `GET https://api.github.com/users/<name>` — 用户和组织共用一个命名空间 | 同上 |
| Docker Hub | `GET https://hub.docker.com/v2/repositories/<ns>/<repo>/`（官方镜像: `library/`）；命名空间: `/v2/users/<name>/` | 公开读无鉴权；限额未文档化 |
| Homebrew | `GET https://formulae.brew.sh/api/formula/<name>.json` | 无 |

**GitHub 坑：** 改过名的仓库返回 **301，不是 404** — `facebook/react` → 301（已验证）。把 301 当已占用，否则会把重定向报成可注册。

### 最要紧的陷阱：404 ≠ Publishability

**npm** 会剥标点，再和每个已有名字比对。因为存在 `react-native`，不能发 `reactnative`、`react_native`、`react.native`；因为存在 `jsonstream`，`json-stream` 被拦（blog.npmjs.org/post/168978377570/new-package-moniker-rules）。发布在最后一步失败，`403 E403 Package name too similar to existing packages`。实录：`react-application` 被 `reactapplication` 挡住（github.com/npm/npm/issues/19438）；`md-render` 被 2013 年废弃的 `mdrender` 挡住，当时 `npm view` 已经 404、npmjs.com 什么都没有、`--dry-run` 也过了。2017 年那篇博客是唯一文档，而且**不完整** — 新名和旧名都会被归一化，不只是新名。缓解：同时查剥标点后的形式，或用 `validate-npm-name`（会拉约 150MB 全量名字表）。

**PyPI 更狠，源码里写全了。** Warehouse 的 `check_project_name` 过四道门：PEP 503 规范化 → 禁止标准库模块名 → **`ultranormalize_name`** → 对高依赖语料做 typosquat 检查。Ultranormalize 映射 `o/O→0`、`l/L/i/I→1`，剥 `. _ -`，转小写。所以 **`l10n` 被 `lion` 挡住**（github.com/pypi/warehouse/issues/11139）。失败信息是 `400 The name '...' is too similar to an existing project`，PyPI **拒绝告诉你是哪个项目**（warehouse#17375，closed not-planned）。完整算法逆向见 jslazak.com/reverse-engineering-package-name-validation-on-pypi/。**在本地对 `https://pypi.org/simple/` 的全量名字表重实现 ultranormalize — 这是真正的差异点；现有工具都没做。**

**crates.io** 把 `-` 和 `_` 当等价，且大小写不敏感，所以 `my-crate` 和 `my_crate` 冲突。

### 域名 — 用 RDAP，不用 WHOIS，不用 DNS

- **DNS 回答的是「能不能解析」。** 已注册但停着的域名没有 A 记录，会被读成可注册。namescout-cli 带着这个 bug："redis.dev available — No DNS record found."
- **WHOIS 已弃用**；ICANN 日落之后 gTLD 注册局改走 RDAP。
- **`GET https://rdap.org/domain/<name.tld>`** — 免费、无鉴权，是一个**引导重定向器**（302 → 权威注册局服务器），所以要跟重定向（`curl -sL`）。已验证：`google.com` → 200；未注册的 `.com` 和 `.dev` → 404。
- **404 有歧义**：「未注册」或者「rdap.org 没有这个 TLD 的服务器」。先拿 TLD 去对 IANA 引导注册表 **`https://data.iana.org/rdap/dns.json`**（已验证 200，可缓存），然后再把 404 读成空闲。RFC 7484（引导）、RFC 9082（查询格式）、about.rdap.org。
- ccTLD 是软肋 — 几个开发者常用的（.ai、.co，历史上的 .io）RDAP 残缺或缺失。需要按 TLD 做回退。

### 商标 — 没有免费免鉴权的选项

- **USPTO：** 旧的 `tmsearch.uspto.gov/api-v1-0-0/tmsearch` **404**（已验证）。TSDR / Trademark Enterprise API 需要从 USPTO API Manager 拿 key，请求头 `USPTO-API-KEY: <key>`；**60 次/分**（低峰 120，美东 22:00–05:00），PDF/ZIP **4 次/分**。CLI 更好的做法是 USPTO **批量数据 → 本地语料加模糊匹配**（namera 用这个办法带了 1270 万条）。
- **EUIPO：** Developer Portal 注册 → OAuth2；**同时**发 `Authorization: Bearer <token>` **和** `X-IBM-Client-Id: <client_id>`；默认约 25000 次/天。
- **法律口径：** 表述为「检索未发现冲突」，见 CONTEXT.md **Clearance**。
