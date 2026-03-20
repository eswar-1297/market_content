import { CheckCircle2, Circle, Layers } from 'lucide-react'

export default function FrameworkProgress({ progress }) {
  if (!progress || progress.length === 0) return null

  const completed = progress.filter(s => s.completed).length
  const total = progress.length
  const percent = Math.round((completed / total) * 100)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Framework</span>
        </div>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{completed}/{total}</span>
      </div>

      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-3">
        <div
          className="h-1.5 rounded-full bg-purple-500 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="space-y-1.5">
        {progress.map(section => (
          <div
            key={section.id}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
              section.completed
                ? 'text-green-700 dark:text-green-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {section.completed
              ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
              : <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
            }
            <span className={`text-xs ${section.completed ? 'font-medium' : ''}`}>
              {section.level === 1 ? 'H1' : section.level === 2 ? 'H2' : 'H3'}: {section.heading}
            </span>
            {section.required && !section.completed && (
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">
                Required
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
