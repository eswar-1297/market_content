import {
  AlertCircle, AlertTriangle, Info, Image, Table,
  BarChart3, ListChecks, Monitor, HelpCircle, LayoutGrid,
  ArrowLeftRight, GitBranch, DollarSign
} from 'lucide-react'

const priorityConfig = {
  CRITICAL: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    icon: AlertCircle,
    iconColor: 'text-red-500',
    badge: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
    label: 'Critical'
  },
  RECOMMENDED: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    badge: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300',
    label: 'Recommended'
  },
  NICE_TO_HAVE: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    icon: Info,
    iconColor: 'text-blue-500',
    badge: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
    label: 'Nice to Have'
  }
}

/**
 * Suggestion card component for displaying analysis suggestions
 */
export default function SuggestionCard({ suggestion }) {
  const config = priorityConfig[suggestion.priority] || priorityConfig.RECOMMENDED
  const Icon = config.icon

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} p-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${config.badge}`}>
              {config.label}
            </span>
            {suggestion.guideline && (
              <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                {suggestion.guideline}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {suggestion.text}
          </p>
        </div>
      </div>
    </div>
  )
}

const visualIconMap = {
  'infographic': ListChecks,
  'table': Table,
  'image': Image,
  'chart': BarChart3,
}

/**
 * Visual content recommendation card
 */
export function VisualRecommendationCard({ recommendation }) {
  const Icon = visualIconMap[recommendation.type] || Image

  const typeColors = {
    infographic: 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400',
    table: 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400',
    image: 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400',
    chart: 'bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-400',
  }

  const priorityBadge = {
    CRITICAL: 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400',
    RECOMMENDED: 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400',
    NICE_TO_HAVE: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${typeColors[recommendation.type] || typeColors.image}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {recommendation.name}
            </h4>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${priorityBadge[recommendation.priority] || priorityBadge.RECOMMENDED}`}>
              {recommendation.type}
            </span>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5">
            {recommendation.description}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-500 italic">
            Placement: {recommendation.placement}
          </p>
        </div>
      </div>
    </div>
  )
}
