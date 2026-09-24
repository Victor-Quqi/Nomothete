import { useLayoutEffect, useRef, type RefObject } from 'react'
import { CardMotion } from './cardMotion.ts'
import { resetPlateMeasurements } from './scrollToPlate.ts'
import { transitionPane, type PaneAnchor } from './paneTransition.ts'

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
export function useGridTransition(gridRef: RefObject<HTMLDivElement | null>, items: readonly { id: string }[], detailId?: string) {
  const before = useRef<{ positions: Map<string, Position>; reset: boolean; scrolled: number } | null>(null)
  const motion = useRef<CardMotion | null>(null)
  motion.current ??= new CardMotion()
  const previousIds = useRef(new Set(items.map(item => item.id)))
  const previousDetail = useRef(detailId)
  const paneAnchor = useRef<PaneAnchor | null>(null)
  const paneMotion = useRef<ReturnType<typeof transitionPane> | null>(null)

  // BeforeCommit reads the old viewport before the shell starts changing width.
  const capturePane = () => {
    const grid = gridRef.current
    paneAnchor.current = null
    if (!grid) return
    const canvas = grid.parentElement!
    const id = detailId ?? previousDetail.current
    let slot = Array.from(grid.children).find((node): node is HTMLElement =>
      node instanceof HTMLElement && node.dataset.candidate === id && !node.hidden,
    )
    const bounds = canvas.getBoundingClientRect()
    const box = slot?.getBoundingClientRect()
    // Closing after browsing elsewhere preserves the current reading position.
    if (!slot || (!detailId && box && (box.bottom <= bounds.top || box.top >= bounds.bottom))) {
      const visible = visibleSlots(grid)
      slot = visible.find(node => node.getBoundingClientRect().top >= bounds.top) ?? visible[0]
    }
    if (slot) {
      const rect = slot.getBoundingClientRect()
      paneAnchor.current = {
        slot, top: rect.top, left: rect.left - grid.getBoundingClientRect().left,
      }
    }
  }

  useLayoutEffect(() => {
    const wasOpen = !!previousDetail.current
    previousDetail.current = detailId
    if (wasOpen === !!detailId) {
      paneMotion.current?.cancel()
      return
    }
    // A rapid reversal must not restore the previous transition's anchor.
    paneMotion.current?.cancel()
    paneMotion.current?.finish()
    paneMotion.current = null
    const grid = gridRef.current
    if (!grid || window.matchMedia('(max-width: 1080px)').matches) return
    motion.current!.clear()
    paneMotion.current = transitionPane(grid, paneAnchor.current, !!detailId)
    paneAnchor.current = null
  }, [gridRef, detailId])

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
    if (grid && grid.parentElement!.dataset.paneTransition === undefined) resetPlateMeasurements(grid)
    const added = new Set(items.filter(item => !previousIds.current.has(item.id)).map(item => item.id))
    previousIds.current = new Set(items.map(item => item.id))
    if (!grid || (!snap && added.size === 0)) return
    if (snap?.reset) {
      paneMotion.current?.cancel()
      snap.scrolled = grid.parentElement!.scrollTop
      grid.parentElement!.scrollTo({ top: 0, behavior: 'instant' })
    }
    prepareVisible(grid)
    // The pane owns card motion until its width settles.
    if (grid.parentElement!.dataset.paneTransition !== undefined) return
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
      clearTimeout(settled)
      if (grid.parentElement!.dataset.paneTransition !== undefined) return
      // Ordinary window resizing invalidates the cached offscreen heights.
      settled = setTimeout(() => resetPlateMeasurements(grid), 100)
    })
    observer.observe(grid)
    return () => {
      observer.disconnect()
      clearTimeout(settled)
    }
  }, [gridRef])

  useLayoutEffect(() => () => {
    motion.current?.clear()
    paneMotion.current?.cancel()
    paneMotion.current?.finish()
  }, [])

  return { capture, captureCommit, capturePane }
}
