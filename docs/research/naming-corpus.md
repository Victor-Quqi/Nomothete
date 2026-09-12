# Naming Corpus Study

> 调研日期 2026-09-11。本文为 CONTEXT.md 中 **Prior** 一条提供语料依据。
>
> **本文的立场**：不试图建立"好名字"的标准。Verdict 是最终且唯一标准。本文只回答一个更窄的问题 ——
> **当开发者自发地夸奖或批评一个软件项目名时，他们实际上在夸什么、骂什么？** 这些统计倾向可以作为 Prior，
> 但每一条都必须能被用户当场推翻，且必须能连同下面的证据一起展示给用户看。
>
> **证据强度标签**：全文对每条结论标注 **strong / moderate / thin / contradicted**。
> 标 thin 的地方是真的薄，不作为默认审美。

---

## 0. TL;DR

1. **`-ify` / `-ly` / `-r` 后缀被开发者讨厌** —— **contradicted**。在 117k 次提及中，
   这类名字的"名字评价"出现率与对照组几乎相同（0.19‰ vs 0.18‰），且褒贬比更好（16:6 vs 60:31）。
   这条 folklore 的出处是命名咨询公司的营销内容，不是开发者社区。用户的质疑是对的。
2. **开发者真正抱怨的是"搜不到 / 撞名"**。
   "unsearchable"+"hard to google"+"ungoogleable"+"impossible to google" = 1075 条，超过 "terrible name"（924）。
   "already taken" 5473 条，是命名话题里最高频的单一抱怨。
3. **通用英语词（Abercrombie generic 档）是唯一一个统计上强的负向信号**：
   被夸的 47 个名字里 0 个是 generic 档，被骂的 37 个里有 9 个（Fisher p=0.00034）。
4. **"名字要短（5–8 字符）"没有区分力** —— **contradicted as a discriminating prior**。
   被夸名字的长度中位数是 7，GitHub 高星单词仓库名的中位数也是 7（p=0.31）。短是这个物种的普遍特征。
5. **同一个名字被完全相反地评价**是常态，而且经常发生在同一个帖子里（GIMP、Heroku、Autopilot、Bard）。
   这是 CONTEXT.md 里 Verdict/Prior 分工的最强经验证据。

---

## 1. SOURCING

### 1.1 主要工具：HN Algolia 全量评论检索

对 Hacker News 全部评论历史做短语精确计数。

```
https://hn.algolia.com/api/v1/search?advancedSyntax=1&tags=comment&query=<urlencoded>
```

**必须带 `advancedSyntax=1` 并给短语加引号**，否则返回的是 OR 式分词匹配，计数无意义
（未加时 `worst named` 返回 20925，加后返回 31）。

**仪器校验**（做了才敢用）：

| 校验项 | 结果 | 说明 |
|---|---|---|
| `"ify"` vs `"Spotify"` | 680 vs 46964 | 分词按标点切分，后缀不是独立 token —— 所以"后缀被单独讨论"可以被直接计数 |
| `"cache invalidation"` | 1923 | 已知高频梗，量级合理 |
| `"bikeshedding"` | 3277 | 同上 |
| `"naming things is hard"` | 333 | 同上 |

**已知污染，已排除**：

- `"aptly named"`(645) / `"well named"` / `"well-named"` 这一族看着诱人，读了一遍发现绝大多数在讨论
  **代码内标识符**（变量、函数、模块），不是项目名。CONTEXT.md 明确把代码内标识符划在范围外，全族排除。
  这条污染本身值得记一笔：命名讨论在开发者语料里天然偏向 identifier naming。
- `Rust` / `Zig` / `Make` / `Screen` / `Snap` / `Element` 等词的共现计数被普通英语用法严重污染
  （`Make` 出现在 85 个"名字评价"窗口里，绝大多数是动词 make）。这些行的**计数**一律丢弃，
  只保留人工读过、确认指向项目名的引用。

### 1.2 语料构建方式

对 8 组褒义短语和 8 组贬义短语各抓 4 页，抽取命中处 ±90 字符窗口，共 1716 个褒义窗口 + 1964 个贬义窗口，
再用一份约 450 个软件/技术名的人工清单去匹配窗口。最高质量的证据来自这几组短语，因为它们几乎必然指向"名字本身"：

| 短语 | nbHits | 用途 |
|---|---|---|
| `"best named"` | 33 | 最高信噪比的褒义证据 |
| `"worst named"` | 31 | 最高信噪比的贬义证据 |
| `"what a great name"` | 45 | 褒义 |
| `"such a great name"` | 43 | 褒义 |
| `"greatest name"` | 16 | 褒义 |
| `"best project name"` | 5 | 褒义，直接限定 project name |
| `"terrible name"` / `"stupid name"` / `"awful name"` / `"horrible name"` | 924 / 425 / 220 / 193 | 贬义主力 |

**选择偏差，必须大声说**：一个名字进入这个语料，是因为**有人特地评论了它的名字**。
这天然偏向古怪、可玩梗、有故事的名字。没人会去评论 "PostgreSQL 这个名字真好"，
所以"平淡但好用的名字"在本语料中系统性缺席。**本语料不能用来推断"什么名字最常见"，只能推断"什么名字会被夸/被骂"。**

### 1.3 Brand Pitt corpus (LREC 2012) —— 论文可下载，数据集不可

Özbal, Strapparava & Guerini, *BRAND PITT: A Corpus to Explore the Art of Naming*, LREC 2012.

- **论文**：https://aclanthology.org/L12-1395/ ，PDF 也在 http://www.lrec-conf.org/proceedings/lrec2012/pdf/679_Paper.pdf 。
  ELRA 会议集，ISBN 978-2-9517408-7-7。免费可下。
- **数据集**：**不可公开下载**。UKPLab/coling2016-marketing-blunders 仓库 README 写明
  "Please contact the authors if you want to use the BrandPitt corpus (Özbal et al., 2012) and our annotations for this corpus."
  没有声明开放许可。**结论：只能按引用使用其已发表统计量，不能拿来做训练/复现。**

论文中可直接引用的量（1000 个品牌名，3 名语言学家标注，冲突由第三人裁决）：

| 创意手法 | 语料覆盖率 |
|---|---|
| Plosives（爆破音 p/t/k/b/d/g） | 83–84.1% |
| Metaphor | 40%（文中 39.8%） |
| Functional Descriptive | 34% |
| Invented | 27% |
| Juxtaposition / Assonance | 各 20% |
| Consonance / Semantic | 各 18% |
| Founder Name | 17% |
| Clipping & Blending | 16% |
| Unusual/incorrect spelling | 13% |
| Acronym | 12% |
| Location | 10% |

**对 Nomothete 最有用的一条**：论文 §5 按业务域拆分后指出，**computing 域（占语料 17.5%，第二大域）
最常用的手法是 acronym + clipping/blending，而 rhyming 和 reduplication 在该域"完全没有被使用过"**
（原文 "for the computing domain, acronyms together with clipping and blending are the two most popular
devices whereas rhyming and reduplication methods have not been exploited at all"）。
对照表 4 的手法覆盖率：acronym 在 computing 域占 0.37、clipping&blending 占 0.34，
而两者在 food/beverage 域都很低。**这是一份独立的、非本文自产的证据，说明"取名手法有域特异性"。**

**必须打的折扣**：Brand Pitt 的 "success" 一栏是**3 名语言学家判断这个名字对该业务域是否成功**，
不是用户或市场数据。所以"reduplication 和 onomatopoeia 成功率最高、pure founder name 最低"这条
只能当作**语言学家的审美共识**，不能当作用户偏好。按 CONTEXT.md 的口径，那正是一种 Prior，不是 Verdict。

### 1.4 命名工艺文献中，被开发者主动引用的一篇

**Kevin Cox, "Good Names" (2021-03-23)**, https://kevincox.ca/2021/03/23/good-names/ 。
按重要性排序的三条：

