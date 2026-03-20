import { AlertCircle, Check, X, ArrowRight } from 'lucide-react'

const severityConfig = {
  critical: { bg: 'bg-red-50 dark:bg-red-950/40', border: 'border-red-200 dark:border-red-800', icon: 'text-red-500', label: 'Fix' },
  warning: { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800', icon: 'text-amber-500', label: 'Improve' },
  info: { bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-200 dark:border-blue-800', icon: 'text-blue-500', label: 'Suggestion' }
}

const typeLabels = {
  grammar: 'Grammar',
  clarity: 'Clarity',
  tone: 'Tone',
  extractability: 'AI Extractability',
  structure: 'Structure',
  directness: 'Directness',
  keyword: 'Keyword'
}

export default function CorrectionCard({ correction, onApply, onDismiss }) {
  const config = severityConfig[correction.severity] || severityConfig.info

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} p-3 transition-all`}>
      <div className="flex items-start gap-2">
        <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.icon}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${config.bg} ${config.icon}`}>
              {config.label}
            </span>
            {correction.type && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {typeLabels[correction.type] || correction.type}
              </span>
            )}
          </div>

          {correction.original && (
            <div className="mb-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Original:</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 line-through opacity-75 leading-relaxed">
                "{correction.original.length > 150 ? correction.original.substring(0, 150) + '...' : correction.original}"
              </p>
            </div>
          )}

          {correction.corrected && (
            <div className="mb-2">
              <div className="flex items-center gap-1 mb-0.5">
                <ArrowRight className="w-3 h-3 text-green-500" />
                <p className="text-xs text-green-600 dark:text-green-400">Suggested:</p>
              </div>
              <p className="text-sm text-gray-900 dark:text-gray-100 font-medium leading-relaxed">
                "{correction.corrected.length > 200 ? correction.corrected.substring(0, 200) + '...' : correction.corrected}"
              </p>
            </div>
          )}

          {correction.reason && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              {correction.reason}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2">
            {correction.corrected && onApply && (
              <button
                onClick={() => onApply(correction)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
              >
                <Check className="w-3 h-3" /> Apply Fix
              </button>
            )}
            {onDismiss && (
              <button
                onClick={() => onDismiss(correction)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-3 h-3" /> Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
