import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Atmosphere } from './components/Atmosphere.tsx'
import { CommandPalette, type Command } from './components/CommandPalette.tsx'
import { DetailPanel } from './components/DetailPanel.tsx'
import { DiscardList } from './components/DiscardList.tsx'
import { Drawer } from './components/Drawer.tsx'
import { Opening } from './components/Opening.tsx'
import { PriorDossier } from './components/PriorDossier.tsx'
import { SessionRail } from './components/SessionRail.tsx'
import { SessionDialog, type SessionAction } from './components/SessionDialog.tsx'
import { Settings } from './components/Settings.tsx'
import { TastePanel } from './components/TastePanel.tsx'
import { Toasts } from './components/Toasts.tsx'
import { Workspace, type DrawerKind } from './components/Workspace.tsx'
import { RARITY_MAX, RARITY_MIN, rarityPercent, rarityWord, thresholdForRarity } from './rarity.ts'
import { useAtelier } from './store.ts'
import { useTheme } from './theme.ts'
import { tr } from './i18n.ts'

interface DrawerState {
  kind: DrawerKind
  id?: string
}

const DRAWER_TITLE: Record<DrawerKind, string> = {
  detail: tr('候选', 'Name'),
  taste: tr('你的口味', 'Your taste'),
  priors: tr('取名规则', 'Leanings'),
  brief: tr('项目简介', 'Project brief'),
  keys: tr('快捷键', 'Shortcuts'),
  settings: tr('设置', 'Settings'),
  discards: tr('丢掉的名字', 'Dropped names'),
}

const KEYS: [string, string][] = [
  ['j / k　↑ / ↓', tr('上一个 / 下一个', 'Previous / next')],
  ['1 2 3 4 5', tr('从 ▼▼ 到 ▲▲ 评价，评完自动到下一个', 'Mark from ▼▼ to ▲▲, then move to the next')],
  ['u', tr('撤销上一次评价', 'Undo the last mark')],
  ['⇧J', tr('跳到下一个还没评价的', 'Jump to the next unmarked name')],
  ['↵', tr('打开 / 收起详情', 'Open / close details')],
  ['n', tr('写备注', 'Add a note')],
  ['s', tr('朗读名字', 'Say the name')],
  ['c', tr('复制名字', 'Copy the name')],
  ['g', tr('再来一批', 'Another batch')],
  ['⇧G', tr('写方向、挑方法，再来一批', 'Set a direction, choose methods, and make another batch')],
  ['f', tr('照这个名字再来一批', 'Another batch from this name')],
  ['e', tr('导出 Markdown', 'Export Markdown')],
  ['/', tr('搜索。↵ 跳到第一个结果，Esc 清空', 'Search. ↵ jumps to the first result; Esc clears it')],
  ['t', tr('你的口味', 'Your taste')],
  ['p', tr('取名规则', 'Leanings')],
  ['⌘K / Ctrl+K', tr('命令面板', 'Command palette')],
  ['Esc', tr('取消选中 / 关掉面板', 'Clear selection / close panel')],
]

