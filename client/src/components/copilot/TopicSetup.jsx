import { useState } from 'react'
import { Sparkles, Loader2, FileText, ChevronDown, ChevronUp, Check, ArrowRight, BookOpen, Tag, Lightbulb, Heading1, PenLine } from 'lucide-react'
import { authFetch } from '../../services/authFetch'

export default function TopicSetup({ onPlanGenerated, existingArticles = [] }) {
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState(null)
  const [relatedArticles, setRelatedArticles] = useState([])
  const [showKeywords, setShowKeywords] = useState(false)
  const [showRelated, setShowRelated] = useState(false)
  const [selectedH1, setSelectedH1] = useState(null)
  const [customH1, setCustomH1] = useState('')
  const [isCustomH1, setIsCustomH1] = useState(false)

  const generatePlan = async () => {
    if (!topic.trim()) { setError('Enter a topic to get started'); return }
    setError('')
    setLoading(true)
    setPlan(null)

    try {
      const res = await authFetch('/api/copilot/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to generate plan')
      }
      const data = await res.json()
      setPlan(data.plan)
      setRelatedArticles(data.relatedPastArticles || [])
      // Auto-select first H1 suggestion if available
      if (data.plan?.suggestedH1s?.length > 0) {
        setSelectedH1(0)
        setCustomH1('')
        setIsCustomH1(false)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getChosenH1 = () => {
    if (isCustomH1 && customH1.trim()) return customH1.trim()
    if (selectedH1 !== null && plan?.suggestedH1s?.[selectedH1]) return plan.suggestedH1s[selectedH1].h1
    return topic.trim() // fallback to topic
  }

  const startWriting = () => {
    if (plan) {
      const chosenH1 = getChosenH1()
      // Inject chosen H1 as level-1 at the start of framework
      const frameworkWithH1 = [
        { id: 'h1-title', heading: chosenH1, level: 1, brief: 'Article title (H1)', required: true, wordGuide: '' },
        ...(plan.framework || [])
      ]
      onPlanGenerated({
        topic: topic.trim(),
        plan: { ...plan, framework: frameworkWithH1, chosenH1 },
        relatedArticles
      })
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-sm font-medium mb-4">
          <Sparkles className="w-4 h-4" /> Content Agent
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">What's your topic?</h1>
        <p className="text-gray-500 dark:text-gray-400">Enter a topic name — the AI will suggest enterprise-targeted H1 titles, a framework, and semantic keywords.</p>
      </div>

      {/* Topic input */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && generatePlan()}
            placeholder="e.g., Google Drive to OneDrive migration"
            className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            disabled={loading}
          />
          <button
            onClick={generatePlan}
            disabled={loading || !topic.trim()}
            className="flex items-center gap-2 px-5 py-3 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Generating...' : 'Generate Plan'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Generating your writing plan...</p>
            <p className="text-xs text-gray-500 mt-1">Analyzing topic, checking past articles, building framework & keywords</p>
          </div>
        </div>
      )}

      {/* Plan result */}
      {plan && !loading && (
        <div className="space-y-4">
          {/* Content type & overview */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">Writing Plan</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium">{plan.contentType}</span>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">{plan.searchIntent}</span>
                  {plan.targetAudience && <span className="text-xs text-gray-500 dark:text-gray-400">{plan.targetAudience}</span>}
                </div>
              </div>
            </div>

            {plan.uniqueAngle && (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-1.5 mb-1">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Suggested Unique Angle</span>
                </div>
                <p className="text-sm text-amber-800 dark:text-amber-200">{plan.uniqueAngle}</p>
              </div>
            )}

            {/* Suggested H1s */}
            {plan.suggestedH1s?.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Heading1 className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Choose Your H1 Title</h3>
                  <span className="text-xs text-gray-400">Enterprise-optimized suggestions</span>
                </div>
                <div className="space-y-2">
                  {plan.suggestedH1s.map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => { setSelectedH1(i); setIsCustomH1(false) }}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        selectedH1 === i && !isCustomH1
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-300'
                          : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-gray-50 dark:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          selectedH1 === i && !isCustomH1
                            ? 'border-indigo-500 bg-indigo-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {selectedH1 === i && !isCustomH1 && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${
                            selectedH1 === i && !isCustomH1
                              ? 'text-indigo-700 dark:text-indigo-300'
                              : 'text-gray-900 dark:text-white'
                          }`}>{suggestion.h1}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{suggestion.rationale}</p>
                          {suggestion.icpTargeting && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {suggestion.icpTargeting.estimatedICPTier && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                                  suggestion.icpTargeting.estimatedICPTier === 'Core ICP'
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                    : suggestion.icpTargeting.estimatedICPTier === 'Strong ICP'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                }`}>{suggestion.icpTargeting.estimatedICPTier}</span>
                              )}
                              {suggestion.icpTargeting.buyerPersona && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400">{suggestion.icpTargeting.buyerPersona}</span>
                              )}
                              {suggestion.icpTargeting.technology && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400">{suggestion.icpTargeting.technology}</span>
                              )}
                              {suggestion.icpTargeting.companySize && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400">{suggestion.icpTargeting.companySize}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}

                  {/* Custom H1 option */}
                  <button
                    onClick={() => setIsCustomH1(true)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      isCustomH1
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-300'
                        : 'border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-700 bg-gray-50 dark:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        isCustomH1
                          ? 'border-indigo-500 bg-indigo-500'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {isCustomH1 && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <PenLine className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-sm text-gray-500 dark:text-gray-400">Write my own H1</span>
                    </div>
                  </button>

                  {isCustomH1 && (
                    <input
                      type="text"
                      value={customH1}
                      onChange={e => setCustomH1(e.target.value)}
                      placeholder="Type your custom H1 heading..."
                      className="w-full mt-1 px-4 py-2.5 rounded-lg border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                      autoFocus
                    />
                  )}
                </div>
              </div>
            )}

            {/* Framework sections */}
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Article Framework</h3>
            <div className="space-y-1.5 mb-4">
              {(plan.framework || []).map((section, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    section.level === 1 ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' :
                    section.level === 2 ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' :
                    'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}>H{section.level}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{section.heading}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{section.brief}</p>
                    {section.contentElements?.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {section.contentElements.map((el, j) => {
                          const elementStyles = {
                            'table': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: '📊' },
                            'bullet-list': { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', icon: '•' },
                            'numbered-list': { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300', icon: '1.' },
                            'infographic': { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', icon: '🎨' },
                            'image': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', icon: '🖼' },
                            'comparison-chart': { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300', icon: '⚖️' },
                            'callout-box': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', icon: '💡' },
                            'screenshot': { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', icon: '📸' },
                            'diagram': { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', icon: '🔀' },
                            'stats-highlight': { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', icon: '📈' },
                          };
                          const style = elementStyles[el] || { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400', icon: '📄' };
                          const detail = section.elementDetails?.[j];
                          return (
                            <div key={j} className="flex items-start gap-1.5">
                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${style.bg} ${style.text}`}>
                                {style.icon} {el.replace('-', ' ')}
                              </span>
                              {detail && (
                                <span className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{detail}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {section.wordGuide && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{section.wordGuide}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Semantic Keywords */}
          {plan.semanticKeywords && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <button onClick={() => setShowKeywords(!showKeywords)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-green-500" />
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">Semantic Keywords</span>
                  <span className="text-xs text-gray-500">({
                    (plan.semanticKeywords.secondary?.length || 0) + (plan.semanticKeywords.lsi?.length || 0)
                  } keywords)</span>
                </div>
                {showKeywords ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {showKeywords && (
                <div className="px-6 pb-5 space-y-3">
                  {plan.semanticKeywords.primary && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Primary</p>
                      <span className="inline-block px-3 py-1 text-sm rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium">{plan.semanticKeywords.primary}</span>
                    </div>
                  )}
                  <KeywordGroup label="Secondary" keywords={plan.semanticKeywords.secondary} color="purple" />
                  <KeywordGroup label="LSI / Semantic" keywords={plan.semanticKeywords.lsi} color="green" />
                  <KeywordGroup label="Question Keywords" keywords={plan.semanticKeywords.questions} color="blue" />
                  <KeywordGroup label="Entities" keywords={plan.semanticKeywords.entities} color="gray" />
                </div>
              )}
            </div>
          )}

          {/* Related Past Articles */}
          {relatedArticles.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <button onClick={() => setShowRelated(!showRelated)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-500" />
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">Related Past Articles</span>
                  <span className="text-xs text-gray-500">({relatedArticles.length} found)</span>
                </div>
                {showRelated ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {showRelated && (
                <div className="px-6 pb-5 space-y-2">
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">Avoid duplicating content from these articles. Consider linking to them instead.</p>
                  {relatedArticles.map((article, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                      <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 dark:text-white truncate">{article.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{article.content_type} &middot; {article.primary_keyword || 'No keyword'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Content gaps */}
          {plan.contentGaps?.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                Content Gaps to Fill
              </h3>
              <div className="space-y-1.5">
                {plan.contentGaps.map((gap, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <ArrowRight className="w-3.5 h-3.5 mt-0.5 text-yellow-500 flex-shrink-0" />
                    {gap}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Start writing button */}
          <div className="space-y-2">
            {getChosenH1() !== topic.trim() && (
              <div className="text-center px-4 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800">
                <p className="text-xs text-indigo-500 dark:text-indigo-400 font-medium">Selected H1</p>
                <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">{getChosenH1()}</p>
              </div>
            )}
            <button
              onClick={startWriting}
              disabled={isCustomH1 && !customH1.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRight className="w-5 h-5" />
              Start Writing with This Plan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function KeywordGroup({ label, keywords, color }) {
  if (!keywords || keywords.length === 0) return null
  const colorMap = {
    purple: 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    green: 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
    blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    gray: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
  }
  const cls = colorMap[color] || colorMap.gray

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw, i) => (
          <span key={i} className={`inline-block px-2 py-0.5 text-xs rounded-full border ${cls}`}>{kw}</span>
        ))}
      </div>
    </div>
  )
}
