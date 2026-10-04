import { tr } from '../i18n.ts'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function SessionIcon({ kind }: { kind: 'more' | 'rename' | 'pin' | 'unpin' | 'delete' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === 'more' && <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>}
      {kind === 'rename' && <><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z" /><path d="M13 20h7" /></>}
      {(kind === 'pin' || kind === 'unpin') && <><path d="M8 3h8l-1 7 4 4v2H5v-2l4-4ZM12 16v6" />{kind === 'unpin' && <path d="m3 3 18 18" />}</>}
      {kind === 'delete' && <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>}
    </svg>
  )
}

export function SessionMenu({ title, pinned, disabled, onRename, onPin, onDelete }: {
  title: string
  pinned: boolean
  disabled: boolean
  onRename: () => void
  onPin: () => void
  onDelete: () => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const firstFocus = useRef<'first' | 'last' | null>(null)
  const [input, setInput] = useState<'pointer' | 'keyboard'>('pointer')
  const [box, setBox] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!box) return
    const rows = menu.current?.querySelectorAll<HTMLButtonElement>('button')
    const target = firstFocus.current === 'first' ? rows?.[0]
      : firstFocus.current === 'last' ? rows?.[rows.length - 1] : menu.current
    target?.focus({ preventScroll: true })
    const close = () => setBox(null)
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) close()
    }
    const scroll = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', close)
    }
  }, [box])

  const toggle = (keyboard: boolean, last = false) => {
    if (box) return setBox(null)
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect) return
    firstFocus.current = keyboard ? (last ? 'last' : 'first') : null
    setInput(keyboard ? 'keyboard' : 'pointer')
    setBox({
      top: Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - 130)),
      left: Math.max(8, Math.min(rect.right - 160, window.innerWidth - 168)),
    })
  }

  const choose = (action: () => void) => {
    setBox(null)
    trigger.current?.focus({ preventScroll: true })
    action()
  }

  return (
    <>
      <button
        ref={trigger}
        className="rail__more"
        aria-label={tr(`会话「${title}」的操作`, `Session “${title}” actions`)}
        aria-haspopup="menu"
        aria-expanded={!!box}
        aria-controls={box ? id : undefined}
        disabled={disabled}
        onClick={e => toggle(e.detail === 0)}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (!box) toggle(true, e.key === 'ArrowUp')
          }
        }}
      >
        <SessionIcon kind="more" />
      </button>
      {box && createPortal(
        <div
          ref={menu}
          id={id}
          className="session-menu"
          role="menu"
          tabIndex={-1}
          data-input={input}
          aria-label={tr('会话操作', 'Session actions')}
          style={box}
          onPointerMove={e => {
            setInput('pointer')
            const row = (e.target as HTMLElement).closest<HTMLButtonElement>('button[role="menuitem"]')
            row?.focus({ preventScroll: true })
          }}
          onBlur={e => {
            if (!e.currentTarget.contains(e.relatedTarget as Node) && e.relatedTarget !== trigger.current) setBox(null)
          }}
          onKeyDown={e => {
            e.stopPropagation()
            setInput('keyboard')
            if (e.key === 'Escape') {
              e.preventDefault()
              setBox(null)
              trigger.current?.focus({ preventScroll: true })
            } else if (e.key === 'Tab') {
              setBox(null)
              trigger.current?.focus({ preventScroll: true })
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
              e.preventDefault()
              const rows = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
              const index = rows.indexOf(document.activeElement as HTMLButtonElement)
              const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1
                : index < 0 ? (e.key === 'ArrowDown' ? 0 : rows.length - 1)
                : (index + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
              rows[next]?.focus()
            }
          }}
        >
          <button role="menuitem" tabIndex={-1} onClick={() => choose(onRename)}><SessionIcon kind="rename" />{tr('重命名', 'Rename')}</button>
          <button role="menuitem" tabIndex={-1} onClick={() => choose(onPin)}><SessionIcon kind={pinned ? 'unpin' : 'pin'} />{pinned ? tr('取消置顶', 'Unpin') : tr('置顶', 'Pin')}</button>
          <button role="menuitem" tabIndex={-1} className="session-menu__delete" onClick={() => choose(onDelete)}><SessionIcon kind="delete" />{tr('删除', 'Delete')}</button>
        </div>,
        document.body,
      )}
    </>
  )
}
