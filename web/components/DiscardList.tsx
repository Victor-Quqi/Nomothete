import { rarityPercent } from '../rarity.ts'
import type { Discard, StrategyInfo } from '../types.ts'

/**
 * The names the rarity floor turned away, newest first. The floor is the
 * model's guess at how ordinary a name is, not a judgement of it, so any of
 * these can be put back on the wall.
 */
export function DiscardList({
  discards,
  strategyById,
  onKeep,
}: {
  discards: Discard[]
  strategyById: Map<string, StrategyInfo>
  onKeep: (id: string) => void
}) {
  if (discards.length === 0) return <p className="drawer__lead">没有丢掉的名字。</p>
  return (
    <>
      <p className="drawer__lead">罕见度不到下限，没有上墙。留下的回到原来那一批。</p>
      <ul className="discards">
        {[...discards].reverse().map(d => (
          <li key={d.id} className="discard">
            <div className="discard__head">
              <b className="discard__name">{d.name}</b>
              <span className="discard__meta">
                第 {d.generation} 批 · {strategyById.get(d.strategyId)?.label ?? d.strategyId} · 罕见度 {rarityPercent(d.probability)}%
              </span>
              <button className="btn btn--ghost btn--sm discard__keep" onClick={() => onKeep(d.id)}>
                留下
              </button>
            </div>
            {d.rationale && <p className="discard__rationale">{d.rationale}</p>}
          </li>
        ))}
      </ul>
    </>
  )
}
