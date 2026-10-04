interface SearchData {
  total?: number
  names?: string[]
  exactNorm?: string[]
  nearMisses?: string[]
}

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Compare the package basename; an npm scope identifies its owner.
 *
 * Both sides call this, and each has its own language switch, so the caller
 * hands its `tr` in.
 */
export function npmNeighbourhood(data: SearchData, query: string, tr: (zh: string, en: string) => string) {
  const target = normalize(query)
  const stored = data.names ?? [...(data.exactNorm ?? []), ...(data.nearMisses ?? [])]
  const names = [...new Set(stored)].filter(name => {
    const base = normalize(name.split('/').at(-1) ?? '')
    return target && base && (base.includes(target) || target.includes(base))
  })
  // Older rows may contain only the total, with no package names to inspect.
  const hasNames = data.names !== undefined || data.exactNorm !== undefined || data.nearMisses !== undefined
  const headline = names.length
    ? tr(
        `npm 结果中有 ${names.length} 个相近包名`,
        `npm: ${names.length} similar package name${names.length === 1 ? '' : 's'}`,
      )
    : hasNames || data.total === 0
      ? tr('npm 返回结果中无相近包名', 'npm: no similar package names')
      : tr('npm 结果未保存包名', 'npm: package names not stored')
  return {
    names,
    headline,
    status: names.length >= 6 || names.some(name => normalize(name) === target) ? 'caution' as const : 'clear' as const,
  }
}
