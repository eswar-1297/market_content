import { useState, useEffect } from 'react'
import { Upload, Trash2, FileText, Search, Loader2, Plus, X, BookOpen, ExternalLink } from 'lucide-react'
import { authFetch } from '../../services/authFetch'

export default function ArticleManager({ onClose }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')

  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newTopic, setNewTopic] = useState('')
  const [newKeyword, setNewKeyword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => { loadArticles() }, [])

  const loadArticles = async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/copilot/articles?writerId=default')
      const data = await res.json()
      setArticles(data)
    } catch (err) {
      console.error('Failed to load articles:', err)
    } finally {
      setLoading(false)
    }
  }

  const saveArticle = async () => {
    if (!newTitle.trim() || !newContent.trim()) {
      setSaveError('Title and content are required')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const res = await authFetch('/api/copilot/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          content: newContent.trim(),
          url: newUrl.trim(),
          topic: newTopic.trim(),
          primaryKeyword: newKeyword.trim()
        })
      })
      if (!res.ok) throw new Error('Failed to save')
      setNewTitle(''); setNewContent(''); setNewUrl(''); setNewTopic(''); setNewKeyword('')
      setShowAdd(false)
      loadArticles()
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteArticle = async (id) => {
    if (!confirm('Delete this article from memory?')) return
    try {
      await authFetch(`/api/copilot/articles/${id}`, { method: 'DELETE' })
      loadArticles()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const filtered = search
    ? articles.filter(a => a.title.toLowerCase().includes(search.toLowerCase()) || (a.topic || '').toLowerCase().includes(search.toLowerCase()))
    : articles

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Article Memory</h2>
            <span className="text-sm text-gray-500">({articles.length} articles)</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Actions bar */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search articles..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Article
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 space-y-3">
            <input
              type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
              placeholder="Article title *"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
            />
            <div className="grid grid-cols-3 gap-3">
              <input type="text" value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="URL (optional)" className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              <input type="text" value={newTopic} onChange={e => setNewTopic(e.target.value)} placeholder="Topic (optional)" className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              <input type="text" value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="Primary keyword" className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
            </div>
            <textarea
              value={newContent} onChange={e => setNewContent(e.target.value)}
              placeholder="Paste the full article content here... *"
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 font-mono resize-none"
            />
            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
              <button
                onClick={saveArticle} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save to Memory'}
              </button>
            </div>
          </div>
        )}

        {/* Articles list */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {search ? 'No articles match your search' : 'No articles saved yet. Add your past articles to build memory.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(article => (
                <div key={article.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{article.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {article.content_type} &middot; {article.word_count} words
                      {article.primary_keyword && <> &middot; <span className="text-indigo-500">{article.primary_keyword}</span></>}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteArticle(article.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
