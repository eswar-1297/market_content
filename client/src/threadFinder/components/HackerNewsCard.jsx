import { useState } from 'react'
import { 
  Bookmark, 
  BookmarkCheck, 
  ExternalLink, 
  Copy, 
  Check,
  ArrowUp,
  MessageSquare,
  Search,
  Newspaper,
  HelpCircle,
  Zap
} from 'lucide-react'

function HackerNewsCard({ story, onBookmark, isBookmarked, darkMode, index }) {
  const [copied, setCopied] = useState(false)
  const [bookmarking, setBookmarking] = useState(false)

  const copyLink = async () => {
    await navigator.clipboard.writeText(story.hnUrl || story.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleBookmark = async () => {
    setBookmarking(true)
    await onBookmark(story)
    setBookmarking(false)
  }

  const formatNumber = (num) => {
    if (!num) return '0'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return null
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diffMs = now - date
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
    return `${Math.floor(diffDays / 365)}y ago`
  }

  const staggerClass = index < 8 ? `stagger-${index + 1}` : ''
  
  // Check sources
  const sources = story.sources || []
  const hasHN = sources.includes('hackernews')
  const hasBing = sources.includes('bing')
  const hasGoogle = sources.includes('google')
  const hasMultiple = sources.length >= 2

  // Story type badge
  const getTypeInfo = () => {
    switch (story.type) {
      case 'ask_hn':
        return { label: 'Ask HN', icon: HelpCircle, color: 'text-purple-500 bg-purple-500/20' }
      case 'show_hn':
        return { label: 'Show HN', icon: Zap, color: 'text-green-500 bg-green-500/20' }
      default:
        return { label: 'Story', icon: Newspaper, color: 'text-orange-500 bg-orange-500/20' }
    }
  }
  
  const typeInfo = getTypeInfo()
  const TypeIcon = typeInfo.icon

  return (
    <article 
      className={`group rounded-xl border p-4 transition-all duration-300 hover:shadow-xl animate-fade-in opacity-0 ${staggerClass} ${
        darkMode
          ? 'bg-reddit-gray/70 border-reddit-lightGray hover:border-orange-500/50 hover:bg-reddit-gray'
          : 'bg-white border-gray-200 hover:border-orange-500/50 hover:shadow-orange-500/10'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${typeInfo.color}`}>
            <TypeIcon size={12} />
            {typeInfo.label}
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
            href={story.hnUrl || story.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-reddit-lightGray' : 'hover:bg-gray-100'
            }`}
            title="Open in Hacker News"
          >
            <ExternalLink size={16} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
          </a>
          <button
            onClick={handleBookmark}
            disabled={bookmarking}
            className={`p-2 rounded-lg transition-colors ${
              isBookmarked
                ? 'text-orange-500'
                : darkMode 
                  ? 'text-gray-400 hover:bg-reddit-lightGray hover:text-orange-500' 
                  : 'text-gray-500 hover:bg-gray-100 hover:text-orange-500'
            }`}
            title={isBookmarked ? 'Bookmarked' : 'Add bookmark'}
          >
            {isBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
        </div>
      </div>

      {/* Source Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {hasHN && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-500">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
            HN API
          </span>
        )}
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
            Multi-Source
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className={`font-semibold mb-2 line-clamp-2 group-hover:text-orange-500 transition-colors ${
        darkMode ? 'text-white' : 'text-gray-900'
      }`}>
        <a 
          href={story.hnUrl || story.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {story.title}
        </a>
      </h3>

      {/* Story text preview if Ask HN */}
      {story.storyText && (
        <p className={`text-sm mb-3 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          {story.storyText.replace(/<[^>]+>/g, ' ').substring(0, 200)}
        </p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 mb-2">
        <div className={`flex items-center gap-1.5 text-sm ${
          (story.points || 0) >= 100 ? 'text-orange-500 font-semibold' : darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          <ArrowUp size={14} />
          <span>{formatNumber(story.points)} points</span>
        </div>
        <div className={`flex items-center gap-1.5 text-sm ${
          (story.numComments || 0) >= 50 ? 'text-blue-500 font-semibold' : darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          <MessageSquare size={14} />
          <span>{formatNumber(story.numComments)} comments</span>
        </div>
      </div>

      {/* Footer */}
      <div className={`flex items-center justify-between text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
        <span>
          by {story.author || 'Unknown'}
        </span>
        <div className="flex items-center gap-2">
          {story.createdAt && (
            <span>{formatDate(story.createdAt)}</span>
          )}
          <span>
            {sources.length} source{sources.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* External link if story has URL */}
      {story.url && story.url !== story.hnUrl && (
        <div className={`mt-2 pt-2 border-t ${darkMode ? 'border-reddit-lightGray' : 'border-gray-200'}`}>
          <a
            href={story.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-xs flex items-center gap-1 hover:underline ${
              darkMode ? 'text-blue-400' : 'text-blue-600'
            }`}
          >
            <ExternalLink size={10} />
            {new URL(story.url).hostname}
          </a>
        </div>
      )}
    </article>
  )
}

export default HackerNewsCard
