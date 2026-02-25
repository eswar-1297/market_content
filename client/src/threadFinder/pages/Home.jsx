import { useState, useCallback, useEffect, useMemo } from 'react'
import { AlertCircle, Brain, Loader2, MessageSquare } from 'lucide-react'
import SearchBar from '../components/SearchBar'
import ThreadCard from '../components/ThreadCard'
import FilterPanel from '../components/FilterPanel'
import { searchAIThreads, addBookmark, getBookmarks } from '../services/api'

// Helper function to filter threads by time
function filterByTime(threads, timeFilter) {
  if (!timeFilter || timeFilter === 'all') return threads
  
  const now = Date.now() / 1000 // Current time in seconds
  const DAY = 86400 // seconds in a day
  
  return threads.filter(thread => {
    const threadAge = now - thread.created_utc
    
    switch (timeFilter) {
      case '1month':
        return threadAge <= 30 * DAY
      case '3months':
        return threadAge <= 90 * DAY
      case '6months':
        return threadAge <= 180 * DAY
      case '1year':
        return threadAge <= 365 * DAY
      case 'older':
        return threadAge > 365 * DAY
      default:
        return true
    }
  })
}

function Home({ darkMode }) {
  const [results, setResults] = useState([])
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set())
  const [filters, setFilters] = useState({
    timeFilter: 'all',
    minScore: 0,
    minComments: 0
  })
  
  // Apply filters to results
  const filteredResults = useMemo(() => {
    let filtered = results
    
    // Apply time filter
    filtered = filterByTime(filtered, filters.timeFilter)
    
    // Apply score filter
    if (filters.minScore > 0) {
      filtered = filtered.filter(t => t.score >= filters.minScore)
    }
    
    // Apply comments filter
    if (filters.minComments > 0) {
      filtered = filtered.filter(t => t.num_comments >= filters.minComments)
    }
    
    return filtered
  }, [results, filters])

  // Load existing bookmarks
  useEffect(() => {
    const loadBookmarks = async () => {
      try {
        const bookmarks = await getBookmarks()
        setBookmarkedIds(new Set(bookmarks.map(b => b.reddit_id)))
      } catch (err) {
        // Silently fail
      }
    }
    loadBookmarks()
  }, [])

  const handleSearch = useCallback(async (query) => {
    setIsLoading(true)
    setError(null)
    setHasSearched(true)
    setStats(null)

    try {
      const data = await searchAIThreads({
        query,
        minScore: 0,
        minComments: 0,
        limit: 150,
        useGemini: true,
        useOpenAI: true,
        useGoogle: true
      })
      
      setResults(data.threads || [])
      setStats(data.stats)
    } catch (err) {
      setError(err.message)
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleBookmark = async (thread) => {
    try {
      await addBookmark(thread)
      setBookmarkedIds(prev => new Set([...prev, thread.id]))
    } catch (err) {
      console.error('Failed to bookmark:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="text-center py-8 animate-fade-in">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Brain className="text-purple-500" size={28} />
          <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            AI-Powered Thread Finder
          </h1>
        </div>
        <p className={`text-lg max-w-2xl mx-auto ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Find Reddit threads indexed by <span className="text-reddit-orange font-semibold">Reddit</span>,{' '}
          <span className="text-blue-500 font-semibold">Gemini</span>,{' '}
          <span className="text-green-500 font-semibold">ChatGPT</span>, and{' '}
          <span className="text-yellow-500 font-semibold">Google</span> for maximum AI visibility
        </p>
      </div>

      {/* Search Bar */}
      <div className="animate-fade-in stagger-1 opacity-0">
        <SearchBar 
          onSearch={handleSearch} 
          isLoading={isLoading} 
          darkMode={darkMode}
        />
      </div>

      {/* Filter Panel */}
      {hasSearched && results.length > 0 && (
        <div className="animate-fade-in">
          <FilterPanel 
            filters={filters} 
            setFilters={setFilters} 
            darkMode={darkMode} 
          />
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
            darkMode ? 'bg-reddit-orange/10' : 'bg-orange-50'
          }`}>
            <p className="text-2xl font-bold text-reddit-orange">{stats.reddit}</p>
            <p className={`text-xs ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>Reddit</p>
          </div>
          <div className={`rounded-xl p-4 text-center ${
            darkMode ? 'bg-blue-500/10' : 'bg-blue-50'
          }`}>
            <p className="text-2xl font-bold text-blue-500">{stats.gemini}</p>
            <p className={`text-xs ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>Gemini</p>
          </div>
          <div className={`rounded-xl p-4 text-center ${
            darkMode ? 'bg-green-500/10' : 'bg-green-50'
          }`}>
            <p className="text-2xl font-bold text-green-500">{stats.openai}</p>
            <p className={`text-xs ${darkMode ? 'text-green-400' : 'text-green-600'}`}>ChatGPT</p>
          </div>
          <div className={`rounded-xl p-4 text-center ${
            darkMode ? 'bg-yellow-500/10' : 'bg-yellow-50'
          }`}>
            <p className="text-2xl font-bold text-yellow-500">{stats.google || 0}</p>
            <p className={`text-xs ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>Google</p>
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
              <MessageSquare size={18} className="text-reddit-orange" />
              <h2 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {filteredResults.length} {filteredResults.length === 1 ? 'thread' : 'threads'} found
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
              {filteredResults.map((thread, index) => (
                <ThreadCard
                  key={thread.id}
                  thread={thread}
                  onBookmark={handleBookmark}
                  isBookmarked={bookmarkedIds.has(thread.id)}
                  darkMode={darkMode}
                  index={index}
                  showAiSources={true}
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
                  ? 'No threads match your filters. Try adjusting the filters.'
                  : 'No threads found. Try a different search term.'}
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
          <MessageSquare size={48} className={`mx-auto mb-4 ${darkMode ? 'text-reddit-orange/50' : 'text-orange-300'}`} />
          <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Ready to find AI-visible threads
          </h3>
          <p className={`max-w-md mx-auto ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            Search across Reddit, Gemini, ChatGPT, and Google to find threads with maximum AI visibility.
          </p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="py-16 text-center">
          <Loader2 size={48} className="mx-auto mb-4 animate-spin text-reddit-orange" />
          <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Searching Reddit across all sources...
          </h3>
          <p className={darkMode ? 'text-gray-500' : 'text-gray-500'}>
            Reddit + Gemini + ChatGPT + Google
          </p>
        </div>
      )}
    </div>
  )
}

export default Home
