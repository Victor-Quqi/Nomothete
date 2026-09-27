import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

export interface Command {
  id: string
  label: string
  hint?: string
  group: string
  run: () => void
}

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean
  commands: Command[]
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const followKeyboard = useRef(true)

  useEffect(() => {
    if (open) {
      followKeyboard.current = true
      setQ('')
      setI(0)
      setTimeout(() => input.current?.focus(), 30)
    }
  }, [open])

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return commands
    return commands.filter(c => `${c.label} ${c.hint ?? ''} ${c.group}`.toLowerCase().includes(needle))
  }, [q, commands])

  useEffect(() => setI(0), [q])

  useLayoutEffect(() => {
    if (!open || !followKeyboard.current) return
    list.current?.querySelector<HTMLElement>('[data-on="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  }, [open, i, hits])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="palette__scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
        >
          <motion.div
            className="palette"
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 36 }}
            onClick={e => e.stopPropagation()}
          >
            <input
              ref={input}
              value={q}
              placeholder="做点什么…"
              onChange={e => {
                followKeyboard.current = true
                setQ(e.target.value)
              }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  followKeyboard.current = true
                  setI(x => Math.max(0, Math.min(hits.length - 1, x + 1)))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  followKeyboard.current = true
                  setI(x => Math.max(0, x - 1))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const hit = hits[i]
                  if (hit) {
                    onClose()
                    hit.run()
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  onClose()
                }
              }}
            />
            <div ref={list} className="palette__list">
              {hits.length === 0 && <div className="palette__empty">没有匹配的命令</div>}
              {hits.map((c, idx) => (
                <button
                  key={c.id}
                  className="palette__item"
                  data-on={idx === i}
                  onMouseMove={() => {
                    followKeyboard.current = false
                    setI(idx)
                  }}
                  onClick={() => {
                    onClose()
                    c.run()
                  }}
                >
                  <span style={{ color: 'var(--text-4)', fontSize: 12, width: 46, flex: 'none' }}>{c.group}</span>
                  <span>{c.label}</span>
                  {c.hint && <small>{c.hint}</small>}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
