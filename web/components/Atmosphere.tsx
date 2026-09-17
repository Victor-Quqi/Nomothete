import { motion } from 'motion/react'

/**
 * The room. A lamp above the bench that brightens while a batch is out, film
 * grain over everything, and a vignette so the edges fall away.
 */
export function Atmosphere({ working }: { working: boolean }) {
  return (
    <div className="atmos" aria-hidden>
      <motion.div
        className="atmos__lamp"
        animate={working ? { opacity: 1, scale: 1.04 } : { opacity: 0.55, scale: 1 }}
        transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className="atmos__grain" />
      <div className="atmos__vignette" />
    </div>
  )
}
