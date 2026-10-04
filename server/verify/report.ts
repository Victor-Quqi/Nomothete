import type { ClaimVerdict, Verification } from './store.ts'
import { tr } from '../i18n.ts'

const CLAIM_LABEL: Record<ClaimVerdict, string> = {
  get supported() { return tr('有资料支持', 'Supported by sources') },
  get contradicted() { return tr('与资料不符', 'Contradicted by sources') },
  get insufficient() { return tr('未找到足够依据', 'Insufficient evidence') },
  get failed() { return tr('未能核查', 'Could not verify') },
}

/** Rationale findings for the Markdown export, so a detected contradiction travels with the text. */
export function verificationLines(v: Verification | null | undefined): string[] {
  if (v?.state === 'failed') return [tr(`- 取义核查 · 未能核查：${v.reason}`, `- Source check · Could not verify: ${v.reason}`)]
  if (v?.state !== 'done') return []
  return v.claims.map(claim => {
    const detail = claim.note ?? claim.reason
    const links = claim.sources.map(s => `[${(s.title || s.url).replace(/[[\]]/g, '')}](${s.url})`).join(tr('、', ', '))
    return tr(`- 取义核查 · ${CLAIM_LABEL[claim.verdict]}：${claim.text}${detail ? `（${detail}）` : ''}${links ? ` 来源：${links}` : ''}`, `- Source check · ${CLAIM_LABEL[claim.verdict]}: ${claim.text}${detail ? ` (${detail})` : ''}${links ? ` Sources: ${links}` : ''}`)
  })
}
