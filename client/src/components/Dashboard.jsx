import { Link } from 'react-router-dom'
import {
  FileText, Search, Settings, CheckCircle2, ArrowRight,
  Bot, Eye, BarChart3, Image, Table, ListChecks, Zap, Shield
} from 'lucide-react'

const features = [
  {
    to: '/framework',
    icon: FileText,
    color: 'indigo',
    title: 'CSABF Content Builder',
    description: 'Build AI-optimized blog content following the CloudFuze Standard AI Blog Framework with section-by-section guidance and structure validation.',
    highlights: ['SEO metadata builder', 'Section structure guidance', 'AI citation optimization', 'CSABF compliance export']
  },
  {
    to: '/analyzer',
    icon: Search,
    color: 'emerald',
    title: 'CSABF Content Analyzer',
    description: 'Paste your content and get instant CSABF compliance scoring, AI citation readiness analysis, and actionable suggestions.',
    highlights: ['CSABF compliance score', 'AI Citation Readiness score', '20+ rule-based checks', 'Section structure audit']
  },
  {
    to: '/settings',
    icon: Settings,
    color: 'amber',
    title: 'AI Settings',
    description: 'Configure OpenAI or Gemini API keys to unlock advanced AI-powered CSABF analysis with specific rewrite suggestions.',
    highlights: ['OpenAI GPT-4 support', 'Google Gemini support', 'CSABF-aware AI prompts', 'Citation optimization feedback']
  }
]

const colorMap = {
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/50',
    icon: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-800',
    check: 'text-indigo-500'
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/50',
    icon: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800',
    check: 'text-emerald-500'
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    icon: 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
    check: 'text-amber-500'
  }
}

const csabfRules = [
  { section: 'Structure', rules: ['No word count rules — structure > length', '1 H1 (8–14 words)', '4–10 H2s (ideal 6–8)', 'H3 subheadings within H2s', 'Only warn if over ~2,500 words'] },
  { section: 'Formatting', rules: ['Max 5 lines per paragraph', 'No paragraph over 120 words', 'At least 2 bullet lists', 'Numbered lists for processes'] },
  { section: 'SEO & Links', rules: ['Platform mentioned 8–12 times', 'Keyword density 1–1.5%', '3–5 internal links', 'Descriptive anchor text'] },
  { section: 'AI Citation', rules: ['Key Takeaways upfront', 'Definition block when relevant', 'Task-oriented content', 'No marketing-heavy tone'] }
]

const coreSections = [
  { name: 'FAQs', words: '4–7 Q&A, concise answers', type: 'core' },
  { name: 'Conclusion', words: 'summary + reinforcement', type: 'core' },
  { name: 'CloudFuze Positioning', words: 'soft positioning', type: 'flexible', note: 'Standalone H2 or embedded in Conclusion' }
]

const contextualSections = [
  { name: 'Key Takeaways', words: 'bullet summary', type: 'contextual', when: 'Recommended for all blogs — AI engines prioritize upfront summaries' },
  { name: 'What is [Topic]', words: 'definition block', type: 'contextual', when: 'When topic needs definition (skip for action-oriented content)' },
  { name: 'Why It Matters', words: 'impacts + bullets', type: 'contextual', when: 'When discussing impacts, risks, compliance' },
  { name: 'Step-by-Step / Methods', words: 'numbered steps', type: 'contextual', when: 'When content describes procedures (can be multiple method sections)' },
  { name: 'Common Issues', words: 'bullet list', type: 'contextual', when: 'When content discusses errors or troubleshooting' },
  { name: 'Best Practices', words: 'tips + suggestions', type: 'contextual', when: 'When content covers recommendations' }
]

