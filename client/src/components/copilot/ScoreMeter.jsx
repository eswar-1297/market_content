export default function ScoreMeter({ score, categories }) {
  const getColor = (s) => {
    if (s >= 80) return 'text-green-500'
    if (s >= 60) return 'text-yellow-500'
    if (s >= 40) return 'text-orange-500'
    return 'text-red-500'
  }

  const getBgColor = (s) => {
    if (s >= 80) return 'bg-green-500'
    if (s >= 60) return 'bg-yellow-500'
    if (s >= 40) return 'bg-orange-500'
    return 'bg-red-500'
  }

  const catEntries = categories ? Object.entries(categories).slice(0, 4) : []

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Live Score</span>
        <span className={`text-2xl font-bold ${getColor(score)}`}>{score || 0}</span>
      </div>

      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-4">
        <div
          className={`h-2.5 rounded-full transition-all duration-500 ${getBgColor(score)}`}
          style={{ width: `${Math.min(score || 0, 100)}%` }}
        />
      </div>

      {catEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {catEntries.map(([key, cat]) => (
            <div key={key} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800">
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{cat.label || key}</span>
              <span className={`text-xs font-semibold ${getColor(cat.score)}`}>{cat.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
