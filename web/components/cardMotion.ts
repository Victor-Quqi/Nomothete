/**
 * Motion for cards on the wall, run on one animation frame loop.
 *
 * A card that the layout moves keeps an offset from its new slot and slides
 * home on a critically damped spring. When the layout moves it again, the
 * offset absorbs the change and the velocity carries on, so a stream of
 * arrivals bends one motion instead of restarting it. A spring also starts
 * from rest rather than at full speed, and no card overshoots its slot into a
 * neighbour.
 *
 * Two moves are not slides:
 *
 *   - A card whose slot is now in another row would cross the row between its
 *     old and new slots, over the cards moving the other way. It fades out
 *     where it was, drifting forward, then fades in at its new slot coming
 *     from the side it would have entered from.
 *   - A card new to the wall appears only at its final slot, and only once
 *     the card that was sitting there has mostly moved out, so the two never
 *     show on top of each other.
 */

/** Critically damped: ω sets the pace. Most of a one-column slide is done in ~300ms. */
const OMEGA = 11
const DRIFT = 28
const FADE_OUT_MS = 170
const FADE_IN_MS = 280
const WRAP_IN_MS = 240
/** A new card waits at most this long for its slot to clear. */
const MAX_WAIT_MS = 380
/** Share of the new card's box still covered by a visible neighbour that keeps it waiting. */
const COVER_LIMIT = 0.12

type Box = { x: number; y: number; w: number; h: number }

interface Fade {
  from: number
  to: number
  start: number
  duration: number
  then?: () => void
}

interface State {
  x: number
  y: number
  vx: number
  vy: number
  /** Spring target in offset space; (0, 0) except while fading out of an old row. */
  tx: number
  ty: number
  opacity: number
  fade?: Fade
  /** Waiting for its slot to clear, since this time. */
  waiting?: number
  /** Where layout puts the card, relative to the grid. */
  slot: Box
}

const easeOut = (t: number) => 1 - (1 - t) ** 3
const easeIn = (t: number) => t * t

export class CardMotion {
  private states = new Map<HTMLElement, State>()
  private frame = 0
  private last = 0

  /** The offset this engine has applied, so a measured rect can be turned back into a slot. */
  offset(node: HTMLElement): { x: number; y: number } {
    const s = this.states.get(node)
    return s ? { x: s.x, y: s.y } : { x: 0, y: 0 }
  }

  /**
   * The layout moved `node` to `slot`; it was showing at `was` (both relative
   * to the grid). Keeps it on screen where it was and sends it home.
   */
  moved(node: HTMLElement, was: { x: number; y: number; opacity: number }, slot: Box) {
    const s = this.states.get(node) ?? this.fresh(was.opacity, slot)
    if (s.waiting !== undefined) {
      // Not shown yet, so it has nowhere to slide from: it simply waits at its new slot.
      s.slot = slot
      this.run()
      return
    }
    const x = was.x - slot.x
    const y = was.y - slot.y
    const shiftX = x - s.x
    const shiftY = y - s.y
    s.x = x
    s.y = y
    s.slot = slot
    if (s.tx !== 0 || s.ty !== 0) {
      // Already fading out of an old row: keep holding the old spot.
      s.tx += shiftX
      s.ty += shiftY
    } else if (Math.abs(shiftY) > slot.h * 0.5 && Math.abs(shiftX) > slot.w * 0.5 && s.opacity > 0.05) {
      const forward = shiftY < 0 ? 1 : -1
      this.wrap(s, forward)
    }
    this.states.set(node, s)
    this.paint(node, s)
    this.run()
  }

  /** `node` is new to the wall, at `slot`. */
  entered(node: HTMLElement, slot: Box) {
    const s = this.fresh(0, slot)
    s.waiting = performance.now()
    this.states.set(node, s)
    this.paint(node, s)
    this.run()
  }

  /** The layout is unchanged for `node`, but its slot may have been re-measured. */
  resettle(node: HTMLElement, slot: Box) {
    const s = this.states.get(node)
    if (s) s.slot = slot
  }

