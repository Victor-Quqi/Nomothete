/**
 * The check interface.
 *
 * Every check is one object in an array. Adding a check means pushing a new
 * object; the pipeline does not change. Each one declares what it costs and
 * when it is allowed to run, and the runner honours that — the free tier goes
 * out for every Candidate, the rate-limited tier waits until a Candidate has
 * earned it with a positive Verdict.
 *
 * Vocabulary discipline (CONTEXT.md): `clear` means "no record found" and
 * nothing stronger. It is never rendered as 可用 or 安全.
 */
import { tr } from '../i18n.ts'

export type CheckTier = 'local' | 'free' | 'ratelimited' | 'paid'

export type CheckStatus =
  | 'clear' // 查无记录
  | 'taken' // 注册表里已有同名记录
  | 'blocked' // 归一化后与既有名字相撞，注册会被拒
  | 'caution' // 有值得知道的信号，但不是硬约束
  | 'invalid' // 这个名字在该注册表上根本不合法
  | 'error'
  | 'pending'

export interface CheckResult {
  checkId: string
  label: string
  tier: CheckTier
  status: CheckStatus
  /** One short line for the badge. */
  headline: string
  /** The reasoning, shown when the user opens the candidate. */
  detail?: string
  /** Anything structured the UI wants: collision lists, counts, links. */
  data?: Record<string, unknown>
}

export interface CheckContext {
  name: string
  /** Set when the check is re-run after a positive Verdict. */
  deep: boolean
  signal: AbortSignal
}

/** What a check concludes, given facts. Everything here is words about data. */
export interface CheckReading {
  status: CheckStatus
  headline: string
  detail?: string
}

/**
 * A check is two halves that must stay apart.
 *
 * `run` goes and finds things out. It may take a second and hit the network,
 * and what it returns is facts — counts, states, names — with no opinion and no
 * prose in them.
 *
 * `describe` turns those facts into a verdict and a sentence. It is pure and
 * instant, so it runs again every time a stored answer is read. That is the
 * whole point of the split: for a year this app wrote its sentences into the
 * database beside the facts, and a card kept whatever words the build that
 * generated it happened to use. Reword a check and 227 cards disagreed with
 * each other, and the only way to fix one was to pay for the network call
 * again. Facts are worth storing. Sentences are not.
 */
export interface Check {
  id: string
  label: string
  tier: CheckTier
  /** Whether this check runs for every Candidate or only after an upvote. */
  when: 'always' | 'after-upvote'
  /** Gather. Null means there is nothing about this name worth keeping. */
  run(ctx: CheckContext): Promise<Record<string, unknown> | null>
  /** Speak. Null means the facts turned out to be nothing worth showing. */
  describe(data: Record<string, unknown>, name: string): CheckReading | null
}

export function tierLabel(tier: CheckTier): string {
  switch (tier) {
    case 'local': return tr('本地，0ms', 'Local, 0 ms')
    case 'free': return tr('免费网络', 'Free network')
    case 'ratelimited': return tr('限速', 'Rate limited')
    case 'paid': return tr('付费', 'Paid')
  }
}
