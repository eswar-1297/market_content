import { useState, useEffect } from 'react'
import { Loader2, Copy, CheckCheck, Download, Search, Sparkles, ChevronDown } from 'lucide-react'

export default function FanoutGenerator() {
  const [mainQuery, setMainQuery] = useState('')
  const [domain, setDomain] = useState('')
  const [maxFanouts, setMaxFanouts] = useState(10)
  const [provider, setProvider] = useState('openai')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [darkMode, setDarkMode] = useState(() => document.body.classList.contains('dark'))

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDarkMode(document.body.classList.contains('dark'))
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!mainQuery.trim()) {
      setError('Please enter a query')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/fanout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          main_query: mainQuery,
          domain: domain || undefined,
          max_fanouts: maxFanouts,
          provider,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to generate fanout queries')
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const copyAllQueries = () => {
    if (!result) return
    const allQueries = result.fanouts.map(f => f.query).join('\n')
    navigator.clipboard.writeText(allQueries)
    setCopiedId('all')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const downloadJSON = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fanout-queries-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadContentBrief = () => {
    if (!result) return

    const groupedByCategory = {}
    result.fanouts.forEach(fanout => {
      if (!groupedByCategory[fanout.category]) groupedByCategory[fanout.category] = []
      groupedByCategory[fanout.category].push(fanout)
    })

    let brief = `CONTENT BRIEF: ${result.main_query}\n`
    brief += `${'='.repeat(60)}\n\n`
    if (result.domain) brief += `Domain: ${result.domain}\n`
    brief += `Generated: ${new Date().toLocaleString()}\n`
    brief += `Total Topics to Cover: ${result.fanouts.length}\n\n`
    brief += `${'='.repeat(60)}\nCONTENT COVERAGE PLAN\n${'='.repeat(60)}\n\n`
    brief += `This content brief breaks down "${result.main_query}" into ${result.fanouts.length} key research areas.\n`
    brief += `Each section below represents an angle your content should cover for comprehensive coverage.\n\n`

    Object.keys(groupedByCategory).forEach((category, idx) => {
      const categoryName = category.replace('_', ' ').toUpperCase()
      brief += `\n${idx + 1}. ${categoryName}\n${'-'.repeat(60)}\n`
      groupedByCategory[category].forEach((fanout, qIdx) => {
        brief += `\n${String.fromCharCode(97 + qIdx)}. ${fanout.query}\n   Purpose: ${fanout.purpose}\n`
      })
      brief += `\n`
    })

    brief += `\n${'='.repeat(60)}\nCONTENT CREATION CHECKLIST\n${'='.repeat(60)}\n\n`
    result.fanouts.forEach((fanout, idx) => {
      brief += `[ ] ${idx + 1}. ${fanout.query}\n`
    })

    brief += `\n${'='.repeat(60)}\nALL QUERIES (for research):\n${'='.repeat(60)}\n\n`
    brief += result.fanouts.map((f, i) => `${i + 1}. ${f.query}`).join('\n')
    brief += `\n\n--- End of Content Brief ---\n`

    const blob = new Blob([brief], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `content-brief-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getCategoryConfig = (category) => {
    const configs = {
      core_facts:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  icon: '📘', label: 'Core Facts' },
      background:     { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.3)', icon: '📚', label: 'Background' },
      comparisons:    { color: '#ec4899', bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.3)', icon: '⚖️', label: 'Comparisons' },
      edge_cases:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: '⚠️', label: 'Edge Cases' },
      implementation: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', icon: '🛠️', label: 'Implementation' },
      evaluation:     { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',  border: 'rgba(6,182,212,0.3)',  icon: '📊', label: 'Evaluation' },
      follow_up:      { color: '#6366f1', bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.3)', icon: '🚀', label: 'Follow Up' },
    }
    return configs[category] || { color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)', icon: '📌', label: category }
  }

  const categoryStats = result
    ? result.fanouts.reduce((acc, f) => {
        acc[f.category] = (acc[f.category] || 0) + 1
        return acc
      }, {})
    : {}

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-8">
      <div className={`min-h-[calc(100vh-4rem)] rounded-xl overflow-hidden border transition-colors duration-300 ${
        darkMode
          ? 'bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 border-gray-800'
          : 'bg-gradient-to-br from-blue-50 via-white to-purple-50 border-gray-200'
      }`}>

        {/* Header */}
        <div className={`px-6 py-8 text-center border-b ${
          darkMode ? 'border-gray-800' : 'border-gray-200'
        }`}>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', boxShadow: '0 8px 32px rgba(59,130,246,0.3)' }}>
            <Sparkles size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Fanout Query Generator
          </h1>
          <p className={`text-base mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Transform any topic into comprehensive sub-queries for complete content coverage
          </p>
          <p className={`text-sm max-w-xl mx-auto ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            Generate research queries that cover all angles — perfect for content planning and AI search visibility
          </p>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Form */}
          <form onSubmit={handleSubmit} className={`rounded-2xl p-6 mb-8 border backdrop-blur-sm ${
            darkMode
              ? 'bg-gray-900/50 border-gray-700'
              : 'bg-white/80 border-gray-200 shadow-lg'
          }`}>
            <div className="mb-5">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Main Query <span className="text-red-400">*</span>
              </label>
              <textarea
                value={mainQuery}
                onChange={(e) => setMainQuery(e.target.value)}
                placeholder={"e.g., What is artificial intelligence and how does it work?\ne.g., How to start a successful podcast in 2025?\ne.g., Benefits and risks of intermittent fasting"}
                rows={3}
                disabled={loading}
                className={`w-full px-4 py-3 rounded-xl border text-sm resize-y min-h-[80px] transition-colors ${
                  darkMode
                    ? 'bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500'
                    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
                } focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div className="sm:col-span-2">
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Domain (optional)
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g., technical, marketing, research"
                  disabled={loading}
                  className={`w-full px-4 py-3 rounded-xl border text-sm transition-colors ${
                    darkMode
                      ? 'bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500'
                      : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Max Fanouts
                </label>
                <input
                  type="number"
                  value={maxFanouts}
                  onChange={(e) => setMaxFanouts(parseInt(e.target.value) || 10)}
                  min={1}
                  max={20}
                  disabled={loading}
                  className={`w-full px-4 py-3 rounded-xl border text-sm transition-colors ${
                    darkMode
                      ? 'bg-gray-800 border-gray-600 text-gray-100 focus:border-blue-500'
                      : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50`}
                />
              </div>
            </div>

            <div className="mb-5">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                AI Provider
              </label>
              <div className="relative">
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  disabled={loading}
                  className={`w-full px-4 py-3 rounded-xl border text-sm transition-colors appearance-none cursor-pointer ${
                    darkMode
                      ? 'bg-gray-800 border-gray-600 text-gray-100 focus:border-blue-500'
                      : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50`}
                >
                  <option value="openai">ChatGPT</option>
                  <option value="gemini">Gemini</option>
                  <option value="both">Both (Best of ChatGPT + Gemini)</option>
                </select>
                <ChevronDown size={16} className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 rounded-xl text-white font-semibold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(59,130,246,0.3)',
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Generating Fanout Queries...
                </>
              ) : (
                <>
                  <Search size={20} />
                  Generate Fanout Queries
                </>
              )}
            </button>
          </form>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 rounded-xl border border-red-400/50 bg-red-500/10 text-red-400">
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className={`rounded-2xl p-6 border backdrop-blur-sm ${
              darkMode
                ? 'bg-gray-900/50 border-gray-700'
                : 'bg-white/80 border-gray-200 shadow-lg'
            }`}>
              {/* Results Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <h2 className={`text-xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Generated Fanout Queries ({result.fanouts.length})
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={copyAllQueries}
                    className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                      darkMode
                        ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                    }`}
                  >
                    {copiedId === 'all' ? <CheckCheck size={16} /> : <Copy size={16} />}
                    Copy All
                  </button>
                  <button
                    onClick={downloadJSON}
                    className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                      darkMode
                        ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                    }`}
                  >
                    <Download size={16} />
                    Export JSON
                  </button>
                  <button
                    onClick={downloadContentBrief}
                    className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                      darkMode
                        ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                    }`}
                  >
                    <Download size={16} />
                    Content Brief
                  </button>
                </div>
              </div>

              {/* Meta */}
              <div className={`p-4 rounded-xl mb-5 text-sm ${
                darkMode ? 'bg-gray-800/60 text-gray-300' : 'bg-gray-50 text-gray-600'
              }`}>
                <span><strong>Main Query:</strong> {result.main_query}</span>
                {result.domain && <span className="ml-4"><strong>Domain:</strong> {result.domain}</span>}
              </div>

              {/* Category Stats */}
              <div className="flex flex-wrap gap-2 mb-5">
                {Object.entries(categoryStats).map(([cat, count]) => {
                  const cfg = getCategoryConfig(cat)
                  return (
                    <span key={cat} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                      <span>{cfg.icon}</span>
                      {cfg.label} ({count})
                    </span>
                  )
                })}
              </div>

              {/* Fanout Cards */}
              <div className="space-y-3">
                {result.fanouts.map((fanout, index) => {
                  const cfg = getCategoryConfig(fanout.category)
                  return (
                    <div key={fanout.id} className={`rounded-xl p-5 border transition-all hover:-translate-y-0.5 ${
                      darkMode
                        ? 'bg-gray-800/40 border-gray-700 hover:border-gray-600 hover:shadow-lg hover:shadow-black/20'
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'
                    }`}
                    style={{ animationDelay: `${index * 0.03}s` }}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2 py-1 rounded-md text-white"
                            style={{ backgroundColor: cfg.color }}>
                            {cfg.icon} {cfg.label}
                          </span>
                          <span className={`text-xs font-mono ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            {fanout.id}
                          </span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(fanout.query, fanout.id)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            darkMode ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'
                          }`}
                          title="Copy query"
                        >
                          {copiedId === fanout.id ? <CheckCheck size={16} className="text-green-400" /> : <Copy size={16} />}
                        </button>
                      </div>
                      <p className={`text-xs italic mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        {fanout.purpose}
                      </p>
                      <p className={`text-sm font-medium leading-relaxed ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {fanout.query}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
