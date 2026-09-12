# 系统不持有"好名字"的标准

竞品普遍内置质量评分表，打分项通常是可发音性、记忆点、后缀黑名单。我们不做。调研发现，最常被引用的那条命名禁忌，也就是避开 `-ify`、`-ly`、`-r` 后缀，在开发者语料中站不住脚，而且同一个名字被截然相反地评价是常态。所以 Verdict，即用户的主观裁决，是本项目判定名字好坏的唯一最终标准。系统只提供 Publishability 这类客观硬约束，以及标注了证据强度的 Prior 软倾向。

## 证据

HN 全站计数。后缀族 17 个名字，包括 Spotify、Netlify、Calendly、Flickr、Fastly，共 117,201 次提及，16 褒 6 贬。非后缀对照组，包括 Docker、Kafka、Redis、Terraform，共 500,788 次提及，60 褒 31 贬。两组评价率相同，后缀族的褒贬比反而更好。搜 `"ify names"` 全站只有 2 条，`"ify suffix"` 0 条。这套说法的源头是四家出售命名服务的公司。

同名对立判断。GIMP 有 3 位独立评论者称其 "perfect name"，同时有人称其 "the worst offender amongst badly named products"。Heroku 在同一帖内被称为 "a great name" 和 "a terrible name"。

完整方法、114 条标注与 9 条 Prior 的强度分级见 [`docs/research/naming-corpus.md`](../research/naming-corpus.md)。

## 后果

- 代码中不存在名字质量评分表。
- 任何内置倾向必须携带证据强度标注，并可被用户推翻。
- 长度与音节数不作为筛选依据。被夸的、被骂的、高星仓库三组名字字符数中位数同为 7，Fisher p=0.31，未发现显著差异；音节 p=0.063，未过门槛。
- 唯一一条经过三角验证的 strong prior 是唯一性与可搜索性。
