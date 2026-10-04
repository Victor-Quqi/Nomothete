import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { lang, tr, type Lang } from '../i18n.ts'
import type { ThemeChoice } from '../theme.ts'
import type { ProbeResult, ProviderConfig, ProviderStatus } from '../types.ts'
import { ThemePicker } from './ThemePicker.tsx'

// Each in its own language, so the way back is readable from either side.
const LANGS: { id: Lang; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
]

const SOURCE_LABEL: Record<ProviderConfig['source'], string> = {
  'config-file': 'nomothete.config.json',
  env: '.env',
  none: tr('未设置', 'Not set'),
}

export function Settings({
  theme,
  onTheme,
  onSaved,
  autoVerify,
  onAutoVerify,
  savingAutoVerify,
  onLanguage,
}: {
  theme: ThemeChoice
  onTheme: (theme: ThemeChoice) => void
  onSaved: (provider: ProviderStatus) => void
  autoVerify: boolean
  onAutoVerify: (on: boolean) => void
  savingAutoVerify: boolean
  onLanguage: (language: Lang) => void
}) {
  const [cfg, setCfg] = useState<ProviderConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)

  const [baseURL, setBaseURL] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [effort, setEffort] = useState('')

  const adopt = (c: ProviderConfig) => {
    setCfg(c)
    setBaseURL(c.baseURL)
    setModel(c.model)
    setEffort(c.reasoningEffort)
  }

  useEffect(() => {
    api.config().then(adopt).catch((e: Error) => setError(e.message))
  }, [])

  const save = async () => {
    setBusy('save')
    setError(null)
    setProbe(null)
    try {
      const next = await api.saveConfig({ baseURL, model, apiKey, reasoningEffort: effort })
      adopt(next)
      // Clear the submitted key from the input and component state.
      setApiKey('')
      onSaved(next.provider)
      setProbe(await api.testConfig())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    setBusy('test')
    setError(null)
    setProbe(null)
    try {
      setProbe(await api.testConfig())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const locked = !cfg?.writable
  const ready = cfg?.provider.hasKey || apiKey.trim().length > 0
  const dirty = !!cfg && (baseURL !== cfg.baseURL || model !== cfg.model || effort !== cfg.reasoningEffort || apiKey.length > 0)

  return (
    <div className="cfg">
      <section className="cfg__section" aria-labelledby="cfg-appearance">
        <h2 id="cfg-appearance" className="cfg__heading">{tr('外观', 'Appearance')}</h2>
        <ThemePicker value={theme} onChange={onTheme} />
      </section>

      <section className="cfg__section" aria-labelledby="cfg-language">
        <h2 id="cfg-language" className="cfg__heading">语言 · Language</h2>
        <div className="theme-pick lang-pick" role="group" aria-labelledby="cfg-language">
          {LANGS.map(l => (
            <button key={l.id} type="button" aria-pressed={lang === l.id} onClick={() => onLanguage(l.id)}>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="cfg__section cfg__verification" aria-labelledby="cfg-auto-verify">
        <div>
          <h2 id="cfg-auto-verify" className="cfg__heading">{tr('自动联网核查', 'Automatic source checks')}</h2>
          <p id="cfg-auto-verify-desc" className="cfg__description">{tr('标记 ▲ 或手动检查时，核对取义说明中的来源与词义。', 'When you mark ▲ or check manually, verify the sources and meanings cited for the name.')}</p>
        </div>
        <button
          type="button"
          className="toggle"
          role="switch"
          aria-checked={autoVerify}
          aria-labelledby="cfg-auto-verify"
          aria-describedby="cfg-auto-verify-desc"
          aria-busy={savingAutoVerify}
          data-on={autoVerify}
          disabled={savingAutoVerify}
          onClick={() => onAutoVerify(!autoVerify)}
        />
      </section>

      <section className="cfg__section" aria-labelledby="cfg-connection">
        <h2 id="cfg-connection" className="cfg__heading">{tr('模型连接', 'Model connection')}</h2>
        {!cfg ? (
          <p className="cfg__description" role="status">{error ?? tr('正在读取…', 'Loading…')}</p>
        ) : (
          <form onSubmit={e => { e.preventDefault(); if (!locked && !busy && ready && dirty) void save() }}>
            {locked && (
              <div className="cfg__notice">
                {tr('由', 'Managed by')} <code>nomothete.config.json</code>{tr(' 管理，请在文件中修改连接信息。', '; edit the connection in that file.')}
                {cfg.shadowsEnv && <>{tr(' 此文件优先于', ' This file takes precedence over')} <code>.env</code>{tr('。', '.')}</>}
              </div>
            )}

            <div className="field">
              <label className="field__label" htmlFor="cfg-endpoint">{tr('API 地址', 'API endpoint')}</label>
              <div className="field__box">
                <input id="cfg-endpoint" value={baseURL} disabled={locked || !!busy}
                  placeholder={cfg.defaults.baseURL} onChange={e => setBaseURL(e.target.value)} spellCheck={false} />
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="cfg-model">{tr('模型', 'Model')}</label>
              <div className="field__box">
                <input id="cfg-model" value={model} disabled={locked || !!busy} placeholder={cfg.defaults.model}
                  onChange={e => setModel(e.target.value)} spellCheck={false} list="cfg-models" />
              </div>
              {!!probe?.sample?.length && (
                <datalist id="cfg-models">
                  {probe.sample.map(id => <option key={id} value={id} />)}
                </datalist>
              )}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="cfg-key">
                {tr('API 密钥', 'API key')}
                {cfg.keyHint && <span className="field__value">{tr('已存', 'Saved')} ····{cfg.keyHint}</span>}
              </label>
              <div className="field__box">
                <input id="cfg-key" type="password" value={apiKey} disabled={locked || !!busy}
                  placeholder={cfg.keyHint ? tr('留空保留现有密钥', 'Leave blank to keep the current key') : tr('输入 API 密钥', 'Enter API key')}
                  onChange={e => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} />
              </div>
            </div>

            <details className="cfg__advanced">
              <summary>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
                {tr('更多连接选项', 'More connection options')}
              </summary>
              <div className="cfg__advanced-body">
                {(!cfg.kind || cfg.kind === 'openai-chat' || cfg.kind === 'openai-responses') && <div className="field">
                  <label className="field__label" htmlFor="cfg-effort">{tr('推理强度', 'Reasoning effort')}</label>
                  <div className="field__box">
                    <input id="cfg-effort" value={effort} disabled={locked || !!busy} placeholder={tr('端点默认', 'Endpoint default')}
                      onChange={e => setEffort(e.target.value)} spellCheck={false} aria-describedby="cfg-effort-hint" />
                  </div>
                  <p className="cfg__description" id="cfg-effort-hint">{tr('填写 none 关闭推理；清空后保存，由端点决定。', 'Enter none to disable reasoning; clear the field and save to let the endpoint decide.')}</p>
                </div>}
                <dl className="cfg__source">
                  {cfg.kind && <><dt>{tr('接口协议', 'Interface protocol')}</dt><dd>{cfg.kind}</dd></>}
                  <dt>{tr('读取自', 'Read from')}</dt><dd>{SOURCE_LABEL[cfg.source]}</dd>
                </dl>
                {cfg.path && <p className="cfg__path">{cfg.path}</p>}
              </div>
            </details>

            <div className="cfg__acts">
              <button type="button" className="btn btn--ghost btn--sm" disabled={!!busy || !cfg.provider.configured || dirty} onClick={test}>
                {busy === 'test' ? tr('测试中…', 'Testing…') : tr('测试连接', 'Test connection')}
              </button>
              <button type="submit" className="btn btn--sm cfg__save" disabled={locked || !!busy || !ready || !dirty}>
                {busy === 'save' ? tr('保存中…', 'Saving…') : tr('保存', 'Save')}
              </button>
            </div>
            {error && <div className="warnbox" role="alert">{error}</div>}
            {probe && (
              <div className={`cfg__probe${probe.ok ? '' : ' cfg__probe--bad'}`} role="status">
                <b aria-hidden="true">{probe.ok ? '✓' : '!'}</b>
                <span>{probe.message}</span>
              </div>
            )}
          </form>
        )}
      </section>
    </div>
  )
}
