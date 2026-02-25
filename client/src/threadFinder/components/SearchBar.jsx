import { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'

function SearchBar({ onSearch, isLoading, darkMode }) {
  const [query, setQuery] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (query.trim() && !isLoading) {
      onSearch(query.trim())
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          {isLoading ? (
            <Loader2 className="h-5 w-5 text-reddit-orange animate-spin" />
          ) : (
            <Search className={`h-5 w-5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter your search keyword..."
          className={`w-full pl-12 pr-32 py-4 rounded-2xl border-2 text-lg font-medium transition-all duration-300 focus:outline-none focus:ring-4 ${
            darkMode
              ? 'bg-reddit-gray border-reddit-lightGray text-white placeholder-gray-500 focus:border-reddit-orange focus:ring-reddit-orange/20'
              : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-reddit-orange focus:ring-reddit-orange/20'
          }`}
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className={`absolute inset-y-2 right-2 px-6 rounded-xl font-semibold transition-all ${
            isLoading || !query.trim()
              ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
              : 'bg-reddit-orange hover:bg-reddit-orangeLight text-white hover:shadow-lg hover:shadow-reddit-orange/30'
          }`}
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </div>
    </form>
  )
}

export default SearchBar
