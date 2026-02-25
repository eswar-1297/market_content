import { useState } from 'react'
import { 
  Bookmark, 
  BookmarkCheck, 
  ExternalLink, 
  Copy, 
  Check,
  Search,
  Wrench,
  Cloud,
  Shield,
  Network,
  Database,
  Mail
} from 'lucide-react'

// Category to icon mapping
const CATEGORY_ICONS = {
  'Cloud Computing': Cloud,
  'Security': Shield,
  'Networking': Network,
  'Storage': Database,
  'Email': Mail,
  'default': Wrench
}

// Category to color mapping
const CATEGORY_COLORS = {
  'Cloud Computing': 'bg-blue-500/20 text-blue-500',
  'Security': 'bg-red-500/20 text-red-500',
  'Networking': 'bg-green-500/20 text-green-500',
  'Storage': 'bg-purple-500/20 text-purple-500',
  'Backup & Recovery': 'bg-amber-500/20 text-amber-500',
  'Office 365': 'bg-orange-500/20 text-orange-500',
  'Google Workspace': 'bg-cyan-500/20 text-cyan-500',
  'Windows': 'bg-blue-600/20 text-blue-600',
  'Linux': 'bg-orange-600/20 text-orange-600',
  'Virtualization': 'bg-indigo-500/20 text-indigo-500',
  'Email': 'bg-pink-500/20 text-pink-500',
  'default': 'bg-gray-500/20 text-gray-500'
}

function SpiceworksCard({ topic, onBookmark, isBookmarked, darkMode, index }) {
  const [copied, setCopied] = useState(false)
  const [bookmarking, setBookmarking] = useState(false)

  const copyLink = async () => {
    await navigator.clipboard.writeText(topic.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleBookmark = async () => {
    setBookmarking(true)
    await onBookmark(topic)
    setBookmarking(false)
  }

  const staggerClass = index < 8 ? `stagger-${index + 1}` : ''
  
  // Check sources
  const sources = topic.sources || []
  const hasBing = sources.includes('bing')
  const hasGoogle = sources.includes('google')
  const hasMultiple = sources.length >= 2

  // Get category info
  const category = topic.category || 'General IT'
  const CategoryIcon = CATEGORY_ICONS[category] || CATEGORY_ICONS['default']
  const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS['default']

  return (
    <article 
      className={`group rounded-xl border p-4 transition-all duration-300 hover:shadow-xl animate-fade-in opacity-0 ${staggerClass} ${
        darkMode
          ? 'bg-reddit-gray/70 border-reddit-lightGray hover:border-green-500/50 hover:bg-reddit-gray'
          : 'bg-white border-gray-200 hover:border-green-500/50 hover:shadow-green-500/10'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-600/20 text-green-500 flex items-center gap-1">
            <Wrench size={12} />
            Spiceworks
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${categoryColor}`}>
            <CategoryIcon size={10} />
            {category}
          </span>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={copyLink}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-reddit-lightGray' : 'hover:bg-gray-100'
            }`}
            title="Copy link"
          >
            {copied ? (
              <Check size={16} className="text-green-500" />
            ) : (
              <Copy size={16} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
            )}
          </button>
          <a
            href={topic.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-reddit-lightGray' : 'hover:bg-gray-100'
            }`}
            title="Open in Spiceworks"
          >
            <ExternalLink size={16} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
          </a>
          <button
            onClick={handleBookmark}
            disabled={bookmarking}
            className={`p-2 rounded-lg transition-colors ${
              isBookmarked
                ? 'text-green-500'
                : darkMode 
                  ? 'text-gray-400 hover:bg-reddit-lightGray hover:text-green-500' 
                  : 'text-gray-500 hover:bg-gray-100 hover:text-green-500'
            }`}
            title={isBookmarked ? 'Bookmarked' : 'Add bookmark'}
          >
            {isBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
        </div>
      </div>

      {/* Source Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {hasBing && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-500">
            <Search size={10} />
            Bing
          </span>
        )}
        {hasGoogle && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-500">
            <Search size={10} />
            Google
          </span>
        )}
        {hasMultiple && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-500">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
            Both Sources
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className={`font-semibold mb-2 line-clamp-2 group-hover:text-green-500 transition-colors ${
        darkMode ? 'text-white' : 'text-gray-900'
      }`}>
        <a 
          href={topic.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {topic.title}
        </a>
      </h3>

      {/* Snippet */}
      {topic.snippet && (
        <p className={`text-sm mb-3 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          {topic.snippet}
        </p>
      )}

      {/* Footer */}
      <div className={`flex items-center justify-between text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
        <span className="capitalize">
          {topic.type || 'Discussion'}
        </span>
        <div className="flex items-center gap-2">
          <span>
            {sources.length} source{sources.length !== 1 ? 's' : ''}
          </span>
          {topic.discoveredAt && (
            <span>
              Found: {new Date(topic.discoveredAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

export default SpiceworksCard
