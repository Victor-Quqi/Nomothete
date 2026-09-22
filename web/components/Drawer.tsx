import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'

export function Drawer({
  open,
  title,
  onClose,
  children,
  actions,
  modal = true,
}: {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
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
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

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
          <motion.aside
            className="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 36, mass: 0.9 }}
            role="dialog"
            aria-modal={modal}
          >
            <div className="drawer__head">
              <div className="drawer__title">{title}</div>
              {actions}
              <button className="drawer__x" onClick={onClose} aria-label="关闭">
                ✕
              </button>
            </div>
            <div className="drawer__body">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
