import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface SessionAction {
  kind: 'rename' | 'delete'
  id: string
  title: string
}

export function SessionDialog({ action, onClose, onSubmit }: {
  action: SessionAction
  onClose: () => void
  onSubmit: (title: string) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const pending = useRef(false)
  const labelId = useId()
  const detailId = useId()
  const [title, setTitle] = useState(action.title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rename = action.kind === 'rename'

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const el = dialog.current!
    el.showModal()
    if (input.current) {
      input.current.focus()
      input.current.select()
    } else {
      cancel.current?.focus()
    }
    return () => {
      el.close()
      if (previous?.isConnected) previous.focus({ preventScroll: true })
      else document.querySelector<HTMLButtonElement>('.rail__new')?.focus({ preventScroll: true })
    }
  }, [])

  const close = () => {
    if (!pending.current) onClose()
  }

  const submit = async () => {
    if (pending.current || (rename && !title.trim())) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await onSubmit(title.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败，请重试。')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return createPortal(
    <dialog
      ref={dialog}
      className="session-dialog"
      aria-labelledby={labelId}
      aria-describedby={rename ? undefined : detailId}
      onCancel={e => { e.preventDefault(); close() }}
      onClick={e => {
        if (e.target !== e.currentTarget) return
        const rect = e.currentTarget.getBoundingClientRect()
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close()
      }}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault()
        if (e.key === 'Tab') {
          const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')]
          const first = controls[0]
          const last = controls[controls.length - 1]
          if (!first || (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
            e.preventDefault()
            ;(e.shiftKey ? last : first)?.focus()
          }
        }
      }}
    >
      <form onSubmit={e => { e.preventDefault(); void submit() }} aria-busy={busy}>
        <div className="session-dialog__head">
          <h2 id={labelId}>{rename ? '重命名会话' : '删除会话'}</h2>
          <button type="button" className="session-dialog__close" onClick={close} disabled={busy} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
          </button>
        </div>
        {rename ? (
          <div className="session-dialog__field">
            <input ref={input} autoFocus aria-label="会话名" value={title} disabled={busy} onChange={e => { setTitle(e.target.value); setError('') }} autoComplete="off" />
          </div>
        ) : (
          <div id={detailId} className="session-dialog__description">
            <p className="session-dialog__name">{action.title}</p>
            <p>全部候选名及评价也会删除，无法恢复。</p>
          </div>
        )}
        {error && <p className="session-dialog__error" role="alert">{error}</p>}
        <div className="session-dialog__actions">
          <button ref={cancel} type="button" className="session-dialog__button" disabled={busy} onClick={close}>取消</button>
          <button type="submit" className={`session-dialog__button ${rename ? 'session-dialog__save' : 'session-dialog__delete'}`} disabled={busy || (rename && !title.trim())}>
            {busy ? (rename ? '保存中…' : '删除中…') : (rename ? '保存' : '删除')}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  )
}
