import { useState } from 'react'
import { 
  Bookmark, 
  BookmarkCheck, 
  ExternalLink, 
  Copy, 
  Check,
  Search,
  Rocket,
  MessageCircle,
  HelpCircle,
  FileText
} from 'lucide-react'

// Content type icons
const TYPE_ICONS = {
  'posts': Rocket,
  'discussions': MessageCircle,
  'questions': HelpCircle,
  'stories': FileText,
  'products': Rocket
}

// Category colors
const CATEGORY_COLORS = {
  'SaaS': 'bg-blue-500/20 text-blue-500',
  'Cloud': 'bg-cyan-500/20 text-cyan-500',
  'Productivity': 'bg-green-500/20 text-green-500',
  'Developer Tools': 'bg-purple-500/20 text-purple-500',
  'AI & ML': 'bg-pink-500/20 text-pink-500',
  'Marketing': 'bg-orange-500/20 text-orange-500',
  'Design': 'bg-indigo-500/20 text-indigo-500',
  'Finance': 'bg-emerald-500/20 text-emerald-500',
  'Collaboration': 'bg-amber-500/20 text-amber-500',
  'Analytics': 'bg-teal-500/20 text-teal-500',
  'default': 'bg-gray-500/20 text-gray-500'
}

function ProductHuntCard({ post, onBookmark, isBookmarked, darkMode, index }) {
  const [copied, setCopied] = useState(false)
  const [bookmarking, setBookmarking] = useState(false)

  const copyLink = async () => {
    await navigator.clipboard.writeText(post.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleBookmark = async () => {
    setBookmarking(true)
    await onBookmark(post)
    setBookmarking(false)
  }

  const staggerClass = index < 8 ? `stagger-${index + 1}` : ''
  
  // Check sources
  const sources = post.sources || []
  const hasBing = sources.includes('bing')
  const hasGoogle = sources.includes('google')
  const hasMultiple = sources.length >= 2

  // Get type info
  const TypeIcon = TYPE_ICONS[post.type] || Rocket
  const categoryColor = CATEGORY_COLORS[post.category] || CATEGORY_COLORS['default']

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
            <TypeIcon size={12} />
            {post.typeName || 'Post'}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${categoryColor}`}>
            {post.category || 'Tech'}
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
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-reddit-lightGray' : 'hover:bg-gray-100'
            }`}
            title="Open in Product Hunt"
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
      <h3 className={`font-semibold mb-2 line-clamp-2 group-hover:text-orange-500 transition-colors ${
        darkMode ? 'text-white' : 'text-gray-900'
      }`}>
        <a 
          href={post.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {post.title}
        </a>
      </h3>

      {/* Snippet */}
      {post.snippet && (
        <p className={`text-sm mb-3 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          {post.snippet}
        </p>
      )}

      {/* Footer */}
      <div className={`flex items-center justify-between text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
        <span>
          {post.slug && `/${post.slug}`}
        </span>
        <div className="flex items-center gap-2">
          <span>
            {sources.length} source{sources.length !== 1 ? 's' : ''}
          </span>
          {post.discoveredAt && (
            <span>
              Found: {new Date(post.discoveredAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

export default ProductHuntCard
