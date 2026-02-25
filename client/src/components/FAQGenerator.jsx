import { useState, useEffect } from 'react'
import {
  Globe, Loader2, Sparkles, Copy, CheckCircle2, AlertCircle,
  Code, FileText, BarChart3, Search, Zap, Shield, Target,
  MessageSquare, HelpCircle, Download, Tag, Type
} from 'lucide-react'

const URL_PIPELINE_STEPS = [
  { id: 1, label: 'Scraping Page', description: 'Extracting content, headings, and existing FAQs' },
  { id: 2, label: 'Discovering Questions', description: 'Fetching from Google, Reddit, Quora, QuestionDB' },
  { id: 3, label: 'Gap Analysis', description: 'Identifying missing questions vs existing FAQs' },
  { id: 4, label: 'Prioritizing', description: 'Ranking questions by relevance and AEO impact' },
  { id: 5, label: 'Generating Answers', description: 'Writing optimized FAQ answers with AI' },
  { id: 6, label: 'Building Schema', description: 'Creating JSON-LD FAQ schema markup' },
]

const TITLE_PIPELINE_STEPS = [
  { id: 1, label: 'Questions + Keywords', description: 'Discovering FAQs and semantic keywords in parallel' },
  { id: 2, label: 'Prioritizing', description: 'Ranking questions by relevance and AEO impact' },
  { id: 3, label: 'Generating Answers', description: 'Writing optimized FAQ answers with AI' },
  { id: 4, label: 'Building Schema', description: 'Creating JSON-LD FAQ schema markup' },
]

