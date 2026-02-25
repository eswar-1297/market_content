import { useState, useEffect } from 'react'
import { 
  Bookmark, 
  Download, 
  Filter, 
  Loader2,
  CheckCircle2,
  Clock,
  Circle,
  RefreshCw
} from 'lucide-react'
import BookmarkList from '../components/BookmarkList'
import { getBookmarks, updateBookmark, deleteBookmark, exportBookmarks } from '../services/api'

const STATUS_FILTERS = [
  { value: 'all', label: 'All', icon: Bookmark },
  { value: 'pending', label: 'Pending', icon: Circle },
  { value: 'in_progress', label: 'In Progress', icon: Clock },
  { value: 'published', label: 'Published', icon: CheckCircle2 }
]

function Bookmarks({ darkMode }) {
  const [bookmarks, setBookmarks] = useState([])
  const [filteredBookmarks, setFilteredBookmarks] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [isExporting, setIsExporting] = useState(false)

  const loadBookmarks = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getBookmarks()
      setBookmarks(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadBookmarks()
  }, [])

  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredBookmarks(bookmarks)
    } else {
      setFilteredBookmarks(bookmarks.filter(b => b.status === statusFilter))
    }
  }, [bookmarks, statusFilter])

  const handleUpdate = async (id, updates) => {
    try {
      await updateBookmark(id, updates)
      setBookmarks(prev => 
        prev.map(b => b.id === id ? { ...b, ...updates } : b)
      )
    } catch (err) {
      console.error('Failed to update bookmark:', err)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this bookmark?')) return
    
    try {
      await deleteBookmark(id)
      setBookmarks(prev => prev.filter(b => b.id !== id))
    } catch (err) {
      console.error('Failed to delete bookmark:', err)
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const blob = await exportBookmarks('csv')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reddit-bookmarks-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export:', err)
    } finally {
      setIsExporting(false)
    }
  }

  const stats = {
    total: bookmarks.length,
    pending: bookmarks.filter(b => b.status === 'pending').length,
    inProgress: bookmarks.filter(b => b.status === 'in_progress').length,
    published: bookmarks.filter(b => b.status === 'published').length
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bookmark className="text-reddit-orange" size={24} />
            <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Bookmarks
            </h1>
          </div>
          <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
            Manage saved threads for your content team
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadBookmarks}
            disabled={isLoading}
            className={`p-2 rounded-lg transition-colors ${
              darkMode 
                ? 'text-gray-400 hover:bg-reddit-gray hover:text-white' 
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
            title="Refresh"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || bookmarks.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              isExporting || bookmarks.length === 0
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : 'bg-reddit-orange hover:bg-reddit-orangeLight text-white'
            }`}
          >
            {isExporting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-fade-in stagger-1 opacity-0">
        <div className={`rounded-xl p-4 border ${
          darkMode ? 'bg-reddit-gray/50 border-reddit-lightGray' : 'bg-white border-gray-200'
        }`}>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total</p>
          <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {stats.total}
          </p>
        </div>
        <div className={`rounded-xl p-4 border ${
          darkMode ? 'bg-reddit-gray/50 border-reddit-lightGray' : 'bg-white border-gray-200'
        }`}>
          <p className={`text-sm text-yellow-500`}>Pending</p>
          <p className={`text-2xl font-bold text-yellow-500`}>{stats.pending}</p>
        </div>
        <div className={`rounded-xl p-4 border ${
          darkMode ? 'bg-reddit-gray/50 border-reddit-lightGray' : 'bg-white border-gray-200'
        }`}>
          <p className={`text-sm text-blue-500`}>In Progress</p>
          <p className={`text-2xl font-bold text-blue-500`}>{stats.inProgress}</p>
        </div>
        <div className={`rounded-xl p-4 border ${
          darkMode ? 'bg-reddit-gray/50 border-reddit-lightGray' : 'bg-white border-gray-200'
        }`}>
          <p className={`text-sm text-green-500`}>Published</p>
          <p className={`text-2xl font-bold text-green-500`}>{stats.published}</p>
        </div>
      </div>

      {/* Status Filter */}
      <div className={`flex items-center gap-2 p-2 rounded-xl border animate-fade-in stagger-2 opacity-0 ${
        darkMode ? 'bg-reddit-gray/50 border-reddit-lightGray' : 'bg-gray-50 border-gray-200'
      }`}>
        <Filter size={16} className={darkMode ? 'text-gray-400 ml-2' : 'text-gray-500 ml-2'} />
        {STATUS_FILTERS.map(filter => {
          const Icon = filter.icon
          return (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                statusFilter === filter.value
                  ? 'bg-reddit-orange text-white'
                  : darkMode
                    ? 'text-gray-400 hover:bg-reddit-gray hover:text-white'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{filter.label}</span>
            </button>
          )
        })}
      </div>

      {/* Error State */}
      {error && (
        <div className={`p-4 rounded-xl border ${
          darkMode 
            ? 'bg-red-500/10 border-red-500/30 text-red-400' 
            : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-reddit-orange" />
        </div>
      )}

      {/* Bookmarks List */}
      {!isLoading && !error && (
        <div className="animate-fade-in stagger-3 opacity-0">
          <BookmarkList
            bookmarks={filteredBookmarks}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            darkMode={darkMode}
          />
        </div>
      )}
    </div>
  )
}

export default Bookmarks


