import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Atmosphere } from './components/Atmosphere.tsx'
import { CommandPalette, type Command } from './components/CommandPalette.tsx'
import { DetailPanel } from './components/DetailPanel.tsx'
import { Drawer } from './components/Drawer.tsx'
import { Opening } from './components/Opening.tsx'
import { PriorDossier } from './components/PriorDossier.tsx'
import { SessionRail } from './components/SessionRail.tsx'
import { Settings } from './components/Settings.tsx'
import { TastePanel } from './components/TastePanel.tsx'
import { Toasts } from './components/Toasts.tsx'
import { Workspace, type DrawerKind } from './components/Workspace.tsx'
import { RARITY_MAX, RARITY_MIN, rarityPercent, rarityWord, thresholdForRarity } from './rarity.ts'
import { useAtelier } from './store.ts'

interface DrawerState {
  kind: DrawerKind
  id?: string
}

const DRAWER_TITLE: Record<DrawerKind, string> = {
  detail: '候选',
  taste: '你的口味',
  priors: '取名规则',
  brief: '项目简介',
  keys: '快捷键',
  settings: '模型',
}

const KEYS: [string, string][] = [
  ['j / k　↑ / ↓', '上一个 / 下一个'],
  ['1 2 3 4 5', '从 ▼▼ 到 ▲▲ 评价，评完自动到下一个'],
  ['u', '撤销上一次评价'],
  ['⇧J', '跳到下一个还没评价的'],
  ['↵', '打开详情'],
  ['n', '写备注'],
  ['s', '朗读名字'],
  ['c', '复制名字'],
  ['g', '再来一批'],
  ['e', '导出 Markdown'],
  ['/', '搜索'],
  ['t', '你的口味'],
  ['p', '取名规则'],
  ['⌘K / Ctrl+K', '命令面板'],
  ['Esc', '取消选中 / 关掉面板'],
]

export function App() {
  const a = useAtelier()
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [starting, setStarting] = useState(false)

  const openDrawer = useCallback((kind: DrawerKind, id?: string) => setDrawer({ kind, id }), [])
  const closeDrawer = useCallback(() => setDrawer(null), [])

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
      // Outside the session guard on purpose: the endpoint matters most before
      // there is anything to name.
      { id: 'settings', group: '设置', label: '换模型 / 换端点', run: () => openDrawer('settings') },
    ]
    if (a.sessionId) {
      list.push(
        { id: 'gen', group: '生成', label: '再来一批', hint: 'G', run: () => a.generate() },
        { id: 'gen8', group: '生成', label: '生成一大批', run: () => a.generate({ width: 8 }) },
        { id: 'stop', group: '生成', label: '停止', run: () => a.cancel() },
        { id: 'taste', group: '查看', label: '你的口味', hint: 'T', run: () => openDrawer('taste') },
        { id: 'priors', group: '查看', label: '取名规则', hint: 'P', run: () => openDrawer('priors') },
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
          label: '删除这个会话',
          run: () => {
            if (a.sessionId && confirm('删除这个会话及其全部候选名？')) a.removeSession(a.sessionId)
          },
        },
      )
      for (const s of a.boot?.strategies ?? []) {
        list.push({
          id: `s-${s.id}`,
          group: '换个思路',
          label: `只用「${s.label}」生成一批`,
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
        label: s.title || s.brief,
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
          <h1 className="opening__title">连不上服务</h1>
          <div className="warnbox">
            {a.bootError}
            <br />
            确认 <code>npm run dev</code> 或 <code>npm start</code> 仍在运行，默认端口 5179。
          </div>
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
          onConfigure={() => openDrawer('settings')}
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
              <Workspace
                a={a}
                openDrawer={openDrawer}
                detailId={drawer?.kind === 'detail' ? drawer.id : undefined}
              />
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
              <Opening
                boot={a.boot}
                busy={starting || a.loadingSession}
                onStart={start}
                onConfigure={() => openDrawer('settings')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Drawer
        open={!!drawer}
        onClose={closeDrawer}
        title={drawer ? DRAWER_TITLE[drawer.kind] : ''}
        // Reading a name is not a thing you have to finish. The wall stays lit
        // and clickable, so the next card's seals answer in one press instead
        // of one press to leave plus one to ask.
        modal={drawer?.kind !== 'detail'}
      >
        {drawer?.kind === 'detail' && detail && a.session && (
          <DetailPanel
            candidate={detail}
            strategy={a.strategyById.get(detail.strategyId)}
            family={a.familyById.get(a.strategyById.get(detail.strategyId)?.family ?? '')}
            manifest={a.boot?.checks}
            asked={a.asked.has(detail.id)}
            onVerdict={v => a.setVerdict(detail.id, v)}
            onNote={note => a.setNote(detail.id, note)}
            onRecheck={() => a.recheck(detail.id)}
          />
        )}

        {drawer?.kind === 'settings' && <Settings onSaved={a.setProvider} />}

        {drawer?.kind === 'taste' && a.profile && (
          <TastePanel profile={a.profile} familyById={a.familyById} />
        )}

        {drawer?.kind === 'priors' && a.boot && a.session && (
          <>
            <p className="drawer__lead">关掉哪条，下一批就不再遵守它。</p>
            <PriorDossier priors={a.boot.priors} enabled={a.session.priors} onChange={a.setPriors} />
            <div className="section-h">
              名字的罕见程度
              <span>
                {rarityWord(rarityPercent(a.session.threshold))} · {rarityPercent(a.session.threshold)}%
              </span>
            </div>
            <input
              type="range"
              min={RARITY_MIN}
              max={RARITY_MAX}
              step={5}
              value={rarityPercent(a.session.threshold)}
              onChange={e => a.setThreshold(thresholdForRarity(Number(e.target.value)))}
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
                <div className="section-h">你填的名字</div>
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
          </>
        )}

        {drawer?.kind === 'keys' &&
          KEYS.map(([k, v]) => (
            <div className="detail__form" key={k} style={{ background: 'transparent', padding: '9px 0' }}>
              <b style={{ width: 120, fontFamily: 'var(--font-mono)', textTransform: 'none', fontSize: 13 }}>{k}</b>
              <span style={{ fontSize: 13, color: 'var(--vellum-2)' }}>{v}</span>
            </div>
          ))}
      </Drawer>

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
      <Toasts toasts={a.toasts} />
    </>
  )
}
