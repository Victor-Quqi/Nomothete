import { AnimatePresence, motion } from 'motion/react'
import type { Bootstrap, SessionSummary } from '../types.ts'

function when(ts: number): string {
  const d = Date.now() - ts
  if (d < 60_000) return '刚刚'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分钟前`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小时前`
  return `${Math.floor(d / 86_400_000)} 天前`
}

export function SessionRail({
  boot,
  sessions,
  activeId,
  connected,
  onOpen,
  onNew,
  onConfigure,
}: {
  boot: Bootstrap | null
  sessions: SessionSummary[]
  activeId: string | null
  connected: boolean
  onOpen: (id: string) => void
  onNew: () => void
  onConfigure: () => void
}) {
  return (
    <aside className="rail">
      <div className="rail__brand">
        <div className="rail__mark" onClick={onNew} title="回到起点">
          <span className="rail__glyph">ν</span>
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
          {sessions.map(s => (
            <motion.button
              key={s.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className={`rail__item${s.id === activeId ? ' rail__item--on' : ''}`}
              onClick={() => onOpen(s.id)}
            >
              <div className="rail__item-title">{s.title || s.brief}</div>
              <div className="rail__item-meta">
                <span>{s.candidateCount} 个候选</span>
                {s.lovedCount > 0 && <b>▲{s.lovedCount}</b>}
                <span style={{ marginLeft: 'auto' }}>{when(s.updatedAt)}</span>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      <div className="rail__foot">
        {/* The row that names the endpoint is also the way to change it. */}
        <button
          className={`rail__stat rail__stat--act${boot && !boot.provider.configured ? ' rail__stat--warn' : ''}`}
          onClick={onConfigure}
          title={boot?.provider.configured ? `${boot.provider.host} · 点击修改` : '点击配置模型'}
        >
          <span>模型</span>
          <b>{boot ? (boot.provider.configured ? boot.provider.model : '未配置') : '…'}</b>
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
