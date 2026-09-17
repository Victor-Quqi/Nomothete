import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Atmosphere } from './components/Atmosphere.tsx'
import { CommandPalette, type Command } from './components/CommandPalette.tsx'
import { DetailPanel } from './components/DetailPanel.tsx'
import { Drawer } from './components/Drawer.tsx'
import { Opening } from './components/Opening.tsx'
import { PriorDossier } from './components/PriorDossier.tsx'
import { SessionRail } from './components/SessionRail.tsx'
import { TastePanel } from './components/TastePanel.tsx'
import { Toasts } from './components/Toasts.tsx'
import { Workspace, type DrawerKind } from './components/Workspace.tsx'
import { useAtelier } from './store.ts'

interface DrawerState {
  kind: DrawerKind
  id?: string
}

const KEYS: [string, string][] = [
  ['J / K　↑ / ↓', '在候选之间移动'],
  ['1 2 3 4 5', '打档：▼▼ ▼ · ▲ ▲▲，打完自动跳下一个'],
  ['↵', '打开详情'],
  ['N', '写备注'],
  ['G', '再来一批'],
  ['/', '筛选'],
  ['T', '品味档案'],
  ['P', '内置倾向'],
  ['⌘K / Ctrl+K', '命令面板'],
  ['Esc', '取消焦点 / 关掉面板'],
]

