import { useState } from 'react'
import { 
  ArrowUpCircle, 
  MessageCircle, 
  Bookmark, 
  BookmarkCheck, 
  ExternalLink, 
  Copy, 
  Check,
  Clock
} from 'lucide-react'

function ThreadCard({ thread, onBookmark, isBookmarked, darkMode, index, showAiSources = false }) {
  const [copied, setCopied] = useState(false)
  const [bookmarking, setBookmarking] = useState(false)

  const formatDate = (timestamp) => {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diffMs = now - date
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 30) return `${diffDays}d ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
    return `${Math.floor(diffDays / 365)}y ago`
  }

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num?.toString() || '0'
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(thread.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleBookmark = async () => {
    setBookmarking(true)
    await onBookmark(thread)
    setBookmarking(false)
  }

  const staggerClass = index < 8 ? `stagger-${index + 1}` : ''

  return (
    <article 
      className={`group rounded-xl border p-4 transition-all duration-300 hover:shadow-xl animate-fade-in opacity-0 ${staggerClass} ${
        darkMode
          ? 'bg-reddit-gray/70 border-reddit-lightGray hover:border-reddit-orange/50 hover:bg-reddit-gray'
          : 'bg-white border-gray-200 hover:border-reddit-orange/50 hover:shadow-reddit-orange/10'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-reddit-orange/20 text-reddit-orange">
            r/{thread.subreddit}
          </span>
          {thread.created_utc && (
            <span className={`flex items-center gap-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Clock size={12} />
              {formatDate(thread.created_utc)}
            </span>
          )}
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
            href={thread.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-reddit-lightGray' : 'hover:bg-gray-100'
            }`}
            title="Open in Reddit"
          >
            <ExternalLink size={16} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
          </a>
          <button
            onClick={handleBookmark}
            disabled={bookmarking}
            className={`p-2 rounded-lg transition-colors ${
              isBookmarked
                ? 'text-reddit-orange'
                : darkMode 
                  ? 'text-gray-400 hover:bg-reddit-lightGray hover:text-reddit-orange' 
                  : 'text-gray-500 hover:bg-gray-100 hover:text-reddit-orange'
            }`}
            title={isBookmarked ? 'Bookmarked' : 'Add bookmark'}
          >
            {isBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
        </div>
      </div>

      {/* Source Badges */}
      {showAiSources && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {thread.found_in_reddit && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-reddit-orange/20 text-reddit-orange">
              <span className="w-1.5 h-1.5 rounded-full bg-reddit-orange"></span>
              Reddit
            </span>
          )}
          {thread.found_in_gemini && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-500">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              Gemini
            </span>
          )}
          {thread.found_in_openai && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              ChatGPT
            </span>
          )}
          {thread.found_in_google && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-500">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
              Google
            </span>
          )}
        </div>
      )}

      {/* Title */}
      <h3 className={`font-semibold mb-3 line-clamp-2 group-hover:text-reddit-orange transition-colors ${
        darkMode ? 'text-white' : 'text-gray-900'
      }`}>
        <a 
          href={thread.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {thread.title}
        </a>
      </h3>

      {/* Self text preview */}
      {thread.selftext && (
        <p className={`text-sm mb-3 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          {thread.selftext}
        </p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-1.5 text-sm ${
          thread.score >= 100 ? 'text-reddit-orange font-semibold' : darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          <ArrowUpCircle size={16} />
          <span>{formatNumber(thread.score)}</span>
        </div>
        <div className={`flex items-center gap-1.5 text-sm ${
          thread.num_comments >= 50 ? 'text-reddit-blue font-semibold' : darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          <MessageCircle size={16} />
          <span>{formatNumber(thread.num_comments)}</span>
        </div>
      </div>
      
      {thread.author && (
        <div className={`mt-2 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          by u/{thread.author}
        </div>
      )}
    </article>
  )
}

export default ThreadCard
