import { useLayoutEffect, useRef, type RefObject } from 'react'

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

/** Measure and animate only the cards intersecting the scroll viewport. */
export function useGridTransition(gridRef: RefObject<HTMLDivElement | null>, items: readonly { id: string }[]) {
  const before = useRef<Map<string, Position> | null>(null)
  const animations = useRef(new Map<HTMLElement, Animation>())
  const previousIds = useRef(new Set(items.map(item => item.id)))

  const capture = () => {
    const grid = gridRef.current
    if (!grid) return
    const positions = new Map<string, Position>()
    for (const node of visibleSlots(grid)) {
      const rect = node.getBoundingClientRect()
      positions.set(node.dataset.candidate!, {
        x: rect.x, y: rect.y, opacity: Number(getComputedStyle(node).opacity),
      })
    }
    before.current = positions
  }

  useLayoutEffect(() => {
    const positions = before.current
    const grid = gridRef.current
    const added = new Set(items.filter(item => !previousIds.current.has(item.id)).map(item => item.id))
    previousIds.current = new Set(items.map(item => item.id))
    if (!grid || (!positions && added.size === 0)) return
    before.current = null
    if (positions) {
      for (const animation of animations.current.values()) animation.cancel()
      animations.current.clear()
      grid.parentElement!.scrollTo({ top: 0, behavior: 'instant' })
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // Finish every geometry read before starting animations.
    const targets = visibleSlots(grid)
      .filter(node => positions || added.has(node.dataset.candidate!))
      .map(node => ({ node, rect: node.getBoundingClientRect() }))
    for (const { node, rect } of targets) {
      const previous = positions?.get(node.dataset.candidate!)
      const dx = previous ? previous.x - rect.x : 0
      const dy = previous ? previous.y - rect.y : 8
      if (previous && Math.abs(dx) < 1 && Math.abs(dy) < 1 && previous.opacity === 1) continue
      const animation = node.animate([
        { transform: `translate(${dx}px, ${dy}px)`, opacity: previous?.opacity ?? 0 },
        { transform: 'translate(0, 0)', opacity: 1 },
      ], { duration: 220, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' })
      animations.current.set(node, animation)
      animation.onfinish = () => {
        if (animations.current.get(node) === animation) animations.current.delete(node)
      }
    }
  }, [gridRef, items])

  useLayoutEffect(() => () => {
    for (const animation of animations.current.values()) animation.cancel()
    animations.current.clear()
  }, [])

  return capture
}
