import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { BeforeCommit } from './BeforeCommit.tsx'
import { byCheckOrder, presentCheck } from '../checks.ts'
import { linksOf } from './CheckList.tsx'
import { Tip } from './Tip.tsx'
import type { CheckResult } from '../types.ts'

/**
 * Seals report what the checks found — and only that.
 *
 * Nothing found prints nothing. A pill reading "5 项检查没发现冲突" sat on very
 * nearly every card, the same size and colour and place as the one pill that
 * meant something — so the wall could not be scanned for trouble. Quiet is the
 * signal now: seals on a card mean something is wrong with that name. What was
 * searched, and what each search said, is in the pane.
 *
 * The wording never says "safe" or "available" — the vocabulary is
 * 查无记录 / 已有同名 (CONTEXT.md).
 */
/** Gentle at both ends: starts from rest and settles, no front-loaded dash. */
const EASE = 'cubic-bezier(0.33, 0, 0.2, 1)'
/** Sideways drift of a pill changing line; the same as the gap between pills. */
const DRIFT = 6

function tipFor(c: CheckResult): ReactNode {
  const links = linksOf(c).length
  const { detail } = presentCheck(c)
  if (!detail && links === 0) return null
  // The headline is on the pill, an inch under the pointer. All the title line
  // can add is which check said it.
  return (
    <>
      <b>{c.label}</b>
      {detail && <p>{detail}</p>}
      {links > 0 && <em>点开看 {links} 条链接</em>}
    </>
  )
}

