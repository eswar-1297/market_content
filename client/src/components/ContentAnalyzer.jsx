import { useState, useEffect } from 'react'
import {
  Search, Loader2, Sparkles, LayoutList, Image,
  BookOpen, Eye, Layers, ChevronDown, ChevronUp,
  Wand2, ArrowRight, Copy, RefreshCw,
  AlertCircle, ArrowUpRight, Lightbulb,
  Play, ExternalLink, Tag, Link, FileText, Globe
} from 'lucide-react'

function deduplicateResult(data) {
  if (!data || !data.sectionsFound) return data
  const foundNames = new Set(
    data.sectionsFound.map(s => s.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
  )

  const hasFaqSection = data.sectionsFound.some(s =>
    /faq|frequently\s*asked/i.test(s.name)
  )
  const faqIsGood = data.sectionsFound.some(s =>
    /faq|frequently\s*asked/i.test(s.name) && s.assessment === 'good'
  )

  return {
    ...data,
    sectionSuggestions: (data.sectionSuggestions || []).filter(s => {
      const normalized = s.section.toLowerCase().replace(/[^a-z0-9]/g, '')
      return !foundNames.has(normalized) &&
        ![...foundNames].some(f => normalized.includes(f) || f.includes(normalized))
    }),
    faqSuggestions: faqIsGood ? [] : (data.faqSuggestions || []),
    quickWins: (data.quickWins || []).filter(w => {
      const wLower = w.toLowerCase()
      if (hasFaqSection && wLower.includes('faq') && (wLower.includes('add') || wLower.includes('more'))) {
        return false
      }
      return ![...foundNames].some(f => {
        const readable = data.sectionsFound.find(
          s => s.name.toLowerCase().replace(/[^a-z0-9]/g, '') === f
        )?.name.toLowerCase()
        return readable && wLower.includes('add') && wLower.includes(readable)
      })
    })
  }
}

export default function ContentAnalyzer() {
  const [inputMode, setInputMode] = useState('paste') // 'paste' or 'url'
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapedInfo, setScrapedInfo] = useState(null) // { title, url, wordCount }
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('suggestions')
  const [aiStatus, setAiStatus] = useState({ openai: false, gemini: false })

  useEffect(() => {
    fetch('/api/analyze-ai/status')
      .then(res => res.json())
      .then(data => setAiStatus(data))
      .catch(() => setAiStatus({ openai: false, gemini: false }))
  }, [])

  const hasAIProvider = aiStatus.openai || aiStatus.gemini

  const scrapeUrl = async () => {
    if (!url.trim()) {
      setError('Please enter a URL.')
      return
    }
    let normalizedUrl = url.trim()
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = 'https://' + normalizedUrl

    setError('')
    setScraping(true)
    setScrapedInfo(null)
    setContent('')

    try {
      const res = await fetch('/api/analyze-ai/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to scrape URL')
      }
      const data = await res.json()
      setContent(data.content)
      setScrapedInfo({ title: data.title, url: data.url, wordCount: data.wordCount })
    } catch (err) {
      setError(err.message)
    } finally {
      setScraping(false)
    }
  }

  const runAnalysis = async (contentToAnalyze) => {
    const text = contentToAnalyze || content
    if (!text.trim()) {
      setError(inputMode === 'url' ? 'Please fetch the URL content first.' : 'Please paste some content to analyze.')
      return
    }
    if (!hasAIProvider) {
      setError('No AI provider configured. Add your OpenAI or Gemini API key in Settings.')
      return
    }

    setError('')
    setLoading(true)
    setResult(null)
    setActiveTab('suggestions')

    try {
      const provider = localStorage.getItem('ai-provider') || (aiStatus.openai ? 'openai' : 'gemini')
      const res = await fetch('/api/analyze-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, provider })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Analysis failed')
      }

      const data = await res.json()
      setResult(deduplicateResult(data))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const analyze = () => runAnalysis()
  const reAnalyze = () => runAnalysis()

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length

  const hasVideoSuggestions = result?.videoSuggestions && result.videoSuggestions.length > 0

  const tabs = [
    { id: 'suggestions', label: 'Improvements', icon: Lightbulb },
    { id: 'sections', label: 'Sections', icon: Layers },
    { id: 'rewrites', label: 'Rewrites', icon: Wand2 },
    { id: 'faqs', label: 'FAQ & Links', icon: BookOpen },
    { id: 'visuals', label: 'Visuals', icon: Image },
    ...(hasVideoSuggestions ? [{ id: 'videos', label: 'Videos', icon: Play }] : [])
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Content Analyzer</h1>
          <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> AI-Powered
          </span>
        </div>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Paste your blog content to get AI-powered analysis for maximum visibility in AI search engines.
        </p>
      </div>

      {/* Input area */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        {/* Input Mode Toggle */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit mb-5">
          <button
            onClick={() => { setInputMode('paste'); setError(''); setScrapedInfo(null) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              inputMode === 'paste'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <FileText className="w-4 h-4" />
            Paste Content
          </button>
          <button
            onClick={() => { setInputMode('url'); setError('') }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              inputMode === 'url'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Globe className="w-4 h-4" />
            Enter URL
          </button>
        </div>

        {/* URL Input Mode */}
        {inputMode === 'url' && (
          <div className="mb-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !scraping && scrapeUrl()}
                  placeholder="https://example.com/blog-post"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600
                    bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                    focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  disabled={scraping}
                />
              </div>
              <button
                onClick={scrapeUrl}
                disabled={scraping || !url.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-800 dark:bg-gray-600 text-white text-sm font-medium
                  hover:bg-gray-900 dark:hover:bg-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                {scraping ? 'Fetching...' : 'Fetch Content'}
              </button>
            </div>

            {scrapedInfo && (
              <div className="mt-3 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">Content fetched successfully</span>
                </div>
                <p className="text-xs text-green-600 dark:text-green-400">
                  <strong>{scrapedInfo.title}</strong> — {scrapedInfo.wordCount} words extracted
                </p>
              </div>
            )}
          </div>
        )}

        {/* Content textarea (always visible — shows scraped content in URL mode) */}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600
            bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
            focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            font-mono text-sm resize-none"
          rows={inputMode === 'url' ? 8 : 12}
          placeholder={inputMode === 'url'
            ? 'Content will appear here after fetching the URL. You can also edit it before analyzing...'
            : 'Paste your blog content here — plain text, markdown, or HTML. The AI will analyze it for AI search engine visibility...'
          }
        />

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {wordCount} words
            </p>
            {hasAIProvider && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <Sparkles className="w-3 h-3" /> AI ready
              </span>
            )}
            {!hasAIProvider && (
              <span className="flex items-center gap-1 text-xs text-amber-500">
                <AlertCircle className="w-3 h-3" /> Add AI key in Settings to analyze
              </span>
            )}
          </div>
          <button
            onClick={analyze}
            disabled={loading || !content.trim() || !hasAIProvider}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium
              hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /></>}
            {loading ? 'AI Analyzing...' : 'Analyze with AI'}
          </button>
        </div>

        {error && (
          <div className="mt-3 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
            <span>{error}</span>
            {result && (
              <button onClick={reAnalyze} className="text-xs font-medium text-red-700 dark:text-red-300 underline hover:no-underline">
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && !result && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900 dark:text-white">AI is analyzing your content...</p>
            <p className="text-xs text-gray-500 mt-1">Checking structure, AI extractability, readability, SEO, and FAQ quality.</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Tab navigation */}
          <div className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-1.5">
            <div className="flex gap-1 overflow-x-auto flex-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                    ${activeTab === tab.id
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              onClick={reAnalyze}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Re-analyze
            </button>
          </div>

          {/* ═══ SECTIONS TAB ═══ */}
          {activeTab === 'sections' && (
            <div className="space-y-4">
              {/* Sections Found */}
              {result.sectionsFound && result.sectionsFound.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Sections in Your Content</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">How each detected section contributes to AI visibility.</p>
                  <div className="space-y-2">
                    {result.sectionsFound.map((s, i) => (
                      <div key={i} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                        s.assessment === 'good'
                          ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
                          : s.assessment === 'weak'
                            ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
                            : 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${
                            s.assessment === 'good' ? 'bg-green-500' :
                            s.assessment === 'weak' ? 'bg-red-500' : 'bg-amber-500'
                          }`} />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{s.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs ${
                            s.assessment === 'good' ? 'text-green-600 dark:text-green-400' :
                            s.assessment === 'weak' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                          }`}>
                            {s.note}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            s.assessment === 'good' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                            s.assessment === 'weak' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                            'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                          }`}>
                            {s.assessment}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section Suggestions */}
              {result.sectionSuggestions && result.sectionSuggestions.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Add These Sections to Your Article</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Complementary H2 sections that would strengthen this article and boost AI visibility.</p>
                  <div className="space-y-3">
                    {result.sectionSuggestions.map((s, i) => (
                      <div key={i} className={`rounded-lg border p-4 space-y-2 ${
                        s.relevance === 'high'
                          ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30'
                      }`}>
                        <div className="flex items-center gap-2">
                          <Sparkles className={`w-3.5 h-3.5 ${s.relevance === 'high' ? 'text-amber-500' : 'text-gray-400'}`} />
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{s.section}</span>
                          {s.type && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 capitalize">
                              {s.type.replace('-', ' ')}
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            s.relevance === 'high'
                              ? 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200'
                              : s.relevance === 'medium'
                                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                          }`}>{s.relevance}</span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400">{s.reason}</p>
                        {s.example && (
                          <div className="mt-2 px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap">
                            {s.example}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Content Ideas */}
              {result.contentIdeas && result.contentIdeas.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-indigo-500" /> Related Blog Post Ideas
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Separate articles you could write to build a content cluster around this topic.
                  </p>
                  <div className="space-y-3">
                    {result.contentIdeas.map((idea, i) => (
                      <div key={i} className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">{idea.title}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 capitalize">
                                {idea.type}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400">{idea.preview}</p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <Search className="w-3 h-3 text-indigo-400" />
                              <span className="text-[11px] text-indigo-600 dark:text-indigo-400 italic">
                                Targets: "{idea.targetQuery}"
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ IMPROVEMENTS TAB ═══ */}
          {activeTab === 'suggestions' && (
            <div className="space-y-4">
              {result.improvements && result.improvements.length > 0 ? (
                <>
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-amber-500" /> Content Improvements
                      </h3>
                      <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
                        {result.improvements.length} changes
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Specific, actionable changes to improve AI visibility. Each one shows exactly what to change and why.
                    </p>
                  </div>

                  {result.improvements.map((imp, i) => {
                    const priorityConfig = {
                      critical: { label: 'Critical', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800', dot: 'bg-red-500', border: 'border-l-red-500' },
                      recommended: { label: 'Recommended', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800', dot: 'bg-amber-500', border: 'border-l-amber-500' },
                      'nice-to-have': { label: 'Nice to Have', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700', dot: 'bg-gray-400', border: 'border-l-gray-400' }
                    }
                    const typeLabels = {
                      'split-paragraph': 'Split Paragraph',
                      'add-heading': 'Add Heading',
                      'add-bullet-list': 'Convert to List',
                      'restructure': 'Restructure',
                      'add-content': 'Add Content',
                      'fix-formatting': 'Fix Formatting',
                      'add-schema': 'Add Schema',
                      'add-definition': 'Add Definition',
                      'front-load-answer': 'Front-load Answer',
                      'add-direct-answer': 'Add Direct Answer'
                    }
                    const pc = priorityConfig[imp.priority] || priorityConfig['nice-to-have']

                    return (
                      <div key={i} className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 border-l-4 ${pc.border} overflow-hidden`}>
                        <div className="p-5">
                          {/* Header */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${pc.color}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
                                  {pc.label}
                                </span>
                                {imp.type && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                                    {typeLabels[imp.type] || imp.type}
                                  </span>
                                )}
                                {imp.location && (
                                  <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                                    {imp.location}
                                  </span>
                                )}
                              </div>
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{imp.title}</h4>
                            </div>
                            <span className="text-xs font-bold text-gray-300 dark:text-gray-600 flex-shrink-0">#{i + 1}</span>
                          </div>

                          {/* Why this matters */}
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">{imp.description}</p>

                          {/* Current → Suggested */}
                          {(imp.currentText || imp.suggestedFix) && (
                            <div className="space-y-3">
                              {imp.currentText && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-red-500 dark:text-red-400">Current</span>
                                  </div>
                                  <div className="rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 px-4 py-3">
                                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{imp.currentText}</p>
                                  </div>
                                </div>
                              )}
                              {imp.suggestedFix && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-green-500 dark:text-green-400">Suggested</span>
                                  </div>
                                  <div className="rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 px-4 py-3">
                                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{imp.suggestedFix}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </>
              ) : (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
                  <Lightbulb className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No improvements found. Your content looks good!</p>
                </div>
              )}
            </div>
          )}

          {/* ═══ REWRITES TAB ═══ */}
          {activeTab === 'rewrites' && (
            <div className="space-y-4">
              {result.rewriteSuggestions && result.rewriteSuggestions.length > 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">AI Rewrite Suggestions</h3>
                    <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
                      {result.rewriteSuggestions.length} suggestions
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Specific text improvements for better AI visibility. Each rewrite explains why it helps AI engines cite your content.</p>
                  <div className="space-y-4">
                    {result.rewriteSuggestions.map((s, i) => {
                      const catColors = {
                        clarity: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                        extractability: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
                        tone: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
                        structure: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
                        directness: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                      }
                      return (
                        <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-400 dark:text-gray-500">#{i + 1}</span>
                            {s.category && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ${catColors[s.category] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                                {s.category}
                              </span>
                            )}
                          </div>
                          <div className="rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 px-4 py-3">
                            <p className="text-[10px] font-bold text-red-400 uppercase mb-1">Original</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 line-through leading-relaxed">{s.original}</p>
                          </div>
                          <div className="rounded-lg bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 px-4 py-3">
                            <p className="text-[10px] font-bold text-green-400 uppercase mb-1">Improved</p>
                            <p className="text-sm text-gray-800 dark:text-gray-200 font-medium leading-relaxed">{s.suggested}</p>
                          </div>
                          <div className="flex items-start gap-2 px-1">
                            <Lightbulb className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-indigo-600 dark:text-indigo-400 leading-relaxed">{s.reason}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
                  <p className="text-sm text-gray-500">No rewrite suggestions — your content's writing is solid.</p>
                </div>
              )}
            </div>
          )}

          {/* ═══ FAQS & LINKS TAB ═══ */}
          {activeTab === 'faqs' && (
            <div className="space-y-4">
              {/* FAQ Suggestions */}
              {result.faqSuggestions && result.faqSuggestions.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Suggested FAQ Questions</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Questions users commonly ask about this topic — add these to your FAQ section.</p>
                  <div className="space-y-2">
                    {result.faqSuggestions.map((q, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        <HelpCircleIcon />
                        <span className="text-sm text-blue-700 dark:text-blue-300">{q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Internal Link Opportunities */}
              {result.internalLinkOpportunities && result.internalLinkOpportunities.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Internal Link Opportunities</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Add these internal links to improve SEO and AI context.</p>
                  <div className="space-y-2">
                    {result.internalLinkOpportunities.map((link, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                        <ArrowUpRight className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">"{link.anchorText}"</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{link.context}</p>
                          {link.suggestedTopic && (
                            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">Link to: {link.suggestedTopic}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ VIDEOS TAB ═══ */}
          {activeTab === 'videos' && hasVideoSuggestions && (
            <div className="space-y-4">
              {/* Topic Detection Summary */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                  <Search className="w-4 h-4 text-indigo-500" /> Topic Detection
                </h3>
                {result.blogTitle && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Detected from: <span className="font-medium text-gray-700 dark:text-gray-300">"{result.blogTitle}"</span>
                  </p>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Search keywords:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(result.extractedKeywords || []).map((kw, i) => {
                    const breakdown = result.videoKeywordBreakdown?.find(b => b.keyword === kw)
                    return (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                      >
                        <Tag className="w-3 h-3" />
                        {kw}
                        {breakdown && (
                          <span className="ml-1 bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 px-1.5 py-0.5 rounded-full text-[10px]">
                            {breakdown.count} video{breakdown.count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </span>
                    )
                  })}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                  Videos are ranked by relevance: H1 topic match first, then keyword matches.
                </p>
              </div>

              {/* Matched Videos */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Play className="w-5 h-5 text-red-500" /> Matched Videos
                  </h3>
                  <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                    {result.videoSuggestions.length} found
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
                  Ranked by relevance — topic matches first, then keyword matches. Pick any video to embed.
                </p>
                <div className="space-y-4">
                  {result.videoSuggestions.map((video, i) => {
                    const tierLabel = video.tier === 1 ? 'Best match' : video.tier === 2 ? 'Good match' : 'Related'
                    const tierColor = video.tier === 1 ? 'bg-green-600' : video.tier === 2 ? 'bg-blue-600' : 'bg-gray-600'
                    return (
                    <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 overflow-hidden">
                      <div className="flex flex-col sm:flex-row">
                        <a
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative sm:w-56 flex-shrink-0 group"
                        >
                          <img
                            src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                            alt={video.title}
                            className="w-full sm:h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-10 h-10 text-white fill-white" />
                          </div>
                          <div className={`absolute top-2 right-2 ${tierColor} text-white text-[10px] font-bold px-2 py-0.5 rounded-full`}>
                            {tierLabel}
                          </div>
                        </a>
                        <div className="p-4 flex-1 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <a
                              href={video.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors line-clamp-2"
                            >
                              {video.title}
                            </a>
                            <a
                              href={video.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                              title="Open in YouTube"
                            >
                              <ExternalLink className="w-4 h-4 text-gray-400" />
                            </a>
                          </div>

                          {/* Matched keywords tags */}
                          <div className="flex flex-wrap gap-1.5">
                            {video.matchedKeywords.map((kw, ki) => (
                              <span
                                key={ki}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                              >
                                <Tag className="w-2.5 h-2.5" />{kw}
                              </span>
                            ))}
                          </div>

                          {video.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">{video.description}</p>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-3 pt-1">
                            <button
                              onClick={() => {
                                const embedCode = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${video.videoId}" frameborder="0" allowfullscreen></iframe>`
                                navigator.clipboard.writeText(embedCode)
                              }}
                              className="flex items-center gap-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              <Copy className="w-3 h-3" /> Copy embed code
                            </button>
                            <button
                              onClick={() => navigator.clipboard.writeText(video.url)}
                              className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 hover:underline"
                            >
                              <Copy className="w-3 h-3" /> Copy URL
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>

              {/* YouTube stats info */}
              {result.contentStats?.youtubeVideosAvailable > 0 && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                  Searched {result.contentStats.youtubeVideosAvailable} CloudFuze YouTube videos by keyword matching
                </p>
              )}
            </div>
          )}

          {/* ═══ VISUALS TAB ═══ */}
          {activeTab === 'visuals' && (
            <div className="space-y-4">
              {/* Visual Strategy Summary */}
              {result.visualStrategy ? (
                <>
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Image className="w-5 h-5 text-purple-500" /> Visual Strategy
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-3 mb-4">
                      <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-4 text-center">
                        <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                          {result.visualStrategy.currentImageCount || 0}
                        </p>
                        <p className="text-[10px] text-purple-500 dark:text-purple-400 font-medium uppercase mt-1">Images Found</p>
                      </div>
                      <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 p-4 text-center">
                        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                          {result.visualStrategy.recommendedImageCount || 0}
                        </p>
                        <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium uppercase mt-1">Recommended</p>
                      </div>
                      <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 text-center">
                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                          {Math.max(0, (result.visualStrategy.recommendedImageCount || 0) - (result.visualStrategy.currentImageCount || 0))}
                        </p>
                        <p className="text-[10px] text-amber-500 dark:text-amber-400 font-medium uppercase mt-1">To Add</p>
                      </div>
                    </div>
                    {result.visualStrategy.summary && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3">
                        {result.visualStrategy.summary}
                      </p>
                    )}
                  </div>

                  {/* Individual Image Recommendations */}
                  {result.visualStrategy.images && result.visualStrategy.images.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                        Recommended Images ({result.visualStrategy.images.length})
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                        Each image includes placement, alt text for SEO, and why it helps AI visibility.
                      </p>
                      <div className="space-y-3">
                        {result.visualStrategy.images.map((img, i) => (
                          <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 p-4 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 text-xs font-bold">
                                  {i + 1}
                                </span>
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">{img.title}</span>
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 uppercase">
                                {img.type}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">{img.description}</p>
                            <div className="grid gap-2 sm:grid-cols-2 text-xs">
                              <div className="rounded bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
                                <span className="font-medium text-blue-600 dark:text-blue-400">Placement: </span>
                                <span className="text-blue-700 dark:text-blue-300">{img.placement}</span>
                              </div>
                              {img.altText && (
                                <div className="rounded bg-green-50 dark:bg-green-900/20 px-3 py-2">
                                  <span className="font-medium text-green-600 dark:text-green-400">Alt text: </span>
                                  <span className="text-green-700 dark:text-green-300 italic">"{img.altText}"</span>
                                </div>
                              )}
                            </div>
                            {img.purpose && (
                              <div className="flex items-start gap-1.5 mt-1">
                                <Eye className="w-3 h-3 text-indigo-400 mt-0.5 flex-shrink-0" />
                                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 italic">{img.purpose}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : result.imageRecommendations && result.imageRecommendations.length > 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Visual Content Recommendations</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Visuals improve engagement and help AI engines understand content structure.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {result.imageRecommendations.map((r, i) => (
                      <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <Image className="w-4 h-4 text-purple-500" />
                          <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase">{r.type}</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{r.description}</p>
                        <p className="text-xs text-gray-500">Placement: {r.placement}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
                  <p className="text-sm text-gray-500">No specific visual recommendations for this content.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helper Components ──────────────────────────────────────────────────────

function HelpCircleIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  )
}
