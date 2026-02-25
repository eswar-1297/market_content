import { useState } from 'react'
import { 
  Bookmark, 
  BookmarkCheck, 
  ExternalLink, 
  Copy, 
  Check,
  Search,
  MessageSquare,
  AlertCircle,
  GitPullRequest,
  Github
} from 'lucide-react'

// Content type icons and colors
const TYPE_INFO = {
  'discussion': { icon: MessageSquare, color: 'bg-purple-500/20 text-purple-500', label: 'Discussion' },
  'issue': { icon: AlertCircle, color: 'bg-green-500/20 text-green-500', label: 'Issue' },
  'pull_request': { icon: GitPullRequest, color: 'bg-blue-500/20 text-blue-500', label: 'Pull Request' }
}

function GitHubCard({ item, onBookmark, isBookmarked, darkMode, index }) {
  const [copied, setCopied] = useState(false)
  const [bookmarking, setBookmarking] = useState(false)

  const copyLink = async () => {
    await navigator.clipboard.writeText(item.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleBookmark = async () => {
    setBookmarking(true)
    await onBookmark(item)
    setBookmarking(false)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
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
  const sources = item.sources || []
  const hasGitHub = sources.includes('github')
  const hasBing = sources.includes('bing')
  const hasGoogle = sources.includes('google')
  const hasMultiple = sources.length >= 2

  // Get type info
  const typeInfo = TYPE_INFO[item.type] || TYPE_INFO['discussion']
  const TypeIcon = typeInfo.icon

  return (
    <article 
      className={`group rounded-xl border p-4 transition-all duration-300 hover:shadow-xl animate-fade-in opacity-0 ${staggerClass} ${
        darkMode
          ? 'bg-reddit-gray/70 border-reddit-lightGray hover:border-gray-500/50 hover:bg-reddit-gray'
          : 'bg-white border-gray-200 hover:border-gray-500/50 hover:shadow-gray-500/10'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${typeInfo.color}`}>
            <TypeIcon size={12} />
            {typeInfo.label}
          </span>
          {item.state && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              item.state === 'open' 
                ? 'bg-green-500/20 text-green-500' 
                : 'bg-red-500/20 text-red-500'
            }`}>
              {item.state}
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
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-reddit-lightGray' : 'hover:bg-gray-100'
            }`}
            title="Open in GitHub"
          >
            <ExternalLink size={16} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
          </a>
          <button
            onClick={handleBookmark}
            disabled={bookmarking}
            className={`p-2 rounded-lg transition-colors ${
              isBookmarked
                ? 'text-gray-500'
                : darkMode 
                  ? 'text-gray-400 hover:bg-reddit-lightGray hover:text-gray-300' 
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
            title={isBookmarked ? 'Bookmarked' : 'Add bookmark'}
          >
            {isBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
        </div>
      </div>

      {/* Repo name */}
      {item.repoFullName && (
        <div className={`flex items-center gap-1.5 text-xs mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <Github size={12} />
          <span className="font-mono">{item.repoFullName}</span>
          {item.number && <span className="text-gray-500">#{item.number}</span>}
        </div>
      )}

      {/* Source Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {hasGitHub && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
            <Github size={10} />
            GitHub API
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
      <h3 className={`font-semibold mb-2 line-clamp-2 group-hover:text-blue-500 transition-colors ${
        darkMode ? 'text-white' : 'text-gray-900'
      }`}>
        <a 
          href={item.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {item.title}
        </a>
      </h3>

      {/* Body/Snippet preview */}
      {(item.body || item.snippet) && (
        <p className={`text-sm mb-3 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          {(item.body || item.snippet).substring(0, 200)}
        </p>
      )}

      {/* Labels */}
      {item.labels && item.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {item.labels.slice(0, 4).map((label, idx) => (
            <span 
              key={idx}
              className={`px-2 py-0.5 rounded text-xs ${
                darkMode ? 'bg-reddit-lightGray text-gray-300' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {label}
            </span>
          ))}
          {item.labels.length > 4 && (
            <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              +{item.labels.length - 4} more
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 mb-2">
        {item.comments !== undefined && (
          <div className={`flex items-center gap-1.5 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <MessageSquare size={14} />
            <span>{item.comments} comments</span>
          </div>
        )}
        {item.reactions !== undefined && item.reactions > 0 && (
          <div className={`flex items-center gap-1.5 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <span>👍</span>
            <span>{item.reactions}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`flex items-center justify-between text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
        <span>
          by {item.author || 'Unknown'}
        </span>
        <div className="flex items-center gap-2">
          {item.updatedAt && (
            <span>Updated {formatDate(item.updatedAt)}</span>
          )}
          <span>
            {sources.length} source{sources.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </article>
  )
}

export default GitHubCard
