import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { PriorDossier } from './PriorDossier.tsx'
import { VerdictDial } from './VerdictDial.tsx'
import type { Bootstrap, Verdict } from '../types.ts'

const PLACEHOLDER =
  '比如：一个命令行工具，监视一堆目录，把散落的截图按来源应用和日期自动归档，重名的按内容哈希去重。给自己用的，会开源。'

interface SeedRow {
  key: number
  text: string
  verdict: Verdict
}

/**
 * The first screen. One textarea, and everything else folded away — the design
 * position is that the main signal is behaviour, not forms (docs/design.md),
 * so the opening must not look like an intake questionnaire.
 */
export function Opening({
  boot,
  busy,
  onStart,
}: {
  boot: Bootstrap | null
  busy: boolean
  onStart: (input: {
    brief: string
    seeds: { text: string; verdict: Verdict }[]
    priors: string[]
    threshold: number
  }) => void
}) {
  const [brief, setBrief] = useState('')
  const [seeds, setSeeds] = useState<SeedRow[]>([])
  const [more, setMore] = useState(false)
  const [priors, setPriors] = useState<string[]>([])
  const [threshold, setThreshold] = useState(0.5)
  const area = useRef<HTMLTextAreaElement>(null)
  const seedSeq = useRef(0)

  useEffect(() => {
    if (boot && priors.length === 0) {
      setPriors(boot.priors.filter(p => p.defaultOn && p.instruction).map(p => p.id))
    }
  }, [boot, priors.length])

  useEffect(() => {
    const t = setTimeout(() => area.current?.focus(), 420)
    return () => clearTimeout(t)
  }, [])

  // Grow the textarea with its content; no scrollbar inside a writing surface.
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(132, el.scrollHeight)}px`
  }, [brief])

  const ready = brief.trim().length >= 4 && !busy

  const submit = () => {
    if (!ready) return
    onStart({
      brief: brief.trim(),
      seeds: seeds.filter(s => s.text.trim()).map(s => ({ text: s.text.trim(), verdict: s.verdict })),
      priors,
      threshold,
    })
  }

  return (
    <div className="opening">
      <motion.div
        className="opening__inner"
        initial={{ opacity: 0, y: 22, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="opening__eyebrow">Nomothete · νομοθέτης</div>
        <h1 className="opening__title">
          给这个东西
          <br />
          起一个<em>名字</em>。
        </h1>
        <blockquote className="opening__epigraph">
          名字是一种工具，用来教人，也用来把事物彼此分开。制作名字的那位匠人，就是立法者 ——
          在所有匠人当中，他是最少见的一个。
          <cite>柏拉图《克拉底鲁篇》388b–389a</cite>
        </blockquote>

        <div className="field">
          <label className="field__label" htmlFor="brief">
            这个项目是什么
            <span className="field__hint">写得越具体，取义越有地方可抓。中文英文都行。</span>
          </label>
          <div className="field__box">
            <textarea
              id="brief"
              ref={area}
              value={brief}
              placeholder={PLACEHOLDER}
              onChange={e => setBrief(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
              }}
            />
          </div>
        </div>

        <button className="btn btn--ghost btn--sm" onClick={() => setMore(m => !m)} style={{ marginBottom: 10 }}>
          {more ? '收起' : '我已经有一些想法'} {more ? '▴' : '▾'}
        </button>

        <AnimatePresence initial={false}>
          {more && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div className="field">
                <div className="field__label">
                  已经想过的名字
                  <span className="field__hint">喜欢的和讨厌的都填进来，它们直接算作 Verdict。</span>
                </div>
                {seeds.map((s, i) => (
                  <div className="seedrow" key={s.key}>
                    <input
                      className="seedrow__input"
                      value={s.text}
                      autoFocus={i === seeds.length - 1}
                      placeholder="一个名字"
                      onChange={e =>
                        setSeeds(list => list.map(x => (x.key === s.key ? { ...x, text: e.target.value } : x)))
                      }
                    />
                    <VerdictDial
                      compact
                      verdict={s.verdict}
                      onChange={v =>
                        setSeeds(list =>
                          list.map(x => (x.key === s.key ? { ...x, verdict: x.verdict === v ? 0 : v } : x)),
                        )
                      }
                    />
                    <button
                      className="seedrow__x"
                      onClick={() => setSeeds(list => list.filter(x => x.key !== s.key))}
                      aria-label="删掉这一行"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setSeeds(list => [...list, { key: ++seedSeq.current, text: '', verdict: 0 }])}
                >
                  ＋ 加一个
                </button>
              </div>

              <div className="field">
                <div className="field__label">
                  留下的名字要多罕见
                  <span className="field__hint">
                    自报概率高于 {(threshold * 100).toFixed(0)}% 的当场丢掉。调低 = 更奇，也更容易全军覆没。
                  </span>
                </div>
                <input
                  type="range"
                  min={0.15}
                  max={0.9}
                  step={0.05}
                  value={threshold}
                  onChange={e => setThreshold(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--brass)' }}
                />
              </div>

              {boot && (
                <div className="field">
                  <div className="field__label">
                    内置的倾向
                    <span className="field__hint">每一条都带着它的证据强度，随时可以关掉。</span>
                  </div>
                  <PriorDossier priors={boot.priors} enabled={priors} onChange={setPriors} />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="opening__go">
          <button className="btn btn--primary" disabled={!ready} onClick={submit}>
            {busy ? '正在开工…' : '开始取名'}
            <kbd style={{ borderColor: 'rgba(26,19,5,0.25)', color: '#3a2c0c' }}>⌘↵</kbd>
          </button>
          <span style={{ fontSize: 12.5, color: 'var(--vellum-4)', lineHeight: 1.7 }}>
            第一批会同时跑六条互不相干的路数。名字到一个显示一个，注册表检查随后自己跟上。
          </span>
        </div>

        {boot && !boot.provider.configured && (
          <div
            style={{
              marginTop: 22,
              padding: '12px 15px',
              border: '1px solid rgba(196,87,62,0.4)',
              borderRadius: 10,
              color: '#e09680',
              fontSize: 12.5,
              lineHeight: 1.7,
            }}
          >
            模型还没配好：{boot.provider.problem} 在项目根目录放一个 .env，写 BASE_URL、API_KEY、MODEL 三行就行。
          </div>
        )}
      </motion.div>
    </div>
  )
}
