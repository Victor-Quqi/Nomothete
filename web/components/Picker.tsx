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
}

interface Props {
  options: PickerOption[]
  value: string | null
  onPick: (id: string | null) => void
  /** The row that means "no choice made", and the button's resting label. Given
      only by the pickers that filter: an ordering always has an answer. */
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
export function Picker({ options, value, onPick, clearLabel, clearN, align = 'left', title }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ top: number; left?: number; right?: number } | null>(null)

  const open = box !== null
  const current = options.find(o => o.id === value) ?? null
  // One dot missing from a column of dots reads as a mistake, so the rows agree
  // on whether they are dotted at all.
  const dotted = options.some(o => o.hue !== undefined)

  const close = useCallback(() => setBox(null), [])

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
      close()
      btnRef.current?.focus()
    },
    [onPick, close],
  )

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

  const rows = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('.picker__row') ?? [])]

  return (
    <>
      <button
        ref={btnRef}
        className={`chip picker${clearLabel && value ? ' chip--on' : ''}`}
        onClick={toggle}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current?.hue !== undefined && (
          <i className="picker__dot" style={{ background: `hsl(${current.hue} 55% 55%)` }} />
        )}
        {current?.label ?? clearLabel ?? ''}
        {current?.n !== undefined && <span className="chip__n">{current.n}</span>}
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
                  data-on={value === null}
                  role="option"
                  aria-selected={value === null}
                  ref={el => {
                    if (value === null) el?.focus()
                  }}
                  onMouseEnter={e => e.currentTarget.focus({ preventScroll: true })}
                  onClick={() => pick(null)}
                >
                  {dotted && <i className="picker__dot" />}
                  <span className="picker__label">{clearLabel}</span>
                  {clearN !== undefined && <span className="chip__n">{clearN}</span>}
                </button>
              )}
              {options.map(o => (
                <button
                  key={o.id}
                  className="picker__row"
                  data-on={o.id === value}
                  role="option"
                  aria-selected={o.id === value}
                  ref={el => {
                    if (o.id === value) el?.focus()
                  }}
                  // Hovering a row moves the cursor onto it, so the pointer and
                  // the arrow keys leave the menu in the same state — one row
                  // lit, and the next key press steps from where you are.
                  onMouseEnter={e => e.currentTarget.focus({ preventScroll: true })}
                  onClick={() => pick(o.id)}
                >
                  {dotted && (
                    <i
                      className="picker__dot"
                      style={o.hue !== undefined ? { background: `hsl(${o.hue} 55% 55%)` } : undefined}
                    />
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
