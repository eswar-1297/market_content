import { useState } from 'react'
import { 
  Bookmark, 
  BookmarkCheck, 
  ExternalLink, 
  Copy, 
  Check,
  ArrowUp,
  MessageSquare,
  Eye,
  CheckCircle,
  Search,
  Code
} from 'lucide-react'

function StackOverflowCard({ question, onBookmark, isBookmarked, darkMode, index }) {
  const [copied, setCopied] = useState(false)
  const [bookmarking, setBookmarking] = useState(false)

  const copyLink = async () => {
    await navigator.clipboard.writeText(question.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleBookmark = async () => {
    setBookmarking(true)
    await onBookmark(question)
    setBookmarking(false)
  }

  const formatNumber = (num) => {
    if (!num) return '0'
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return null
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diffMs = now - date
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays < 1) return 'Today'
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
    return `${Math.floor(diffDays / 365)}y ago`
  }

  const staggerClass = index < 8 ? `stagger-${index + 1}` : ''
  
  // Check sources
  const sources = question.sources || []
  const hasStackExchange = sources.includes('stackexchange')
  const hasBing = sources.includes('bing')
  const hasGoogle = sources.includes('google')
  const hasMultiple = sources.length >= 2

  // Question status
  const hasAcceptedAnswer = !!question.acceptedAnswerId
  const isAnswered = question.isAnswered || question.answerCount > 0

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
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500/20 text-orange-500 flex items-center gap-1">
            <Code size={12} />
            Stack Overflow
          </span>
          {hasAcceptedAnswer && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-500 flex items-center gap-1">
              <CheckCircle size={10} />
              Accepted
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
            href={question.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-reddit-lightGray' : 'hover:bg-gray-100'
            }`}
            title="Open in Stack Overflow"
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
        {hasStackExchange && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-500">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
            SE API
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
          href={question.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {question.title}
        </a>
      </h3>

      {/* Tags */}
      {question.tags && question.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {question.tags.slice(0, 5).map((tag, i) => (
            <span 
              key={i}
              className={`px-2 py-0.5 rounded text-xs ${
                darkMode 
                  ? 'bg-blue-900/30 text-blue-400' 
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {tag}
            </span>
          ))}
          {question.tags.length > 5 && (
            <span className={`px-2 py-0.5 rounded text-xs ${
              darkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              +{question.tags.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Snippet */}
      {(question.snippet || question.body) && (
        <p className={`text-sm mb-3 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          {question.snippet || question.body?.substring(0, 200)}
        </p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 mb-2">
        <div className={`flex items-center gap-1.5 text-sm ${
          (question.score || 0) >= 10 ? 'text-orange-500 font-semibold' : darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          <ArrowUp size={14} />
          <span>{formatNumber(question.score)}</span>
        </div>
        <div className={`flex items-center gap-1.5 text-sm ${
          isAnswered ? 'text-green-500 font-semibold' : darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          <MessageSquare size={14} />
          <span>{formatNumber(question.answerCount)} answers</span>
        </div>
        {question.viewCount > 0 && (
          <div className={`flex items-center gap-1.5 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <Eye size={14} />
            <span>{formatNumber(question.viewCount)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`flex items-center justify-between text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
        <span>
          by {question.owner || 'Unknown'}
        </span>
        <div className="flex items-center gap-2">
          {question.lastActivityAt && (
            <span>
              Active: {formatDate(question.lastActivityAt)}
            </span>
          )}
          <span>
            {sources.length} source{sources.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </article>
  )
}

export default StackOverflowCard
