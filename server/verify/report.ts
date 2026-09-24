import type { ClaimVerdict, Verification } from './store.ts'

const CLAIM_LABEL: Record<ClaimVerdict, string> = {
  supported: '有资料支持',
  contradicted: '与资料不符',
  insufficient: '未找到足够依据',
  failed: '未能核查',
}

/** Rationale findings for the Markdown export, so a detected contradiction travels with the text. */
export function verificationLines(v: Verification | null | undefined): string[] {
  if (v?.state === 'failed') return [`- 取义核查 · 未能核查：${v.reason}`]
  if (v?.state !== 'done') return []
  return v.claims.map(claim => {
    const detail = claim.note ?? claim.reason
    const links = claim.sources.map(s => `[${(s.title || s.url).replace(/[[\]]/g, '')}](${s.url})`).join('、')
    return `- 取义核查 · ${CLAIM_LABEL[claim.verdict]}：${claim.text}${detail ? `（${detail}）` : ''}${links ? ` 来源：${links}` : ''}`
  })
}
