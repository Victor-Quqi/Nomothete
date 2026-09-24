export function resetPlateMeasurements(grid: HTMLElement) {
  for (const node of grid.querySelectorAll<HTMLElement>('.plate-slot')) {
    delete node.dataset.prepared
    node.style.removeProperty('contain-intrinsic-block-size')
  }
}

/** Resolve nearby row heights before measuring a scroll destination. */
export function preparePlate(slot: HTMLElement) {
  const grid = slot.parentElement!
  const canvas = grid.parentElement!
  const slots = Array.from(grid.children).filter((node): node is HTMLElement =>
    node instanceof HTMLElement && node.classList.contains('plate-slot') && !node.hidden,
  )
  const center = slot.offsetTop + slot.offsetHeight / 2
  // Include the browser's offscreen rendering margin on both sides of the viewport.
  const radius = canvas.clientHeight * 2 + 1000
  const nearby = new Set(slots.filter(node =>
    node.offsetTop + node.offsetHeight >= center - radius && node.offsetTop <= center + radius,
  ))
  const previous = Array.from(grid.querySelectorAll<HTMLElement>('[data-prepared]'))

  // Save measured heights before returning old rows to deferred layout.
  const heights = previous.map(node => [node, node.offsetHeight] as const)
  for (const [node, height] of heights) {
    if (height && node.style.containIntrinsicBlockSize !== `${height}px`) node.style.containIntrinsicBlockSize = `${height}px`
    if (!nearby.has(node)) delete node.dataset.prepared
  }
  for (const node of nearby) node.dataset.prepared = ''
}

export function scrollToPlate(plate: HTMLElement, behavior: 'smooth' | 'instant') {
  const slot = plate.parentElement!
  const grid = slot.parentElement!
  const canvas = grid.parentElement!
  preparePlate(slot)

  // This read lays out the prepared rows together, before the destination is measured.
  const top = canvas.scrollTop + grid.getBoundingClientRect().top - canvas.getBoundingClientRect().top +
    slot.offsetTop + slot.offsetHeight / 2 - canvas.clientHeight / 2
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const distant = Math.abs(top - canvas.scrollTop) > canvas.clientHeight
  canvas.scrollTo({ top: Math.max(0, top), behavior: reduced || distant ? 'instant' : behavior })
}
