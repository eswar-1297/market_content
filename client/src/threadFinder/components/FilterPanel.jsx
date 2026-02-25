import { Filter, ArrowUpCircle, MessageCircle, Calendar } from 'lucide-react'

const MIN_SCORE_OPTIONS = [
  { value: 0, label: 'Any' },
  { value: 10, label: '10+' },
  { value: 50, label: '50+' },
  { value: 100, label: '100+' },
  { value: 500, label: '500+' },
  { value: 1000, label: '1K+' }
]

const MIN_COMMENTS_OPTIONS = [
  { value: 0, label: 'Any' },
  { value: 5, label: '5+' },
  { value: 10, label: '10+' },
  { value: 25, label: '25+' },
  { value: 50, label: '50+' },
  { value: 100, label: '100+' }
]

const TIME_FILTER_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: '1month', label: 'Last Month' },
  { value: '3months', label: 'Last 3 Months' },
  { value: '6months', label: 'Last 6 Months' },
  { value: '1year', label: 'Last Year' },
  { value: 'older', label: 'More than a Year' }
]

function FilterPanel({ filters, setFilters, darkMode }) {
  const handleChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const inputClasses = `w-full px-4 py-2.5 rounded-lg border transition-all focus:outline-none focus:ring-2 ${
    darkMode
      ? 'bg-reddit-gray border-reddit-lightGray text-white focus:border-reddit-orange focus:ring-reddit-orange/20'
      : 'bg-white border-gray-200 text-gray-900 focus:border-reddit-orange focus:ring-reddit-orange/20'
  }`

  const labelClasses = `flex items-center gap-2 text-sm font-medium mb-2 ${
    darkMode ? 'text-gray-300' : 'text-gray-600'
  }`

  return (
    <div className={`rounded-xl p-4 border transition-colors ${
      darkMode 
        ? 'bg-reddit-gray/50 border-reddit-lightGray' 
        : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-center gap-2 mb-4">
        <Filter size={18} className="text-reddit-orange" />
        <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Filters
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Time Filter */}
        <div>
          <label className={labelClasses}>
            <Calendar size={14} />
            Time Period
          </label>
          <select
            value={filters.timeFilter || 'all'}
            onChange={(e) => handleChange('timeFilter', e.target.value)}
            className={inputClasses}
          >
            {TIME_FILTER_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Min Score */}
        <div>
          <label className={labelClasses}>
            <ArrowUpCircle size={14} />
            Minimum Upvotes
          </label>
          <select
            value={filters.minScore}
            onChange={(e) => handleChange('minScore', parseInt(e.target.value))}
            className={inputClasses}
          >
            {MIN_SCORE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Min Comments */}
        <div>
          <label className={labelClasses}>
            <MessageCircle size={14} />
            Minimum Comments
          </label>
          <select
            value={filters.minComments}
            onChange={(e) => handleChange('minComments', parseInt(e.target.value))}
            className={inputClasses}
          >
            {MIN_COMMENTS_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

export default FilterPanel
