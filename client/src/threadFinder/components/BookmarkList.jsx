import { useState } from 'react'
import { 
  ExternalLink, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Clock, 
  CheckCircle2,
  Circle,
  MessageSquare
} from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', icon: Circle, color: 'text-yellow-500' },
  { value: 'in_progress', label: 'In Progress', icon: Clock, color: 'text-blue-500' },
  { value: 'published', label: 'Published', icon: CheckCircle2, color: 'text-green-500' }
]

function BookmarkList({ bookmarks, onUpdate, onDelete, darkMode }) {
  const [editingId, setEditingId] = useState(null)
  const [editNotes, setEditNotes] = useState('')

  const startEdit = (bookmark) => {
    setEditingId(bookmark.id)
    setEditNotes(bookmark.notes || '')
  }

  const saveEdit = async (id) => {
    await onUpdate(id, { notes: editNotes })
    setEditingId(null)
    setEditNotes('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditNotes('')
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (bookmarks.length === 0) {
    return (
      <div className={`text-center py-16 rounded-xl border ${
        darkMode 
          ? 'bg-reddit-gray/30 border-reddit-lightGray' 
          : 'bg-gray-50 border-gray-200'
      }`}>
        <MessageSquare size={48} className={`mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
        <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          No bookmarks yet
        </h3>
        <p className={darkMode ? 'text-gray-500' : 'text-gray-500'}>
          Search for threads and bookmark the ones you want to track
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {bookmarks.map((bookmark, index) => {
        const StatusIcon = STATUS_OPTIONS.find(s => s.value === bookmark.status)?.icon || Circle
        const statusColor = STATUS_OPTIONS.find(s => s.value === bookmark.status)?.color || 'text-gray-500'

        return (
          <article
            key={bookmark.id}
            className={`rounded-xl border p-4 transition-all animate-fade-in opacity-0 ${
              index < 8 ? `stagger-${index + 1}` : ''
            } ${
              darkMode
                ? 'bg-reddit-gray/70 border-reddit-lightGray hover:border-reddit-orange/30'
                : 'bg-white border-gray-200 hover:border-reddit-orange/30'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-reddit-orange/20 text-reddit-orange">
                    r/{bookmark.subreddit}
                  </span>
                  <select
                    value={bookmark.status}
                    onChange={(e) => onUpdate(bookmark.id, { status: e.target.value })}
                    className={`px-2 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      darkMode
                        ? 'bg-reddit-gray border-reddit-lightGray'
                        : 'bg-gray-50 border-gray-200'
                    } ${statusColor}`}
                  >
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Saved {formatDate(bookmark.created_at)}
                  </span>
                </div>

                {/* Title */}
                <h3 className={`font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  <a 
                    href={bookmark.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-reddit-orange transition-colors hover:underline"
                  >
                    {bookmark.title}
                  </a>
                </h3>

                {/* Notes */}
                {editingId === bookmark.id ? (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Add notes for your team..."
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 ${
                        darkMode
                          ? 'bg-reddit-dark border-reddit-lightGray text-white focus:ring-reddit-orange/30'
                          : 'bg-gray-50 border-gray-200 text-gray-900 focus:ring-reddit-orange/30'
                      }`}
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(bookmark.id)}
                      className="p-2 rounded-lg bg-green-500/20 text-green-500 hover:bg-green-500/30"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="p-2 rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500/30"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : bookmark.notes ? (
                  <p className={`text-sm italic ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    "{bookmark.notes}"
                  </p>
                ) : null}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEdit(bookmark)}
                  className={`p-2 rounded-lg transition-colors ${
                    darkMode 
                      ? 'text-gray-400 hover:bg-reddit-lightGray hover:text-white' 
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                  title="Edit notes"
                >
                  <Edit3 size={16} />
                </button>
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-2 rounded-lg transition-colors ${
                    darkMode 
                      ? 'text-gray-400 hover:bg-reddit-lightGray hover:text-white' 
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                  title="Open in Reddit"
                >
                  <ExternalLink size={16} />
                </a>
                <button
                  onClick={() => onDelete(bookmark.id)}
                  className={`p-2 rounded-lg transition-colors ${
                    darkMode 
                      ? 'text-gray-400 hover:bg-red-500/20 hover:text-red-500' 
                      : 'text-gray-500 hover:bg-red-50 hover:text-red-500'
                  }`}
                  title="Delete bookmark"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export default BookmarkList


