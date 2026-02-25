import { useState, useCallback, useMemo } from 'react'
import { AlertCircle, Users, Loader2, MessageSquare, Search, Filter, Calendar, Package } from 'lucide-react'
import SearchBar from '../components/SearchBar'
import GoogleCommunityCard from '../components/GoogleCommunityCard'
import { searchGoogleCommunityQuestions } from '../services/api'

// Time filter options (applied at search API level)
const TIME_FILTER_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: '1month', label: 'Last Month' },
  { value: '3months', label: 'Last 3 Months' },
  { value: '6months', label: 'Last 6 Months' },
  { value: '1year', label: 'Last Year' }
]

// Google Product filter options
const PRODUCT_FILTER_OPTIONS = [
  { value: 'all', label: 'All Products' },
  { value: 'drive', label: 'Google Drive' },
  { value: 'mail', label: 'Gmail' },
  { value: 'docs', label: 'Google Docs' },
  { value: 'sheets', label: 'Google Sheets' },
  { value: 'calendar', label: 'Google Calendar' },
  { value: 'meet', label: 'Google Meet' },
  { value: 'photos', label: 'Google Photos' },
  { value: 'chrome', label: 'Google Chrome' },
  { value: 'android', label: 'Android' },
  { value: 'workspace', label: 'Google Workspace' },
  { value: 'cloud', label: 'Google Cloud' }
]

// Source filter options (applied client-side)
const SOURCE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'bing', label: 'Bing Only' },
  { value: 'google', label: 'Google Only' },
  { value: 'multi', label: 'Both Sources' }
]

