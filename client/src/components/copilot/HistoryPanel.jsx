import { useState, useEffect } from 'react'
import { History, X, Trash2, MessageSquare, FileText, Clock, ChevronRight, ChevronLeft, Loader2, Layers, ArrowUpRight } from 'lucide-react'
import { authFetch } from '../../services/authFetch'

export default function HistoryPanel({ onClose, onLoadSession, onLoadSnapshot, currentSessionId, userId = 'default' }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  // Detail view
  const [selectedSession, setSelectedSession] = useState(null)
  const [snapshots, setSnapshots] = useState([])
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)

  useEffect(() => {
    fetchSessions()
  }, [])

  const fetchSessions = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/copilot/sessions?writerId=${encodeURIComponent(userId)}`)
      if (res.ok) setSessions(await res.json())
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Delete this session and all its chat history & versions?')) return
    setDeletingId(id)
    try {
      await authFetch(`/api/copilot/sessions/${id}`, { method: 'DELETE' })
      setSessions(prev => prev.filter(s => s.id !== id))
      if (selectedSession?.id === id) setSelectedSession(null)
    } catch (err) {
      console.error('Failed to delete session:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleSessionClick = async (session) => {
    setSelectedSession(session)
    setSnapshotsLoading(true)
    try {
      const res = await authFetch(`/api/copilot/sessions/${session.id}/snapshots`)
      if (res.ok) setSnapshots(await res.json())
      else setSnapshots([])
    } catch {
      setSnapshots([])
    } finally {
      setSnapshotsLoading(false)
    }
  }

  const handleLoadLatest = () => {
    onLoadSession(selectedSession)
    onClose()
  }

  const handleLoadVersion = async (snapshot) => {
    // Load the full snapshot content
    try {
      const res = await authFetch(`/api/copilot/snapshots/${snapshot.id}`)
      if (res.ok) {
        const data = await res.json()
        onLoadSnapshot(selectedSession, data.content)
        onClose()
      }
    } catch (err) {
      console.error('Failed to load snapshot:', err)
    }
  }

  const handleDeleteSnapshot = async (e, snapshotId) => {
    e.stopPropagation()
    try {
      await authFetch(`/api/copilot/snapshots/${snapshotId}`, { method: 'DELETE' })
      setSnapshots(prev => prev.filter(s => s.id !== snapshotId))
    } catch (err) {
      console.error('Failed to delete snapshot:', err)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'Z')
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'Z')
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      case 'paused': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
    }
  }

  const getSourceColor = (source) => {
    switch (source) {
      case 'agent': return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
      case 'manual': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            {selectedSession ? (
              <button
                onClick={() => setSelectedSession(null)}
                className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="w-4.5 h-4.5 text-gray-600 dark:text-gray-400" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                <History className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
              </div>
            )}
            <div>
              {selectedSession ? (
                <>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white truncate max-w-[300px]">{selectedSession.topic}</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{snapshots.length} version{snapshots.length !== 1 ? 's' : ''} saved</p>
                </>
              ) : (
                <>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">Session History</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {selectedSession ? (
            // --- Session Detail: versions ---
            <>
              {/* Load latest (chat + current content) */}
              <button
                onClick={handleLoadLatest}
                className="w-full text-left p-3.5 rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Resume session</span>
                    </div>
                    <p className="text-xs text-indigo-500 dark:text-indigo-400 ml-5.5">Load full chat + latest editor content</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors" />
                </div>
              </button>

              {snapshotsLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading versions...
                </div>
              ) : snapshots.length === 0 ? (
                <div className="text-center py-8">
                  <Layers className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No content versions yet</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Versions are auto-saved when the agent generates or edits articles</p>
                </div>
              ) : (
                <>
                  <div className="px-1 pt-2 pb-1">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Content Versions</p>
                  </div>
                  {snapshots.map((snap, idx) => (
                    <button
                      key={snap.id}
                      onClick={() => handleLoadVersion(snap)}
                      className="w-full text-left p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-gray-400 flex-shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {snap.label || `Version ${idx + 1}`}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getSourceColor(snap.source)}`}>
                              {snap.source === 'agent' ? 'AI' : snap.source}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 ml-7">
                            <span>{snap.word_count.toLocaleString()} words</span>
                            <span>{formatTime(snap.created_at)}</span>
                            <span>{formatDate(snap.created_at)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={(e) => handleDeleteSnapshot(e, snap.id)}
                            className="p-1 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete version"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 transition-colors" />
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </>
          ) : (
            // --- Session List ---
            <>
              {loading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading sessions...
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No sessions yet</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start a new conversation to create your first session</p>
                </div>
              ) : (
                sessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => handleSessionClick(session)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all group hover:shadow-md ${
                      session.id === currentSessionId
                        ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-200 dark:ring-indigo-800'
                        : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{session.topic}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                          <Clock className="w-3 h-3" />
                          <span>{formatDate(session.updated_at)}</span>
                          {session.content_type && (
                            <>
                              <span className="text-gray-300 dark:text-gray-600">|</span>
                              <span>{session.content_type}</span>
                            </>
                          )}
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(session.status)}`}>
                            {session.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => handleDelete(e, session.id)}
                          disabled={deletingId === session.id}
                          className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete session"
                        >
                          {deletingId === session.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 transition-colors" />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
