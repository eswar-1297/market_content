import { useState, useCallback, useMemo } from 'react'
import { AlertCircle, Newspaper, Loader2, MessageSquare, Search, Filter, Calendar, Tag, ArrowUp } from 'lucide-react'
import SearchBar from '../components/SearchBar'
import HackerNewsCard from '../components/HackerNewsCard'
import { searchHackerNewsStories } from '../services/api'

// Time filter options
const TIME_FILTER_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: '1month', label: 'Last Month' },
  { value: '3months', label: 'Last 3 Months' },
  { value: '6months', label: 'Last 6 Months' },
  { value: '1year', label: 'Last Year' }
]

// Story type options
const STORY_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'story', label: 'Stories' },
  { value: 'ask_hn', label: 'Ask HN' },
  { value: 'show_hn', label: 'Show HN' }
]

// Source filter options (client-side)
const SOURCE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'hackernews', label: 'HN API Only' },
  { value: 'bing', label: 'Bing Only' },
  { value: 'google', label: 'Google Only' },
  { value: 'multi', label: 'Multi-Source' }
]

// Quick search suggestions
const QUICK_SEARCHES = [
  'SaaS management',
  'cloud migration',
  'enterprise software',
  'B2B tools',
  'startup tools',
  'productivity apps'
]

function HackerNews({ darkMode }) {
  const [results, setResults] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState('all')
  const [storyType, setStoryType] = useState('all')
  const [lastQuery, setLastQuery] = useState('')

  // Apply source filter to results
  const filteredResults = useMemo(() => {
    if (sourceFilter === 'all') return results
    
    return results.filter(s => {
      const sources = s.sources || []
      switch (sourceFilter) {
        case 'hackernews':
          return sources.includes('hackernews') && sources.length === 1
        case 'bing':
          return sources.includes('bing') && !sources.includes('google') && !sources.includes('hackernews')
        case 'google':
          return sources.includes('google') && !sources.includes('bing') && !sources.includes('hackernews')
        case 'multi':
          return sources.length >= 2
        default:
          return true
      }
    })
  }, [results, sourceFilter])

  const handleSearch = useCallback(async (query, time = timeFilter, type = storyType) => {
    setIsLoading(true)
    setError(null)
    setHasSearched(true)
    setStats(null)
    setLastQuery(query)

    try {
      const data = await searchHackerNewsStories({
        query,
        limit: 150,
        useHackerNews: true,
        useBing: true,
        useGoogle: true,
        timeFilter: time,
        storyType: type,
        minPoints: 0
      })
      
      setResults(data.stories || [])
      setStats(data.stats)
    } catch (err) {
      setError(err.message)
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [timeFilter, storyType])

  // Re-search when filters change
  const handleTimeFilterChange = useCallback((newTimeFilter) => {
    setTimeFilter(newTimeFilter)
    if (lastQuery) {
      handleSearch(lastQuery, newTimeFilter, storyType)
    }
  }, [lastQuery, handleSearch, storyType])

  const handleStoryTypeChange = useCallback((newStoryType) => {
    setStoryType(newStoryType)
    if (lastQuery) {
      handleSearch(lastQuery, timeFilter, newStoryType)
    }
  }, [lastQuery, handleSearch, timeFilter])

  const inputClasses = `w-full px-4 py-2.5 rounded-lg border transition-all focus:outline-none focus:ring-2 ${
    darkMode
      ? 'bg-reddit-gray border-reddit-lightGray text-white focus:border-orange-500 focus:ring-orange-500/20'
      : 'bg-white border-gray-200 text-gray-900 focus:border-orange-500 focus:ring-orange-500/20'
  }`

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="text-center py-8 animate-fade-in">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Newspaper className="text-orange-500" size={28} />
          <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Hacker News
          </h1>
        </div>
        <p className={`text-lg max-w-2xl mx-auto ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Find tech discussions using{' '}
          <span className="text-orange-500 font-semibold">HN Algolia API</span>,{' '}
          <span className="text-blue-500 font-semibold">Bing</span>, and{' '}
          <span className="text-green-500 font-semibold">Google</span>
        </p>
      </div>

      {/* Search Bar */}
      <div className="animate-fade-in stagger-1 opacity-0">
        <SearchBar 
          onSearch={handleSearch} 
          isLoading={isLoading} 
          darkMode={darkMode}
          placeholder="Search Hacker News (e.g., SaaS tools, cloud management, productivity)..."
        />
      </div>

      {/* Quick Search Suggestions */}
      {!hasSearched && (
        <div className="flex flex-wrap justify-center gap-2 animate-fade-in stagger-2 opacity-0">
          {QUICK_SEARCHES.map((term) => (
            <button
              key={term}
              onClick={() => handleSearch(term)}
              disabled={isLoading}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                darkMode
                  ? 'bg-reddit-gray/50 text-gray-300 hover:bg-orange-500/20 hover:text-orange-400'
                  : 'bg-gray-100 text-gray-600 hover:bg-orange-100 hover:text-orange-600'
              }`}
            >
              {term}
            </button>
          ))}
        </div>
      )}

      {/* Filter Panel */}
      {hasSearched && results.length > 0 && (
        <div className={`rounded-xl p-4 border transition-colors animate-fade-in ${
          darkMode 
            ? 'bg-reddit-gray/50 border-reddit-lightGray' 
            : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center gap-2 mb-4">
            <Filter size={18} className="text-orange-500" />
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

            {/* Story Type Filter */}
            <div>
              <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                darkMode ? 'text-gray-300' : 'text-gray-600'
              }`}>
                <Tag size={14} />
                Story Type
              </label>
              <select
                value={storyType}
                onChange={(e) => handleStoryTypeChange(e.target.value)}
                className={inputClasses}
                disabled={isLoading}
              >
                {STORY_TYPE_OPTIONS.map(option => (
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 animate-fade-in">
          <div className={`rounded-xl p-4 text-center ${
            darkMode ? 'bg-reddit-gray/50' : 'bg-white border border-gray-200'
          }`}>
            <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {stats.total}
            </p>
            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total</p>
          </div>
          <div className={`rounded-xl p-4 text-center ${
            darkMode ? 'bg-orange-500/10' : 'bg-orange-50'
          }`}>
            <p className="text-2xl font-bold text-orange-500">{stats.hackernews}</p>
            <p className={`text-xs ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>HN API</p>
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
            <p className={`text-xs ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>Multi</p>
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
              <MessageSquare size={18} className="text-orange-500" />
              <h2 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {filteredResults.length} {filteredResults.length === 1 ? 'story' : 'stories'} found
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
              {filteredResults.map((story, index) => (
                <HackerNewsCard
                  key={story.id}
                  story={story}
                  onBookmark={() => {}}
                  isBookmarked={false}
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
                  ? 'No stories match your filters. Try adjusting the filters.'
                  : 'No stories found. Try a different search term.'}
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
          <Newspaper size={48} className={`mx-auto mb-4 ${darkMode ? 'text-orange-500/50' : 'text-orange-300'}`} />
          <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Ready to find Hacker News discussions
          </h3>
          <p className={`max-w-md mx-auto ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            Search tech stories, Ask HN questions, and Show HN submissions across the developer community.
          </p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="py-16 text-center">
          <Loader2 size={48} className="mx-auto mb-4 animate-spin text-orange-500" />
          <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Searching Hacker News...
          </h3>
          <p className={darkMode ? 'text-gray-500' : 'text-gray-500'}>
            HN Algolia + Bing + Google APIs
          </p>
        </div>
      )}
    </div>
  )
}

export default HackerNews
