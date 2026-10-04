import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import type { Family, GenerateAsk, StrategyInfo } from '../types.ts'
import { tr } from '../i18n.ts'

const WIDTHS = [2, 4, 6]

/**
 * 再来一批, with a say in it: a line for where this batch should lean, and the
 * Strategies to run. Both are optional and both are for this batch only; left
 * empty, it is the plain button.
 */
export function BatchComposer({
  open,
  anchor,
  families,
  strategies,
  onClose,
  onGenerate,
}: {
  open: boolean
  /** The dock, which the panel stands on. */
  anchor: RefObject<HTMLElement | null>
  families: Family[]
  strategies: StrategyInfo[]
  onClose: () => void
  onGenerate: (ask: GenerateAsk) => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [direction, setDirection] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [width, setWidth] = useState(4)
  const [box, setBox] = useState<{ bottom: number; right: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const r = anchor.current?.getBoundingClientRect()
    if (r) setBox({ bottom: window.innerHeight - r.top + 10, right: Math.max(12, window.innerWidth - r.right) })
  }, [open, anchor])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onClose)
    }
  }, [open, anchor, onClose])

  const submit = () => {
    onGenerate({
      direction: direction.trim() || undefined,
      ...(chosen.length > 0 ? { strategyIds: chosen } : { width }),
    })
    setDirection('')
    setChosen([])
    onClose()
  }

  const toggle = (id: string) => setChosen(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]))

  return createPortal(
    <AnimatePresence>
      {open && box && (
        <motion.div
          ref={panel}
          className="composer"
          role="dialog"
          aria-label={tr('再来一批', 'Another batch')}
          style={{ bottom: box.bottom, right: box.right }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        >
          <input
            className="composer__direction"
            autoFocus
            value={direction}
            maxLength={200}
            placeholder={tr('这一批往哪边走，可不写。比如：和潮汐有关', 'Where should this batch go? Optional. For example: something about tides')}
            onChange={e => setDirection(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
            }}
          />
          <div className="composer__families">
            {families.map(f => {
              const own = strategies.filter(s => s.family === f.id)
              if (own.length === 0) return null
              return (
                <div key={f.id} className="composer__family" style={{ ['--fam-hue' as string]: f.hue }}>
                  <span className="composer__family-label">
                    <i />
                    {f.label}
                  </span>
                  <span className="composer__strategies">
                    {own.map(s => (
                      <button
                        key={s.id}
                        className={`chip composer__strategy${chosen.includes(s.id) ? ' chip--on' : ''}`}
                        aria-pressed={chosen.includes(s.id)}
                        title={s.brief}
                        onClick={() => toggle(s.id)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="composer__foot">
            {chosen.length === 0 ? (
              <span className="composer__width">
                {tr('自动挑', 'Auto-pick ')}
                {WIDTHS.map(n => (
                  <button key={n} className="composer__n" data-on={n === width} onClick={() => setWidth(n)}>
                    {n}
                  </button>
                ))}
                {tr('种方法', ' methods')}
              </span>
            ) : (
              <span className="composer__width">
                {tr(`只用选中的 ${chosen.length} 种`, `Use only ${chosen.length} selected ${chosen.length === 1 ? 'method' : 'methods'}`)}
                <button className="composer__clear" onClick={() => setChosen([])}>
                  {tr('清空', 'Clear')}
                </button>
              </span>
            )}
            <button className="dock__act" onClick={submit}>
              {tr('生成', 'Generate')} <kbd>↵</kbd>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
