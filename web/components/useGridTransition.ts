import { useLayoutEffect, useRef, type RefObject } from 'react'
import { CardMotion } from './cardMotion.ts'
import { resetPlateMeasurements } from './scrollToPlate.ts'

type Position = { x: number; y: number; opacity: number }

function visibleSlots(grid: HTMLElement) {
  const canvas = grid.parentElement!
  const top = canvas.getBoundingClientRect().top - grid.getBoundingClientRect().top
  const bottom = top + canvas.clientHeight
  const visible: HTMLElement[] = []
  for (const node of grid.children) {
    if (!(node instanceof HTMLElement) || node.hidden || !node.dataset.candidate) continue
    const y = node.offsetTop
    if (y >= bottom) break
    if (y + node.offsetHeight > top) visible.push(node)
  }
  return visible
}

/**
 * Give the slots in view their real layout before anything is measured.
 *
 * A slot the browser has never rendered, such as a card that just arrived or
 * one pushed into view for the first time, is laid out at its
 * contain-intrinsic-size placeholder until the browser notices it is on
 * screen, a frame later. Measuring then would aim at the placeholder, and the
 * cards behind it would jump again when the real height lands. Only slots in
 * view are opened; offscreen ones keep deferring. Laying out real heights can
 * change which slots are in view, so this repeats until the set settles.
 */
function prepareVisible(grid: HTMLElement) {
  for (let pass = 0; pass < 4; pass++) {
    let opened = false
    for (const node of visibleSlots(grid)) {
      if (node.dataset.prepared !== undefined) continue
      node.dataset.prepared = ''
      opened = true
    }
    if (!opened) return
  }
}

/**
 * Measure and animate only the cards intersecting the scroll viewport. How
 * they move is CardMotion's business; this hook decides when, and from where.
 */
