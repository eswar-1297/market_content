import { Tag, Check, Circle, TrendingUp, TrendingDown, Minus } from 'lucide-react'

export default function KeywordTracker({ keywordUsage }) {
  if (!keywordUsage) return null

  const { primary, secondary = [], lsi = [], missingCount = 0, usedCount = 0 } = keywordUsage

  const totalTracked = secondary.length + lsi.length
  const coveragePercent = totalTracked > 0 ? Math.round((usedCount / totalTracked) * 100) : 0

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-4 h-4 text-green-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Keyword Tracker</span>
      </div>

      {/* Primary keyword */}
      {primary && (
        <div className="mb-3 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Primary Keyword</span>
            <DensityBadge status={primary.status} density={primary.density} />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{primary.keyword}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Used {primary.count}x &middot; Density: {primary.density}% (target: 1.0-1.5%)
          </p>
        </div>
      )}

      {/* Coverage meter */}
      {totalTracked > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Semantic Coverage</span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{usedCount}/{totalTracked} ({coveragePercent}%)</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${
                coveragePercent >= 60 ? 'bg-green-500' : coveragePercent >= 30 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${coveragePercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Missing high-priority keywords */}
      {missingCount > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1.5">Missing keywords to incorporate:</p>
          <div className="flex flex-wrap gap-1.5">
            {[...secondary.filter(k => !k.used), ...lsi.filter(k => !k.used)].slice(0, 12).map(k => (
              <span
                key={k.keyword}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
              >
                <Circle className="w-2.5 h-2.5" />
                {k.keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Used keywords */}
      {usedCount > 0 && (
        <div>
          <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1.5">Keywords used:</p>
          <div className="flex flex-wrap gap-1.5">
            {[...secondary.filter(k => k.used), ...lsi.filter(k => k.used)].slice(0, 10).map(k => (
              <span
                key={k.keyword}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
              >
                <Check className="w-2.5 h-2.5" />
                {k.keyword} ({k.count}x)
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DensityBadge({ status, density }) {
  const configs = {
    good: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300', icon: Check },
    low: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', icon: TrendingDown },
    high: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', icon: TrendingUp }
  }
  const config = configs[status] || configs.good
  const Icon = config.icon

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${config.bg} ${config.text}`}>
      <Icon className="w-3 h-3" /> {density}%
    </span>
  )
}
