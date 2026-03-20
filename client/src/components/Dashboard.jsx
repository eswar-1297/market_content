import { Link } from 'react-router-dom'
import {
  CheckCircle2, ArrowRight,
  Bot, Eye, BarChart3, Search, PenTool,
  Radar, GitFork, MessageSquareText, Newspaper,
  FileText, ClipboardCheck
} from 'lucide-react'

const features = [
  {
    to: '/copilot',
    icon: PenTool,
    color: 'purple',
    title: 'Content Agent',
    description: 'Your all-in-one AI writing assistant. Ask it anything — analyze content, get frameworks, keywords, FAQs, fanout queries, Reddit/Quora threads, published articles, G2 testimonials, YouTube videos, and real-time corrections.',
    highlights: [
      'Analyze pasted content (CSABF score + fixes)',
      'Audit any published URL',
      'FAQs + fanout queries in chat',
      'Reddit & Quora thread search',
      'Browse published articles',
      'Article memory & writer profile',
      'Full article generation (CSABF-compliant)',
    ]
  },
]

const agentCapabilities = [
  { icon: Search, label: 'Content Analysis', desc: 'Paste content → CSABF score + fixes' },
  { icon: ClipboardCheck, label: 'Article Audit', desc: 'Paste URL → full audit + FAQ gaps' },
  { icon: GitFork, label: 'Fanout Generator', desc: 'ChatGPT + Gemini fanout queries' },
  { icon: MessageSquareText, label: 'FAQ Generator', desc: 'Reddit, Quora & Google PAA questions' },
  { icon: Radar, label: 'Thread Finder', desc: 'Reddit & Quora community threads' },
  { icon: Newspaper, label: 'Published Articles', desc: 'Browse CloudFuze article library' },
  { icon: FileText, label: 'Content Builder', desc: 'Frameworks, keywords & structure' },
  { icon: PenTool, label: 'Article Generator', desc: 'Full CSABF article from your inputs' },
]

const colorMap = {
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/50',
    icon: 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
    check: 'text-purple-500'
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

      {/* Agent capabilities — tools now merged into Content Agent */}
      <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 p-5">
        <p className="text-sm font-semibold text-purple-700 dark:text-purple-300 mb-3">
          The following tools are now available directly inside the Content Agent — just ask!
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {agentCapabilities.map(cap => (
            <div key={cap.label} className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center flex-shrink-0">
                <cap.icon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">{cap.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{cap.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main feature card */}
      <div>
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
              <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-lg ${colors.icon} flex items-center justify-center flex-shrink-0`}>
                  <feature.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    {feature.title}
                    <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {feature.description}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                    {feature.highlights.map(h => (
                      <div key={h} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <CheckCircle2 className={`w-3.5 h-3.5 ${colors.check} flex-shrink-0`} />
                        {h}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
