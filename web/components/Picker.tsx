import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'

export interface PickerOption {
  id: string
  label: string
  /** Families carry a hue; sorts do not. */
  hue?: number
  /** A tally, shown at the end of the row. */
  n?: number
  /** One of the row above's own kinds, set in under it. */
  sub?: boolean
}

interface Props {
  options: PickerOption[]
  /** A list makes the rows switches: any number can be on, and picking one
      leaves the menu open for the next. */
  value: string | null | string[]
  /** With a list, the id of the row that was switched; null clears. */
  onPick: (id: string | null) => void
  /** What the button says while nothing is chosen. */
  label?: string
  /** The row that means "no choice made". Given only by the pickers that
      filter: an ordering always has an answer. */
  clearLabel?: string
  clearN?: number
  /** Which edge of the button the menu lines up with. */
  align?: 'left' | 'right'
  title?: string
}

/**
 * A chip that holds a list behind it. Six family chips in a row spend the whole
 * bar on options nobody has taken yet; folded into one chip they spend a word,
 * and the chip says which one is taken.
 */
export function Picker({ options, value, onPick, label, clearLabel, clearN, align = 'left', title }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ top: number; left?: number; right?: number } | null>(null)

  const open = box !== null
  const multi = Array.isArray(value)
  const chosen = multi ? value : value === null ? [] : [value]
  const current = options.find(o => chosen.includes(o.id)) ?? null
  // One dot missing from a column of dots reads as a mistake, so the rows agree
  // on whether they are dotted at all.
  const dotted = options.some(o => o.hue !== undefined)

  const close = useCallback(() => setBox(null), [])
  const rows = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('.picker__row') ?? [])]

  const toggle = useCallback(() => {
    if (open) return close()
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    setBox({
      top: r.bottom + 8,
      left: align === 'right' ? undefined : r.left,
      right: align === 'right' ? window.innerWidth - r.right : undefined,
    })
  }, [open, close, align])

  const pick = useCallback(
    (id: string | null) => {
      onPick(id)
      if (multi && id !== null) return
      close()
      btnRef.current?.focus()
    },
    [onPick, close, multi],
  )

  // The menu opens on the choice in force. Only on opening: a switch flipped
  // inside an open menu keeps the cursor where it is.
  useEffect(() => {
    if (!open) return
    const list = rows()
    ;(list.find(row => row.dataset.on === 'true') ?? list[0])?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape belongs to the open menu first; the workspace uses it to drop the
      // focused plate, and closing both at one keystroke loses your place.
      e.stopPropagation()
      close()
      btnRef.current?.focus()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  return (
    <>
      <button
        ref={btnRef}
        className={`chip picker${clearLabel && chosen.length > 0 ? ' chip--on' : ''}`}
        onClick={toggle}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current?.hue !== undefined && (
          <i className="picker__dot" style={{ background: `hsl(${current.hue} var(--dot-s) var(--dot-l))` }} />
        )}
        {current?.label ?? label ?? clearLabel ?? ''}
        {chosen.length > 1 ? (
          <span className="chip__n">+{chosen.length - 1}</span>
        ) : (
          current?.n !== undefined && <span className="chip__n">{current.n}</span>
        )}
        <svg className="picker__caret" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
          <path
            d="M2.2 4l2.8 2.8L7.8 4"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>

      {createPortal(
        <AnimatePresence>
          {box && (
            <motion.div
              ref={menuRef}
              className="picker__menu"
              style={{ top: box.top, left: box.left, right: box.right }}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              role="listbox"
              aria-multiselectable={multi}
              onKeyDown={e => {
                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                e.preventDefault()
                const list = rows()
                const i = list.indexOf(document.activeElement as HTMLButtonElement)
                const step = e.key === 'ArrowDown' ? 1 : -1
                list[(i + step + list.length) % list.length]?.focus()
              }}
            >
              {clearLabel && (
                <button
                  className="picker__row"
                  data-on={chosen.length === 0}
                  role="option"
                  aria-selected={chosen.length === 0}
                  onMouseEnter={e => e.currentTarget.focus({ preventScroll: true })}
                  onClick={() => pick(null)}
                >
                  {dotted && <i className="picker__dot" />}
                  {multi && <i className="picker__tick" />}
                  <span className="picker__label">{clearLabel}</span>
                  {clearN !== undefined && <span className="chip__n">{clearN}</span>}
                </button>
              )}
              {options.map(o => (
                <button
                  key={o.id}
                  className={`picker__row${o.sub ? ' picker__row--sub' : ''}`}
                  data-on={chosen.includes(o.id)}
                  data-none={o.n === 0}
                  role="option"
                  aria-selected={chosen.includes(o.id)}
                  // Hovering a row moves the cursor onto it, so the pointer and
                  // the arrow keys leave the menu in the same state — one row
                  // lit, and the next key press steps from where you are.
                  onMouseEnter={e => e.currentTarget.focus({ preventScroll: true })}
                  onClick={() => pick(o.id)}
                >
                  {dotted && (
                    <i
                      className="picker__dot"
                      style={o.hue !== undefined ? { background: `hsl(${o.hue} var(--dot-s) var(--dot-l))` } : undefined}
                    />
                  )}
                  {multi && (
                    <i className="picker__tick">
                      {chosen.includes(o.id) && (
                        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
                          <path
                            d="M2 5.2l2 2L8 3"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                          />
                        </svg>
                      )}
                    </i>
                  )}
                  <span className="picker__label">{o.label}</span>
                  {o.n !== undefined && <span className="chip__n">{o.n}</span>}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