export function Seals({
  checks,
  pending,
  onInspect,
}: {
  checks: CheckResult[]
  /** Text for the one provisional seal, when something is still out. */
  pending?: string | null
  onInspect?: () => void
}) {
  const findings = checks.filter(c => c.status !== 'clear').sort(byCheckOrder)
  const box = useRef<HTMLDivElement>(null)
  const before = useRef<{ height: number; at: Map<string, { x: number; y: number; opacity: number }> } | null>(null)
  const running = useRef(new Map<Element, Animation>())

  // Where each pill is on screen, relative to the row, and how tall the row
  // is, just before the DOM changes. Relative, so a card sliding in the grid
  // does not read as a pill moving inside it.
  const capture = () => {
    const el = box.current
    if (!el) return
    const origin = el.getBoundingClientRect()
    const at = new Map<string, { x: number; y: number; opacity: number }>()
    for (const pill of el.children) {
      const r = pill.getBoundingClientRect()
      at.set((pill as HTMLElement).dataset.seal!, {
        x: r.left - origin.left,
        y: r.top - origin.top,
        opacity: Number(getComputedStyle(pill).opacity),
      })
    }
    before.current = { height: origin.height, at }
  }

  const stop = () => {
    for (const animation of running.current.values()) animation.cancel()
    running.current.clear()
  }

  // Finish and cancel events arrive a task later. By then a newer animation may
  // own the element, and cleanup must not undo what that one set up.
  const track = (target: Element, animation: Animation, done?: () => void) => {
    running.current.set(target, animation)
    const settle = () => {
      const current = running.current.get(target)
      if (current === animation) running.current.delete(target)
      if (!current || current === animation) done?.()
    }
    animation.onfinish = settle
    animation.oncancel = settle
  }

  // A pill that leaves is gone at once, so the waiting pill never holds a
  // place the results need. Pills that stay slide to where the new row puts
  // them; findings that arrive fade in where they land, once nothing is still
  // passing over that spot. When the row wraps onto another line, its height
  // eases to the new one, so the card's border, the controls under the row and
  // the plates below all move with it rather than jumping. Pills present when
  // the card mounts do not animate at all. With reduced motion, nothing moves
  // or grows; arrivals only fade in.
  useLayoutEffect(() => {
    const snap = before.current
    before.current = null
    const el = box.current
    if (!snap || !el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    stop()
    const origin = el.getBoundingClientRect()
    if (!reduced && Math.abs(origin.height - snap.height) > 0.5) {
      // Hidden overflow while growing, so a new line is uncovered rather than
      // spilling over the controls below.
      el.style.overflow = 'hidden'
      const grow = el.animate([{ height: `${snap.height}px` }, { height: `${origin.height}px` }], { duration: 320, easing: EASE })
      track(el, grow, () => el.style.removeProperty('overflow'))
    }

    const pills = [...el.children].map(pill => {
      const r = pill.getBoundingClientRect()
      const slot = { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }
      return { pill, slot, was: snap.at.get((pill as HTMLElement).dataset.seal!) }
    })

    // An entrance carries on from the opacity it had reached, never from zero.
    const fadeIn = (pill: Element, from: number, duration: number, delay: number) => {
      if (from >= 1) return
      track(pill, pill.animate([{ opacity: from }, { opacity: 1 }], {
        duration: duration * (1 - from), delay, easing: reduced ? 'linear' : 'ease-out', fill: 'backwards',
      }))
    }

    if (reduced) {
      for (const { pill, was } of pills) fadeIn(pill, was?.opacity ?? 0, 150, 0)
      return
    }

    // Slides first: each one's starting box is where it still shows, and how
    // long until it has left that box.
    const leaving: { slot: typeof pills[number]['slot']; clearAt: number }[] = []
    const still: typeof pills = []
    for (const p of pills) {
      const { pill, slot, was } = p
      if (!was) {
        still.push(p)
        continue
      }
      const dx = was.x - slot.x
      const dy = was.y - slot.y
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        still.push(p)
        continue
      }
      const from = { ...slot, x: was.x, y: was.y }
      if (Math.abs(dy) > slot.h / 2) {
        // Onto another line: a slide would cut across the pills between, so
        // it leaves drifting forward and comes back in from behind. The drift
        // is no wider than the gap, so it never touches a neighbour.
        const forward = dy < 0 ? 1 : -1
        track(pill, pill.animate([
          { transform: `translate(${dx}px, ${dy}px)`, opacity: was.opacity },
          { offset: 0.42, transform: `translate(${dx + forward * DRIFT}px, ${dy}px)`, opacity: 0 },
          { offset: 0.58, transform: `translate(${-forward * DRIFT}px, 0)`, opacity: 0 },
          { transform: 'translate(0, 0)', opacity: 1 },
        ], { duration: 380, easing: 'linear' }))
        leaving.push({ slot: from, clearAt: 170 })
      } else {
        track(pill, pill.animate([
          { transform: `translate(${dx}px, ${dy}px)`, opacity: was.opacity },
          { transform: 'translate(0, 0)', opacity: 1 },
        ], { duration: 320, easing: EASE }))
        // The curve's tail: by here less than 3% of the distance is left.
        leaving.push({ slot: from, clearAt: 260 })
      }
    }

    // Pills that stay put and are still arriving, or are new: they hold what
    // opacity they have until nothing is passing over their spot.
    for (const { pill, slot, was } of still) {
      let wait = was ? 0 : 80
      for (const l of leaving) {
        const w = Math.min(slot.x + slot.w, l.slot.x + l.slot.w) - Math.max(slot.x, l.slot.x)
        const h = Math.min(slot.y + slot.h, l.slot.y + l.slot.h) - Math.max(slot.y, l.slot.y)
        if (w > 0 && h > 0) wait = Math.max(wait, l.clearAt)
      }
      fadeIn(pill, was?.opacity ?? 0, 240, wait)
    }
  })

  useLayoutEffect(() => stop, [])

  return (
    <div className="seals" ref={box}>
      <BeforeCommit watch={`${findings.map(c => `${c.checkId}:${c.status}:${c.headline}`).join('|')}|${pending ?? ''}`} capture={capture} />
      {findings.map(c => (
        <span key={c.checkId} data-seal={c.checkId} style={{ display: 'inline-flex' }}>
          <Tip
            className={`seal seal--${c.status}`}
            onClick={onInspect}
            // A hover that repeats the pill is worse than no hover: it costs
            // a wait and a glance and hands back the words already on screen.
            // So it opens only when the check found something the pill has no
            // room for, and it promises links only when there are links.
            content={tipFor(c)}
          >
            <i />
            <span>{c.headline}</span>
          </Tip>
        </span>
      ))}

      {pending && (
        <span key="pending" data-seal="pending" className="seal seal--pending">
          <i />
          <span>{pending}</span>
        </span>
      )}
    </div>
  )
}
