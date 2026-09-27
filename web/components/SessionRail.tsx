import { AnimatePresence, motion } from 'motion/react'
import { THEME_LABEL, type ThemeChoice } from '../theme.ts'
import type { Bootstrap, SessionSummary } from '../types.ts'
import { SessionIcon, SessionMenu } from './SessionMenu.tsx'

const THEMES: ThemeChoice[] = ['system', 'light', 'dark']

function ThemeIcon({ kind }: { kind: ThemeChoice }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === 'system' && <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" /></>}
      {kind === 'light' && <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>}
      {kind === 'dark' && <path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z" />}
    </svg>
  )
}

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
  theme,
  onTheme,
  onRename,
  onPin,
  onDelete,
  pendingId,
}: {
  boot: Bootstrap | null
  sessions: SessionSummary[]
  activeId: string | null
  connected: boolean
  onOpen: (id: string) => void
  onNew: () => void
  onConfigure: () => void
  theme: ThemeChoice
  onTheme: (theme: ThemeChoice) => void
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
        {/* The row that names the endpoint is also the way to change it. */}
        <button
          className={`rail__stat rail__stat--act${boot && !boot.provider.configured ? ' rail__stat--warn' : ''}`}
          onClick={onConfigure}
          title={boot?.provider.configured ? `${boot.provider.host} · 点击修改` : '点击配置模型'}
        >
          <span>模型</span>
          <b>{boot ? (boot.provider.configured ? boot.provider.model : '未配置') : '…'}</b>
        </button>
        <div className="rail__stat">
          <span id="rail-theme">外观</span>
          <span className="theme-pick" role="group" aria-labelledby="rail-theme">
            {THEMES.map(t => (
              <button key={t} aria-pressed={theme === t} aria-label={THEME_LABEL[t]} title={THEME_LABEL[t]} onClick={() => onTheme(t)}>
                <ThemeIcon kind={t} />
              </button>
            ))}
          </span>
        </div>
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
