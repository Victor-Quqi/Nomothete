import { rarityPercent } from '../rarity.ts'
import type { Discard, StrategyInfo } from '../types.ts'
import { tr } from '../i18n.ts'

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
  if (discards.length === 0) return <p className="drawer__lead">{tr('没有丢掉的名字。', 'No dropped names.')}</p>
  return (
    <>
      <p className="drawer__lead">{tr('罕见度不到下限，没有上墙。留下的回到原来那一批。', 'These names are below the rarity floor and stayed off the wall. Kept names return to their original batch.')}</p>
      <ul className="discards">
        {[...discards].reverse().map(d => (
          <li key={d.id} className="discard">
            <div className="discard__head">
              <b className="discard__name">{d.name}</b>
              <span className="discard__meta">
                {tr(`第 ${d.generation} 批 · ${strategyById.get(d.strategyId)?.label ?? d.strategyId} · 罕见度 ${rarityPercent(d.probability)}%`, `Batch ${d.generation} · ${strategyById.get(d.strategyId)?.label ?? d.strategyId} · rarity ${rarityPercent(d.probability)}%`)}
              </span>
              <button className="btn btn--ghost btn--sm discard__keep" onClick={() => onKeep(d.id)}>
                {tr('留下', 'Keep')}
              </button>
            </div>
            {d.rationale && <p className="discard__rationale">{d.rationale}</p>}
          </li>
        ))}
      </ul>
    </>
  )
}
