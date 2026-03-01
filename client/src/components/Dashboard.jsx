import { Link } from 'react-router-dom'
import {
  FileText, Search, Settings, CheckCircle2, ArrowRight,
  Bot, Eye, BarChart3, MessageSquareText, Radar, GitFork, Newspaper, Mail
} from 'lucide-react'

const features = [
  {
    to: '/fanout',
    icon: GitFork,
    color: 'amber',
    title: 'Fanout Generator',
    description: 'Generate search query variations using ChatGPT, Gemini, or both for comprehensive keyword coverage.',
    highlights: ['ChatGPT & Gemini support', 'Combined best-of-both mode', 'Domain-specific queries', 'Category classification']
  },
  {
    to: '/faq-generator',
    icon: MessageSquareText,
    color: 'violet',
    title: 'FAQ Generator',
    description: 'Generate FAQs and semantic keywords from existing article URLs or new article titles using real question sources.',
    highlights: ['Reddit & Quora questions', 'Google PAA discovery', 'JSON-LD schema output', 'Semantic keywords for new articles']
  },
  {
    to: '/thread-finder',
    icon: Radar,
    color: 'cyan',
    title: 'Thread Finder',
    description: 'Discover Reddit and Quora threads where your brand can be mentioned for increased AI visibility.',
    highlights: ['Multi-source search', 'AI cross-referencing', 'Brand mention detection', 'Visibility scoring']
  },
  {
    to: '/analyzer',
    icon: Search,
    color: 'emerald',
    title: 'Content Analyzer',
    description: 'Paste your content and get instant CSABF compliance scoring, AI citation readiness analysis, and actionable suggestions.',
    highlights: ['CSABF compliance score', 'AI Citation Readiness score', '20+ rule-based checks', 'Section structure audit']
  },
  {
    to: '/framework',
    icon: FileText,
    color: 'indigo',
    title: 'Content Builder',
    description: 'Build AI-optimized blog content following the CloudFuze Standard AI Blog Framework with section-by-section guidance and structure validation.',
    highlights: ['SEO metadata builder', 'Section structure guidance', 'AI citation optimization', 'CSABF compliance export']
  },
  {
    to: '/articles',
    icon: Newspaper,
    color: 'rose',
    title: 'Articles',
    description: 'Browse all published CloudFuze articles by author and time period with real-time data from the website.',
    highlights: ['Filter by author', 'Time period filtering', 'Auto-refreshing cache', 'Direct article links']
  },
  {
    to: '/email',
    icon: Mail,
    color: 'sky',
    title: 'Email Marketing',
    description: 'Create email campaigns, manage contacts, send bulk emails via SendGrid, and track opens and clicks.',
    highlights: ['Template builder', 'Bulk contact import', 'Open & click tracking', 'Campaign analytics']
  },
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
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-950/50',
    icon: 'bg-violet-100 dark:bg-violet-900 text-violet-600 dark:text-violet-400',
    border: 'border-violet-200 dark:border-violet-800',
    check: 'text-violet-500'
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-950/50',
    icon: 'bg-cyan-100 dark:bg-cyan-900 text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-200 dark:border-cyan-800',
    check: 'text-cyan-500'
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    icon: 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
    check: 'text-amber-500'
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-950/50',
    icon: 'bg-rose-100 dark:bg-rose-900 text-rose-600 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-800',
    check: 'text-rose-500'
  },
  sky: {
    bg: 'bg-sky-50 dark:bg-sky-950/50',
    icon: 'bg-sky-100 dark:bg-sky-900 text-sky-600 dark:text-sky-400',
    border: 'border-sky-200 dark:border-sky-800',
    check: 'text-sky-500'
  },
}

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
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
    </div>
  )
}
