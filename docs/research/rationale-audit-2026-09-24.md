# 取义说明抽样核查

2026-09-24，代码版本 `df4b0045c6546e36267188e41256f578d68c6550`。

已扩样至 348 条取义说明，覆盖 297 个不区分大小写的不同名字。检出 11 条明确错误或将无依据的来源说成确定事实，占 3.2%；另有 30 条词义扩写、构词描述不准或功能承诺过头，两类合计 41 条，占 11.8%。还有 3 条待核实，单独列出。

| 样本 | 条数 | 明确问题 | 加上不准确与过度承诺 | 待核实 |
| --- | ---: | ---: | ---: | ---: |
| 首轮 | 87 | 6，6.9% | 14，16.1% | 0 |
| 新增三轮 | 261 | 5，1.9% | 27，10.3% | 3 |
| 合计 | 348 | 11，3.2% | 41，11.8% | 3 |

统计单位是一条生成回答，同名但取义说明不同的回答各计一次。合计比例是这批样本的描述性检出率。补测中排除项持续增长，端点的推理参数也发生回退，不能将首轮与新增样本的差值归因于模型准确率变化。

## 新增三轮

沿用 `gemini-3.7-flash` 的配置标识、相同项目描述、已有反馈、开启的倾向、生产提示词生成函数和 `temperature=1`。29 种手法各再调用三次，共 87 次请求，每次返回三条，总计 261 条。六路并发，全部成功。新增样本包括 257 个不同名字，其中 4 条在补测过程中重复，249 条通过名字格式、常见程度阈值和补测去重检查。

此次排除列表从会话中已有的 17 个名字开始，每收到一个格式合格的名字便加入，涵盖超过常见程度阈值的名字，且未截断到生产代码的最近 120 个。首轮测试的 87 个名字未预先加入排除列表。这让补测覆盖更多词语，同时与首轮固定排除列表的条件存在差异。

请求最初设置 `reasoning_effort=none`。第二轮期间适配器报告端点拒绝该参数，之后省略该参数；没有记录每次请求的实际推理档位。模型标识相同，无法据此确认上游每次请求的实际路由。每次随机选取的词表与排除列表未逐次落盘，原始回答、生成脚本内容、公共 system prompt 和审阅结果含另一个未公开项目的描述，没有随仓库发布。

261 条已逐条人工审阅，疑点以词典、专业资料及原文检索复核。未标记条目表示本轮没有检出问题，每个专业细节的真实性尚未全部外部验证。以下三个条件分别判断：明确的来源或含义错误；较宽口径的语义扩写和过度承诺；证据不足、需要继续核实。查不到出处的说法不自动计入明确错误。

新增的五条明确问题如下，均通过补测的筛选与去重检查。

