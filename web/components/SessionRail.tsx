import { AnimatePresence, motion } from 'motion/react'
import type { SessionSummary } from '../types.ts'
import { SessionIcon, SessionMenu } from './SessionMenu.tsx'

function when(ts: number): string {
  const d = Date.now() - ts
  if (d < 60_000) return '刚刚'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分钟前`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小时前`
  return `${Math.floor(d / 86_400_000)} 天前`
}

export function SessionRail({
  sessions,
  activeId,
  connected,
  onOpen,
  onNew,
  onConfigure,
  settingsOpen,
  onRename,
  onPin,
  onDelete,
  pendingId,
}: {
  sessions: SessionSummary[]
  activeId: string | null
  connected: boolean
  onOpen: (id: string) => void
  onNew: () => void
  onConfigure: () => void
  settingsOpen: boolean
  onRename: (session: SessionSummary) => void
  onPin: (session: SessionSummary) => void
  onDelete: (session: SessionSummary) => void
  pendingId: string | null
}) {
  return (
    <aside className="rail">
      <div className="rail__brand">
        <div className="rail__mark" onClick={onNew} title="回到起点">
          <span className="rail__name">Nomothete</span>
        </div>
      </div>

      <button className="rail__new" onClick={onNew}>
        <span>＋</span>
        <span>新命名</span>
        <kbd>N</kbd>
      </button>

      <div className="rail__list">
        {sessions.length > 0 && <div className="rail__section">会话</div>}
        <AnimatePresence initial={false}>
          {[...sessions].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt).map(s => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className={`rail__item${s.id === activeId ? ' rail__item--on' : ''}`}
            >
              <button className="rail__open" onClick={() => onOpen(s.id)} aria-current={s.id === activeId ? 'page' : undefined}>
                <span className="rail__item-heading">
                  {s.pinned && <span className="rail__pin" aria-label="已置顶"><SessionIcon kind="pin" /></span>}
                  <span className="rail__item-title">{s.title || s.brief}</span>
                </span>
                <span className="rail__item-meta">
                  <span>{s.candidateCount} 个候选</span>
                  {s.lovedCount > 0 && <b>▲{s.lovedCount}</b>}
                  <span style={{ marginLeft: 'auto' }}>{when(s.updatedAt)}</span>
                </span>
              </button>
              <SessionMenu title={s.title || s.brief} pinned={s.pinned} disabled={pendingId === s.id}
                onRename={() => onRename(s)} onPin={() => onPin(s)} onDelete={() => onDelete(s)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="rail__foot">
        <button className="rail__settings" onClick={onConfigure} aria-haspopup="dialog" aria-expanded={settingsOpen}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9.5 3-.6 2.3-1.8 1L4.8 6 2.3 10l1.7 1.6v.8L2.3 14l2.5 4 2.3-.3 1.8 1 .6 2.3h5l.6-2.3 1.8-1 2.3.3 2.5-4-1.7-1.6v-.8l1.7-1.6-2.5-4-2.3.3-1.8-1L14.5 3Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>设置</span>
          <svg className="rail__settings-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
        </button>
        {/* Silence means it is working. The row only appears when it is not. */}
        {activeId && !connected && (
          <div className="rail__stat rail__stat--warn">
            <span>连接</span>
            <b>正在重连</b>
          </div>
        )}
      </div>
    </aside>
  )
}
