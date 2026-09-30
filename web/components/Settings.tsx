import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import type { ThemeChoice } from '../theme.ts'
import type { ProbeResult, ProviderConfig, ProviderStatus } from '../types.ts'
import { ThemePicker } from './ThemePicker.tsx'

const SOURCE_LABEL: Record<ProviderConfig['source'], string> = {
  'config-file': 'nomothete.config.json',
  env: '.env',
  none: '未设置',
}

export function Settings({
  theme,
  onTheme,
  onSaved,
  autoVerify,
  onAutoVerify,
  savingAutoVerify,
}: {
  theme: ThemeChoice
  onTheme: (theme: ThemeChoice) => void
  onSaved: (provider: ProviderStatus) => void
  autoVerify: boolean
  onAutoVerify: (on: boolean) => void
  savingAutoVerify: boolean
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
  const ready = model.trim().length > 0 && (cfg?.provider.hasKey || apiKey.trim().length > 0)
  const dirty = !!cfg && (baseURL !== cfg.baseURL || model !== cfg.model || effort !== cfg.reasoningEffort || apiKey.length > 0)

  return (
    <div className="cfg">
      <section className="cfg__section" aria-labelledby="cfg-appearance">
        <h2 id="cfg-appearance" className="cfg__heading">外观</h2>
        <ThemePicker value={theme} onChange={onTheme} />
      </section>

      <section className="cfg__section cfg__verification" aria-labelledby="cfg-auto-verify">
        <div>
          <h2 id="cfg-auto-verify" className="cfg__heading">自动联网核查</h2>
          <p id="cfg-auto-verify-desc" className="cfg__description">标记 ▲ 或手动检查时，核对取义说明中的来源与词义。</p>
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
        <h2 id="cfg-connection" className="cfg__heading">模型连接</h2>
        {!cfg ? (
          <p className="cfg__description" role="status">{error ?? '正在读取…'}</p>
        ) : (
          <form onSubmit={e => { e.preventDefault(); if (!locked && !busy && ready && dirty) void save() }}>
            {locked && (
              <div className="cfg__notice">
                由 <code>nomothete.config.json</code> 管理，请在文件中修改连接信息。
                {cfg.shadowsEnv && <> 此文件优先于 <code>.env</code>。</>}
              </div>
            )}

            <div className="field">
              <label className="field__label" htmlFor="cfg-endpoint">API 地址</label>
              <div className="field__box">
                <input id="cfg-endpoint" value={baseURL} disabled={locked || !!busy}
                  placeholder="https://api.openai.com/v1" onChange={e => setBaseURL(e.target.value)} spellCheck={false} />
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="cfg-model">模型</label>
              <div className="field__box">
                <input id="cfg-model" value={model} disabled={locked || !!busy} placeholder="gpt-5"
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
                API 密钥
                {cfg.keyHint && <span className="field__value">已存 ····{cfg.keyHint}</span>}
              </label>
              <div className="field__box">
                <input id="cfg-key" type="password" value={apiKey} disabled={locked || !!busy}
                  placeholder={cfg.keyHint ? '留空保留现有密钥' : '输入 API 密钥'}
                  onChange={e => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} />
              </div>
            </div>

            <details className="cfg__advanced">
              <summary>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
                更多连接选项
              </summary>
              <div className="cfg__advanced-body">
                {(!cfg.kind || cfg.kind === 'openai-chat' || cfg.kind === 'openai-responses') && <div className="field">
                  <label className="field__label" htmlFor="cfg-effort">推理强度</label>
                  <div className="field__box">
                    <input id="cfg-effort" value={effort} disabled={locked || !!busy} placeholder="端点默认"
                      onChange={e => setEffort(e.target.value)} spellCheck={false} aria-describedby="cfg-effort-hint" />
                  </div>
                  <p className="cfg__description" id="cfg-effort-hint">填写 none 关闭推理；清空后保存，由端点决定。</p>
                </div>}
                <dl className="cfg__source">
                  {cfg.kind && <><dt>接口协议</dt><dd>{cfg.kind}</dd></>}
                  <dt>读取自</dt><dd>{SOURCE_LABEL[cfg.source]}</dd>
                </dl>
                {cfg.path && <p className="cfg__path">{cfg.path}</p>}
              </div>
            </details>

            <div className="cfg__acts">
              <button type="button" className="btn btn--ghost btn--sm" disabled={!!busy || !cfg.provider.configured || dirty} onClick={test}>
                {busy === 'test' ? '测试中…' : '测试连接'}
              </button>
              <button type="submit" className="btn btn--sm cfg__save" disabled={locked || !!busy || !ready || !dirty}>
                {busy === 'save' ? '保存中…' : '保存'}
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
