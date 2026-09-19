import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import type { ProbeResult, ProviderConfig, ProviderStatus } from '../types.ts'

const SOURCE_LABEL: Record<ProviderConfig['source'], string> = {
  'config-file': 'nomothete.config.json',
  env: '.env',
  none: '未设置',
}

/**
 * The third way in, next to the first-run questions and the file itself.
 *
 * It exists because changing endpoints is not a one-time act — you try a proxy,
 * it is slow, you try another. Doing that by editing a file and restarting is
 * three steps too many for something you do six times in an afternoon.
 *
 * The key field is write-only, and that is the whole security argument for this
 * panel: the browser can *set* a credential it can never *read*. A hostile
 * script in this page can spend tokens through the local proxy either way, but
 * it cannot walk away with something that still works tomorrow.
 */
export function Settings({ onSaved }: { onSaved: (provider: ProviderStatus) => void }) {
  const [cfg, setCfg] = useState<ProviderConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [busy, setBusy] = useState(false)

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
    setBusy(true)
    setError(null)
    setProbe(null)
    try {
      const next = await api.saveConfig({ baseURL, model, apiKey, reasoningEffort: effort })
      adopt(next)
      // Nothing keeps it after it has gone in — not state, not the input.
      setApiKey('')
      onSaved(next.provider)
      setProbe(await api.testConfig())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    setError(null)
    try {
      setProbe(await api.testConfig())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!cfg) {
    return <p className="drawer__lead">{error ?? '正在读取配置…'}</p>
  }

  const locked = !cfg.writable
  const ready = model.trim().length > 0 && (cfg.provider.hasKey || apiKey.trim().length > 0)

  return (
    <div className="cfg">
      <div className="section-h">
        当前来自
        <span>{SOURCE_LABEL[cfg.source]}</span>
      </div>
      <div className="cfg__path">{cfg.path}</div>

      {cfg.shadowsEnv && (
        <div className="warnbox">
          <code>nomothete.config.json</code> 优先于 <code>.env</code>，<code>.env</code> 中的同名设置不生效。
        </div>
      )}
      {locked && (
        <div className="warnbox">
          配置来自 <code>nomothete.config.json</code>，此处不可修改。移走该文件后此处生效。
        </div>
      )}

      <div className="field">
        <div className="field__label">端点</div>
        <div className="field__box">
          <input
            value={baseURL}
            disabled={locked}
            placeholder="https://api.openai.com/v1"
            onChange={e => setBaseURL(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>

      <div className="field">
        <div className="field__label">
          模型
          {cfg.kind && <span className="field__value">{cfg.kind}</span>}
        </div>
        <div className="field__box">
          <input
            value={model}
            disabled={locked}
            placeholder="gpt-5"
            onChange={e => setModel(e.target.value)}
            spellCheck={false}
            list="cfg-models"
          />
        </div>
        {probe?.sample?.length ? (
          <datalist id="cfg-models">
            {probe.sample.map(id => (
              <option key={id} value={id} />
            ))}
          </datalist>
        ) : null}
      </div>

      <div className="field">
        <div className="field__label">
          API key
          <span className="field__value">
            {cfg.keyHint ? `已存 ····${cfg.keyHint}` : '未设置'}
          </span>
        </div>
        <div className="field__box">
          <input
            type="password"
            value={apiKey}
            disabled={locked}
            placeholder={cfg.keyHint ? '留空则不变' : '必填'}
            onChange={e => setApiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="field">
        <div className="field__label">
          reasoning_effort
          <span className="field__value">留空则用端点默认值</span>
        </div>
        <div className="field__box">
          <input
            value={effort}
            disabled={locked}
            placeholder="none"
            onChange={e => setEffort(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>

      <div className="cfg__acts">
        <button className="btn btn--primary btn--sm" disabled={locked || busy || !ready} onClick={save}>
          {busy ? '…' : '保存'}
        </button>
        <button className="btn btn--ghost btn--sm" disabled={busy || !cfg.provider.configured} onClick={test}>
          测试连接
        </button>
      </div>

      {error && <div className="warnbox">{error}</div>}

      {probe && (
        <div className={`cfg__probe${probe.ok ? '' : ' cfg__probe--bad'}`}>
          <b>{probe.ok ? '✓' : '!'}</b>
          <span>{probe.message}</span>
        </div>
      )}
    </div>
  )
}