export default function FAQGenerator() {
  const [inputMode, setInputMode] = useState('url')
  const [url, setUrl] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('faqs')
  const [currentStep, setCurrentStep] = useState(0)
  const [stepData, setStepData] = useState({})
  const [copied, setCopied] = useState(null)
  const [aiStatus, setAiStatus] = useState({ openai: false, gemini: false })
  const [previewData, setPreviewData] = useState(null)
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    fetch('/api/analyze-ai/status')
      .then(res => res.json())
      .then(data => setAiStatus(data))
      .catch(() => setAiStatus({ openai: false, gemini: false }))
  }, [])

  const hasAIProvider = aiStatus.openai || aiStatus.gemini

  const previewPage = async () => {
    if (!url.trim()) return
    setPreviewing(true)
    setError('')
    setPreviewData(null)
    try {
      const res = await fetch('/api/faq/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scrape failed')
      setPreviewData(data.pageData)
    } catch (err) {
      setError(err.message)
    } finally {
      setPreviewing(false)
    }
  }

  const generate = async () => {
    if (inputMode === 'url' && !url.trim()) {
      setError('Please enter a page URL.')
      return
    }
    if (inputMode === 'title' && !titleInput.trim()) {
      setError('Please enter an article title.')
      return
    }
    if (!hasAIProvider) {
      setError('No AI provider configured. Add your API key in Settings.')
      return
    }

    setError('')
    setLoading(true)
    setResult(null)
    setActiveTab('faqs')
    setCurrentStep(1)
    setStepData({})

    const maxSteps = inputMode === 'title' ? 4 : 6
    const stepTimer = setInterval(() => {
      setCurrentStep(prev => prev < maxSteps ? prev + 0.1 : prev)
    }, 800)

    try {
      const provider = localStorage.getItem('ai-provider') || (aiStatus.openai ? 'openai' : 'gemini')

      const endpoint = inputMode === 'title' ? '/api/faq/generate-from-title' : '/api/faq/generate'
      const body = inputMode === 'title'
        ? { title: titleInput.trim(), provider }
        : { url: url.trim(), provider }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      clearInterval(stepTimer)

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Generation failed')
      }

      const data = await res.json()
      setResult(data)
      setCurrentStep(maxSteps + 1)
    } catch (err) {
      setError(err.message)
      setCurrentStep(0)
    } finally {
      clearInterval(stepTimer)
      setLoading(false)
    }
  }

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const downloadFile = (content, filename, type = 'text/plain') => {
    const blob = new Blob([content], { type })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const tabs = [
    { id: 'faqs', label: 'Generated FAQs', icon: MessageSquare },
    ...(inputMode === 'title' ? [{ id: 'keywords', label: 'Semantic Keywords', icon: Tag }] : []),
    { id: 'pipeline', label: 'Pipeline Details', icon: BarChart3 },
    { id: 'schema', label: 'Schema & Code', icon: Code },
    { id: 'export', label: 'Export', icon: Download },
  ]

  const PIPELINE_STEPS = inputMode === 'title' ? TITLE_PIPELINE_STEPS : URL_PIPELINE_STEPS

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">FAQ Generator</h1>
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium flex items-center gap-1">
            <Zap className="w-3 h-3" /> AEO Engine
          </span>
        </div>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          {inputMode === 'url'
            ? 'Enter a page URL to research, generate FAQs, and schema markup for AI search engines.'
            : 'Enter a title for a new article to generate FAQs, semantic keywords, and schema markup before writing.'
          }
        </p>
      </div>

      {/* Input Section */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        {/* Mode Toggle */}
        <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
          <button
            onClick={() => { setInputMode('url'); setResult(null); setError(''); setPreviewData(null) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              inputMode === 'url'
                ? 'bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Globe className="w-4 h-4" /> Existing Article (URL)
          </button>
          <button
            onClick={() => { setInputMode('title'); setResult(null); setError(''); setPreviewData(null) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              inputMode === 'title'
                ? 'bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Type className="w-4 h-4" /> New Article (Title)
          </button>
        </div>

        {/* URL Input */}
        {inputMode === 'url' && (
          <>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Page URL
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="url"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setPreviewData(null) }}
                  placeholder="https://www.cloudfuze.com/blog/slack-to-teams-migration"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
                    bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                    focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  onKeyDown={e => e.key === 'Enter' && !loading && generate()}
                />
              </div>
              <button
                onClick={previewPage}
                disabled={previewing || !url.trim()}
                className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium
                  text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Preview
              </button>
              <button
                onClick={generate}
                disabled={loading || !url.trim() || !hasAIProvider}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium
                  hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? 'Generating...' : 'Generate FAQs'}
              </button>
            </div>
          </>
        )}

        {/* Title Input */}
        {inputMode === 'title' && (
          <>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Article Title
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={titleInput}
                  onChange={e => setTitleInput(e.target.value)}
                  placeholder="e.g., How to Migrate from Dropbox to OneDrive Without Data Loss"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
                    bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                    focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  onKeyDown={e => e.key === 'Enter' && !loading && generate()}
                />
              </div>
              <button
                onClick={generate}
                disabled={loading || !titleInput.trim() || !hasAIProvider}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium
                  hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? 'Generating...' : 'Generate FAQs & Keywords'}
              </button>
            </div>
          </>
        )}

        <div className="flex items-center gap-4 mt-3">
          {hasAIProvider && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <Sparkles className="w-3 h-3" /> AI ready
            </span>
          )}
          {!hasAIProvider && (
            <span className="flex items-center gap-1 text-xs text-amber-500">
              <AlertCircle className="w-3 h-3" /> Add AI key in Settings
            </span>
          )}
        </div>

        {error && (
          <div className="mt-3 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Page Preview (URL mode only) */}
      {inputMode === 'url' && previewData && !loading && !result && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-500" /> Page Preview
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Title</p>
              <p className="text-sm text-gray-900 dark:text-white font-medium truncate">{previewData.title || 'N/A'}</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Word Count</p>
              <p className="text-sm text-gray-900 dark:text-white font-medium">{previewData.wordCount?.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Existing FAQs</p>
              <p className="text-sm text-gray-900 dark:text-white font-medium">
                {previewData.existingFAQs.length}
                {previewData.existingFAQs.length > 0 && <span className="text-green-500 ml-1">found</span>}
                {previewData.existingFAQs.length === 0 && <span className="text-amber-500 ml-1">none</span>}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">FAQ Schema</p>
              <p className="text-sm font-medium">
                {previewData.hasFAQSchema
                  ? <span className="text-green-600 dark:text-green-400">Present</span>
                  : <span className="text-red-600 dark:text-red-400">Missing</span>}
              </p>
            </div>
          </div>
          {previewData.existingFAQs.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Existing FAQ Questions:</p>
              <div className="space-y-1">
                {previewData.existingFAQs.map((q, i) => (
                  <p key={i} className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-2">
                    <HelpCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-blue-400" /> {q}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pipeline Progress */}
      {loading && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" /> AEO Pipeline Running...
          </h3>
          <div className="space-y-3">
            {PIPELINE_STEPS.map(step => {
              const isActive = Math.floor(currentStep) === step.id
              const isComplete = currentStep > step.id
              const isPending = currentStep < step.id
              return (
                <div key={step.id} className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all ${
                  isActive ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' :
                  isComplete ? 'bg-green-50/50 dark:bg-green-900/10 border border-green-200/50 dark:border-green-800/50' :
                  'bg-gray-50 dark:bg-gray-800/30 border border-gray-200/50 dark:border-gray-700/50'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    isActive ? 'bg-emerald-500 text-white' :
                    isComplete ? 'bg-green-500 text-white' :
                    'bg-gray-200 dark:bg-gray-700 text-gray-500'
                  }`}>
                    {isComplete ? <CheckCircle2 className="w-4 h-4" /> :
                     isActive ? <Loader2 className="w-4 h-4 animate-spin" /> :
                     step.id}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      isActive ? 'text-emerald-700 dark:text-emerald-300' :
                      isComplete ? 'text-green-700 dark:text-green-400' :
                      'text-gray-500 dark:text-gray-400'
                    }`}>{step.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">{step.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className={`grid gap-4 sm:grid-cols-2 ${inputMode === 'title' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
            <StatCard label="Questions Found" value={result.discovery?.totalQuestions || 0} color="blue" />
            {inputMode === 'url' && (
              <StatCard label="Missing FAQs" value={result.gapAnalysis?.missingQuestions || 0} color="amber" />
            )}
            <StatCard label="High Priority" value={result.prioritization?.highPriority || 0} color="red" />
            <StatCard label="FAQs Generated" value={result.faqs?.length || 0} color="emerald" />
            {inputMode === 'title' && (
              <StatCard
                label="Semantic Keywords"
                value={result.semanticKeywords
                  ? (result.semanticKeywords.coreTopicKeywords?.length || 0)
                    + (result.semanticKeywords.lsiKeywords?.length || 0)
                    + (result.semanticKeywords.longTailPhrases?.length || 0)
                    + (result.semanticKeywords.entityKeywords?.length || 0)
                  : 0}
                color="purple"
              />
            )}
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 overflow-x-auto pb-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-1.5">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                  ${activeTab === tab.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* ═══ GENERATED FAQS TAB ═══ */}
          {activeTab === 'faqs' && result.faqs && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    Generated FAQ Content ({result.faqs.length} questions)
                  </h3>
                  <button
                    onClick={() => copyToClipboard(
                      result.faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n'),
                      'all-faqs'
                    )}
                    className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {copied === 'all-faqs' ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === 'all-faqs' ? 'Copied!' : 'Copy all'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Optimized for AI search engines (ChatGPT, Gemini, Perplexity). Each answer is 80-120 words.
                </p>

                <div className="space-y-4">
                  {result.faqs.map((faq, i) => (
                    <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex-shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{faq.question}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                faq.priority === 'high'
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                              }`}>{faq.priority}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                {faq.targetIntent}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => copyToClipboard(`${faq.question}\n${faq.answer}`, `faq-${i}`)}
                          className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 flex-shrink-0"
                          title="Copy Q&A"
                        >
                          {copied === `faq-${i}` ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                        </button>
                      </div>
                      <div className="px-4 py-3 bg-white dark:bg-gray-900">
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{faq.answer}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Existing FAQs comparison */}
              {result.pageData?.existingFAQs?.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-6">
                  <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Existing FAQs on Page ({result.pageData.existingFAQs.length})
                  </h4>
                  <div className="space-y-1.5">
                    {result.pageData.existingFAQs.map((q, i) => (
                      <p key={i} className="text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
                        <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" /> {q}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ SEMANTIC KEYWORDS TAB ═══ */}
          {activeTab === 'keywords' && result.semanticKeywords && (() => {
            const sk = result.semanticKeywords
            const allKeywords = [
              ...(sk.coreTopicKeywords || []),
              ...(sk.lsiKeywords || []),
              ...(sk.longTailPhrases || []),
              ...(sk.entityKeywords || []),
            ].filter((kw, i, arr) => kw && arr.indexOf(kw) === i)

            return (
              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <Tag className="w-5 h-5 text-violet-500" /> Semantic Keywords
                      <span className="text-xs font-normal text-gray-400 dark:text-gray-500">({allKeywords.length})</span>
                    </h3>
                    <button
                      onClick={() => copyToClipboard(allKeywords.join(', '), 'all-keywords')}
                      className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      {copied === 'all-keywords' ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied === 'all-keywords' ? 'Copied!' : 'Copy all keywords'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
                    Include these keywords naturally in your content and FAQ answers to maximize AI visibility and topical authority.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {allKeywords.map((kw, i) => (
                      <button
                        key={i}
                        onClick={() => copyToClipboard(kw, `kw-all-${i}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium
                          bg-violet-50 dark:bg-violet-900/20 text-violet-800 dark:text-violet-200 border-violet-200 dark:border-violet-700
                          hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors cursor-pointer"
                        title="Click to copy"
                      >
                        {kw}
                        {copied === `kw-all-${i}`
                          ? <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                          : <Copy className="w-2.5 h-2.5 opacity-40 flex-shrink-0" />
                        }
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {activeTab === 'keywords' && !result.semanticKeywords && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 text-center">
              <Tag className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No semantic keywords were generated. Try regenerating.
              </p>
            </div>
          )}

          {/* ═══ PIPELINE DETAILS TAB ═══ */}
          {activeTab === 'pipeline' && (
            <div className="space-y-4">
              {/* Page Analysis */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-blue-500" /> Page Analysis
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoCell label="URL" value={result.pageData?.url} truncate />
                  <InfoCell label="Title" value={result.pageData?.title} />
                  <InfoCell label="H1" value={result.pageData?.h1} />
                  <InfoCell label="Word Count" value={result.pageData?.wordCount?.toLocaleString()} />
                  <InfoCell label="Headings" value={result.pageData?.headingCount} />
                  <InfoCell label="Existing FAQs" value={result.pageData?.existingFAQs?.length || 0} />
                  <InfoCell label="Has FAQ Schema" value={result.pageData?.hasFAQSchema ? 'Yes' : 'No'} />
                  <InfoCell label="Schema Types" value={result.pageData?.existingSchemaTypes?.join(', ') || 'None'} />
                  <InfoCell label="AI Provider" value={result.provider} />
                </div>
              </div>

              {/* Discovery Results */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                  <Search className="w-5 h-5 text-purple-500" /> Question Discovery
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Topic: <span className="font-medium text-gray-700 dark:text-gray-300">{result.discovery?.topic}</span>
                  {' · '}Primary keyword: <span className="font-medium text-gray-700 dark:text-gray-300">{result.discovery?.primaryKeyword}</span>
                </p>

                {/* Source breakdown */}
                {result.discovery?.sourceCounts && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(result.discovery.sourceCounts).map(([source, count]) => {
                      const isReal = source !== 'ai-generated'
                      const sourceStyles = {
                        'google-autocomplete': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                        'google-paa': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
                        'google-related': 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
                        'reddit': 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
                        'answerthepublic': 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800',
                        'ubersuggest': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                        'questiondb': 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                        'quora': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
                        'youtube': 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
                        'ai-generated': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                      }
                      return (
                        <div key={source} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium ${sourceStyles[source] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isReal ? 'bg-green-500' : 'bg-purple-500'}`} />
                          {source}: {count}
                          {isReal && <span className="text-[9px] opacity-70">(REAL)</span>}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="space-y-2">
                  {result.discovery?.allQuestions?.map((q, i) => {
                    const isGap = result.gapAnalysis?.gaps?.some(g => g.question === q.question)
                    const isReal = q.source !== 'ai-generated'
                    const sourceBadgeStyle = {
                      'google-autocomplete': 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
                      'google-paa': 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
                      'google-related': 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
                      'reddit': 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
                      'answerthepublic': 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400',
                      'ubersuggest': 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
                      'questiondb': 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
                      'quora': 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
                      'youtube': 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
                      'ai-generated': 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
                    }
                    return (
                      <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                        isGap
                          ? 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800'
                          : 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800'
                      }`}>
                        <div className="flex items-start gap-2 flex-1">
                          <span className={`mt-0.5 ${isGap ? 'text-amber-500' : 'text-green-500'}`}>
                            {isGap ? '○' : '●'}
                          </span>
                          <div className="flex-1">
                            <span className="text-gray-700 dark:text-gray-300">{q.question}</span>
                            {q.subreddit && <span className="ml-1 text-[10px] text-gray-400">r/{q.subreddit}</span>}
                            {q.searchVolume && <span className="ml-1 text-[10px] text-gray-400">vol: {q.searchVolume.toLocaleString()}</span>}
                            {q.channel && <span className="ml-1 text-[10px] text-gray-400">{q.channel}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceBadgeStyle[q.source] || 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                            {isReal ? '● ' : '◆ '}{q.source}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            isGap
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          }`}>{isGap ? 'gap' : 'covered'}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Prioritization */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                  <Target className="w-5 h-5 text-red-500" /> Question Prioritization
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  AI evaluated each question for search relevance, AI citation likelihood, content fit, and commercial value.
                </p>

                {/* Priority groups */}
                {['high', 'medium', 'low'].map(priority => {
                  const questions = result.prioritization?.questions?.filter(q => q.priority === priority) || []
                  if (questions.length === 0) return null
                  const config = {
                    high: { label: 'High Priority', sublabel: 'Will generate FAQ answers', bg: 'bg-red-50 dark:bg-red-900/10', border: 'border-red-200 dark:border-red-800', badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', dot: 'bg-red-500' },
                    medium: { label: 'Medium Priority', sublabel: 'Included if under 8 total', bg: 'bg-amber-50 dark:bg-amber-900/10', border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
                    low: { label: 'Low Priority', sublabel: 'Skipped', bg: 'bg-gray-50 dark:bg-gray-800/30', border: 'border-gray-200 dark:border-gray-700', badge: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400', dot: 'bg-gray-400' },
                  }[priority]
                  return (
                    <div key={priority} className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{config.label}</span>
                        <span className="text-[10px] text-gray-500">{config.sublabel}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${config.badge}`}>{questions.length}</span>
                      </div>
                      <div className="space-y-2">
                        {questions.map((q, i) => (
                          <div key={i} className={`rounded-lg border ${config.border} ${config.bg} px-4 py-3`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0 mt-0.5 ${config.badge}`}>
                                  {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">{q.question}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{q.reasoning}</p>
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px]">{q.source}</span>
                                    <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px]">{q.intent}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ═══ SCHEMA & CODE TAB ═══ */}
          {activeTab === 'schema' && result.output && (
            <div className="space-y-4">
              {/* JSON-LD Schema */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Code className="w-5 h-5 text-purple-500" /> JSON-LD FAQ Schema
                  </h3>
                  <button
                    onClick={() => copyToClipboard(result.output.schemaScript, 'schema')}
                    className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {copied === 'schema' ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === 'schema' ? 'Copied!' : 'Copy schema'}
                  </button>
                </div>
                <pre className="bg-gray-950 text-green-400 p-4 rounded-lg text-xs font-mono overflow-x-auto max-h-96 whitespace-pre-wrap">
                  {result.output.schemaScript}
                </pre>
              </div>

              {/* HTML with Microdata */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" /> HTML with Microdata
                  </h3>
                  <button
                    onClick={() => copyToClipboard(result.output.fullHTML, 'html')}
                    className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {copied === 'html' ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === 'html' ? 'Copied!' : 'Copy HTML'}
                  </button>
                </div>
                <pre className="bg-gray-950 text-blue-400 p-4 rounded-lg text-xs font-mono overflow-x-auto max-h-96 whitespace-pre-wrap">
                  {result.output.fullHTML}
                </pre>
              </div>
            </div>
          )}

          {/* ═══ EXPORT TAB ═══ */}
          {activeTab === 'export' && result.output && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Export Options</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <ExportButton
                    label="FAQ HTML Block"
                    description="Clean HTML for CMS"
                    icon={Code}
                    onClick={() => copyToClipboard(result.output.htmlBlock, 'export-html')}
                    copied={copied === 'export-html'}
                  />
                  <ExportButton
                    label="HTML + Microdata"
                    description="Schema.org microdata attributes"
                    icon={FileText}
                    onClick={() => copyToClipboard(result.output.fullHTML, 'export-full')}
                    copied={copied === 'export-full'}
                  />
                  <ExportButton
                    label="JSON-LD Schema"
                    description="Paste in <head> section"
                    icon={Code}
                    onClick={() => copyToClipboard(result.output.schemaScript, 'export-schema')}
                    copied={copied === 'export-schema'}
                  />
                  <ExportButton
                    label="Markdown"
                    description="For docs and READMEs"
                    icon={FileText}
                    onClick={() => copyToClipboard(result.output.markdownBlock, 'export-md')}
                    copied={copied === 'export-md'}
                  />
                  <ExportButton
                    label="JSON Data"
                    description="Structured FAQ data"
                    icon={Code}
                    onClick={() => copyToClipboard(JSON.stringify(result.output.schemaJSON, null, 2), 'export-json')}
                    copied={copied === 'export-json'}
                  />
                  <ExportButton
                    label="Download All"
                    description="HTML + Schema + Markdown"
                    icon={Download}
                    isDownload
                    onClick={() => {
                      const content = `<!-- FAQ HTML Block -->\n${result.output.fullHTML}\n\n<!-- JSON-LD Schema -->\n${result.output.schemaScript}\n\n<!-- Markdown -->\n${result.output.markdownBlock}`
                      downloadFile(content, `faq-${new Date().toISOString().slice(0, 10)}.html`, 'text/html')
                    }}
                  />
                </div>
              </div>

              {/* Markdown Preview */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Markdown Preview</h3>
                <pre className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg text-sm text-gray-700 dark:text-gray-300 font-mono overflow-x-auto max-h-96 whitespace-pre-wrap">
                  {result.output.markdownBlock}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helper Components ──────────────────────────────────────────────────────

function StatCard({ label, value, color, isText = false }) {
  const colorMap = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400',
  }
  return (
    <div className={`rounded-xl border p-4 text-center ${colorMap[color]}`}>
      <p className={`${isText ? 'text-lg' : 'text-2xl'} font-bold`}>{value}</p>
      <p className="text-[10px] font-medium uppercase mt-1 opacity-80">{label}</p>
    </div>
  )
}

function InfoCell({ label, value, truncate = false }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
      <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{label}</p>
      <p className={`text-sm text-gray-900 dark:text-white font-medium ${truncate ? 'truncate' : ''}`}>
        {value || 'N/A'}
      </p>
    </div>
  )
}

function KeywordGroup({ title, description, keywords, color, copied, onCopy, groupId }) {
  if (!keywords || keywords.length === 0) return null

  const colorMap = {
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/15',
      border: 'border-emerald-200 dark:border-emerald-800',
      chip: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700',
      dot: 'bg-emerald-500',
      title: 'text-emerald-700 dark:text-emerald-300',
    },
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/15',
      border: 'border-blue-200 dark:border-blue-800',
      chip: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-700',
      dot: 'bg-blue-500',
      title: 'text-blue-700 dark:text-blue-300',
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-900/15',
      border: 'border-amber-200 dark:border-amber-800',
      chip: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-700',
      dot: 'bg-amber-500',
      title: 'text-amber-700 dark:text-amber-300',
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-900/15',
      border: 'border-purple-200 dark:border-purple-800',
      chip: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-700',
      dot: 'bg-purple-500',
      title: 'text-purple-700 dark:text-purple-300',
    },
  }

  const c = colorMap[color] || colorMap.blue

  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-4 mb-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
          <h4 className={`text-sm font-semibold ${c.title}`}>{title}</h4>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{keywords.length} keywords</span>
        </div>
        <button
          onClick={() => onCopy(keywords.join(', '), `kw-${groupId}`)}
          className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          {copied === `kw-${groupId}` ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          {copied === `kw-${groupId}` ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">{description}</p>
      <div className="flex flex-wrap gap-2">
        {keywords.map((kw, i) => (
          <button
            key={i}
            onClick={() => onCopy(kw, `kw-${groupId}-${i}`)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium 
              ${c.chip} hover:opacity-80 transition-opacity cursor-pointer`}
            title="Click to copy"
          >
            {kw}
            {copied === `kw-${groupId}-${i}`
              ? <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
              : <Copy className="w-2.5 h-2.5 opacity-40 flex-shrink-0" />
            }
          </button>
        ))}
      </div>
    </div>
  )
}

function ExportButton({ label, description, icon: Icon, onClick, copied = false, isDownload = false }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 text-left
        hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors group"
    >
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-5 h-5 text-gray-400 group-hover:text-emerald-500 transition-colors" />
        {copied && <CheckCircle2 className="w-4 h-4 text-green-500" />}
      </div>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
    </button>
  )
}
