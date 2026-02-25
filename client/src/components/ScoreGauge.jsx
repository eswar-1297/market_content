/**
 * Circular score gauge component
 * Displays a ring chart with score 0-100
 */
export default function ScoreGauge({ score, label, size = 120 }) {
  const radius = 45
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const getColor = (score) => {
    if (score >= 80) return { stroke: '#10b981', text: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' }
    if (score >= 60) return { stroke: '#f59e0b', text: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' }
    if (score >= 40) return { stroke: '#f97316', text: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' }
    return { stroke: '#ef4444', text: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' }
  }

  const color = getColor(score)

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="transform -rotate-90" style={{ width: size, height: size }}>
          {/* Background ring */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-gray-200 dark:text-gray-700"
          />
          {/* Score ring */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={color.stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="score-ring-animated"
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${color.text}`}>{score}</span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">/ 100</span>
        </div>
      </div>
      {label && (
        <span className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      )}
    </div>
  )
}

/**
 * Horizontal bar score for categories
 */
export function CategoryScore({ label, score, icon: Icon }) {
  const getBarColor = (score) => {
    if (score >= 80) return 'bg-emerald-500'
    if (score >= 60) return 'bg-amber-500'
    if (score >= 40) return 'bg-orange-500'
    return 'bg-red-500'
  }

  const getTextColor = (score) => {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
    if (score >= 60) return 'text-amber-600 dark:text-amber-400'
    if (score >= 40) return 'text-orange-600 dark:text-orange-400'
    return 'text-red-600 dark:text-red-400'
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-gray-400" />}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        </div>
        <span className={`text-sm font-bold ${getTextColor(score)}`}>{score}</span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${getBarColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}