1. **Be unique** —— 名字唯一就能查到文档，名字本身反而不那么重要了。
2. **Don't be misleading** —— 误导性的名字会一直造成混乱，直到读者去查文档（如果他肯查的话）。
3. **Be leading** —— 名字能提示功能是加分项，但排最后，因为"把有意义的信息压进一个名字里极其困难"，
   而且"项目会变，开工时贴切的名字到 1.0 时未必还贴切"。

**为什么这篇值得单独列**：它不是我挑的，是 HN 用户在讨论命名时**自己引用**的
（[32822674](https://news.ycombinator.com/item?id=32822674) 直接贴了这个链接，并说
"of course my ideal name would also give some hint about what it does (I think Google's BigTable may be
one of the best named products) but I think this is far less important than the other two requirements"）。
Cox 的排序和本文独立测出的抱怨分布是一致的：唯一性/可搜索性 >> 误导性 >> 描述性。

### 1.5 已排除的来源（内容农场与自利厂商内容）

以下都出现在检索结果里，**全部只作方向性参考或直接弃用**，不进入证据表：

- **Spellbrand / The Name Inspector / Brighter Naming / NameStation** —— "别用 -ify/-ly 后缀，太俗"这条
  folklore 的实际出处，全部是**卖命名服务的公司**。它们有直接的商业动机去把"自己起的名"和"套路名"对立起来。
  本文第 3 节用数据检验了这条主张，结论是 contradicted（对开发者受众而言）。
- **mend.io "Top 10 Weirdest Names For Open Source Projects"** —— 供应商 SEO 列表文，无出处、无方法。
- **reddit.sentinel-team.org 等 Reddit 镜像/爬虫站** —— exa 检索 r/programming 命名话题时返回的大量结果
  是这类快照站，内容与命名无关。**Reddit 侧三角验证失败，本文不包含 Reddit 证据，这是一个真实的覆盖缺口。**

### 1.6 待挖的批量清单（本轮只做了第一项）

| 来源 | 本轮状态 | 价值 |
|---|---|---|
| GitHub 高星仓库名（stars>60000，366 个） | **已用**，抓了 200 个建长度基线 | 提供"总体分布"对照，是判断某个 Prior 有没有区分力的必需品 |
| npm most-depended-upon | 未做 | 包名受全局唯一性硬约束，最贴近 Package Name 形态 |
| CNCF Landscape | 未做 | 隐喻家族命名（航海/希腊）密度最高的地方，可用来量化 §3(c) |
| Apache TLP 列表 | 未做 | 动物/神话名密集，且有正式的命名与商标流程 |
| EngineeringKiosk/OSS-Names | 未做（已定位） | 现成的开源项目**词源**索引，可省掉大量人工考据 |

---

## 2. ANNOTATION

114 行。维度按 `docs/research/prior-art.md` §2 的构词法分类 + Abercrombie 显著性谱系。

**Set 列**：
`P` = 有明确的、指向名字本身的褒义证据；
`D` = 有明确贬义证据；
`C` = 同时有褒有贬（**这一档本身就是结论**）；
`0` = 提及量很大但**找不到任何指向名字的评价**（后缀族大多落在这里），或仅作为词源参照点收录。

**Metaphor 列**：`transparent` = 看名字就能猜到隐喻指向（Docker、Bootstrap）；
`opaque` = 隐喻/词源存在但需要人告诉你（Kafka、Hadoop）；
`misleading` = 名字主动把人引向错误的理解（TeXmacs、GraphQL）。

**标注不是盲标**：我在知道一个名字属于哪个 set 的情况下给它打的 Abercrombie 档和 Metaphor 档。
所以"generic 全在 D 档"这类结论**部分是定义性的**（一个名字之所以被我判为 generic，
部分正是因为有人抱怨它搜不到）。这一条在 §4 里降级处理。

