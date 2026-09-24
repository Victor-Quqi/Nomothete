import { preparePlate, resetPlateMeasurements } from './scrollToPlate.ts'

export type PaneAnchor = { slot: HTMLElement; top: number; left: number }

/** Keep the reading position while the pane changes the grid's column count. */
export function transitionPane(grid: HTMLElement, anchor: PaneAnchor | null, open: boolean) {
  const canvas = grid.parentElement!
  const shell = grid.closest<HTMLElement>('.shell')!
  const dock = shell.querySelector<HTMLElement>('.dock')
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const style = getComputedStyle(canvas)
  const shellStyle = getComputedStyle(shell)
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  const targetWidth = shell.clientWidth - parseFloat(shellStyle.getPropertyValue('--rail-w')) -
    (open ? parseFloat(shellStyle.getPropertyValue('--drawer-w')) : 0) -
    padding - (canvas.offsetWidth - canvas.clientWidth)
  let interrupted = false
  let finished = false
  let frame = 0
  let timer: ReturnType<typeof setTimeout>
  const animations: Animation[] = []

  // Freeze the destination width so rows reflow only once during the slide.
  canvas.dataset.paneTransition = ''
  canvas.scrollTo({ top: canvas.scrollTop, behavior: 'instant' })
  grid.style.width = `${Math.max(0, targetWidth)}px`
  resetPlateMeasurements(grid)

  const align = () => {
    if (interrupted || !anchor || !anchor.slot.isConnected || anchor.slot.hidden) return
    preparePlate(anchor.slot)
    // A second pass resolves rows that entered the rendering margin after reflow.
    for (let pass = 0; pass < 2; pass++) {
      const box = anchor.slot.getBoundingClientRect()
      const bounds = canvas.getBoundingClientRect()
      const bottom = Math.min(bounds.bottom, dock?.getBoundingClientRect().top ?? bounds.bottom)
      const top = Math.max(24, Math.min(anchor.top - bounds.top, bottom - bounds.top - box.height - 24))
      const delta = box.top - bounds.top - top
      if (Math.abs(delta) <= 0.5) break
      canvas.scrollTo({ top: canvas.scrollTop + delta, behavior: 'instant' })
      preparePlate(anchor.slot)
    }
  }
  align()

  if (!reduced) {
    const bounds = canvas.getBoundingClientRect()
    for (const slot of grid.children) {
      if (!(slot instanceof HTMLElement) || slot.hidden) continue
      const box = slot.getBoundingClientRect()
      if (box.bottom <= bounds.top || box.top >= bounds.bottom) continue
      if (slot === anchor?.slot) {
        // Keep the live card opaque and inside both the old and new viewports.
        const available = Math.min(canvas.clientWidth - padding, targetWidth)
        const scale = Math.min(1, available / box.width)
        const left = Math.max(0, Math.min(anchor.left, available - box.width * scale))
        const offset = left - slot.offsetLeft
        slot.style.zIndex = '1'
        animations.push(slot.animate([
          { transform: `translateX(${offset}px) scaleX(${scale})`, transformOrigin: 'top left' },
          { transform: 'translateX(0) scaleX(1)', transformOrigin: 'top left' },
        ], { duration: 320, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }))
      } else {
        // Neighbours appear after the selected card has nearly reached its column.
        animations.push(slot.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 140, delay: anchor ? 180 : 0, fill: 'backwards',
        }))
      }
    }
  }

  const cancel = () => {
    interrupted = true
    for (const animation of animations) animation.cancel()
    anchor?.slot.style.removeProperty('z-index')
  }
  const onKey = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'j', 'k', 'J'].includes(event.key)) cancel()
  }
  const finish = () => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    cancelAnimationFrame(frame)
    const width = grid.clientWidth
    grid.style.removeProperty('width')
    // Keep measured heights when the destination width already matches.
    if (grid.clientWidth !== width) resetPlateMeasurements(grid)
    align()
    cancel()
    delete canvas.dataset.paneTransition
    canvas.removeEventListener('wheel', cancel)
    canvas.removeEventListener('touchstart', cancel)
    canvas.removeEventListener('pointerdown', cancel)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', onResize)
    shell.removeEventListener('transitionend', onEnd)
  }
  const onResize = () => { cancel(); finish() }
  const onEnd = (event: TransitionEvent) => {
    if (!reduced && event.target === shell && event.propertyName === 'grid-template-columns') finish()
  }
  const tick = () => {
    align()
    if (!finished) frame = requestAnimationFrame(tick)
  }
  canvas.addEventListener('wheel', cancel, { passive: true })
  canvas.addEventListener('touchstart', cancel, { passive: true })
  canvas.addEventListener('pointerdown', cancel, { passive: true })
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', onResize)
  shell.addEventListener('transitionend', onEnd)
  frame = requestAnimationFrame(tick)
  // Deferred rows can settle after a reduced-motion transition has already ended.
  timer = setTimeout(finish, reduced ? 120 : 380)
  return { cancel, finish }
}