  clear() {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    for (const node of this.states.keys()) {
      node.style.removeProperty('transform')
      node.style.removeProperty('opacity')
    }
    this.states.clear()
  }

  private fresh(opacity: number, slot: Box): State {
    return { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, opacity, slot }
  }

  /** Fade out where it is, drifting forward; then fade in at its slot from behind. */
  private wrap(s: State, forward: number) {
    s.tx = s.x + forward * DRIFT
    s.ty = s.y
    s.fade = {
      from: s.opacity,
      to: 0,
      start: performance.now(),
      duration: FADE_OUT_MS * s.opacity,
      then: () => {
        s.x = -forward * DRIFT
        s.y = 0
        s.vx = s.vy = 0
        s.tx = s.ty = 0
        s.fade = { from: 0, to: 1, start: performance.now(), duration: WRAP_IN_MS }
      },
    }
  }

  private run() {
    if (this.frame) return
    this.last = performance.now()
    this.frame = requestAnimationFrame(this.tick)
  }

  private tick = (now: number) => {
    const dt = Math.min(0.034, Math.max(0, (now - this.last) / 1000))
    this.last = now
    const k = OMEGA * OMEGA
    const c = 2 * OMEGA
    for (const [node, s] of this.states) {
      if (!node.isConnected || node.hidden) {
        this.drop(node)
        continue
      }
      // Two half steps keep the integration steady on a slow frame.
      for (let i = 0; i < 2; i++) {
        const h = dt / 2
        s.vx += (-k * (s.x - s.tx) - c * s.vx) * h
        s.vy += (-k * (s.y - s.ty) - c * s.vy) * h
        s.x += s.vx * h
        s.y += s.vy * h
      }
      if (s.waiting !== undefined && (now - s.waiting > MAX_WAIT_MS || !this.covered(node, s))) {
        s.waiting = undefined
        s.fade = { from: s.opacity, to: 1, start: now, duration: FADE_IN_MS }
      }
      if (s.fade) {
        const f = s.fade
        const t = f.duration > 0 ? Math.min(1, (now - f.start) / f.duration) : 1
        s.opacity = f.from + (f.to - f.from) * (f.to < f.from ? easeIn(t) : easeOut(t))
        if (t >= 1) {
          s.fade = undefined
          f.then?.()
        }
      }
      const still =
        Math.abs(s.x) < 0.3 && Math.abs(s.y) < 0.3 && Math.abs(s.vx) < 4 && Math.abs(s.vy) < 4 &&
        s.tx === 0 && s.ty === 0 && !s.fade && s.waiting === undefined && s.opacity >= 1
      if (still) this.drop(node)
      else this.paint(node, s)
    }
    this.frame = this.states.size ? requestAnimationFrame(this.tick) : 0
  }

  /** Whether a visible, moving neighbour still covers this card's slot. */
  private covered(node: HTMLElement, s: State): boolean {
    const a = s.slot
    for (const [other, o] of this.states) {
      if (other === node || o.opacity < 0.25 || o.waiting !== undefined) continue
      const bx = o.slot.x + o.x
      const by = o.slot.y + o.y
      const w = Math.min(a.x + a.w, bx + o.slot.w) - Math.max(a.x, bx)
      const h = Math.min(a.y + a.h, by + o.slot.h) - Math.max(a.y, by)
      if (w > 0 && h > 0 && (w * h) / (a.w * a.h) > COVER_LIMIT) return true
    }
    return false
  }

  private paint(node: HTMLElement, s: State) {
    node.style.transform = Math.abs(s.x) < 0.05 && Math.abs(s.y) < 0.05 ? '' : `translate3d(${s.x}px, ${s.y}px, 0)`
    node.style.opacity = s.opacity >= 1 ? '' : String(s.opacity)
  }

  private drop(node: HTMLElement) {
    this.states.delete(node)
    node.style.removeProperty('transform')
    node.style.removeProperty('opacity')
  }
}