| 名字 / 轮次 | 核查结果 |
| --- | --- |
| Cardiograph / 1 | 把心动记录仪的来源写成 cardo 枢轴与协作书写。实际 cardio- 来自希腊语 kardia 心脏。[词义](https://www.merriam-webster.com/dictionary/cardiograph)、[词根](https://www.merriam-webster.com/dictionary/cardio-) |
| telamon / 1 | 把建筑中的承重男像柱写成大地控制网的刚性基线点结构，附加了未经支持的测绘历史用途。[词条](https://www.merriam-webster.com/dictionary/telamon)、[对应建筑义](https://www.merriam-webster.com/dictionary/atlas) |
| korum / 1 | 声称 quorum 的 qu 与 k 发音一致；quorum 读音以 /kw/ 开头，改为 k 会丢失 /w/。[读音](https://www.merriam-webster.com/dictionary/quorum) |
| tabellio / 2 | 将起草契约、遗嘱等文书的公证书吏说成递送公文的专职人员。[Lewis and Short 拉丁词典](https://atlas.perseus.tufts.edu/dictionaries/entry/urn%3Acite2%3Ascaife-viewer%3Adictionary-entries.atlas_v1%3Alat.ls.perseus-eng2-n47324/) |
| reseau / 2 | 把预先刻在标板上的基准格网写成刻在底片上。NASA 资料说明其使用带标记的玻璃板。[NASA SP-5099](https://ntrs.nasa.gov/api/citations/19730009710/downloads/19730009710.pdf) |

新增的 22 条较宽口径问题已在未发布的样本记录中逐条标记。例如 `tiepoint` 和 `resection` 编入了项目描述没有给出的具体工作机制；`aplanat` 把消球差、消彗差写成所有方向完美成像；`promptuary` 声称由 prompt 加 -ary 构成，漏交代一个 u。[光学厂商对 aplanatic 的说明](https://www.edmundoptics.co.uk/f/adloptica-aplanoxx-aplan-objectives/39807/)。这些问题涵盖细节失准与未获项目描述支持的能力推断，严重程度低于整段来源错置。

三条待核实分别为 `ebulu` 的约鲁巴语结社含义、装帧术语 `catenary stitch`，以及《堂吉诃德》中 `alcorza` 所述糖饰工艺的具体出处。古腾堡西语全文检索没有命中 alcorza；这条检索结果只记录核查进度。[原文版本](https://www.gutenberg.org/cache/epub/2000/pg2000.txt)。

补测没有改变此前的影响判断：词源和出处错误会误导选名，并可能被复述进项目文档；功能过度承诺会让用户误判工具能力。此次发现的明确错误都能通过现有筛选。首轮的 7% 不能继续作为稳定频率使用，扩样后的描述性检出率应更新为约 3%，纳入不准确和过度承诺后约 12%。

## 首轮方法

使用项目当前配置的 `gemini-3.7-flash`，经配置的 OpenAI Chat 兼容端点调用。这是配置中的模型标识。`temperature=1`，请求 `reasoning_effort=none`，沿用生产代码的 schema、system prompt 和 user prompt 生成函数。

项目描述是另一个未公开项目的一句话说明，此处从略。沿用当前会话开启的 P1、P2、P3、P7、17 个历史名字排除项及已有的三条负面反馈。遍历全部 29 种手法，每种调用一次、每次产出 3 条，共 29 次请求、87 条。三路并发，全部成功。端点报告输入 29,197 tokens，输出 5,927 tokens。

每次调用固定使用抽样开始时的会话上下文，保留各次随机词表和原始回答。样本逐条人工审阅，再以词典、专业机构资料及字符串核对查证疑点。正常的自创词、明确标为比喻的项目联想均不计为错误。未标记条目表示本轮未检出问题；没有对每一个专业细节完成外部查证。

这一比例描述当前模型配置、当前项目描述和手法等额抽样下的检出率。实际交互会按用户反馈调整手法分布，跨请求排除项也会变化。每种手法仅 3 条，因此不据此估计单个手法的稳定错误率。历史 17 条单独回看，不混入新样本分母；数据库没有保存其生成模型和提示词版本。

原始回答、完整提示词、逐条标记和统计含另一个未公开项目的描述，没有随仓库发布。抽样调用绕过写库与注册表查询，数据库以只读方式打开。

## 首轮检出的 6 条明确问题

| 名字 / 手法 | 模型的说法 | 核查结果 |
| --- | --- | --- |
| sennit / weaving | “源自古英语” | Collins 将词源标为未知，英式词条记为 17 世纪。确定的古英语来源没有依据。[词条](https://www.collinsdictionary.com/dictionary/english/sennit) |
| inweave / weaving | “古英语动词” | Merriam-Webster 最早用例为 15 世纪，把该词直接归为古英语不成立。[词条](https://www.merriam-webster.com/dictionary/inweave) |
| collogue / obsolete-english | “源自古英语和中古英语” | 词典记载始于 17 世纪，词源未知；“私下商议”义的证据到 19 世纪才出现。[词条](https://www.merriam-webster.com/dictionary/collogue) |
| synthand / blend | 把 shorthand 的意思写成“速记、命令行操作手” | “速记”正确，“命令行操作手”属于额外编出的词义。[词条](https://www.merriam-webster.com/dictionary/shorthand) |
| symbiont / respell | 原词也是 symbiont，却声称“去除了冗余修饰” | 输出与引用的原词完全一致，没有发生所声称的改写。可直接核对字符串。 |
| clique / acronym-word | 展开为 CLI Interface for Quick Unix Exchanges | 忽略 for，按单词首字母得到 CIQUE；将 CLI 展开又得到 CLIIQUE。给出的展开式无法按所述手法拼成 CLIQUE。 |

六条均通过 0.5 的常见程度阈值。总计 84/87 条通过名字格式和该阈值检查；这些检查不判断取义说明的事实性。`symbiont` 同时出现于 mycology 和 respell 两批，实际写入同一会话时会去重，其错误版本能否显示取决于到达顺序。

## 首轮另 8 条需收紧的说法

这些条目采用较宽的口径计数，适合衡量取义说明的可靠性，不能全部等同于编造词源。

| 名字 | 问题 |
| --- | --- |
| kanonema | 把 kanon 与 nema 的组合写成字面意义“依规则交织的线”。“交织”及其关系属于作者补入的联想。 |
| stilopus | stilus 与 opus 被展开为“多支笔协同完成的作品”。词根本身没有“多支”或“协同”这一层。 |
| lexokheme | 给 lexis 的释义混入了项目用途的引申。项目自带词表给的是 word, diction。 |
| thalweg | 把最深河槽轨迹直接说成“流速最快”。USGS 的定义以各横断面最低点为准，不能由深度定义直接推得最大流速。[USGS 测流手册](https://pubs.water.usgs.gov/TWRI3A10/pdf/TWRI_3-A10.pdf) |
| colab | 声称来自 collaboration 的前段截断，但还额外删了一个 l。应交代截短后的改写。 |
| synapse | 来源中的连接义基本成立，把完整借入并变化词尾的历史概括成“截断”过于粗糙。[词条](https://www.merriam-webster.com/dictionary/synapse) |
| parley | parler 与 parley 的关系基本成立，但“截断名词”无法交代词尾变化。[词条](https://www.merriam-webster.com/dictionary/parley) |
| graticule | 比喻延伸出“不发生冲突”的功能保证，项目描述无法支持。 |

借词样本中的 auzolan、cymorth、mshikamano 找到了支持核心释义的资料，未因词语冷门而判错。[巴斯克政府资料](https://www.euskadi.eus/gobierno-vasco/-/entrada-blog/2013/pasado-y-presente-del-auzolan/)、[威尔士语词典](https://deriv.nls.uk/dcn23/7661/76612002.23.pdf)、[斯瓦希里语词典](https://hist.hse.ru/data/2021/06/13/1440903613/J.%20Knappert%2C%20L.%20van%20Kessel%20-%20Dictionary%20of%20Literary%20Swahili.pdf)。

历史样本中的 `tacket` 也有需要改正的范围限定：它被描述为没有正式封皮前的临时绑扎，而 tackets 可用于连接书芯与封皮，具有多种用途。[爱丁堡大学托管的装帧术语库](https://lob.is.ed.ac.uk/concept/1657)。

## 影响与代码中的原因

影响最大的环节是用户根据词源、历史和文化含义做取舍。错误说明一旦被采信，会进入项目对外文档；这些信息也是本工具帮助用户理解冷门名字的主要依据。多数已检出问题不改变名字字符串，注册表检查仍然针对原来的字符串运行。

另一个后果是偏好反馈受到间接影响。用户可能因为编出的故事喜欢一个名字，后续生成便更偏向该手法。程序只把名字、用户态度和备注写入后续偏好文本，取义说明本身没有直接回灌。

生成提示词要求每个名字都交代来源、字面义和项目关系，却没有要求区分可查证含义、自创含义及比喻，也没有提供承认未知来源的出口。参见 `server/naming/generate.ts:97`。这给“先生成一个名字，再补齐合乎手法的故事”留下了空间；这是根据输出与提示词的推断。

`server/naming/generate.ts:265` 仅将取义说明去掉首尾空白后写入，`web/components/CandidatePlate.tsx:272` 和 `web/components/DetailPanel.tsx:98` 直接显示。`server/checks/index.ts:14` 的检查表不包含来源核验。schema 验证也只约束其为字符串。

词表本身含有来源混淆。拉丁词根列表中的 `vellum` 是英语经法语借入的词形，直接作为拉丁词根材料容易让模型沿用错误分类。[词源记录](https://www.merriam-webster.com/dictionary/vellum)。数种手法的提示还把冷门、废弃或改拼与“无人使用”“全球唯一”联系起来，参见 `server/naming/strategies.ts:177`、`:197`、`:287`、`:396`、`:495`。这类事实承诺应由查询结果支持。

优先处理来源与引申含义的分界，修正词表，并对缩写展开、截短和改拼做直接的字符串核对。词源和典故可在用户关注某个名字时检索原始资料。上述措施的实际降错幅度需要另做对照抽样。