function GoogleCommunity({ darkMode }) {
  const [results, setResults] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState('all')
  const [productFilter, setProductFilter] = useState('all')
  const [lastQuery, setLastQuery] = useState('')

  // Apply source filter to results
  const filteredResults = useMemo(() => {
    if (sourceFilter === 'all') return results
    
    return results.filter(q => {
      const sources = q.sources || []
      switch (sourceFilter) {
        case 'bing':
          return sources.includes('bing') && !sources.includes('google')
        case 'google':
          return sources.includes('google') && !sources.includes('bing')
        case 'multi':
          return sources.length >= 2
        default:
          return true
      }
    })
  }, [results, sourceFilter])

  const handleSearch = useCallback(async (query, time = timeFilter, product = productFilter) => {
    setIsLoading(true)
    setError(null)
    setHasSearched(true)
    setStats(null)
    setLastQuery(query)

    try {
      const data = await searchGoogleCommunityQuestions({
        query,
        limit: 150,
        useBing: true,
        useGoogle: true,
        timeFilter: time,
        productFilter: product
      })
      
      setResults(data.questions || [])
      setStats(data.stats)
    } catch (err) {
      setError(err.message)
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [timeFilter, productFilter])

  // Re-search when time filter changes
  const handleTimeFilterChange = useCallback((newTimeFilter) => {
    setTimeFilter(newTimeFilter)
    if (lastQuery) {
      handleSearch(lastQuery, newTimeFilter, productFilter)
    }
  }, [lastQuery, handleSearch, productFilter])

  // Re-search when product filter changes
  const handleProductFilterChange = useCallback((newProductFilter) => {
    setProductFilter(newProductFilter)
    if (lastQuery) {
      handleSearch(lastQuery, timeFilter, newProductFilter)
    }
  }, [lastQuery, handleSearch, timeFilter])

  const inputClasses = `w-full px-4 py-2.5 rounded-lg border transition-all focus:outline-none focus:ring-2 ${
    darkMode
      ? 'bg-reddit-gray border-reddit-lightGray text-white focus:border-blue-500 focus:ring-blue-500/20'
      : 'bg-white border-gray-200 text-gray-900 focus:border-blue-500 focus:ring-blue-500/20'
  }`

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="text-center py-8 animate-fade-in">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Users className="text-blue-500" size={28} />
          <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Google Community Finder
          </h1>
        </div>
        <p className={`text-lg max-w-2xl mx-auto ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Find Google Community questions using <span className="text-blue-500 font-semibold">Bing</span> and{' '}
          <span className="text-green-500 font-semibold">Google</span> search APIs
        </p>
      </div>

      {/* Search Bar */}
      <div className="animate-fade-in stagger-1 opacity-0">
        <SearchBar 
          onSearch={handleSearch} 
          isLoading={isLoading} 
          darkMode={darkMode}
          placeholder="Search Google Community questions..."
        />
      </div>

      {/* Filter Panel */}
      {hasSearched && results.length > 0 && (
        <div className={`rounded-xl p-4 border transition-colors animate-fade-in ${
          darkMode 
            ? 'bg-reddit-gray/50 border-reddit-lightGray' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center gap-2 mb-4">
            <Filter size={18} className="text-blue-500" />
            <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Filters
            </h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Time Filter */}
            <div>
              <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                darkMode ? 'text-gray-300' : 'text-gray-600'
              }`}>
                <Calendar size={14} />
                Time Period
              </label>
              <select
                value={timeFilter}
                onChange={(e) => handleTimeFilterChange(e.target.value)}
                className={inputClasses}
                disabled={isLoading}
              >
                {TIME_FILTER_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Product Filter */}
            <div>
              <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                darkMode ? 'text-gray-300' : 'text-gray-600'
              }`}>
                <Package size={14} />
                Google Product
              </label>
              <select
                value={productFilter}
                onChange={(e) => handleProductFilterChange(e.target.value)}
                className={inputClasses}
                disabled={isLoading}
              >
                {PRODUCT_FILTER_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Source Filter */}
            <div>
              <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                darkMode ? 'text-gray-300' : 'text-gray-600'
              }`}>
                <Search size={14} />
                Source
              </label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className={inputClasses}
              >
                {SOURCE_FILTER_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in">
          <div className={`rounded-xl p-4 text-center ${
            darkMode ? 'bg-reddit-gray/50' : 'bg-white border border-gray-200'
          }`}>
            <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {stats.total}
            </p>
            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total</p>
          </div>
          <div className={`rounded-xl p-4 text-center ${
            darkMode ? 'bg-blue-500/10' : 'bg-blue-50'
          }`}>
            <p className="text-2xl font-bold text-blue-500">{stats.bing}</p>
            <p className={`text-xs ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>Bing</p>
          </div>
          <div className={`rounded-xl p-4 text-center ${
            darkMode ? 'bg-green-500/10' : 'bg-green-50'
          }`}>
            <p className="text-2xl font-bold text-green-500">{stats.google}</p>
            <p className={`text-xs ${darkMode ? 'text-green-400' : 'text-green-600'}`}>Google</p>
          </div>
          <div className={`rounded-xl p-4 text-center ${
            darkMode ? 'bg-purple-500/10' : 'bg-purple-50'
          }`}>
            <p className="text-2xl font-bold text-purple-500">{stats.multiSource}</p>
            <p className={`text-xs ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>Both</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border animate-fade-in ${
          darkMode 
            ? 'bg-red-500/10 border-red-500/30 text-red-400' 
            : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      )}

      {/* Results */}
      {hasSearched && !isLoading && !error && (
        <div className="space-y-4">
          {/* Results header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare size={18} className="text-blue-500" />
              <h2 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {filteredResults.length} {filteredResults.length === 1 ? 'question' : 'questions'} found
                {filteredResults.length !== results.length && (
                  <span className={`text-sm font-normal ml-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    (filtered from {results.length})
                  </span>
                )}
              </h2>
            </div>
          </div>

          {/* Results grid */}
          {filteredResults.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredResults.map((question, index) => (
                <GoogleCommunityCard
                  key={question.id}
                  question={question}
                  darkMode={darkMode}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <div className={`text-center py-16 rounded-xl border ${
              darkMode 
                ? 'bg-reddit-gray/30 border-reddit-lightGray' 
                : 'bg-gray-50 border-gray-200'
            }`}>
              <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
                {results.length > 0 
                  ? 'No questions match your filters. Try adjusting the filters.'
                  : 'No questions found. Try a different search term.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Initial State */}
      {!hasSearched && !isLoading && (
        <div className={`text-center py-16 rounded-xl border animate-fade-in stagger-3 opacity-0 ${
          darkMode 
            ? 'bg-reddit-gray/30 border-reddit-lightGray' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <Users size={48} className={`mx-auto mb-4 ${darkMode ? 'text-blue-500/50' : 'text-blue-300'}`} />
          <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Ready to find Google Community questions
          </h3>
          <p className={`max-w-md mx-auto ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            Search across Bing and Google to find relevant Google Community questions for your content marketing.
          </p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="py-16 text-center">
          <Loader2 size={48} className="mx-auto mb-4 animate-spin text-blue-500" />
          <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Searching Google Community across all sources...
          </h3>
          <p className={darkMode ? 'text-gray-500' : 'text-gray-500'}>
            Bing + Google Search APIs
          </p>
        </div>
      )}
    </div>
  )
}

export default GoogleCommunity
