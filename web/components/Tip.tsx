import { useCallback, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'

interface Props {
  content: ReactNode
  children: ReactNode
  className?: string
  onClick?: () => void
  /** Delay before the tooltip appears, in ms. Long hovers only. */
  delay?: number
}

/**
 * A hover card that is allowed to be wordy — most of what this app knows about
 * a name is a sentence with a caveat in it, and the caveat is the point.
 */
export function Tip({ content, children, className, onClick, delay = 240 }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [box, setBox] = useState<{ x: number; y: number; below: boolean } | null>(null)

  const show = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      const below = r.top < 190
      setBox({
        x: Math.min(Math.max(r.left + r.width / 2, 180), window.innerWidth - 180),
        y: below ? r.bottom + 10 : r.top - 10,
        below,
      })
    }, delay)
  }, [delay])

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setBox(null)
  }, [])

  return (
    <>
      <span
        ref={ref}
        className={className}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={
          onClick
            ? e => {
                e.stopPropagation()
                hide()
                onClick()
              }
            : undefined
        }
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onClick()
                }
              }
            : undefined
        }
      >
        {children}
      </span>
      {createPortal(
        <AnimatePresence>
          {box && (
            <div
              className={`tip-anchor${box.below ? ' tip-anchor--below' : ''}`}
              style={{ left: box.x, top: box.y }}
            >
              <motion.div
                className="tip"
                initial={{ opacity: 0, y: box.below ? -5 : 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: box.below ? -3 : 3 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {content}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
