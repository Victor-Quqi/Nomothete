import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { PriorDossier } from './PriorDossier.tsx'
import { VerdictDial } from './VerdictDial.tsx'
import { RARITY_MAX, RARITY_MIN, rarityPercent, rarityWord, thresholdForRarity } from '../rarity.ts'
import type { Bootstrap, Verdict } from '../types.ts'

const PLACEHOLDER =
  '比如：一个命令行工具，监视一堆目录，把散落的截图按来源应用和日期自动归档，重名的按内容哈希去重。给自己用的，会开源。'

/**
 * Three briefs, one click away.
 *
 * The blank page is the real failure mode of this screen: the quality of every
 * name downstream is set by how concrete this paragraph is, and nobody writes a
 * concrete paragraph into an empty box on the first try. They disappear the
 * moment you type — this is a way in, not a menu.
 */
const EXAMPLES: { label: string; brief: string }[] = [
  {
    label: '命令行工具',
    brief:
      '一个命令行工具，监视一堆目录，把散落的截图按来源应用和日期自动归档，重名的按内容哈希去重。给自己用的，会开源。',
  },
  {
    label: '库',
    brief:
      '一个 TypeScript 库，把任意异步函数变成可重放的状态机：每一步的输入输出都落盘，进程崩了之后从最后一个成功的步骤继续，而不是从头再来。',
  },
  {
    label: '编辑器插件',
    brief:
      '一个编辑器插件，在你改动某个函数时，把仓库里所有依赖它的调用点安静地列在侧边，按「改了会炸」的可能性排序，不做任何自动修改。',
  },
]

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
  onConfigure,
}: {
  boot: Bootstrap | null
  busy: boolean
  onConfigure: () => void
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
        <h1 className="opening__title">
          给这个东西
          <br />
          起一个<em>名字</em>。
        </h1>

        <div className="field">
          <label className="field__label" htmlFor="brief">
            这个项目是做什么的？写得越具体越好
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
          <AnimatePresence initial={false}>
            {brief.trim() === '' && (
              <motion.div
                className="examples"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                <span>示例</span>
                {EXAMPLES.map(e => (
                  <button
                    key={e.label}
                    className="chip"
                    onClick={() => {
                      setBrief(e.brief)
                      area.current?.focus()
                    }}
                  >
                    {e.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button className="btn btn--ghost btn--sm" onClick={() => setMore(m => !m)} style={{ marginBottom: 10 }}>
          {more ? '收起' : '更多设置'} {more ? '▴' : '▾'}
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
                <div className="field__label">你已经想过的名字</div>
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
                  名字的罕见程度
                  <span className="field__value">
                    {rarityWord(rarityPercent(threshold))} · {rarityPercent(threshold)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={RARITY_MIN}
                  max={RARITY_MAX}
                  step={5}
                  value={rarityPercent(threshold)}
                  onChange={e => setThreshold(thresholdForRarity(Number(e.target.value)))}
                  style={{ width: '100%', accentColor: 'var(--brass)' }}
                />
              </div>

              {boot && (
                <div className="field">
                  <div className="field__label">取名时遵守的规则</div>
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
        </div>

        {boot && !boot.provider.configured && (
          <div className="warnbox">
            还没配置模型：{boot.provider.problem}
            <div style={{ marginTop: 10 }}>
              <button className="btn btn--sm" onClick={onConfigure}>
                现在配置
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
