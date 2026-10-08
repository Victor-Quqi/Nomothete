import { tr } from '../i18n.ts'
import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion, usePresence, useReducedMotion } from 'motion/react'

function DrawerPanel({ modal, children, variant }: { modal: boolean; children: ReactNode; variant?: 'settings' | 'pane' }) {
  const [present, remove] = usePresence()
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    if (present) return
    const timer = setTimeout(() => remove?.(), reducedMotion ? 0 : 350)
    return () => clearTimeout(timer)
  }, [present, remove, reducedMotion])
  return (
    <aside
      className={`drawer${variant ? ` drawer--${variant}` : ''}`}
      data-open={present}
      onTransitionEnd={e => {
        if (!present && e.target === e.currentTarget && e.propertyName === 'transform') remove?.()
      }}
      role="dialog"
      aria-modal={modal}
      inert={!present}
    >
      {children}
    </aside>
  )
}

export function Drawer({
  open,
  title,
  onClose,
  children,
  actions,
  modal = true,
  variant,
}: {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
  variant?: 'settings' | 'pane'
  /**
   * Dim the page behind and swallow clicks on it. Right for a form you have to
   * finish; wrong for reading one name off a wall of them, where the scrim is
   * what turns a glance into a round trip — it costs a click to get out before
   * the next card will answer at all.
   */
  modal?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Beside a pane, a text field (its note box, the wall's search) takes the
      // first Escape to let go, and letting go is what saves a note. Closing
      // over it would drop the draft with the field. The next Escape closes.
      const el = document.activeElement
      if (!modal && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose, modal])

  return (
    <AnimatePresence>
      {open && (
        <>
          {modal && (
            <motion.div
              className="drawer__scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={onClose}
            />
          )}
          <DrawerPanel modal={modal} variant={variant}>
            <div className="drawer__head">
              <div className="drawer__title">{title}</div>
              {actions}
              <button className="drawer__x" onClick={onClose} aria-label={tr('关闭', 'Close')}>
                ✕
              </button>
            </div>
            <div className="drawer__body">{children}</div>
          </DrawerPanel>
        </>
      )}
    </AnimatePresence>
  )
}
