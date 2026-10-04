import type { ReactNode } from 'react'
import { motion } from 'motion/react'

/**
 * A block that opens and closes by its height, inside an AnimatePresence.
 *
 * The animated box has no padding, border or margin of its own. Those do not
 * shrink with the height, so the box would stop at their size and then vanish
 * in one step. Spacing goes on `className`, which is the box inside.
 */
export function Fold({ className, duration = 0.28, children }: { className?: string; duration?: number; children: ReactNode }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration, ease: [0.16, 1, 0.3, 1] }}
      style={{ overflow: 'hidden' }}
    >
      <div className={className}>{children}</div>
    </motion.div>
  )
}
