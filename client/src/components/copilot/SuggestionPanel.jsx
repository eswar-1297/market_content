import { useState } from 'react'
import { Sparkles, Loader2, AlertTriangle, Info, ChevronDown, ChevronUp, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import ScoreMeter from './ScoreMeter'
import CorrectionCard from './CorrectionCard'
import KeywordTracker from './KeywordTracker'
import FrameworkProgress from './FrameworkProgress'

export default function SuggestionPanel({
  liveAnalysis,
  aiCorrections,
  aiLoading,
  onRequestAI,
  onApplyCorrection,
  onDismissCorrection
}) {
  const [expandedSection, setExpandedSection] = useState('corrections')
  const [dismissedIds, setDismissedIds] = useState(new Set())

  const { issues = [], metrics = {}, wordCount = 0 } = liveAnalysis || {}
  const score = liveAnalysis?.score || liveAnalysis?.metrics?.score || 0

  const corrections = aiCorrections?.corrections || []
  const structureIssues = aiCorrections?.structureIssues || []
  const toneIssues = aiCorrections?.toneIssues || []
  const overallTips = aiCorrections?.overallTips || []
  const missingElements = aiCorrections?.missingElements || []

  const visibleCorrections = corrections.filter((_, i) => !dismissedIds.has(`corr-${i}`))

  const handleDismiss = (idx) => {
    setDismissedIds(prev => new Set([...prev, idx]))
    onDismissCorrection?.()
  }

  const criticalIssues = issues.filter(i => i.severity === 'critical')
  const warningIssues = issues.filter(i => i.severity === 'warning')
  const infoIssues = issues.filter(i => i.severity === 'info')

  const toggle = (section) => {
    setExpandedSection(prev => prev === section ? null : section)
  }

  return (
    <div className="h-full flex flex-col gap-3 overflow-y-auto pr-1">
      {/* Score */}
      <ScoreMeter score={score} categories={liveAnalysis?.categories} />

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Words" value={wordCount} />
        <Stat label="H2s" value={metrics.h2Count || 0} target="4-10" />
        <Stat label="Lists" value={(metrics.bulletListCount || 0) + (metrics.numberedListCount || 0)} target="3+" />
      </div>

      {/* AI Corrections button */}
      <button
        onClick={onRequestAI}
        disabled={aiLoading || wordCount < 50}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {aiLoading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
          : <><Sparkles className="w-4 h-4" /> Get AI Suggestions</>
        }
      </button>

      {/* AI Corrections */}
      {visibleCorrections.length > 0 && (
        <Section title={`AI Corrections (${visibleCorrections.length})`} id="corrections" expanded={expandedSection} onToggle={toggle}>
          <div className="space-y-2">
            {visibleCorrections.map((corr, i) => (
              <CorrectionCard
                key={i}
                correction={corr}
                onApply={onApplyCorrection}
                onDismiss={() => handleDismiss(`corr-${i}`)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Overall Tips */}
      {overallTips.length > 0 && (
        <Section title="Tips" id="tips" expanded={expandedSection} onToggle={toggle}>
          <div className="space-y-1.5">
            {overallTips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">{tip}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Missing Elements */}
      {missingElements.length > 0 && (
        <Section title="Missing Elements" id="missing" expanded={expandedSection} onToggle={toggle}>
          <div className="space-y-1.5">
            {missingElements.map((el, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">{el}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Tone Issues */}
      {toneIssues.length > 0 && (
        <Section title="Tone Issues" id="tone" expanded={expandedSection} onToggle={toggle}>
          <div className="space-y-2">
            {toneIssues.map((issue, i) => (
              <CorrectionCard
                key={i}
                correction={{
                  original: issue.original,
                  corrected: issue.suggestion,
                  reason: `Issue: ${issue.issue}`,
                  type: 'tone',
                  severity: 'warning'
                }}
                onApply={onApplyCorrection}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Readability Metrics */}
      {metrics.readability && wordCount > 50 && (
        <Section title="Readability" id="readability" expanded={expandedSection} onToggle={toggle}>
          <div className="space-y-2">
            <ReadabilityRow
              label="Word complexity"
              value={`${metrics.readability.wordComplexity.pct}% complex`}
              status={metrics.readability.wordComplexity.status}
              tip="Percentage of 3+ syllable words. Aim for under 15%."
            />
            <ReadabilityRow
              label="Transition words"
              value={`${metrics.readability.transitionWords.pct}% of sentences`}
              status={metrics.readability.transitionWords.status === 'low' ? 'bad' : metrics.readability.transitionWords.status === 'good' ? 'good' : 'ok'}
              tip="Use transitions (however, therefore, additionally) for flow. Aim for 20%+."
            />
            <ReadabilityRow
              label="Passive voice"
              value={`${metrics.readability.passiveVoice.pct}%`}
              status={metrics.readability.passiveVoice.status === 'high' ? 'bad' : metrics.readability.passiveVoice.status === 'moderate' ? 'ok' : 'good'}
              tip="Keep passive voice under 10%. Use active voice for clarity."
            />
            <ReadabilityRow
              label="Consecutive sentences"
              value={metrics.readability.consecutiveSentences.max >= 3
                ? `${metrics.readability.consecutiveSentences.max} ${metrics.readability.consecutiveSentences.type} in a row`
                : 'Good variety'}
              status={metrics.readability.consecutiveSentences.status === 'bad' ? 'bad' : metrics.readability.consecutiveSentences.status === 'warning' ? 'ok' : 'good'}
              tip="Vary sentence lengths. Don't write too many short or long sentences in a row."
            />
            <ReadabilityRow
              label="Subheading distribution"
              value={metrics.readability.subheadingDistribution.maxGap > 0
                ? `${metrics.readability.subheadingDistribution.maxGap} words max gap`
                : 'N/A'}
              status={metrics.readability.subheadingDistribution.status === 'bad' ? 'bad' : metrics.readability.subheadingDistribution.status === 'warning' ? 'ok' : 'good'}
              tip="Keep sections under 200 words. Add H3 subheadings to break up long sections."
            />
            <ReadabilityRow
              label="Paragraph length"
              value={`avg ${metrics.readability.paragraphLength.avg} words${metrics.readability.paragraphLength.long > 0 ? `, ${metrics.readability.paragraphLength.long} long` : ''}`}
              status={metrics.readability.paragraphLength.status === 'bad' ? 'bad' : metrics.readability.paragraphLength.status === 'warning' ? 'ok' : 'good'}
              tip="Keep paragraphs under 120 words. Short paragraphs are easier to scan."
            />
            <ReadabilityRow
              label="Sentence length"
              value={`avg ${metrics.readability.sentenceLength.avg} words`}
              status={metrics.readability.sentenceLength.status === 'long' ? 'bad' : metrics.readability.sentenceLength.status === 'short' ? 'ok' : 'good'}
              tip="Aim for 15-20 words per sentence on average."
            />
          </div>
        </Section>
      )}

      {/* Grammar Issues */}
      {metrics.readability?.grammar?.count > 0 && (
        <Section title={`Grammar (${metrics.readability.grammar.count} issue${metrics.readability.grammar.count > 1 ? 's' : ''})`} id="grammar" expanded={expandedSection} onToggle={toggle}>
          <div className="space-y-1.5">
            {metrics.readability.grammar.issues.slice(0, 8).map((gi, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/30">
                <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700 dark:text-red-300">{gi.message}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Keyword Tracker */}
      <KeywordTracker keywordUsage={metrics.keywordUsage} />

      {/* Framework Progress */}
      <FrameworkProgress progress={metrics.frameworkProgress} />

      {/* Live Issues */}
      {(criticalIssues.length > 0 || warningIssues.length > 0) && (
        <Section title={`Live Issues (${criticalIssues.length + warningIssues.length})`} id="live" expanded={expandedSection} onToggle={toggle}>
          <div className="space-y-1.5">
            {[...criticalIssues, ...warningIssues].slice(0, 10).map((issue, i) => (
              <div key={i} className={`flex items-start gap-2 p-2 rounded-lg ${
                issue.severity === 'critical' ? 'bg-red-50 dark:bg-red-950/30' : 'bg-amber-50 dark:bg-amber-950/30'
              }`}>
                <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                  issue.severity === 'critical' ? 'text-red-500' : 'text-amber-500'
                }`} />
                <div>
                  <p className={`text-xs font-medium ${
                    issue.severity === 'critical' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'
                  }`}>{issue.message}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{issue.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ title, id, expanded, onToggle, children }) {
  const isExpanded = expanded === id

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {title}
        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {isExpanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

function Stat({ label, value, target }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-2.5 text-center">
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {label}{target ? ` (${target})` : ''}
      </p>
    </div>
  )
}

function ReadabilityRow({ label, value, status, tip }) {
  const StatusIcon = status === 'good' ? CheckCircle2 : status === 'bad' ? XCircle : MinusCircle
  const statusColor = status === 'good'
    ? 'text-green-500'
    : status === 'bad'
      ? 'text-red-500'
      : 'text-amber-500'
  const bgColor = status === 'good'
    ? 'bg-green-50 dark:bg-green-950/20'
    : status === 'bad'
      ? 'bg-red-50 dark:bg-red-950/20'
      : 'bg-amber-50 dark:bg-amber-950/20'

  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg ${bgColor}`}>
      <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 ${statusColor}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
          <span className={`text-xs font-semibold ${statusColor}`}>{value}</span>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{tip}</p>
      </div>
    </div>
  )
}
