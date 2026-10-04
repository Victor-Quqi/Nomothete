/**
 * Priors: the built-in aesthetic leanings derived from the naming corpus.
 *
 * Contract from CONTEXT.md — every Prior must be displayable to the user, must
 * carry its evidence strength, and must be overridable by Verdict. Nothing in
 * here is a score, a blacklist, or a filter. A Prior only ever reaches the
 * model as a sentence in the prompt, and only while the user leaves it on.
 *
 * Evidence: docs/research/naming-corpus.md §4.
 */

export type Strength = 'strong' | 'moderate' | 'thin' | 'contradicted'

export interface Prior {
  id: string
  /** Shown to the user, in their language. */
  statement: string
  statementEn: string
  strength: Strength
  /** The measurement behind it, shown when the user opens the dossier. */
  evidence: string
  evidenceEn: string
  /** What would make this one wrong for you. */
  overturnedBy: string
  overturnedByEn: string
  /** Whether it is on when a session starts. */
  defaultOn: boolean
  /** The sentence handed to the model while it is on. Empty = advisory only. */
  instruction: string
}

export const PRIORS: Prior[] = [
  {
    id: 'P1',
    statement: '避开已经被广泛使用的普通英语词',
    statementEn: 'Avoid common English words already in widespread use',
    strength: 'strong',
    evidence:
      'HN 全站计数：可搜索性抱怨（unsearchable / hard to google / ungoogleable / impossible to google）合计 1075 条，高于 "terrible name" 的 924 条；"already taken" 5473 条，是命名话题里最高频的单一抱怨。标注集中 Abercrombie generic 档在被骂的 37 个名字里占 9 个，在被夸的 47 个里占 0 个，Fisher p=0.00034。三条互不相关的证据线（语料计数、标注统计、Kevin Cox 与 Doug Cutting 各自独立提出的标准）指向同一处。',
    evidenceEn: 'Site-wide HN counts: complaints about searchability (unsearchable / hard to google / ungoogleable / impossible to google) total 1075, exceeding the 924 for "terrible name"; "already taken" appears 5473 times, the most frequent single complaint about naming. In the annotated set, the Abercrombie generic category accounts for 9 of the 37 criticised names and 0 of the 47 praised names, Fisher p=0.00034. Three independent lines of evidence (corpus counts, annotation statistics, and criteria independently proposed by Kevin Cox and Doug Cutting) point to the same conclusion.',
    overturnedBy:
      '你只在小圈子里用这个名字，或者已经有别的区分手段（org 前缀、既有品牌）。Go、Rust、Swift 都极成功，它们的作者显然接受了这个代价。',
    overturnedByEn: 'You use the name only within a small circle, or already have another way to distinguish it (an org prefix or an established brand). Go, Rust, and Swift are all extremely successful; their authors clearly accepted this cost.',
    defaultOn: true,
    instruction:
      'Avoid names that are common English words in everyday use. A name that collides with ordinary vocabulary becomes impossible to search for. Rare, technical, or obsolete words are fine and often ideal — the problem is frequency of use, not being a real word.',
  },
  {
    id: 'P2',
    statement: '名字不能承诺它做不到的事',
    statementEn: 'A name must not promise what the project cannot do',
    strength: 'strong',
    evidence:
      '标注集中 misleading 档在被骂的名字里 6 例、被夸的里 0 例，Fisher p=0.0057。TeXmacs 有 3 位互相独立的评论者说同一件事（它既不是 Emacs 也不基于 LaTeX）；Smart Contracts 同样有 3 位（"They\'re not smart, and they\'re not contracts"）。反向证据：真正不透明的 Hadoop 9240 次提及、褒贬皆为 0，Kafka 16437 次提及、6 褒 1 贬。不透明本身无罪，有罪的是透明但指向错误。',
    evidenceEn: 'In the annotated set, the misleading category has 6 criticised names and 0 praised names, Fisher p=0.0057. 3 independent commenters make the same point about TeXmacs (it is neither Emacs nor based on LaTeX); Smart Contracts also has 3 ("They\'re not smart, and they\'re not contracts"). Evidence in the other direction: the opaque name Hadoop has 9240 mentions, with 0 instances of praise and 0 instances of criticism; Kafka has 16437 mentions, with 6 instances of praise and 1 instance of criticism. Opacity itself causes no harm; a clear but misleading meaning does.',
    overturnedBy:
      '故意的反讽与玩梗命名（nocode、brainfuck）在开发者社区是被接受的。你想玩梗时这条不适用。',
    overturnedByEn: 'Deliberate irony and joke names (nocode, brainfuck) are accepted in developer communities. This does not apply when you intend a joke.',
    defaultOn: true,
    instruction:
      'A name may be opaque, but it must not be actively misleading. Never imply a relationship to an existing well-known project, nor a capability the project does not have. An opaque name at least does not lie.',
  },
  {
    id: 'P3',
    statement: '可拼写、可念出来，比「短」重要得多',
    statementEn: 'Easy to spell and say matters far more than short',
    strength: 'moderate',
    evidence:
      'HN 计数："can\'t spell" 522、"hard to type" 488、"how do you pronounce" 276、"can\'t pronounce" 240、"hard to pronounce" 220、"hard to spell" 132，合计约 1878；作为对照，"name is too long" 只有 42 条。Crossfilter 改名被夸的三个理由之一是 "two simple words with obvious spellings"；Bing 被骂的核心是 "physically difficult to pronounce"；Libera 遭到的第一句质疑是 "How is Libera meant to be pronounced?"。打折：这些计数没有区分项目名与人名、外语词、代码标识符，方向可靠但绝对量不可靠。',
    evidenceEn: 'HN counts: "can\'t spell" 522, "hard to type" 488, "how do you pronounce" 276, "can\'t pronounce" 240, "hard to pronounce" 220, "hard to spell" 132, approximately 1878 in total; by comparison, "name is too long" has only 42. One of the three reasons given for praising the Crossfilter rename was "two simple words with obvious spellings"; the central criticism of Bing was "physically difficult to pronounce"; the first question raised about Libera was "How is Libera meant to be pronounced?". Limitation: these counts do not separate project names from personal names, foreign words, or code identifiers. The direction is reliable, but the absolute counts are not.',
    overturnedBy:
      '目标受众是单一语言社区，或名字只出现在书面场景（纯包名），此时发音代价接近 0。',
    overturnedByEn: 'The audience is a single-language community, or the name appears only in writing (solely as a package name), so the pronunciation cost is close to 0.',
    defaultOn: true,
    instruction:
      'A reader who has never seen the name must be able to guess both how to spell it after hearing it and how to say it after seeing it. Length is not a constraint; ambiguity is.',
  },
  {
    id: 'P5',
    statement: '两个音节以内略占优',
    statementEn: 'One or two syllables have a slight edge',
    strength: 'thin',
    evidence:
      '被夸的名字里 77% 在 2 音节以内，被骂的里 57%，Fisher p=0.063 —— 没有过 0.05 的门槛。定性证据只有 1 条（HN 48650382 抱怨「五音节加上 AI」）。样本 84 个名字，且集合本身有选择偏差。这条默认关闭，如果你要用它，请连同这个 p 值一起看。',
    evidenceEn: 'Of the praised names, 77% have 2 syllables or fewer, compared with 57% of the criticised names, Fisher p=0.063. This does not meet the 0.05 significance cutoff. There is only 1 piece of qualitative evidence (HN 48650382 complains about “five syllables plus AI”). The sample has 84 names, and the set itself has selection bias. This leaning starts switched off; read this p-value alongside it if you turn it on.',
    overturnedBy: '任何你自己的相反判断。这条本来就没过显著性门槛。',
    overturnedByEn: 'Any contrary judgement of your own. This finding did not meet the significance cutoff.',
    defaultOn: false,
    instruction: 'Prefer names of one or two syllables.',
  },
  {
    id: 'P7',
    statement: '隐喻家族（航海／希腊／甜点）留给生态里的第 N 个组件',
    statementEn: 'Save metaphor families (nautical / Greek / desserts) for the Nth component in an ecosystem',
    strength: 'thin',
    evidence:
      '"nautical theme" 全站只有 15 条，"naming theme" 19 条，"themed names" 21 条 —— 在一个有 3277 条 bikeshedding 的语料里，这个话题基本不存在，且正负混杂：圈内人喜欢，新人困惑。最硬的一条反证来自家族成员自己 —— Helm："Awful name, there are so many projects called helm already."（HN 18239742）。隐喻家族靠从一个语义场取词来保证成员协调，恰恰因此把成员推向那个语义场里最常见、最容易撞名的词。',
    evidenceEn: 'Site-wide, "nautical theme" has only 15 mentions, "naming theme" 19, and "themed names" 21. In a corpus with 3277 mentions of bikeshedding, this topic barely appears, and reactions are mixed: insiders like it, newcomers are confused. The strongest counterexample comes from a family member itself, Helm: "Awful name, there are so many projects called helm already." (HN 18239742). Metaphor families keep members consistent by drawing words from one semantic field. This also pushes them toward the most common words in that field, which are the most likely to collide.',
    overturnedBy:
      '你要命名的正是一个已有生态里的第 N 个组件，受众已经在生态内部，协调价值大于撞名代价。',
    overturnedByEn: 'You are naming the Nth component in an existing ecosystem, and the audience is already part of it. Consistency matters more than the cost of name collisions.',
    defaultOn: true,
    instruction:
      'Do not reach for the worn metaphor families — nautical, Greek pantheon, desserts, gemstones, constellations. Their members crowd into the most common word of the semantic field and collide with each other.',
  },
  {
    id: 'P6',
    statement: '-ify / -ly / -r / 去元音 这类「套路后缀」不减分',
    statementEn: 'Conventional suffixes (-ify / -ly / -r / vowel removal) carry no penalty',
    strength: 'contradicted',
    evidence:
      '这是一条被推翻的 folklore，写在这里是为了说明系统里为什么没有后缀黑名单。"ify names" 全站 2 条，"ify suffix" 0 条 —— 作为一个可抱怨的类别它几乎不存在。受控对比：后缀族 17 个名字（Spotify、Netlify、Calendly、Flickr、Fastly 等）共 117,201 次提及对应 16 褒 6 贬（0.19‰）；对照组 14 个名字（Docker、Kafka、Redis、Terraform 等）共 500,788 次提及对应 60 褒 31 贬（0.18‰）。评价率相同，后缀族的褒贬比反而更好。Calendly、Grammarly、Expensify、Scribd、Feedly、Fastly、Plotly、Bitly、Storify 九个名字褒贬全为 0。这套说法的源头是四家出售命名服务的公司。',
    evidenceEn: 'This is overturned folklore, included to show why the system has no suffix blacklist. Site-wide, "ify names" has 2 mentions and "ify suffix" 0. As a category to complain about, it barely exists. Controlled comparison: 17 names in the suffix group (Spotify, Netlify, Calendly, Flickr, Fastly, and others) have 117,201 mentions, with 16 instances of praise and 6 instances of criticism (0.19‰); the control group of 14 names (Docker, Kafka, Redis, Terraform, and others) has 500,788 mentions, with 60 instances of praise and 31 instances of criticism (0.18‰). The frequency of praise or criticism is the same, and the suffix group has a higher ratio of praise to criticism. All nine names Calendly, Grammarly, Expensify, Scribd, Feedly, Fastly, Plotly, Bitly, and Storify have 0 instances of praise and 0 instances of criticism. This claim originated with four companies selling naming services.',
    overturnedBy: '不适用。这条本身就是「不要设这条规则」。',
    overturnedByEn: 'Not applicable. This entry itself says to leave this restriction out.',
    defaultOn: false,
    instruction: '',
  },
  {
    id: 'P4',
    statement: '名字长度不作为筛选依据',
    statementEn: 'Name length is not a filter',
    strength: 'contradicted',
    evidence:
      '被夸的 47 个名字字符数中位数 7；GitHub stars>60k 中 124 个单词仓库名的中位数也是 7；被骂的 37 个同样是 7。Fisher p=0.31，无差异。「5–8 字符」是软件名的总体分布，不是区分好坏的信号。本系统只把长度当描述性信息展示（「你这个名字比 74% 的高星项目长」），绝不据此筛选。',
    evidenceEn: 'The 47 praised names have a median length of 7 characters; the 124 single-word repository names with GitHub stars>60k also have a median of 7; the 37 criticised names also have a median of 7. Fisher p=0.31, no difference. “5–8 characters” describes the overall distribution of software names; it does not distinguish praise from criticism. The system shows length only as descriptive information (“Your name is longer than 74% of highly starred projects”) and never filters by it.',
    overturnedBy: '不适用。这条本身就是「不要设这条规则」。',
    overturnedByEn: 'Not applicable. This entry itself says to leave this restriction out.',
    defaultOn: false,
    instruction: '',
  },
  {
    id: 'P8',
    statement: '系统不对候选名给出好坏结论',
    statementEn: 'The system does not judge names',
    strength: 'strong',
    evidence:
      '同一个名字被完全相反地评价是常态，而且经常发生在同一个帖子里。GIMP：3 位独立评论者说 "perfect name"，另有人说 "the worst offender amongst badly named products"。Heroku：同一讨论串内 "a great name" 与 "a terrible name" 针锋相对。Autopilot 3 褒 2 贬，Bing 1 褒 5 贬。再加上 HN 1523310："Great names often seem pretty crappy at first. Later, after repeated use, people say \'what a great name\'. So don\'t necessarily reject names that seem crappy."—— 第一反应是好名字的劣质预测器。这是一条架构约束，不是可选项，所以它不能被关掉。',
    evidenceEn: 'Opposite reactions to the same name are common, often within the same thread. GIMP: 3 independent commenters say "perfect name", while another says "the worst offender amongst badly named products". Heroku: "a great name" and "a terrible name" directly oppose each other in the same thread. Autopilot has 3 instances of praise and 2 instances of criticism, Bing 1 instance of praise and 5 instances of criticism. HN 1523310 adds: "Great names often seem pretty crappy at first. Later, after repeated use, people say \'what a great name\'. So don\'t necessarily reject names that seem crappy." First impressions poorly predict whether a name will be liked. This is a fixed constraint on the system, so it cannot be switched off.',
    overturnedBy: '不可关闭。这是 Verdict 作为唯一标准的直接后果。',
    overturnedByEn: 'Cannot be switched off. Your marks are the sole basis for judging names.',
    defaultOn: true,
    instruction: '',
  },
  {
    id: 'P9',
    statement: '不要为了完美的名字拖延',
    statementEn: 'Do not delay work for a perfect name',
    strength: 'thin',
    evidence:
      'HN 21826558："i have seen projects stalled and waste time on the \'perfect name\' ... Stripe started as /dev/payments"；HN 9725698："\'What a great name\' does not produce checks."。只有 2 条证据，但方向明确且来自实践者。这条是对本工具自身的警告 —— 如果它把你困在挑名循环里，它的失败模式就写在这两条评论里。',
    evidenceEn: 'HN 21826558: "i have seen projects stalled and waste time on the \'perfect name\' ... Stripe started as /dev/payments"; HN 9725698: "\'What a great name\' does not produce checks." There are only 2 pieces of evidence, but they point in a clear direction and come from practitioners. This is a warning about this tool itself. If it traps you in a naming loop, these two comments describe how it has failed.',
    overturnedBy: '不适用。这条不进入生成，只提醒你自己。',
    overturnedByEn: 'Not applicable. This is a reminder for you and does not affect generation.',
    defaultOn: false,
    instruction: '',
  },
]

export const PRIOR_BY_ID = new Map(PRIORS.map(p => [p.id, p]))

/** Priors that actually reach the prompt. The rest are dossier-only. */
export const STEERABLE_PRIOR_IDS = PRIORS.filter(p => p.instruction).map(p => p.id)

export const DEFAULT_PRIOR_IDS = PRIORS.filter(p => p.defaultOn && p.instruction).map(p => p.id)
