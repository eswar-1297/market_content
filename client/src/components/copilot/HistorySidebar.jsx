import { useState, useEffect } from 'react'
import { Plus, Trash2, FileText, Clock, Loader2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { authFetch } from '../../services/authFetch'

export default function HistorySidebar({ onLoadSession, onNewSession, currentSessionId, collapsed, onToggle, userId = 'default' }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => { fetchSessions() }, [userId])

  // Refresh when session changes (new session created)
  useEffect(() => {
    if (currentSessionId) fetchSessions()
  }, [currentSessionId])

  const fetchSessions = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/copilot/sessions?writerId=${encodeURIComponent(userId)}`)
      if (res.ok) {
        setSessions(await res.json())
      } else if (res.status === 401) {
        // Token might not be ready yet after refresh — retry once after a short delay
        setTimeout(() => {
          authFetch(`/api/copilot/sessions?writerId=${encodeURIComponent(userId)}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (Array.isArray(data)) setSessions(data) })
            .catch(() => {})
        }, 1500)
      }
    } catch {} finally { setLoading(false) }
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Delete this session?')) return
    setDeletingId(id)
    try {
      await authFetch(`/api/copilot/sessions/${id}`, { method: 'DELETE' })
      setSessions(prev => prev.filter(s => s.id !== id))
    } catch {} finally { setDeletingId(null) }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'Z')
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return 'Now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (collapsed) {
    return (
      <div className="w-12 flex-shrink-0 flex flex-col items-center py-3 gap-2 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <button onClick={onToggle} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors" title="Show history">
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <button onClick={onNewSession} className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors" title="New chat">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="w-64 flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/80">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200 dark:border-gray-800">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">History</span>
        <div className="flex items-center gap-1">
          <button onClick={onNewSession} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors" title="New chat">
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={onToggle} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors" title="Collapse">
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No sessions yet</p>
        ) : (
          sessions.map(session => (
            <div
              key={session.id}
              onClick={() => onLoadSession(session)}
              role="button"
              tabIndex={0}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all group cursor-pointer ${
                session.id === currentSessionId
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate leading-tight">{session.topic}</p>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{formatDate(session.updated_at)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  disabled={deletingId === session.id}
                  className="p-1 rounded text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                >
                  {deletingId === session.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