export default function Dashboard() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            CloudFuze Standard AI Blog Framework
          </h1>
          <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-medium">
            CSABF
          </span>
        </div>
        <p className="mt-2 text-gray-600 dark:text-gray-400 max-w-2xl">
          Write and optimize content for maximum visibility across AI search engines.
          Designed for AI citation visibility, SEO performance, structural consistency, and scalable content production.
        </p>
      </div>

      {/* AI Engines banner */}
      <div className="flex flex-wrap gap-3">
        {[
          { name: 'ChatGPT', icon: Bot },
          { name: 'Gemini', icon: Eye },
          { name: 'Google AI Overview', icon: BarChart3 },
          { name: 'Perplexity', icon: Search }
        ].map(engine => (
          <span
            key={engine.name}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
              bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300
              border border-gray-200 dark:border-gray-700"
          >
            <engine.icon className="w-3.5 h-3.5" />
            {engine.name}
          </span>
        ))}
      </div>

      {/* Feature cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {features.map(feature => {
          const colors = colorMap[feature.color]
          return (
            <Link
              key={feature.to}
              to={feature.to}
              className={`
                group block rounded-xl border ${colors.border} ${colors.bg}
                p-6 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5
              `}
            >
              <div className={`w-11 h-11 rounded-lg ${colors.icon} flex items-center justify-center mb-4`}>
                <feature.icon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                {feature.title}
                <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {feature.description}
              </p>
              <ul className="space-y-1.5">
                {feature.highlights.map(h => (
                  <li key={h} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <CheckCircle2 className={`w-3.5 h-3.5 ${colors.check} flex-shrink-0`} />
                    {h}
                  </li>
                ))}
              </ul>
            </Link>
          )
        })}
      </div>

      {/* CSABF Rules Grid */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          CSABF Non-Negotiable Rules
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Every blog post must pass these validation checks for full framework compliance.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {csabfRules.map((group, gi) => (
            <div key={gi} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                {gi === 0 && <FileText className="w-4 h-4 text-indigo-500" />}
                {gi === 1 && <ListChecks className="w-4 h-4 text-emerald-500" />}
                {gi === 2 && <Search className="w-4 h-4 text-amber-500" />}
                {gi === 3 && <Zap className="w-4 h-4 text-purple-500" />}
                {group.section}
              </h3>
              <ul className="space-y-1.5">
                {group.rules.map((r, ri) => (
                  <li key={ri} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <CheckCircle2 className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* CSABF Sections */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          H2 Sections (Core + Contextual)
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Core sections are always required. Contextual sections are suggested based on what the content is about.
        </p>

        <h3 className="text-xs uppercase tracking-wider font-semibold text-green-600 dark:text-green-400 mb-2">Core (Always Required)</h3>
        <div className="grid gap-2 sm:grid-cols-2 mb-4">
          {coreSections.map((s, i) => (
            <div
              key={i}
              className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 ${
                s.type === 'flexible'
                  ? 'bg-blue-50 dark:bg-blue-900/20'
                  : 'bg-green-50 dark:bg-green-900/20'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  s.type === 'flexible'
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                    : 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400'
                }`}>
                  {i + 1}
                </span>
                <span>{s.name} <span className="text-gray-400">({s.words})</span></span>
              </div>
              {s.note && <span className="text-xs text-gray-400 dark:text-gray-500 ml-9">{s.note}</span>}
            </div>
          ))}
        </div>

        <h3 className="text-xs uppercase tracking-wider font-semibold text-amber-600 dark:text-amber-400 mb-2">Contextual (Suggested When Relevant)</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {contextualSections.map((s, i) => (
            <div
              key={i}
              className="flex flex-col gap-1 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/15 text-sm text-gray-700 dark:text-gray-300"
            >
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400
                  flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  ?
                </span>
                <span>{s.name} <span className="text-gray-400">({s.words})</span></span>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-7">{s.when}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Schema + AI Citation */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-500" />
            Schema Requirements
          </h2>
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-sm text-green-700 dark:text-green-300">
              <CheckCircle2 className="w-4 h-4" /> Article schema (mandatory)
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-sm text-green-700 dark:text-green-300">
              <CheckCircle2 className="w-4 h-4" /> FAQ schema (mandatory)
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-300">
              <Zap className="w-4 h-4" /> HowTo schema (optional, if procedural)
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Zap className="w-5 h-5 text-purple-500" />
            AI-Citation Optimization
          </h2>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p>Content must be optimized for AI engines to extract, cite, and display:</p>
            <ul className="space-y-1.5 mt-2">
              {[
                'Clear 40–60 word definition block',
                'Structured numbered steps',
                'Bullet summaries for key points',
                'Task-oriented throughout',
                'No marketing-heavy tone',
                'No generic thought leadership'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="w-3 h-3 text-purple-500 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