export function useGridTransition(gridRef: RefObject<HTMLDivElement | null>, items: readonly { id: string }[], paneOpen: boolean) {
  const before = useRef<{ positions: Map<string, Position>; reset: boolean; scrolled: number } | null>(null)
  const motion = useRef<CardMotion | null>(null)
  motion.current ??= new CardMotion()
  const previousIds = useRef(new Set(items.map(item => item.id)))
  const previousPane = useRef(paneOpen)

  useLayoutEffect(() => {
    if (previousPane.current === paneOpen) return
    previousPane.current = paneOpen
    const grid = gridRef.current
    if (!grid || window.matchMedia('(max-width: 1080px), (prefers-reduced-motion: reduce)').matches) return
    const canvas = grid.parentElement!
    const shell = grid.closest<HTMLElement>('.shell')!
    const style = getComputedStyle(canvas)
    const shellStyle = getComputedStyle(shell)
    const targetWidth = shell.clientWidth - parseFloat(shellStyle.getPropertyValue('--rail-w')) -
      (paneOpen ? parseFloat(shellStyle.getPropertyValue('--drawer-w')) : 0) -
      parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - (canvas.offsetWidth - canvas.clientWidth)

    // Keep a noninteractive copy of the visible old layout while the live
    // grid is laid out once at its destination width.
    const snapshot = document.createElement('div')
    snapshot.className = 'plates-snapshot'
    snapshot.inert = true
    snapshot.setAttribute('aria-hidden', 'true')
    const rect = grid.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()
    snapshot.style.left = `${rect.left - canvasRect.left}px`
    snapshot.style.top = `${canvas.scrollTop}px`
    snapshot.style.height = `${canvas.clientHeight}px`
    snapshot.style.width = `${grid.clientWidth}px`
    for (const node of visibleSlots(grid)) {
      const box = node.getBoundingClientRect()
      const copy = node.cloneNode(true) as HTMLElement
      copy.removeAttribute('id')
      for (const child of copy.querySelectorAll('[id]')) child.removeAttribute('id')
      Object.assign(copy.style, {
        position: 'absolute', left: `${box.left - rect.left}px`, top: `${box.top - canvasRect.top}px`,
        width: `${box.width}px`, height: `${box.height}px`, contentVisibility: 'visible', transform: 'none',
      })
      snapshot.append(copy)
    }
    motion.current!.clear()
    canvas.append(snapshot)
    grid.style.width = `${Math.max(0, targetWidth)}px`
    resetPlateMeasurements(grid)
    const fadeOut = snapshot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' })
    const fadeIn = grid.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 })
    fadeOut.onfinish = () => snapshot.remove()
    const finish = () => {
      grid.style.removeProperty('width')
      snapshot.remove()
    }
    const onEnd = (event: TransitionEvent) => {
      if (event.target === shell && event.propertyName === 'grid-template-columns') finish()
    }
    shell.addEventListener('transitionend', onEnd)
    const timer = setTimeout(finish, 380)
    return () => {
      clearTimeout(timer)
      shell.removeEventListener('transitionend', onEnd)
      fadeIn.cancel()
      fadeOut.cancel()
      finish()
    }
  }, [gridRef, paneOpen])

  const read = () => {
    const grid = gridRef.current
    if (!grid) return null
    const origin = grid.getBoundingClientRect()
    const positions = new Map<string, Position>()
    for (const node of visibleSlots(grid)) {
      const rect = node.getBoundingClientRect()
      positions.set(node.dataset.candidate!, {
        x: rect.x - origin.x, y: rect.y - origin.y, opacity: Number(getComputedStyle(node).opacity),
      })
    }
    return positions
  }

  /** A filter or sort the user chose: the wall re-lays and returns to the top. */
  const capture = () => {
    const positions = read()
    if (positions) before.current = { positions, reset: true, scrolled: 0 }
  }

  /**
   * Any other change to the list, such as a name arriving over the stream.
   * Called from BeforeCommit, so the positions are what is on screen at that
   * frame, animations in flight included.
   */
  const captureCommit = () => {
    if (before.current) return
    const positions = read()
    if (positions) before.current = { positions, reset: false, scrolled: 0 }
  }

  useLayoutEffect(() => {
    const snap = before.current
    before.current = null
    const grid = gridRef.current
    if (grid) resetPlateMeasurements(grid)
    const added = new Set(items.filter(item => !previousIds.current.has(item.id)).map(item => item.id))
    previousIds.current = new Set(items.map(item => item.id))
    if (!grid || (!snap && added.size === 0)) return
    if (snap?.reset) {
      snap.scrolled = grid.parentElement!.scrollTop
      grid.parentElement!.scrollTo({ top: 0, behavior: 'instant' })
    }
    prepareVisible(grid)
    // The detail pane's cross-fade owns the wall while it runs.
    if (grid.parentElement!.querySelector('.plates-snapshot')) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // No movement: every card is at once where it belongs, and a card new
      // to the wall only fades in there.
      motion.current!.clear()
      for (const node of visibleSlots(grid)) {
        if (added.has(node.dataset.candidate!)) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'linear' })
      }
      return
    }

    // Positions are relative to the grid, so the reset path's scroll to the
    // top reads as the cards moving up, as it does on screen.
    const origin = grid.getBoundingClientRect()
    const shift = snap?.reset ? snap.scrolled : 0
    for (const node of visibleSlots(grid)) {
      const rect = node.getBoundingClientRect()
      const applied = motion.current!.offset(node)
      const slot = { x: rect.x - origin.x - applied.x, y: rect.y - origin.y - applied.y, w: rect.width, h: rect.height }
      const id = node.dataset.candidate!
      const previous = snap?.positions.get(id)
      if (previous) {
        const was = { ...previous, y: previous.y - shift }
        if (Math.abs(was.x - rect.x + origin.x) < 1 && Math.abs(was.y - rect.y + origin.y) < 1 && previous.opacity === 1) {
          motion.current!.resettle(node, slot)
        } else {
          motion.current!.moved(node, was, slot)
        }
      } else if (added.has(id) || snap?.reset) {
        motion.current!.entered(node, slot)
      } else {
        motion.current!.resettle(node, slot)
      }
    }
  }, [gridRef, items])

  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    let width = grid.clientWidth
    let settled: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver(() => {
      if (grid.clientWidth === width) return
      width = grid.clientWidth
      // Width changes every frame while the detail pane moves. Reset the
      // offscreen measurements once the pane settles, not on every frame.
      clearTimeout(settled)
      settled = setTimeout(() => resetPlateMeasurements(grid), 100)
    })
    observer.observe(grid)
    return () => {
      observer.disconnect()
      clearTimeout(settled)
    }
  }, [gridRef])

  useLayoutEffect(() => () => motion.current?.clear(), [])

  return { capture, captureCommit }
}
