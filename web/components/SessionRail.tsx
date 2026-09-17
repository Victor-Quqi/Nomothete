import { AnimatePresence, motion } from 'motion/react'
import { Tip } from './Tip.tsx'
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
}: {
  boot: Bootstrap | null
  sessions: SessionSummary[]
  activeId: string | null
  connected: boolean
  onOpen: (id: string) => void
  onNew: () => void
}) {
  return (
    <aside className="rail">
      <div className="rail__brand">
        <div className="rail__mark" onClick={onNew} title="回到起点">
          <span className="rail__glyph">ν</span>
          <span className="rail__name">Nomothete</span>
        </div>
        <div className="rail__tag">立名者 · 工坊</div>
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
              <div className="rail__item-title">{s.title}</div>
              <div className="rail__item-meta">
                <span>{s.candidateCount} 个候选</span>
                {s.lovedCount > 0 && <b>▲{s.lovedCount}</b>}
                <span style={{ marginLeft: 'auto' }}>{when(s.updatedAt)}</span>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
        {sessions.length === 0 && (
          <div style={{ padding: '18px 10px', fontSize: 12.5, color: 'var(--vellum-4)', lineHeight: 1.8 }}>
            还没有会话。写一句项目描述就能开始 —— 第一批名字会横跨六个互不相干的语义场。
          </div>
        )}
      </div>

      <div className="rail__foot">
        {boot?.provider.configured ? (
          <Tip
            className="rail__stat"
            content={
              <>
                <b>
                  {boot.provider.model} @ {boot.provider.host}
                </b>
                <p>
                  由 .env 里的 BASE_URL / API_KEY / MODEL 配置。密钥只存在于这个进程里，浏览器从不接触它，
                  日志也不记录请求体和 Authorization 头。
                </p>
                <em>适配方式：{boot.provider.kind}</em>
              </>
            }
          >
            <span>模型</span>
            <b>{boot.provider.model}</b>
          </Tip>
        ) : (
          <div className="rail__stat rail__stat--warn">
            <span>模型</span>
            <b>{boot ? '未配置' : '…'}</b>
          </div>
        )}
        <div className="rail__stat">
          <span>数据流</span>
          <b style={{ color: connected ? 'var(--verdigris)' : 'var(--vellum-4)' }}>
            {connected ? '已连接' : activeId ? '重连中' : '待机'}
          </b>
        </div>
      </div>
    </aside>
  )
}
