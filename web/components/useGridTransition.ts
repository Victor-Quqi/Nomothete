import { useLayoutEffect, useRef, type RefObject } from 'react'
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

/** Measure and animate only the cards intersecting the scroll viewport. */
export function useGridTransition(gridRef: RefObject<HTMLDivElement | null>, items: readonly { id: string }[], paneOpen: boolean) {
  const before = useRef<Map<string, Position> | null>(null)
  const animations = useRef(new Map<HTMLElement, Animation>())
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
    for (const animation of animations.current.values()) animation.cancel()
    animations.current.clear()
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
    if (grid) resetPlateMeasurements(grid)
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

  useLayoutEffect(() => () => {
    for (const animation of animations.current.values()) animation.cancel()
    animations.current.clear()
  }, [])

  return capture
}