export function App() {
  const a = useAtelier()
  const [theme, setTheme] = useTheme()
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [sessionAction, setSessionAction] = useState<SessionAction | null>(null)
  const [pinningId, setPinningId] = useState<string | null>(null)

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
      { id: 'new', group: tr('会话', 'Session'), label: tr('新建命名会话', 'New naming session'), hint: 'N', run: () => a.open(null) },
      { id: 'settings', group: tr('设置', 'Settings'), label: tr('打开设置', 'Open settings'), run: () => openDrawer('settings') },
    ]
    if (theme !== 'light') list.push({ id: 'theme-light', group: tr('外观', 'Appearance'), label: tr('改用浅色', 'Use light theme'), run: () => setTheme('light') })
    if (theme !== 'dark') list.push({ id: 'theme-dark', group: tr('外观', 'Appearance'), label: tr('改用深色', 'Use dark theme'), run: () => setTheme('dark') })
    if (theme !== 'system') list.push({ id: 'theme-system', group: tr('外观', 'Appearance'), label: tr('跟随系统', 'Follow system'), run: () => setTheme('system') })
    if (a.sessionId) {
      list.push(
        { id: 'gen', group: tr('生成', 'Generate'), label: tr('再来一批', 'Another batch'), hint: 'G', run: () => a.generate() },
        { id: 'gen8', group: tr('生成', 'Generate'), label: tr('生成一大批', 'Generate a large batch'), run: () => a.generate({ width: 8 }) },
        { id: 'stop', group: tr('生成', 'Generate'), label: tr('停止', 'Stop'), run: () => a.cancel() },
        { id: 'taste', group: tr('查看', 'View'), label: tr('你的口味', 'Your taste'), hint: 'T', run: () => openDrawer('taste') },
        { id: 'priors', group: tr('查看', 'View'), label: tr('取名规则', 'Leanings'), hint: 'P', run: () => openDrawer('priors') },
        { id: 'brief', group: tr('查看', 'View'), label: tr('项目简介', 'Project brief'), run: () => openDrawer('brief') },
        { id: 'keys', group: tr('查看', 'View'), label: tr('快捷键', 'Shortcuts'), hint: '?', run: () => openDrawer('keys') },
        {
          id: 'md',
          group: tr('导出', 'Export'),
          label: tr('导出 Markdown', 'Export Markdown'),
          run: () => window.open(`/api/sessions/${a.sessionId}/export?format=md`, '_blank'),
        },
        {
          id: 'json',
          group: tr('导出', 'Export'),
          label: tr('导出 JSON', 'Export JSON'),
          run: () => window.open(`/api/sessions/${a.sessionId}/export?format=json`, '_blank'),
        },
        {
          id: 'del',
          group: tr('会话', 'Session'),
          label: tr('删除这个会话', 'Delete this session'),
          run: () => {
            if (a.session) setSessionAction({ kind: 'delete', id: a.session.id, title: a.session.title || a.session.brief })
          },
        },
      )
      for (const s of a.boot?.strategies ?? []) {
        list.push({
          id: `s-${s.id}`,
          group: tr('换个思路', 'Try another method'),
          label: tr(`只用「${s.label}」生成一批`, `Generate one batch using “${s.label}”`),
          hint: s.brief,
          run: () => a.generate({ strategyIds: [s.id] }),
        })
      }
    }
    for (const s of a.sessions) {
      if (s.id === a.sessionId) continue
      list.push({
        id: `open-${s.id}`,
        group: tr('打开', 'Open'),
        label: s.title || s.brief,
        hint: tr(`${s.candidateCount} 个候选`, `${s.candidateCount} ${s.candidateCount === 1 ? 'name' : 'names'}`),
        run: () => a.open(s.id),
      })
    }
    return list
  }, [a, openDrawer, theme, setTheme])

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
          <h1 className="opening__title">{tr('连不上服务', "Can't connect to the service")}</h1>
          <div className="warnbox">
            {a.bootError}
            <br />
            {tr('确认 ', 'Make sure ')}<code>npm run dev</code>{tr(' 或 ', ' or ')}<code>npm start</code>{tr(' 仍在运行，默认端口 5179。', ' is still running. Default port: 5179.')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <Atmosphere working={a.running} />

      <div className={`shell${drawer?.kind === 'detail' ? ' shell--pane' : ''}`}>
        <SessionRail
          sessions={a.sessions}
          activeId={a.sessionId}
          connected={a.connected}
          onOpen={id => a.open(id)}
          onNew={() => a.open(null)}
          onConfigure={() => openDrawer('settings')}
          settingsOpen={drawer?.kind === 'settings'}
          pendingId={pinningId}
          onRename={s => setSessionAction({ kind: 'rename', id: s.id, title: s.title || s.brief })}
          onDelete={s => setSessionAction({ kind: 'delete', id: s.id, title: s.title || s.brief })}
          onPin={async s => {
            if (pinningId) return
            setPinningId(s.id)
            try {
              await a.updateSession(s.id, { pinned: !s.pinned })
            } catch (err) {
              a.toast((err as Error).message, 'error')
            } finally {
              setPinningId(null)
            }
          }}
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
                closeDetail={closeDrawer}
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
        variant={drawer?.kind === 'settings' ? 'settings' : drawer?.kind === 'detail' ? 'pane' : undefined}
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
            checking={a.checking.has(detail.id)}
            autoVerify={a.boot?.settings.autoVerify ?? true}
            onVerdict={v => a.setVerdict(detail.id, v)}
            onNote={note => a.setNote(detail.id, note)}
            onRecheck={() => a.recheck(detail.id)}
            onFollow={a.running ? undefined : () => a.generate({ parentId: detail.id })}
          />
        )}

        {drawer?.kind === 'discards' && (
          <DiscardList discards={a.discards} strategyById={a.strategyById} onKeep={a.keepDiscard} />
        )}

        {drawer?.kind === 'settings' && (
          <Settings
            theme={theme}
            onTheme={setTheme}
            onSaved={a.setProvider}
            autoVerify={a.boot?.settings.autoVerify ?? true}
            onAutoVerify={a.setAutoVerify}
            savingAutoVerify={a.savingSettings}
            onLanguage={a.setLanguage}
          />
        )}

        {drawer?.kind === 'taste' && a.profile && (
          <TastePanel profile={a.profile} familyById={a.familyById} />
        )}

        {drawer?.kind === 'priors' && a.boot && a.session && (
          <>
            <p className="drawer__lead">{tr('关掉哪条，下一批就不再遵守它。', 'Turn off a leaning to stop using it in the next batch.')}</p>
            <PriorDossier priors={a.boot.priors} enabled={a.session.priors} onChange={a.setPriors} />
            <div className="section-h">
              {tr('名字的罕见程度', 'Name rarity')}
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
              style={{ width: '100%', accentColor: 'var(--mark)' }}
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
                <div className="section-h">{tr('你填的名字', 'Names you entered')}</div>
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
              <b style={{ width: 120, fontFamily: 'var(--font-mono)', textTransform: 'none', fontSize: 14 }}>{k}</b>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{v}</span>
            </div>
          ))}
      </Drawer>

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
      {sessionAction && <SessionDialog
        key={`${sessionAction.kind}-${sessionAction.id}`}
        action={sessionAction}
        onClose={() => setSessionAction(null)}
        onSubmit={async title => {
          if (sessionAction.kind === 'rename') await a.updateSession(sessionAction.id, { title })
          else {
            await a.removeSession(sessionAction.id)
            if (sessionAction.id === a.sessionId) closeDrawer()
          }
        }}
      />}
      <Toasts toasts={a.toasts} />
    </>
  )
}