export function App() {
  const a = useAtelier()
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const openDrawer = useCallback((kind: DrawerKind, id?: string) => setDrawer({ kind, id }), [])
  const closeDrawer = useCallback(() => setDrawer(null), [])

  useEffect(() => setFocusId(null), [a.sessionId])

  // ⌘K anywhere, plus N for a new session while nothing is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
        return
      }
      const el = document.activeElement
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n' && !a.sessionId) {
        e.preventDefault()
        a.open(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [a])

  const detail = drawer?.kind === 'detail' ? a.candidates.find(c => c.id === drawer.id) : undefined

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      { id: 'new', group: '会话', label: '新建命名会话', hint: 'N', run: () => a.open(null) },
    ]
    if (a.sessionId) {
      list.push(
        { id: 'gen', group: '生成', label: '再来一批', hint: 'G', run: () => a.generate() },
        { id: 'gen8', group: '生成', label: '来一大批（8 条路数同时跑）', run: () => a.generate({ width: 8 }) },
        { id: 'stop', group: '生成', label: '停下当前这一代', run: () => a.cancel() },
        { id: 'taste', group: '查看', label: '品味档案', hint: 'T', run: () => openDrawer('taste') },
        { id: 'priors', group: '查看', label: '内置倾向与证据', hint: 'P', run: () => openDrawer('priors') },
        { id: 'brief', group: '查看', label: '项目简介', run: () => openDrawer('brief') },
        { id: 'keys', group: '查看', label: '快捷键', hint: '?', run: () => openDrawer('keys') },
        {
          id: 'md',
          group: '导出',
          label: '导出 Markdown',
          run: () => window.open(`/api/sessions/${a.sessionId}/export?format=md`, '_blank'),
        },
        {
          id: 'json',
          group: '导出',
          label: '导出 JSON',
          run: () => window.open(`/api/sessions/${a.sessionId}/export?format=json`, '_blank'),
        },
        {
          id: 'del',
          group: '会话',
          label: '删掉这个会话',
          run: () => {
            if (a.sessionId && confirm('删掉这个会话和它所有的候选名？')) a.removeSession(a.sessionId)
          },
        },
      )
      for (const s of a.boot?.strategies ?? []) {
        list.push({
          id: `s-${s.id}`,
          group: '路数',
          label: `只用「${s.label}」跑一批`,
          hint: s.brief,
          run: () => a.generate({ strategyIds: [s.id] }),
        })
      }
    }
    for (const s of a.sessions) {
      if (s.id === a.sessionId) continue
      list.push({
        id: `open-${s.id}`,
        group: '打开',
        label: s.title,
        hint: `${s.candidateCount} 个候选`,
        run: () => a.open(s.id),
      })
    }
    return list
  }, [a, openDrawer])

  const start = async (input: Parameters<typeof a.createSession>[0]) => {
    setStarting(true)
    try {
      await a.createSession(input)
    } catch (err) {
      a.toast((err as Error).message, 'error')
    } finally {
      setStarting(false)
    }
  }

  if (a.bootError) {
    return (
      <div className="opening">
        <div className="opening__inner">
          <h1 className="opening__title">连不上工坊</h1>
          <p className="opening__epigraph">
            {a.bootError}
            <cite>确认 `npm run dev` 或 `npm start` 在跑，默认端口 5179。</cite>
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Atmosphere working={a.running} />

      <div className="shell">
        <SessionRail
          boot={a.boot}
          sessions={a.sessions}
          activeId={a.sessionId}
          connected={a.connected}
          onOpen={id => a.open(id)}
          onNew={() => a.open(null)}
        />

        <AnimatePresence mode="wait">
          {a.sessionId && a.session ? (
            <motion.div
              key={a.sessionId}
              style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, position: 'relative' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Workspace a={a} openDrawer={openDrawer} focusId={focusId} setFocusId={setFocusId} />
            </motion.div>
          ) : (
            <motion.div
              key="opening"
              style={{ minHeight: 0, minWidth: 0 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Opening boot={a.boot} busy={starting || a.loadingSession} onStart={start} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Drawer
        open={!!drawer}
        onClose={closeDrawer}
        title={
          drawer?.kind === 'detail'
            ? '候选'
            : drawer?.kind === 'taste'
              ? 'Taste Profile'
              : drawer?.kind === 'priors'
                ? '内置倾向'
                : drawer?.kind === 'brief'
                  ? '项目简介'
                  : '快捷键'
        }
      >
        {drawer?.kind === 'detail' && detail && a.session && (
          <DetailPanel
            candidate={detail}
            strategy={a.strategyById.get(detail.strategyId)}
            family={a.familyById.get(a.strategyById.get(detail.strategyId)?.family ?? '')}
            threshold={a.session.threshold}
            onVerdict={v => a.setVerdict(detail.id, v)}
            onNote={note => a.setNote(detail.id, note)}
            onRecheck={() => a.recheck(detail.id)}
          />
        )}

        {drawer?.kind === 'taste' && a.profile && (
          <TastePanel profile={a.profile} familyById={a.familyById} />
        )}

        {drawer?.kind === 'priors' && a.boot && a.session && (
          <>
            <p className="drawer__lead">
              这些是从命名语料里推出来的软性倾向，不是规则。每一条都带着证据强度，随时可以关掉；
              被你的 Verdict 推翻的那一刻，它就不算数了。
            </p>
            <PriorDossier priors={a.boot.priors} enabled={a.session.priors} onChange={a.setPriors} />
            <div className="section-h">阈值</div>
            <p className="check__detail" style={{ marginBottom: 10 }}>
              自报概率高于 {(a.session.threshold * 100).toFixed(0)}% 的名字在到达那一刻就丢掉。
              调低会更奇，也更容易一整批全被丢光。
            </p>
            <input
              type="range"
              min={0.15}
              max={0.9}
              step={0.05}
              value={a.session.threshold}
              onChange={e => a.setThreshold(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--brass)' }}
            />
          </>
        )}

        {drawer?.kind === 'brief' && a.session && (
          <>
            <p className="drawer__lead" style={{ whiteSpace: 'pre-wrap' }}>
              {a.session.brief}
            </p>
            {a.session.seeds.length > 0 && (
              <>
                <div className="section-h">你自己给的种子</div>
                {a.session.seeds.map(s => (
                  <div className="trait" key={s.text}>
                    <span className="trait__arrow" data-dir={s.verdict > 0 ? 'toward' : 'away'}>
                      {s.verdict > 0 ? '▲' : s.verdict < 0 ? '▼' : '·'}
                    </span>
                    <span>{s.text}</span>
                  </div>
                ))}
              </>
            )}
            <div className="section-h">这个会话</div>
            <div className="detail__forms">
              <div className="detail__form">
                <b>已跑代数</b>
                <code>{a.session.generation}</code>
              </div>
              <div className="detail__form">
                <b>候选</b>
                <code>{a.candidates.length}</code>
              </div>
              <div className="detail__form">
                <b>阈值</b>
                <code>{(a.session.threshold * 100).toFixed(0)}%</code>
              </div>
              <div className="detail__form">
                <b>数据库</b>
                <code style={{ fontSize: 11 }}>{a.boot?.dbPath}</code>
              </div>
            </div>
          </>
        )}

        {drawer?.kind === 'keys' && (
          <>
            <p className="drawer__lead">整个界面都可以只用键盘走完。打档之后焦点会自己往下走，一路按下去就行。</p>
            {KEYS.map(([k, v]) => (
              <div className="detail__form" key={k} style={{ background: 'transparent', padding: '9px 0' }}>
                <b style={{ width: 120, fontFamily: 'var(--font-mono)', textTransform: 'none', fontSize: 12 }}>{k}</b>
                <span style={{ fontSize: 13, color: 'var(--vellum-2)' }}>{v}</span>
              </div>
            ))}
          </>
        )}
      </Drawer>

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
      <Toasts toasts={a.toasts} />
    </>
  )
}