| Name | Set | Strategy | Syl | Chars | Etymology / source | Abercrombie | Form | Metaphor | Evidence (HN item id) |
|---|---|---|---|---|---|---|---|---|---|
| `xkcd` | P | deliberately meaningless letter string | 4 | 4 | chosen for having no meaning | fanciful | coined | opaque | [39621908](https://news.ycombinator.com/item?id=39621908) |
| `Polonius` | P | literary borrowing | 4 | 8 | Hamlet (the advice-giver) | arbitrary | real | opaque | [18302661](https://news.ycombinator.com/item?id=18302661) |
| `MIDIjourney` | P | pun-blend on an existing name | 4 | 11 | MIDI + Midjourney | fanciful | blend | transparent | [38616721](https://news.ycombinator.com/item?id=38616721) |
| `Alien Signals` | P | phrase borrowing | 4 | 12 | English phrase | arbitrary | real | opaque | [43775848](https://news.ycombinator.com/item?id=43775848) |
| `Great Firewall` | P | pun-blend on a landmark | 4 | 13 | Great Wall + firewall | fanciful | blend | transparent | [17726149](https://news.ycombinator.com/item?id=17726149) |
| `Terraform` | P | metaphor + Latin root compound | 3 | 9 | Latin terra + form; 1940s SF coinage | suggestive | real | transparent | [37581934](https://news.ycombinator.com/item?id=37581934) [37592062](https://news.ycombinator.com/item?id=37592062) |
| `BigTable` | P | functional-descriptive compound | 3 | 8 | big + table | descriptive | compound | transparent | [32822674](https://news.ycombinator.com/item?id=32822674) |
| `Exercism` | P | blend (word + suffix) | 3 | 8 | exercise + -ism | suggestive | blend | transparent | [22772164](https://news.ycombinator.com/item?id=22772164) |
| `Humanloop` | P | phrase clipping to compound | 3 | 9 | 'human in the loop' | suggestive | compound | transparent | [23989030](https://news.ycombinator.com/item?id=23989030) |
| `Instagram` | P | blend | 3 | 9 | instant + telegram | suggestive | blend | opaque | [29273035](https://news.ycombinator.com/item?id=29273035) |
| `Kilua` | P | blend on an existing name | 3 | 5 | kilo + Lua (fork of kilo) | fanciful | blend | opaque | [44040482](https://news.ycombinator.com/item?id=44040482) |
| `Clojure` | P | deliberate misspelling + embedded initials | 2 | 7 | closure, respelled to carry C/L/J | fanciful | coined | opaque | [43696819](https://news.ycombinator.com/item?id=43696819) [43696019](https://news.ycombinator.com/item?id=43696019) |
| `Racket` | P | real word + community pun | 2 | 6 | English racket / 'Racketeers' | arbitrary | real | opaque | [12056737](https://news.ycombinator.com/item?id=12056737) |
| `Firefox` | P | compounding (animal) | 2 | 7 | red panda 'firefox' | arbitrary | real | opaque | [7670236](https://news.ycombinator.com/item?id=7670236) |
| `Prolog` | P | clipping (foreign phrase) | 2 | 6 | fr. programmation en logique | suggestive | clipped | transparent | [24849323](https://news.ycombinator.com/item?id=24849323) |
| `Ruby` | P | real word (gemstone) | 2 | 4 | Latin rubeus | arbitrary | real | opaque | [1016814](https://news.ycombinator.com/item?id=1016814) |
| `Dropbox` | P | compounding | 2 | 7 | drop + box | suggestive | compound | transparent | [2153924](https://news.ycombinator.com/item?id=2153924) |
| `Bootstrap` | P | idiom borrowing / metaphor | 2 | 9 | English bootstrap idiom | suggestive | real | transparent | [12241300](https://news.ycombinator.com/item?id=12241300) |
| `Disqus` | P | deliberate misspelling | 2 | 6 | 'discuss' | suggestive | respelled | transparent | [16227](https://news.ycombinator.com/item?id=16227) |
| `StageFright` | P | phrase borrowing / pun on lib name | 2 | 11 | libstagefright + stage fright | suggestive | real | transparent | [9986929](https://news.ycombinator.com/item?id=9986929) |
| `Heartbleed` | P | coined compound | 2 | 10 | heartbeat extension + bleed | fanciful | compound | transparent | [7559440](https://news.ycombinator.com/item?id=7559440) |
| `Decker` | P | agentive -er affixation | 2 | 6 | HyperCard 'deck' + -er | suggestive | affixation | transparent | [40298013](https://news.ycombinator.com/item?id=40298013) |
| `batman` | P | pun on two command names | 2 | 6 | bat(1) + man(1) | arbitrary | real | opaque | [43632275](https://news.ycombinator.com/item?id=43632275) |
| `quick-scope` | P | jargon compound | 2 | 10 | FPS gaming term | suggestive | compound | transparent | [45799696](https://news.ycombinator.com/item?id=45799696) |
| `Haiku` | P | foreign borrowing (Japanese) | 2 | 5 | Japanese poetic form | arbitrary | real | opaque | [42954011](https://news.ycombinator.com/item?id=42954011) |
| `Sonnet` | P | literary-form borrowing | 2 | 6 | Italian sonetto | arbitrary | real | opaque | [42954011](https://news.ycombinator.com/item?id=42954011) |
| `Opus` | P | Latin borrowing | 2 | 4 | Latin 'work' | arbitrary | real | opaque | [42954011](https://news.ycombinator.com/item?id=42954011) |
| `Sea-thru` | P | pun + respelling | 2 | 7 | 'see through' | suggestive | respelled | transparent | [21998145](https://news.ycombinator.com/item?id=21998145) |
| `SPARCPlug` | P | pun-blend | 2 | 9 | SPARC ISA + spark plug | fanciful | blend | transparent | [40949739](https://news.ycombinator.com/item?id=40949739) |
| `Astal` | P | foreign borrowing (Hungarian) | 2 | 5 | Hungarian asztal = table | arbitrary | real | opaque | [41612717](https://news.ycombinator.com/item?id=41612717) |
| `Freshbooks` | P | compounding | 2 | 10 | fresh + books | suggestive | compound | transparent | [4413169](https://news.ycombinator.com/item?id=4413169) |
| `Cloudflare` | P | compounding | 2 | 10 | cloud + flare | suggestive | compound | transparent | [28582628](https://news.ycombinator.com/item?id=28582628) |
| `WordPress` | P | compounding | 2 | 9 | word + press | suggestive | compound | transparent | [47605858](https://news.ycombinator.com/item?id=47605858) |
| `Google` | P | deliberate misspelling | 2 | 6 | googol | fanciful | respelled | opaque | [46243970](https://news.ycombinator.com/item?id=46243970) |
| `Mongoose` | P | blend + animal | 2 | 8 | Mongo + Moose | fanciful | blend | opaque | [14958577](https://news.ycombinator.com/item?id=14958577) |
| `Timeframe` | P | compounding | 2 | 9 | time + frame (e-ink clock) | suggestive | compound | transparent | [47116378](https://news.ycombinator.com/item?id=47116378) |
| `Ghosting` | P | pun on product line | 2 | 8 | Ghost (CMS) + ghosting | suggestive | affixation | transparent | [25415248](https://news.ycombinator.com/item?id=25415248) |
| `Moby` | P | literary borrowing | 2 | 4 | Moby-Dick | arbitrary | real | opaque | [14160647](https://news.ycombinator.com/item?id=14160647) |
| `Steplist` | P | coined compound | 2 | 8 | step + list | descriptive | compound | transparent | [40237110](https://news.ycombinator.com/item?id=40237110) |
| `Bashtag` | P | pun-blend | 2 | 7 | bash + hashtag | fanciful | blend | transparent | [47531832](https://news.ycombinator.com/item?id=47531832) |
| `Bash` | P | acronym-to-word + pun | 1 | 4 | Bourne-again shell / 'born again' | arbitrary | real | opaque | [843527](https://news.ycombinator.com/item?id=843527) [48248435](https://news.ycombinator.com/item?id=48248435) |
| `Awk` | P | acronym (founder initials) | 1 | 3 | Aho, Weinberger, Kernighan | fanciful | coined | opaque | [46243970](https://news.ycombinator.com/item?id=46243970) |
| `Perl` | P | respelling + backronym | 1 | 4 | 'pearl' minus a letter | arbitrary | coined | opaque | [5490005](https://news.ycombinator.com/item?id=5490005) [9001510](https://news.ycombinator.com/item?id=9001510) |
| `Mint` | P | real word, double connotation | 1 | 4 | money mint + 'mint condition' | suggestive | real | transparent | [1747163](https://news.ycombinator.com/item?id=1747163) |
| `weld` | P | real word as metaphor | 1 | 4 | English weld (for a linker) | suggestive | real | transparent | [26236177](https://news.ycombinator.com/item?id=26236177) |
| `Skim.Me` | P | real word + TLD hack | 1 | 6 | English skim | suggestive | real | transparent | [5372642](https://news.ycombinator.com/item?id=5372642) |
| `jails` | P | metaphor, plain noun | 1 | 5 | BSD jails | suggestive | real | transparent | [15993084](https://news.ycombinator.com/item?id=15993084) |
| `Autopilot` | C | domain-metaphor borrowing | 4 | 9 | aviation autopilot | suggestive | real | transparent | +[23494199](https://news.ycombinator.com/item?id=23494199) [20555995](https://news.ycombinator.com/item?id=20555995) [20555961](https://news.ycombinator.com/item?id=20555961) / −[27370679](https://news.ycombinator.com/item?id=27370679) [33218892](https://news.ycombinator.com/item?id=33218892) |
| `Heroku` | C | coined blend | 3 | 6 | heroic + haiku (per founders) | fanciful | coined | opaque | +[4684876](https://news.ycombinator.com/item?id=4684876) / −[4685361](https://news.ycombinator.com/item?id=4685361) |
| `systemd` | C | compound + Unix daemon suffix | 3 | 7 | system + d | descriptive | compound | transparent | +[44989813](https://news.ycombinator.com/item?id=44989813) / −[41914745](https://news.ycombinator.com/item?id=41914745) |
| `Docker` | C | agentive -er + metaphor | 2 | 6 | dock + -er | suggestive | affixation | transparent | 无直接指向 Docker 名字的褒贬；81,866 次提及对应 8 褒 6 贬共现（见 §3(a) 对照表）。相邻证据：[15993084](https://news.ycombinator.com/item?id=15993084) 夸的是 `lxc`/`jails` 而非 Docker |
| `Ebay` | C | clipped coinage | 2 | 4 | Echo Bay Technology | fanciful | coined | opaque | +[4684876](https://news.ycombinator.com/item?id=4684876) / −[4685361](https://news.ycombinator.com/item?id=4685361) |
| `Tumblr` | C | vowel-dropped agentive | 2 | 6 | tumble log + -r | suggestive | respelled | transparent | +[5490005](https://news.ycombinator.com/item?id=5490005) / −[34696041](https://news.ycombinator.com/item?id=34696041) |
| `Perl 6 / Raku` | C | version-number naming | 2 | 10 | renamed to Raku (Japanese 'ease') | arbitrary | real | opaque | [9001510](https://news.ycombinator.com/item?id=9001510) [8908435](https://news.ycombinator.com/item?id=8908435) |
| `Freenode` | C | compounding | 2 | 8 | free + node | suggestive | compound | transparent | [27289364](https://news.ycombinator.com/item?id=27289364) |
| `GIMP` | C | acronym-to-word | 1 | 4 | GNU Image Manipulation Program | fanciful | acronym | opaque | +[46240591](https://news.ycombinator.com/item?id=46240591) [40669295](https://news.ycombinator.com/item?id=40669295) [25177801](https://news.ycombinator.com/item?id=25177801) [20834078](https://news.ycombinator.com/item?id=20834078) [35783540](https://news.ycombinator.com/item?id=35783540) / −[33496679](https://news.ycombinator.com/item?id=33496679) [37589720](https://news.ycombinator.com/item?id=37589720) [48196672](https://news.ycombinator.com/item?id=48196672) |
| `grep` | C | acronym from ed command | 1 | 4 | g/re/p | fanciful | coined | opaque | [9421183](https://news.ycombinator.com/item?id=9421183) |
| `IntelliJ IDEA` | D | blend + backronym | 6 | 12 | intelligent + Java | suggestive | blend | opaque | [5725369](https://news.ycombinator.com/item?id=5725369) |
| `Ubuntu release names` | D | alliterative adjective+animal theme | 6 | 18 | themed codename series | fanciful | phrase | opaque | [4031234](https://news.ycombinator.com/item?id=4031234) [6571737](https://news.ycombinator.com/item?id=6571737) |
| `Windows Live Search` | D | descriptive brand stack | 5 | 17 | English | descriptive | phrase | transparent | [8300145](https://news.ycombinator.com/item?id=8300145) |
| `Modularity` | D | abstract -ity nominalization | 5 | 10 | modular + -ity | descriptive | affixation | transparent | [14033620](https://news.ycombinator.com/item?id=14033620) |
| `TerminalBench` | D | descriptive compound (inaccurate) | 4 | 13 | terminal + benchmark | descriptive | compound | misleading | [47073220](https://news.ycombinator.com/item?id=47073220) |
| `ChatGPT` | D | real word + initialism | 4 | 7 | chat + GPT | descriptive | compound | opaque | [44257529](https://news.ycombinator.com/item?id=44257529) [40235316](https://news.ycombinator.com/item?id=40235316) |
| `miniforge3` | D | compound + version digit | 4 | 10 | mini + forge + 3 | descriptive | compound | opaque | [39170462](https://news.ycombinator.com/item?id=39170462) |
| `GraphQL` | D | compound + initialism | 3 | 7 | graph + QL | descriptive | compound | misleading | [21468643](https://news.ycombinator.com/item?id=21468643) |
| `TeXmacs` | D | compound of two famous names | 3 | 7 | TeX + Emacs (is neither) | suggestive | compound | misleading | [48520779](https://news.ycombinator.com/item?id=48520779) [36946457](https://news.ycombinator.com/item?id=36946457) [31492700](https://news.ycombinator.com/item?id=31492700) |
| `Element` | D | generic real word | 3 | 7 | Latin elementum | generic | real | opaque | [24138348](https://news.ycombinator.com/item?id=24138348) [26274295](https://news.ycombinator.com/item?id=26274295) |
| `WSL` | D | initialism | 3 | 3 | Windows Subsystem for Linux | descriptive | initialism | transparent | [18379357](https://news.ycombinator.com/item?id=18379357) |
| `Mastodon` | D | extinct-animal borrowing | 3 | 8 | Greek mastos + odous | arbitrary | real | opaque | [40013862](https://news.ycombinator.com/item?id=40013862) [38191159](https://news.ycombinator.com/item?id=38191159) [38190550](https://news.ycombinator.com/item?id=38190550) |
| `Smart Contracts` | D | descriptive phrase (inaccurate) | 3 | 14 | English | descriptive | phrase | misleading | [31939465](https://news.ycombinator.com/item?id=31939465) [30156040](https://news.ycombinator.com/item?id=30156040) [33122087](https://news.ycombinator.com/item?id=33122087) |
| `open wiki` | D | generic descriptive phrase | 3 | 8 | English | generic | phrase | transparent | [48756707](https://news.ycombinator.com/item?id=48756707) |
| `Libera` | D | Latin-ish coinage (rebrand) | 3 | 6 | Latin liber 'free' | suggestive | coined | opaque | [27289364](https://news.ycombinator.com/item?id=27289364) |
| `RECOVER` | D | generic imperative verb | 3 | 7 | English | generic | real | misleading | [16767844](https://news.ycombinator.com/item?id=16767844) |
| `ClickHouse` | D | clipped compound | 2 | 10 | Clickstream Data wareHouse | suggestive | compound | opaque | [41697363](https://news.ycombinator.com/item?id=41697363) |
| `Vercel` | D | coined string | 2 | 6 | coined (no public etymology) | fanciful | coined | opaque | [22941081](https://news.ycombinator.com/item?id=22941081) |
| `Decap` | D | clipping of a pun | 2 | 5 | 'decapitated' (headless) CMS | fanciful | coined | opaque | [37990624](https://news.ycombinator.com/item?id=37990624) |
| `Pop!_OS` | D | real word + punctuation | 2 | 5 | 'pop' + literal '!' and '_' | arbitrary | real | opaque | [43443684](https://news.ycombinator.com/item?id=43443684) [38397668](https://news.ycombinator.com/item?id=38397668) [31985928](https://news.ycombinator.com/item?id=31985928) |
| `finger` | D | real word, bad connotation | 2 | 6 | English finger | arbitrary | real | opaque | [1121173](https://news.ycombinator.com/item?id=1121173) |
| `Yahoo!` | D | literary word + punctuation | 2 | 5 | Swift, Gulliver's Travels | arbitrary | real | opaque | [4365009](https://news.ycombinator.com/item?id=4365009) [4015874](https://news.ycombinator.com/item?id=4015874) [3288996](https://news.ycombinator.com/item?id=3288996) |
| `Eclipse` | D | overloaded real word | 2 | 7 | Greek ekleipsis | arbitrary | real | opaque | [39621908](https://news.ycombinator.com/item?id=39621908) [13781257](https://news.ycombinator.com/item?id=13781257) |
| `Riot` | D | real word, bad connotation | 2 | 4 | English riot | arbitrary | real | opaque | [26274295](https://news.ycombinator.com/item?id=26274295) |
| `PostgreSQL 'schemas'` | D | term collision with SQL schema | 2 | 19 | reused SQL term | descriptive | real | misleading | [4486589](https://news.ycombinator.com/item?id=4486589) |
| `Kwikster` | D | respelling + agentive -er | 2 | 8 | quick, respelled | fanciful | respelled | opaque | [3014309](https://news.ycombinator.com/item?id=3014309) |
| `EmDash` | D | typographic term | 2 | 6 | em dash | arbitrary | real | opaque | [47605858](https://news.ycombinator.com/item?id=47605858) |
| `Salesforce Functions` | D | generic technical noun | 2 | 19 | English | generic | real | transparent | [30181113](https://news.ycombinator.com/item?id=30181113) |
| `Coq` | D | foreign word + founder allusion | 1 | 3 | French 'rooster'; Coquand | arbitrary | real | opaque | [5870014](https://news.ycombinator.com/item?id=5870014) |
| `Go` | D | generic real word | 1 | 2 | English 'go' | generic | real | opaque | [8280185](https://news.ycombinator.com/item?id=8280185) [7608064](https://news.ycombinator.com/item?id=7608064) [6165696](https://news.ycombinator.com/item?id=6165696) [39621908](https://news.ycombinator.com/item?id=39621908) |
| `Bing` | D | invented monosyllable | 1 | 4 | 'bingo' / onomatopoeia | fanciful | coined | opaque | [5591611](https://news.ycombinator.com/item?id=5591611) [5577121](https://news.ycombinator.com/item?id=5577121) [8300145](https://news.ycombinator.com/item?id=8300145) [37748625](https://news.ycombinator.com/item?id=37748625) |
| `Helm` | D | metaphor-family (nautical) | 1 | 4 | ship's helm | suggestive | real | transparent | [18239742](https://news.ycombinator.com/item?id=18239742) |
| `strings` | D | generic real word | 1 | 7 | English | generic | real | transparent | [42109668](https://news.ycombinator.com/item?id=42109668) |
| `K (framework)` | D | single letter | 1 | 12 | n/a | generic | letter | opaque | [17746400](https://news.ycombinator.com/item?id=17746400) |
| `D (language)` | D | single letter | 1 | 11 | n/a | generic | letter | opaque | [39621908](https://news.ycombinator.com/item?id=39621908) |
| `Bard` | D | real word (archaic register) | 1 | 4 | Celtic bardos | arbitrary | real | transparent | [39220526](https://news.ycombinator.com/item?id=39220526) [35302434](https://news.ycombinator.com/item?id=35302434) |
| `God (Ruby tool)` | D | generic word, already taken | 1 | 13 | English | generic | real | opaque | [5174424](https://news.ycombinator.com/item?id=5174424) |
| `Kubernetes` | 0 | Greek root borrowing | 4 | 10 | Gk. kybernetes, 'helmsman' | arbitrary | real | opaque | namer-stated |
| `Spotify` | 0 | blend + -ify | 3 | 7 | spot + identify (per founders) | fanciful | blend | opaque | none found |
| `Shopify` | 0 | real word + -ify | 3 | 7 | shop + -ify | suggestive | affixation | transparent | none found |
| `Netlify` | 0 | clipping + -ify | 3 | 7 | network + -ify | suggestive | affixation | opaque | none found |
| `Calendly` | 0 | clipping + -ly | 3 | 8 | calendar + -ly | suggestive | affixation | transparent | none found |
| `Grammarly` | 0 | real word + -ly | 3 | 9 | grammar + -ly | suggestive | affixation | transparent | none found |
| `Expensify` | 0 | real word + -ify | 3 | 9 | expense + -ify | descriptive | affixation | transparent | none found |
| `Storify` | 0 | real word + -ify | 3 | 7 | story + -ify | suggestive | affixation | transparent | none found |
| `Istio` | 0 | Greek word borrowing | 3 | 5 | Gk. istio, 'sail' | arbitrary | real | opaque | vendor-stated |
| `Bitly` | 0 | clipping + -ly | 2 | 5 | bit + -ly (bit.ly domain hack) | suggestive | affixation | opaque | none found |
| `Fastly` | 0 | real adverb | 2 | 6 | English fastly | suggestive | real | transparent | none found |
| `Feedly` | 0 | real word + -ly | 2 | 6 | feed + -ly | suggestive | affixation | transparent | none found |
| `Plotly` | 0 | real word + -ly | 2 | 6 | plot + -ly | descriptive | affixation | transparent | none found |
| `Flickr` | 0 | vowel-dropped real word | 2 | 6 | flicker minus 'e' | arbitrary | respelled | opaque | none found |
| `Grindr` | 0 | vowel-dropped agentive | 2 | 6 | grinder minus 'e' | arbitrary | respelled | opaque | none found |
| `Hadoop` | 0 | child's coinage (nonsense word) | 2 | 6 | Cutting's son's toy elephant | fanciful | coined | opaque | author-stated criteria |
| `Kafka` | 0 | author-name borrowing | 2 | 5 | Franz Kafka (a 'system optimized for writing') | arbitrary | real | opaque | author-stated |
| `Harbor` | 0 | metaphor-family (nautical) | 2 | 6 | English harbor | suggestive | real | transparent | family member |
| `Scribd` | 0 | vowel-dropped real word | 1 | 6 | scribed minus 'e' | suggestive | respelled | opaque | none found |
| `Rook` | 0 | metaphor-family (nautical-ish) | 1 | 4 | chess rook / bird | arbitrary | real | opaque | maintainer 'a bit overdone' |

### 2.1 标注结果的分布

| | n | 字符数 均值/中位 | 5–8 字符占比 | 音节 均值/中位 | ≤2 音节占比 |
|---|---|---|---|---|---|
| **P 被夸** | 47 | 7.1 / 7 | 49% | 2.19 / 2 | **77%** |
| **D 被骂** | 37 | 8.5 / 7 | 46% | 2.54 / 2 | **57%** |
| **C 争议** | 10 | 6.4 / 6 | 50% | 2.20 / 2 | 70% |
| **0 无评价** | 20 | 6.5 / 6 | 80% | 2.40 / 2 | 55% |
| **GitHub 基线**（stars>60k 中的单词仓库名，n=124） | 124 | 7.1 / 7 | 58% | — | — |

Abercrombie 档分布：

| 档 | P | D |
|---|---|---|
| generic | **0** | **9** |
| descriptive | 2 | 9 |
| suggestive | 21 | 5 |
| arbitrary | 13 | 9 |
| fanciful | 11 | 5 |

Metaphor 档分布：

| 档 | P | D |
|---|---|---|
| transparent | 27 | 8 |
| opaque | 20 | 23 |
| misleading | **0** | **6** |

Fisher 精确检验（双侧）：

| 对比 | p | 判读 |
|---|---|---|
| generic 档 ∈ D | **0.00034** | 强 |
| misleading ∈ D | **0.0057** | 强，但样本仅 6 例且标注非盲 |
| ≤2 音节 ∈ P | 0.063 | 边缘 |
| opaque ∈ D | 0.084 | 边缘 |
| P 的 5–8 字符占比 vs GitHub 基线 | 0.305 | **无差异** |

---

## 3. ANALYSIS

### (a) KEY QUESTION：`-ify` / `-ly` / `-r` 到底是不是被讨厌？—— **contradicted**

**直接检验后缀本身**：

| 查询 | nbHits |
|---|---|
| `"ify names"` | **2** |
| `"ify suffix"` | **0** |
| `"dropping vowels"` | 18 |
| `"missing vowels"` | 20 |

在 HN 全部评论历史里，"-ify 这种名字"作为一个可抱怨的类别**几乎不存在**。

**间接检验（受控对比）**：对每个名字统计"该名字与一句明确的名字评价共现于同一条评论"的频次，
再除以总提及量。褒义短语取 `great name / good name / perfect name / love the name`，
贬义取 `terrible name / stupid name / awful name / horrible name / hate the name`。

| 组 | 总提及 | 褒 | 贬 | 评价率 | 褒:贬 |
|---|---|---|---|---|---|
| **后缀族**（Spotify, Shopify, Netlify, Calendly, Grammarly, Bitly, Expensify, Storify, Flickr, Tumblr, Grindr, Scribd, Blendle, Feedly, Fastly, Plotly, Vercel） | 117,201 | 16 | 6 | **0.19‰** | **2.7 : 1** |
| **对照组**（Docker, Kafka, Hadoop, Heroku, Kubernetes, Redis, Django, Rails, Terraform, Ansible, Jenkins, Elasticsearch, MongoDB, Postgres） | 500,788 | 60 | 31 | **0.18‰** | 1.9 : 1 |

两组的**评价率几乎相同**，而后缀族的**褒贬比反而更好**。
若"-ify/-ly/-r 令人反感"为真，后缀族应当有显著更高的贬义率 —— 没有。

单个名字层面同样是空的：Calendly（1121 提及）、Grammarly（2098）、Expensify（505）、Scribd（3991）、
Feedly（2630）、Fastly（2380）、Plotly（1028）、Bitly（655）、Storify（179）
**全部为 0 褒 0 贬**。Spotify 46964 次提及，只有 2 褒 1 贬。

**"是产品受欢迎所以名字被容忍"这个反驳也不成立**：如果真是"容忍"，
我们应该看到"产品很好但名字很烂"这类句式，就像 GIMP（`+46240591 −33496679`）和 Golang
（[8280185](https://news.ycombinator.com/item?id=8280185) "Golang is a terrible name."）那样。
后缀族里找不到这种句式。开发者根本不觉得这是个话题。

**folklore 的实际出处**：Spellbrand、The Name Inspector、Brighter Naming、NameStation —— 全是卖命名服务的公司。品牌顾问行业的话语。

> **给 Nomothete 的直接后果**：不能有后缀黑名单。团队 lead 转述的用户原话
> "how do you know the user doesn't actually LIKE those cliches?" 在数据上是站得住的。
> 如果一定要保留一条相关 Prior，它只能是"这个后缀模式在你的目标受众里既不加分也不减分"，
> 且必须能展示上面这张表。

**唯一站得住的相关观察**：Vercel（9276 提及，`+33155894 −22941081`）被骂的理由是"看不出是什么" —— 落在 §3(d) 的不透明性上。

### (b) 长度与音节 —— 长度 **contradicted**，音节 **thin**

**长度没有区分力**。被夸的 47 个名字中位数 7 字符；GitHub stars>60k 里 124 个单词仓库名的中位数也是 7
（均值 7.1 vs 7.1，5–8 字符占比 49% vs 58%，Fisher p=0.31）。
被骂的 37 个名字中位数**同样是 7**。

即：**"软件项目名倾向于 5–8 字符"是这个物种的普遍事实。**
把它写成 Prior 会给用户一种"系统在帮我筛"的错觉，实际上什么也没筛。

顺带一个反向证据：开发者**几乎从不抱怨名字太长** ——
`"name is too long"` 42 条，`"too long a name"` 3 条。作为对照，
`"can't spell"` 522、`"hard to type"` 488、`"how do you pronounce"` 276、`"can't pronounce"` 240、
`"hard to pronounce"` 220、`"hard to spell"` 132。**机械摩擦的抱怨集中在拼写、打字和发音。**
形态 Prior 的表述是"可拼写、可念出来"。

**音节是边缘信号**：≤2 音节在 P 组占 77%，D 组占 57%，Fisher p=0.063。
方向对，但样本量小且未过显著性门槛。有一条直接的定性证据支持：
[48650382](https://news.ycombinator.com/item?id=48650382)
"Who is in charge of naming things at Google? Like a five syllable word followed by 'AI',
I couldn't think of a worse name for a product competing for mind share."
—— 但这是**一条**评论。标 **thin**。

### (c) 隐喻家族（Docker→Helm→Harbor）—— **mixed to contradicted**

我在 prior-art.md 里说这是"dev tools 最强的一招"。数据不支持。

**量级本身就很小**：`"nautical theme"` 15 条，`"naming theme"` 19 条，`"themed names"` 21 条。
在一个有 3277 条 `bikeshedding` 的语料里，这个话题基本不存在。

**读完这些窗口后，圈内圈外分歧明显**：

- 支持方主要是**圈内人**：给 Kubernetes 取名的 Google 工程师
  （[9654954](https://news.ycombinator.com/item?id=9654954)）、Luxury Yacht 的作者、
  以及 "my favorite naming theme in all of computing" 这类表态。
- 反对方是**新人和圈外人**：一位非母语者被 "helm charts" 搞糊涂；
  "each is totally confusing when you're new to it, especially when the naming theme is completely
  unrelated to what the project actually does"；Rook 的维护者自己说这套主题 "a bit overdone"；
  Android 甜点代号 "a lot of people are opting out because of it"。

**最硬的一条反证来自家族成员自己**：Helm ——
[18239742](https://news.ycombinator.com/item?id=18239742)
"Awful name, there are so many projects called helm already."
**隐喻家族靠"从一个语义场里取词"来保证成员之间协调，但恰恰因此把成员推向了那个语义场里最常见、
最容易撞名的词。** 家族的协调性和 §3(e) 的可搜索性是直接冲突的。

还有一个范围问题：语料里被普遍喜欢的主题命名，大多是**主机名/机器名**
（给自己的服务器按行星、希腊神祇命名）。CONTEXT.md 明确把这类划在项目名之外。

> **修正**：隐喻家族**对已经有多个组件、且受众已在生态内部的项目**有协调价值；
> 对单个新项目的第一个名字，它的主要副作用是撞名。已在 [prior-art.md](./prior-art.md) §2 原文标记。

### (d) 不透明（Kafka、Hadoop）—— **thin，且被混淆变量污染**

统计上：opaque 在 D 组 23/37、P 组 20/47，Fisher p=0.084，不显著。

但把 D 组里的 opaque 逐个读一遍会发现，**它们被骂的理由几乎都是"撞名/搜不到"**：
Go、Element、Eclipse、strings、K、D 全是**常见英语词或单字母**，问题在唯一性不在不透明。

真正的不透明名（Hadoop、Kafka）**在语料里根本没有被骂**：
`"Hadoop"` 9240 次提及，褒 0 贬 0；`"Kafka"` 16437 次提及，褒 6 贬 1。
Hadoop 的作者 Doug Cutting 自述的标准反而与本文的抱怨分布高度一致：
"Short, relatively easy to spell and pronounce, meaningless, and not used elsewhere:
those are my naming criteria." —— **meaningless 和 not used elsewhere 是同一件事的两面。**

**唯一在 D 组稳定出现、且 P 组完全没有的，是 `misleading`（6 vs 0，p=0.0057）**：

- **TeXmacs** —— 3 位互相独立的评论者说同一件事：
  [48520779](https://news.ycombinator.com/item?id=48520779) / [36946457](https://news.ycombinator.com/item?id=36946457) /
  [31492700](https://news.ycombinator.com/item?id=31492700)
  "they gave it a terrible name that strongly implies it's some kind of Emacs TeX editor" /
  "it's actually nothing to do with Emacs and not based on Latex" / "about the worst name they could have chosen"。
- **GraphQL** —— [21468643](https://news.ycombinator.com/item?id=21468643)
  "it's not even a query language in the sense of SQL. It's just about the worst named tech we currently use"。
- **Smart Contracts** —— 3 条独立评论（[31939465](https://news.ycombinator.com/item?id=31939465) /
  [30156040](https://news.ycombinator.com/item?id=30156040) / [33122087](https://news.ycombinator.com/item?id=33122087)）
  "They're not smart, and they're not contracts."
- **TerminalBench** —— [47073220](https://news.ycombinator.com/item?id=47073220)
  "It has almost nothing to do with terminal"。

**结论**：不透明本身无罪（Kafka、Hadoop、Heroku 都活得很好）。
**有罪的是"透明但指向错误"** —— 一个名字承诺了 X 却是 Y。这正是 Kevin Cox 的第 2 条规则。
不透明的名字至少不会撒谎。

### (e) 真正的头号问题：撞名与可搜索性 —— **strong**

| 查询 | nbHits |
|---|---|
| `"already taken"` | **5473** |
| `"name collision"` | 563 |
| `"unsearchable"` | 401 |
| `"unguessable"` | 409 |
| `"hard to google"` | 386 |
| `"ungoogleable"` | 149 |
| `"impossible to google"` | 139 |
| `"namespace collision"` | 132 |
| （对照）`"terrible name"` | 924 |

可搜索性四项合计 **1075**，超过 `"terrible name"` 全部命中数。加上 `"already taken"` 后不在一个量级。

定性证据同样密集，而且**是以"给别人的建议"形式出现的**，这类句式在语料里很少见：

- [5490005](https://news.ycombinator.com/item?id=5490005)
  "when you make a new project, please, please don't use a pre-existing English word.
  Perl? Great name. Searchable. You won't be contaminated and neither will you contaminate others."
- [44989813](https://news.ycombinator.com/item?id=44989813)
  "By now, the best project name is a pronounceable but unique string, for ease of search engine use.
  Ironically, 'systemd' is a good name in [that respect]."
- [39621908](https://news.ycombinator.com/item?id=39621908)
  "see the same issue with go, d, eclipse, and a few other overloaded words.
  This is also the reason why **xkcd** is such a great name."
- [24138348](https://news.ycombinator.com/item?id=24138348)（Element）
  "The SEO on the name is terrible and doesn't come up on Google, Bing or DDG."
- [42109668](https://news.ycombinator.com/item?id=42109668)（`strings`）
  "'strings' is not the greatest name for searching good information."
- [17746400](https://news.ycombinator.com/item?id=17746400)（K framework）
  "isn't the best project name as there is a 'k' language that goes along with the kdb+ database."
- [18239742](https://news.ycombinator.com/item?id=18239742)（Helm）
  "there are so many projects called helm already."

**这条与 CONTEXT.md 的 Publishability 是同一个方向但不是同一件事**：
Publishability 是注册表能不能注册成功（硬约束）；可搜索性是名字在公共语料里能不能被区分开（软倾向）。
一个名字可以完全 publishable 而依然搜不到。**这是本次调研发现的、Nomothete 目前词汇表里没有对应词的一个维度。**

### (f) 改名的自然实验 —— **thin**，但方向一致

必须先排除一个诱人的伪证据：`"much better name"` 215 条 vs `"renaming was a mistake"` **0** 条。
这个不对称**是句式产物**，不是证据 —— 英语里没人会那样说话。**丢弃。**

真实可用的案例很少，逐个列：

**正向**

- **Tesseract → Crossfilter**（Square, 2012）。最完整的一个案例。
  [3759697](https://news.ycombinator.com/item?id=3759697)：
  "this name much better. It's much easier to communicate, two simple words with obvious spellings.
  If I say hey you should checkout Crossfilter, they can easily look that up. With Tesseract, not so much.
  Crossfilter is also suggestive of what it does"。
  改名动因有据可查：与 Google 的 Tesseract OCR 撞名（crossfilter issue #1，
  [3759672](https://news.ycombinator.com/item?id=3759672) "googling wouldn't have helped"）。
  官方说明见 [3770531](https://news.ycombinator.com/item?id=3770531)。
  **三个褒奖理由全部命中 §3(e)：可传达、可拼写、可查到。**
- **Windows Live Search → Bing**。[8300145](https://news.ycombinator.com/item?id=8300145)
  "Windows Live Search was always a horrible name, and they wanted something short and memorable
  that could be verbed, like Google or Xerox"。注意：**改名理由被认可，改后的名字仍被大量批评**
  （见下）。这两件事不矛盾 —— 也正是 Verdict 高于 Prior 的写照。
- **Hudson → Jenkins**。[40093526](https://news.ycombinator.com/item?id=40093526)
  "Now nobody has heard of Hudson, but everybody uses Jenkins."
  但归因不清：Jenkins 赢是因为名字，还是因为社区跟着 fork 走了？后者显然更可能。
  取名逻辑本身有记载（[24467613](https://news.ycombinator.com/item?id=24467613)：
  想要一个和 "Hudson" 一样有管家味的英国名字）。**不能作为"名字影响成败"的证据。**

**负向 / 中性**

- **Vector → Riot → Element**。[26274295](https://news.ycombinator.com/item?id=26274295)
  "changing their name (Vector -> Riot -> Element) is super annoying. I thought Riot was a stupid name
  ..., but don't really get what was wrong with Vector"，且终点名 Element 的 SEO 被单独批评。
  **反复改名本身是成本。**
- **Freenode → Libera**。[27289364](https://news.ycombinator.com/item?id=27289364)
  "How is Libera meant to be pronounced? ... Freenode was such a great name, this one is hard to warm up to."
  发音不确定性 + 旧名情感资产的损失。
- **Netlify CMS → Decap**。[37990624](https://news.ycombinator.com/item?id=37990624) "horrible name"。
- **Coq → Rocq**（2025）。这个案例对 Nomothete 特别有意思：
  2013 年有人说 [5870014](https://news.ycombinator.com/item?id=5870014)
  "'Coq' is competing right up there with ... for the worst named product"，
  但真到改名时，[49324397](https://news.ycombinator.com/item?id=49324397) 转述官方社区调查的结果是
  "most people didn't want it changed or didn't care"。
  **外部人觉得是灾难的名字，内部人不在乎。"谁的 Verdict 算数"是一个真实存在的问题。**
- **Redis → Valkey**（fork）。语料里只有词源解读，没有好坏评价：
  [39858016](https://news.ycombinator.com/item?id=39858016) "Took me a bit to grok the name: Valkey.
  Value/key. Opposite of key-value"。

**总评：thin。** 案例数是个位数，且每个案例都有改名以外的混淆变量（许可证变更、fork、公司收购）。
唯一能提炼的一致方向是：**改名被夸时，被夸的理由是"更好传达、更好拼写、更好查到"，
而不是"更有品味"。** Crossfilter 是唯一一个证据链完整的案例。

### (g) 语料里最重要的一条：同一个名字的判断是对立的 —— **strong**

这不在任务清单里，但它是本次调研对 Nomothete 架构最直接的支持。

| 名字 | 褒 | 贬 |
|---|---|---|
| **GIMP** | "GIMP is the perfect name for this application"（[40669295](https://news.ycombinator.com/item?id=40669295)、[25177801](https://news.ycombinator.com/item?id=25177801)、[20834078](https://news.ycombinator.com/item?id=20834078) 三位独立）；"GIMP's name is great. Had it chosen any other, it would not have stuck in my mind for almost twenty years"（[35783540](https://news.ycombinator.com/item?id=35783540)） | "Gimp is the worst offender amongst badly named products"（[33496679](https://news.ycombinator.com/item?id=33496679)）；"they decided to give GIMP a stupid name, and so they missed out on investment and adoption"（[48196672](https://news.ycombinator.com/item?id=48196672)） |
| **Heroku** | "Heroku is a great name: abstracted, unique, interesting and developer related"（[4684876](https://news.ycombinator.com/item?id=4684876)） | **同一串讨论的回帖**："I think Heroku is a terrible name actually"（[4685361](https://news.ycombinator.com/item?id=4685361)） |
| **Autopilot** | "Autopilot is a perfect name for it. It matches the original usage of the word in aviation perfectly"（3 条独立） | "Autopilot is a horrible name"（2 条独立） |
| **systemd** | "a good name ... a pronounceable but unique string, for ease of search engine use"（[44989813](https://news.ycombinator.com/item?id=44989813)） | [41914745](https://news.ycombinator.com/item?id=41914745) |
| **Bing** | "In comparison, bing is genius"（[40235316](https://news.ycombinator.com/item?id=40235316)） | "physically difficult to pronounce and it evokes no meaning whatsoever"（[5577121](https://news.ycombinator.com/item?id=5577121)）等 4 条独立 |

而且语料里的人**自己就意识到了这件事**：

- [1523310](https://news.ycombinator.com/item?id=1523310)
  "**Great names often seem pretty crappy at first. Later, after repeated use, people say 'what a great name'.
  So don't necessarily reject names that seem crappy. Use them for a while.**"
  —— 直接冲击"一次性给候选名打分"的产品形态：**第一反应是好名字的劣质预测器。**
- [34696041](https://news.ycombinator.com/item?id=34696041)
  "'google', 'facebook', 'amazon', 'apple', 'mac', 'tumblr', 'kindle' are all also pretty stupid names
  we've just gotten used to, but 'toot' is OUR stupid name, and we made it ours"
  —— 习惯化 + 归属感能盖过任何构词法评价。
- [3288996](https://news.ycombinator.com/item?id=3288996)
  "people probably thought Google and Yahoo were stupid names at first too."

**还有一个必须写进来的反方阵营**（否则本文就是在选择性引用）：

- [9725698](https://news.ycombinator.com/item?id=9725698)
  "the work is those things that are harder like making something people will pay for ...
  **'What a great name' does not produce checks.** Microsoft isn't in microcomputers. AirBnB doesn't rent air-mattresses."
- [21826558](https://news.ycombinator.com/item?id=21826558)
  "choose any name, get it out of the way — i have seen projects stalled and waste time on the 'perfect name'.
  The name can be changed after you get traction — **Stripe started as /dev/payments**."
- [8256755](https://news.ycombinator.com/item?id=8256755) 直接要求证据：
  "whether there is good evidence that if they had chosen a much worse name, they might not be as successful today"
  —— 本次调研**没有找到**这样的证据。名字与项目成败的因果关系，语料里无人能证明。

---

## 4. 可辩护的 Prior（Defensible priors）

每条给出：表述、强度、依据、以及**它会怎样被推翻**。
按 CONTEXT.md，这些全部是软倾向；Publishability 才是硬约束。

---

### P1. 避免"已被广泛使用的普通英语词"（唯一性/可搜索性）
**强度：strong**

- **依据**：可搜索性抱怨合计 1075 条 > `"terrible name"` 924 条；`"already taken"` 5473 条。
  Abercrombie generic 档在被骂集合中 9/37、被夸集合中 0/47（Fisher p=0.00034）。
  独立复现：Kevin Cox 把 "Be unique" 列为第一条；Doug Cutting 的自述标准含 "not used elsewhere"；
  HN 上有人主动给出同样建议（5490005、44989813、39621908）。三条互不相关的证据线指向同一处。
- **注意**：这是三个来源的三角验证，不是我一个人的印象。这也是本文唯一一条我认为可以默认开启的 Prior。
- **如何被推翻**：用户明确表示只在小圈子内使用、或已有其他区分手段（org 前缀、已有品牌）。
  Go、Rust、Swift 都是极成功的项目，它们的作者显然接受了这个代价。

### P2. 名字不能承诺它做不到的事（misleading > opaque）
**强度：strong（方向），moderate（量级）**

- **依据**：`misleading` 在被骂集合 6 例、被夸集合 0 例（p=0.0057）；
  TeXmacs 有 3 位独立评论者说同一件事，Smart Contracts 有 3 位。
  Kevin Cox 把 "Don't be misleading" 列为第 2 条。
  反向证据：真正不透明的 Hadoop（9240 次提及）褒贬皆为 0，Kafka 6 褒 1 贬。
- **量级打折**：只有 6 个案例，且 `misleading` 这个标签是我在知道结论的情况下打的（非盲标）。
- **如何被推翻**：故意的反讽/玩梗命名（`nocode`、`brainfuck`）在开发者社区是被接受的。
  用户想要玩梗时，这条不适用。

### P3. 可拼写、可念出来，比"短"重要得多
**强度：moderate**

- **依据**：`"can't spell"` 522 / `"hard to type"` 488 / `"how do you pronounce"` 276 /
  `"can't pronounce"` 240 / `"hard to pronounce"` 220 / `"hard to spell"` 132，
  合计约 1878；对比 `"name is too long"` 仅 42。
  Crossfilter 改名被夸的三个理由之一就是 "two simple words with obvious spellings"。
  Bing 被骂的核心是 "physically difficult to pronounce"。
  Libera 被质疑的第一句话就是 "How is Libera meant to be pronounced?"
- **打折**：这些计数没有区分"项目名"和"人名/外语词/代码标识符"，包含噪音。方向可靠，绝对量不可靠。
- **如何被推翻**：目标受众是单一语言社区、或名字只在书面场景使用（包名）时，发音代价接近 0。

### P4. 名字长度不作为筛选依据
**强度：contradicted（作为区分性 Prior）**

- **依据**：被夸集合中位数 7 字符，GitHub stars>60k 单词仓库名中位数也是 7，Fisher p=0.31。
  被骂集合中位数同样是 7。
- **含义**：**"5–8 字符"是软件名的总体分布。**
  把它做成 Prior 会误导用户以为系统在做有效筛选。
  长度只作为**描述性信息**（"你这个名字比 74% 的高星项目长"）。

### P5. ≤2 音节的轻微正向倾向
**强度：thin**

- **依据**：P 组 77% ≤2 音节 vs D 组 57%，Fisher p=0.063（未过 0.05）。
  定性证据仅 1 条（48650382，抱怨"五音节 + AI"）。
- **诚实说明**：这是一条**没有过显著性门槛**的倾向，样本 84 个名字，且集合本身有选择偏差。
  **不建议默认开启。** 如果要展示，必须连同 p 值一起展示。

### P6. `-ify` / `-ly` / `-r` / 去元音 等"套路后缀"不构成减分
**强度：contradicted（对 folklore 而言），moderate（对"中性"这个结论而言）**

- **依据**：`"ify names"` 2 条、`"ify suffix"` 0 条；
  后缀族 117,201 次提及对应 16 褒 6 贬（0.19‰），对照组 500,788 次提及对应 60 褒 31 贬（0.18‰）；
  9 个后缀名（Calendly、Grammarly、Expensify、Scribd、Feedly、Fastly、Plotly、Bitly、Storify）褒贬**全为 0**。
- **含义**：**系统里不能有后缀黑名单。** 如果用户喜欢 `-ify`，数据这边没有任何理由拦他。
- **保留的余地**：本测量只覆盖 HN（开发者受众）。面向消费者的品牌语料可能不同 —— Brand Pitt 里 computing 域与 food/beverage 域手法分布不同，**手法有域特异性**。

### P7. 隐喻家族（航海/希腊/甜点）主要适用于"生态内的第 N 个组件"，不适用于第一个名字
**强度：thin，且我此前的判断需要修正**

- **依据**：`"nautical theme"` 仅 15 条，正负混杂；圈内人喜欢、新人困惑；
  家族成员 Helm 恰恰因为"取了语义场里最常见的词"而撞名（18239742）。
  语料中被普遍认可的主题命名多是主机名/机器名，已被 CONTEXT.md 划出范围。
- **修正**：对多组件生态有协调价值；对单个新项目会加剧撞名。已在 [prior-art.md](./prior-art.md) §2 原文标记。

### P8. 系统不得对候选名给出"好/坏"结论
**强度：strong**

- **依据**：GIMP（5 褒 vs 4 贬，含 3 位独立说"perfect name"和 1 位说"worst offender"）、
  Heroku（同一讨论串内针锋相对）、Autopilot（3 vs 2）、Bing（1 vs 5）、Bard、systemd。
  加上 [1523310](https://news.ycombinator.com/item?id=1523310)
  "Great names often seem pretty crappy at first ... So don't necessarily reject names that seem crappy."
- **含义**：这是**架构约束**，与 CONTEXT.md 中 Verdict 的定义完全一致。
  它还有一个产品后果：**第一反应是好名字的劣质预测器**，所以"一次性打分/排序"的交互形态
  与语料证据相冲突，多轮对话 + 让名字"用一阵子"更符合证据。

### P9. 不要为了完美的名字拖延
**强度：thin（仅 2 条证据，但方向明确且来自实践者）**

- **依据**：[21826558](https://news.ycombinator.com/item?id=21826558)
  "i have seen projects stalled and waste time on the 'perfect name' ... Stripe started as /dev/payments"；
  [9725698](https://news.ycombinator.com/item?id=9725698) "'What a great name' does not produce checks"。
- **含义**：这是对本项目自身的一条警告。Nomothete 若把用户困在挑名循环里，
  它的失败模式就写在这两条评论里。

---

### 明确"没有证据"的问题

以下问题我找了但**没有找到任何一侧的可用证据**，写在这里以免后来者重复劳动：

- **名字是否影响项目成败**。[8256755](https://news.ycombinator.com/item?id=8256755)
  明确提出了这个问题，语料中无人给出证据。Hudson→Jenkins 混淆变量太多。
- **Reddit / r/programming 侧的意见分布**。exa 检索返回的全是镜像爬虫站和 SEO 列表文，
  未能建立独立的第二个社区语料。**这是一个真实的覆盖缺口，本文所有结论只覆盖 HN 受众。**
- **爆破音（plosives）偏好是否适用于软件名**。Brand Pitt 报告消费品牌 84.1% 含爆破音，
  但我没有做软件名的对照测量，也没有找到开发者讨论这件事的任何证据。**未验证。**
- **音节数与记忆度的关系**。只有 §4/P5 的边缘统计，没有实验证据。

---

## 5. 对 `docs/research/prior-art.md` 的修正

本轮数据推翻了 prior-art.md 里的两处说法，已在该文 §2 原文标记：

1. **`-ify`/`-ly`/`-r` 是"禁用清单而非选项清单"** —— **对开发者受众而言，contradicted**。见 §3(a)。
2. **隐喻家族是"dev tools 最强的单一手法"** —— **mixed to contradicted**。见 §3(c) 与 P7。

---

## 6. 复现方式

所有 HN 计数均可用下面这段复现（计数会随时间增长，本文数据取于 2026-09-11）：

```python
import json, urllib.parse, urllib.request

def hits(phrase, tags="comment"):
    # advancedSyntax=1 + quoted phrase is mandatory; without it Algolia does
    # OR-ish token matching and the counts are meaningless
    url = ("https://hn.algolia.com/api/v1/search?advancedSyntax=1&hitsPerPage=1"
           "&tags=" + tags + "&query=" + urllib.parse.quote(phrase))
    return json.load(urllib.request.urlopen(url, timeout=30))["nbHits"]

hits('"terrible name"')          # 924
hits('"ify names"')              # 2
hits('"Spotify" "great name"')   # co-occurrence within a single comment
```

GitHub 长度基线：`search_repositories(query="stars:>60000", sort="stars")` 前 200 个仓库，
取仓库名中不含 `-`/`_`/`.` 且为纯 ASCII 的 124 个。

评论全文：`https://hn.algolia.com/api/v1/items/<objectID>`；
网页版：`https://news.ycombinator.com/item?id=<objectID>`（本文所有链接均为后者）。
