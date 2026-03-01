import { useState, useCallback, useEffect, useRef } from 'react'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import {
  CheckCircle2, Circle, Info, ChevronDown, ChevronRight, ChevronUp,
  Plus, Trash2, Copy, Download, AlertTriangle, Lightbulb,
  Target, FileText, Save, RotateCcw, ListChecks, Search, Zap, Shield, BookOpen
} from 'lucide-react'
import { GUIDELINES, CSABF_SECTIONS, CSABF_FORMATTING_RULES, CSABF_WORD_COUNT, SEO_METADATA, CSABF_LINKING_RULES, QUESTION_STARTERS } from '../utils/constants'

const AUTOSAVE_KEY = 'csabf-builder-draft'
const AUTOSAVE_DELAY = 2000 // 2 seconds debounce

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

// Helper to get section warnMax from constants (no strict min/max)
function getSectionWarnMax(sectionId) {
  const section = CSABF_SECTIONS.find(s => s.id === sectionId)
  return section?.warnMax || null
}

// ─── CSABF Step Definitions ─────────────────────────────────────────────────

const STEPS = [
  { id: 'seo_metadata', guidelineId: 'seo_metadata', title: 'SEO Metadata', required: true },
  { id: 'h1', guidelineId: 'h1', title: 'H1 — Primary Intent Keyword', required: true },
  { id: 'introduction', guidelineId: 'introduction', title: 'Introduction', required: true },
  { id: 'key_takeaways', guidelineId: 'key_takeaways', title: 'Key Takeaways', contextual: true, hint: 'Recommended — AI engines prioritize upfront summaries' },
  { id: 'what_is', guidelineId: 'what_is', title: 'What is [Topic]', contextual: true, hint: 'Add when topic needs definition' },
  { id: 'why_it_matters', guidelineId: 'why_it_matters', title: 'Why It Matters', contextual: true, hint: 'Add when discussing impacts or risks' },
  { id: 'step_by_step', guidelineId: 'step_by_step', title: 'Step-by-Step / Methods', contextual: true, hint: 'Add when content is procedural' },
  { id: 'common_issues', guidelineId: 'common_issues', title: 'Common Issues / Limitations', contextual: true, hint: 'Add when discussing errors or troubleshooting' },
  { id: 'best_practices', guidelineId: 'best_practices', title: 'Best Practices', contextual: true, hint: 'Add when covering recommendations' },
  { id: 'custom_body', guidelineId: null, title: 'Custom Body Content', contextual: true, hint: 'Free-form body — use when predefined sections don\'t fit your topic' },
  { id: 'faqs', guidelineId: 'faqs', title: 'FAQs', required: true },
  { id: 'cloudfuze_helps', guidelineId: 'cloudfuze_helps', title: 'CloudFuze Positioning', contextual: true, hint: 'Standalone section or embed in Conclusion' },
  { id: 'conclusion', guidelineId: 'conclusion', title: 'Conclusion', required: true },
  { id: 'links', guidelineId: 'internal_links', title: 'Internal Links', required: true },
  { id: 'checklist', guidelineId: null, title: 'Final CSABF Checklist', required: true },
]

function countWords(text) {
  if (!text) return 0
  return text.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(w => w.length > 0).length
}

function countSentences(text) {
  if (!text) return 0
  const cleaned = text.replace(/([.?!])\s*([A-Z"])/g, '$1|$2')
  return cleaned.split('|').filter(s => s.trim().length > 5).length || 1
}

export default function ContentFramework() {
  const [activeStep, setActiveStep] = useState(0)
  const [expandedTip, setExpandedTip] = useState(null)
  const [showGuide, setShowGuide] = useState(false)

  // Track which contextual sections the user has enabled
  const [enabledSections, setEnabledSections] = useState({
    key_takeaways: true,    // recommended by default
    what_is: false,
    why_it_matters: false,
    step_by_step: false,
    common_issues: false,
    best_practices: false,
    custom_body: false,      // free-form body content
    cloudfuze_helps: false,  // can merge into conclusion
  })

  const toggleSection = (id) => {
    setEnabledSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // SEO Metadata
  const [titleTag, setTitleTag] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [urlSlug, setUrlSlug] = useState('')

  // H1
  const [h1Text, setH1Text] = useState('')

  // Content sections
  const [introduction, setIntroduction] = useState('')
  const [keyTakeaways, setKeyTakeaways] = useState('')
  const [whatIs, setWhatIs] = useState('')
  const [whyItMatters, setWhyItMatters] = useState('')
  const [stepByStep, setStepByStep] = useState('')
  const [commonIssues, setCommonIssues] = useState('')
  const [bestPractices, setBestPractices] = useState('')
  const [customBody, setCustomBody] = useState('')
  const [cloudfuzeHelps, setCloudfuzeHelps] = useState('')
  const [conclusion, setConclusion] = useState('')

  // FAQs (4-7)
  const [faqs, setFaqs] = useState([
    { question: '', answer: '' },
    { question: '', answer: '' },
    { question: '', answer: '' },
    { question: '', answer: '' },
  ])

  // Internal Links
  const [links, setLinks] = useState([
    { anchor: '', url: '', type: 'migration' },
    { anchor: '', url: '', type: 'comparison' },
    { anchor: '', url: '', type: 'other' },
  ])

  // ─── Auto-Save / Load Draft ──────────────────────────────────────────────

  const [saveStatus, setSaveStatus] = useState('') // '', 'saving', 'saved'
  const saveTimerRef = useRef(null)

  // Collect all state into one object for saving
  const getDraftData = useCallback(() => ({
    enabledSections, titleTag, metaDescription, urlSlug, h1Text,
    introduction, keyTakeaways, whatIs, whyItMatters, stepByStep,
    commonIssues, bestPractices, customBody, cloudfuzeHelps, conclusion,
    faqs, links, activeStep
  }), [enabledSections, titleTag, metaDescription, urlSlug, h1Text,
    introduction, keyTakeaways, whatIs, whyItMatters, stepByStep,
    commonIssues, bestPractices, customBody, cloudfuzeHelps, conclusion,
    faqs, links, activeStep])

  // Auto-save with debounce
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try {
        const data = getDraftData()
        // Only save if there's actually some content
        const hasContent = h1Text || introduction || whatIs || stepByStep || conclusion || keyTakeaways || customBody ||
          faqs.some(f => f.question.trim() || f.answer.trim())
        if (hasContent) {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() }))
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus(''), 3000)
        }
      } catch (e) {
        console.warn('Auto-save failed:', e)
      }
    }, AUTOSAVE_DELAY)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [getDraftData, h1Text, introduction, whatIs, stepByStep, conclusion, keyTakeaways, customBody, faqs])

  // Load draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        if (data.enabledSections) setEnabledSections(data.enabledSections)
        if (data.titleTag) setTitleTag(data.titleTag)
        if (data.metaDescription) setMetaDescription(data.metaDescription)
        if (data.urlSlug) setUrlSlug(data.urlSlug)
        if (data.h1Text) setH1Text(data.h1Text)
        if (data.introduction) setIntroduction(data.introduction)
        if (data.keyTakeaways) setKeyTakeaways(data.keyTakeaways)
        if (data.whatIs) setWhatIs(data.whatIs)
        if (data.whyItMatters) setWhyItMatters(data.whyItMatters)
        if (data.stepByStep) setStepByStep(data.stepByStep)
        if (data.commonIssues) setCommonIssues(data.commonIssues)
        if (data.bestPractices) setBestPractices(data.bestPractices)
        if (data.customBody) setCustomBody(data.customBody)
        if (data.cloudfuzeHelps) setCloudfuzeHelps(data.cloudfuzeHelps)
        if (data.conclusion) setConclusion(data.conclusion)
        if (data.faqs && data.faqs.length > 0) setFaqs(data.faqs)
        if (data.links && data.links.length > 0) setLinks(data.links)
        if (typeof data.activeStep === 'number') setActiveStep(data.activeStep)
      }
    } catch (e) {
      console.warn('Failed to load draft:', e)
    }
  }, [])

  const clearDraft = () => {
    if (window.confirm('Clear all content and start fresh? This cannot be undone.')) {
      localStorage.removeItem(AUTOSAVE_KEY)
      setEnabledSections({ key_takeaways: true, what_is: false, why_it_matters: false, step_by_step: false, common_issues: false, best_practices: false, custom_body: false, cloudfuze_helps: false })
      setTitleTag(''); setMetaDescription(''); setUrlSlug(''); setH1Text('')
      setIntroduction(''); setKeyTakeaways(''); setWhatIs(''); setWhyItMatters('')
      setStepByStep(''); setCommonIssues(''); setBestPractices(''); setCustomBody('')
      setCloudfuzeHelps(''); setConclusion('')
      setFaqs([{ question: '', answer: '' }, { question: '', answer: '' }, { question: '', answer: '' }, { question: '', answer: '' }])
      setLinks([{ anchor: '', url: '', type: 'migration' }, { anchor: '', url: '', type: 'comparison' }, { anchor: '', url: '', type: 'other' }])
      setActiveStep(0)
    }
  }

  const getLastSavedTime = () => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        if (data.savedAt) {
          const date = new Date(data.savedAt)
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      }
    } catch { /* ignore */ }
    return null
  }

  const getGuideline = (id) => GUIDELINES.find(g => g.id === id)
  const getSection = (id) => CSABF_SECTIONS.find(s => s.id === id)

  // Word count helper for rich text editors
  const wcRich = (html) => countWords(html)

  // ─── Validation (structure-first, no strict word counts) ────────────────

  const getStepStatus = (stepId) => {
    // Contextual sections pass if disabled (skipped) by the user
    const step = STEPS.find(s => s.id === stepId)
    if (step?.contextual && !enabledSections[stepId]) return true  // skipped = pass

    // Helper: just check content exists (no strict word counts)
    const hasContent = (content) => wcRich(content) > 0

    switch (stepId) {
      case 'seo_metadata': {
        const { titleTag: tt, metaDescription: md, urlSlug: us } = SEO_METADATA
        const titleOk = titleTag.length >= tt.minLength && titleTag.length <= tt.maxLength
        const descOk = metaDescription.length >= md.minLength && metaDescription.length <= md.maxLength
        const slugOk = urlSlug.length > 0 && urlSlug.length <= us.maxLength
        return titleOk && descOk && slugOk
      }
      case 'h1': {
        // H1 keeps structural word count (it's a heading, not body content)
        const section = getSection('h1')
        const wc = countWords(h1Text)
        return section?.wordCount ? wc >= section.wordCount.min && wc <= section.wordCount.max : wc > 0
      }
      case 'introduction':
        return hasContent(introduction)
      case 'key_takeaways':
        return wcRich(keyTakeaways) > 0
      case 'what_is':
        return hasContent(whatIs)
      case 'why_it_matters':
        return hasContent(whyItMatters)
      case 'step_by_step':
        return hasContent(stepByStep)
      case 'common_issues':
        return hasContent(commonIssues)
      case 'best_practices':
        return hasContent(bestPractices)
      case 'custom_body':
        return wcRich(customBody) > 0
      case 'faqs': {
        const validFaqs = faqs.filter(f => f.question.trim() && f.answer.trim())
        return validFaqs.length >= 4
      }
      case 'cloudfuze_helps':
        return hasContent(cloudfuzeHelps)
      case 'conclusion':
        return hasContent(conclusion)
      case 'links': {
        const validLinks = links.filter(l => l.anchor.trim() && l.url.trim())
        return validLinks.length >= CSABF_LINKING_RULES.totalLinks.min
      }
      case 'checklist':
        return STEPS.slice(0, -1).every(s => getStepStatus(s.id))
      default: return false
    }
  }

  const completedSteps = STEPS.filter(s => getStepStatus(s.id)).length
  const totalSteps = STEPS.length

  // Total word count across all sections
  const getTotalWordCount = () => {
    let total = countWords(h1Text) + wcRich(introduction) + wcRich(conclusion) +
      faqs.reduce((sum, f) => sum + countWords(f.question) + countWords(f.answer), 0)
    // Only count contextual sections that are enabled
    if (enabledSections.key_takeaways) total += wcRich(keyTakeaways)
    if (enabledSections.what_is) total += wcRich(whatIs)
    if (enabledSections.why_it_matters) total += wcRich(whyItMatters)
    if (enabledSections.step_by_step) total += wcRich(stepByStep)
    if (enabledSections.common_issues) total += wcRich(commonIssues)
    if (enabledSections.best_practices) total += wcRich(bestPractices)
    if (enabledSections.custom_body) total += wcRich(customBody)
    if (enabledSections.cloudfuze_helps) total += wcRich(cloudfuzeHelps)
    return total
  }

  // ─── Generate Document ───────────────────────────────────────────────────

  const generateDocument = useCallback(() => {
    const stripHtml = (html) => html.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

    let doc = ''
    doc += `# ${h1Text}\n\n`
    doc += `${stripHtml(introduction)}\n\n`

    // Key Takeaways (contextual)
    if (enabledSections.key_takeaways && keyTakeaways.trim()) {
      doc += `## Key Takeaways\n\n${stripHtml(keyTakeaways)}\n\n`
    }

    // What is [Topic] (contextual)
    if (enabledSections.what_is && whatIs.trim()) {
      doc += `## What is ${h1Text.split(/\s+/).slice(0, 3).join(' ')}?\n\n${stripHtml(whatIs)}\n\n`
    }

    // Why It Matters (contextual)
    if (enabledSections.why_it_matters && whyItMatters.trim()) {
      doc += `## Why It Matters\n\n${stripHtml(whyItMatters)}\n\n`
    }

    // Step-by-Step / Methods (contextual)
    if (enabledSections.step_by_step && stepByStep.trim()) {
      doc += `## Step-by-Step Process\n\n${stripHtml(stepByStep)}\n\n`
    }

    // Common Issues (contextual)
    if (enabledSections.common_issues && commonIssues.trim()) {
      doc += `## Common Issues and Limitations\n\n${stripHtml(commonIssues)}\n\n`
    }

    // Best Practices (contextual)
    if (enabledSections.best_practices && bestPractices.trim()) {
      doc += `## Best Practices\n\n${stripHtml(bestPractices)}\n\n`
    }

    // Custom Body Content (contextual)
    if (enabledSections.custom_body && customBody.trim()) {
      doc += `${stripHtml(customBody)}\n\n`
    }

    // FAQs (required)
    const validFaqs = faqs.filter(f => f.question.trim() && f.answer.trim())
    if (validFaqs.length > 0) {
      doc += `## Frequently Asked Questions\n\n`
      validFaqs.forEach(f => {
        doc += `### ${f.question}\n\n${f.answer}\n\n`
      })
    }

    // CloudFuze Positioning (contextual — standalone)
    if (enabledSections.cloudfuze_helps && cloudfuzeHelps.trim()) {
      doc += `## How CloudFuze Helps\n\n${stripHtml(cloudfuzeHelps)}\n\n`
    }

    // Conclusion (required)
    doc += `## Conclusion\n\n${stripHtml(conclusion)}\n\n`

    // Links
    const validLinks = links.filter(l => l.anchor.trim() && l.url.trim())
    if (validLinks.length > 0) {
      doc += `## Related Resources\n\n`
      validLinks.forEach(l => {
        doc += `- [${l.anchor}](${l.url})\n`
      })
      doc += '\n'
    }

    // SEO Metadata block
    doc += `---\n\n`
    doc += `**SEO Metadata:**\n`
    doc += `- Title Tag: ${titleTag}\n`
    doc += `- Meta Description: ${metaDescription}\n`
    doc += `- URL Slug: ${urlSlug}\n`
    doc += `\n---\n`
    doc += `Total Word Count: ~${getTotalWordCount()}\n`

    return doc
  }, [h1Text, introduction, keyTakeaways, whatIs, whyItMatters, stepByStep, commonIssues, bestPractices, customBody, faqs, cloudfuzeHelps, conclusion, links, titleTag, metaDescription, urlSlug, enabledSections])

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateDocument())
  }

  const downloadMarkdown = () => {
    const blob = new Blob([generateDocument()], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const slugName = urlSlug || 'csabf-content'
    a.download = `${slugName}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Quill Module Config ─────────────────────────────────────────────────

  const quillModules = {
    toolbar: [
      [{ header: [3, false] }],
      ['bold', 'italic'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link'],
      ['clean']
    ]
  }

  // Full toolbar for custom body section — includes H2, H3, blockquote, images
  const quillModulesFull = {
    toolbar: [
      [{ header: [2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['blockquote'],
      ['link', 'image'],
      ['clean']
    ]
  }

  // ─── Word Count Badge (informational — only warns on max) ──────────────

  const WordCountBadge = ({ current }) => {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
        <span>{current} words</span>
      </div>
    )
  }

  // ─── Section Editor ──────────────────────────────────────────────────────

  const SectionEditor = ({ value, onChange, placeholder, section }) => {
    const wc = wcRich(value)
    return (
      <div className="space-y-2">
        <ReactQuill
          value={value}
          onChange={onChange}
          theme="snow"
          placeholder={placeholder}
          modules={quillModules}
        />
        <div className="flex items-center justify-between">
          <WordCountBadge current={wc} />
        </div>
      </div>
    )
  }

  // ─── Render Step Content ─────────────────────────────────────────────────

  const renderStepContent = (step) => {
    const guideline = step.guidelineId ? getGuideline(step.guidelineId) : null
    const section = getSection(step.id)

    switch (step.id) {
      case 'seo_metadata':
        return (
          <div className="space-y-5">
            {guideline && <GuidelineTip guideline={guideline} expanded={expandedTip === step.id} onToggle={() => setExpandedTip(expandedTip === step.id ? null : step.id)} />}

            {/* Title Tag */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Title Tag <span className="text-gray-400">(55–60 characters)</span>
              </label>
              <input
                type="text"
                value={titleTag}
                onChange={e => setTitleTag(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                placeholder="Primary Keyword + Platform | Short Modifier"
                maxLength={70}
              />
              <div className="flex justify-between mt-1">
                <p className="text-xs text-gray-500">Formula: Primary Keyword + Platform | Short Modifier</p>
                <p className={`text-xs font-medium ${titleTag.length >= 55 && titleTag.length <= 60 ? 'text-green-500' : 'text-red-500'}`}>
                  {titleTag.length}/60 chars
                </p>
              </div>
            </div>

            {/* Meta Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Meta Description <span className="text-gray-400">(140–160 characters)</span>
              </label>
              <textarea
                value={metaDescription}
                onChange={e => setMetaDescription(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none"
                rows={3}
                placeholder="Problem statement + Actionable promise + Platform mention"
                maxLength={170}
              />
              <div className="flex justify-between mt-1">
                <p className="text-xs text-gray-500">Structure: Problem → Promise → Platform</p>
                <p className={`text-xs font-medium ${metaDescription.length >= 140 && metaDescription.length <= 160 ? 'text-green-500' : 'text-red-500'}`}>
                  {metaDescription.length}/160 chars
                </p>
              </div>
            </div>

            {/* URL Slug */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                URL Slug <span className="text-gray-400">(under 60 characters)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">cloudfuze.com/blog/</span>
                <input
                  type="text"
                  value={urlSlug}
                  onChange={e => setUrlSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-'))}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="primary-keyword-platform"
                  maxLength={60}
                />
              </div>
              <p className={`text-xs mt-1 ${urlSlug.length > 0 && urlSlug.length <= 60 ? 'text-green-500' : 'text-gray-500'}`}>
                {urlSlug.length}/60 chars — Hyphen separated, no stop words
              </p>
            </div>
          </div>
        )

      case 'h1':
        return (
          <div className="space-y-4">
            {guideline && <GuidelineTip guideline={guideline} expanded={expandedTip === step.id} onToggle={() => setExpandedTip(expandedTip === step.id ? null : step.id)} />}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                H1 — Primary Intent Keyword <span className="text-gray-400">(8–14 words)</span>
              </label>
              <input
                type="text"
                value={h1Text}
                onChange={e => setH1Text(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-lg font-semibold"
                placeholder="How to Migrate Google Drive to OneDrive for Business"
              />
              <div className="flex items-center justify-between mt-2">
                {/* H1 keeps structural word count (8-14 words for heading clarity) */}
                {(() => {
                  const wc = countWords(h1Text)
                  const ok = wc >= 8 && wc <= 14
                  return (
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${ok ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                      <span>{wc}/8–14 words</span>
                      {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    </div>
                  )
                })()}
                <div className="flex gap-2">
                  {section && section.rules && section.rules.map((r, i) => (
                    <span key={i} className="text-xs text-gray-400">{r}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )

      case 'introduction':
        return (
          <div className="space-y-4">
            {guideline && <GuidelineTip guideline={guideline} expanded={expandedTip === step.id} onToggle={() => setExpandedTip(expandedTip === step.id ? null : step.id)} />}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-xs space-y-1.5">
              <p className="font-medium text-indigo-700 dark:text-indigo-300">How to write for AI visibility:</p>
              <p className="text-indigo-600 dark:text-indigo-400">1. <strong>Open with the problem</strong> — AI engines match user queries to problem statements. State the problem clearly in the first sentence.</p>
              <p className="text-indigo-600 dark:text-indigo-400">2. <strong>State why it matters</strong> — Give context on impact. AI engines cite content that explains relevance.</p>
              <p className="text-indigo-600 dark:text-indigo-400">3. <strong>Preview the content</strong> — Tell readers what this article covers. AI engines use this to understand article scope.</p>
              <p className="text-indigo-600 dark:text-indigo-400 mt-1">Keep paragraphs short (3-4 lines). Direct, no storytelling. AI engines extract short, clear paragraphs as snippets.</p>
            </div>
            <SectionEditor value={introduction} onChange={setIntroduction} placeholder="Start with the problem context..." section={section} />
          </div>
        )

      case 'key_takeaways':
        return (
          <div className="space-y-4">
            <ContextualBanner step={step} enabled={enabledSections.key_takeaways} onToggle={() => toggleSection('key_takeaways')} />
            {enabledSections.key_takeaways && (
              <>
                {guideline && <GuidelineTip guideline={guideline} expanded={expandedTip === step.id} onToggle={() => setExpandedTip(expandedTip === step.id ? null : step.id)} />}
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-xs space-y-1.5">
                  <p className="font-medium text-indigo-700 dark:text-indigo-300">How to write for AI visibility:</p>
                  <p className="text-indigo-600 dark:text-indigo-400">1. <strong>Use 3-6 bullet points</strong> — Each bullet should be a standalone insight. AI engines extract these as quick-answer snippets.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">2. <strong>Front-load the value</strong> — Start each bullet with the key point, not context. "CloudFuze automates migration..." not "When it comes to migration..."</p>
                  <p className="text-indigo-600 dark:text-indigo-400">3. <strong>Make each bullet self-contained</strong> — A reader (or AI engine) should understand each point without reading the full article.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">This is the highest-value section for AI citation — AI engines LOVE upfront summaries they can extract directly.</p>
                </div>
                <SectionEditor value={keyTakeaways} onChange={setKeyTakeaways} placeholder="- Key insight 1&#10;- Key insight 2&#10;- Key insight 3" section={section} />
              </>
            )}
          </div>
        )

      case 'what_is':
        return (
          <div className="space-y-4">
            <ContextualBanner step={step} enabled={enabledSections.what_is} onToggle={() => toggleSection('what_is')} />
            {enabledSections.what_is && (
              <>
                {guideline && <GuidelineTip guideline={guideline} expanded={expandedTip === step.id} onToggle={() => setExpandedTip(expandedTip === step.id ? null : step.id)} />}
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-xs space-y-1.5">
                  <p className="font-medium text-indigo-700 dark:text-indigo-300">How to write for AI visibility:</p>
                  <p className="text-indigo-600 dark:text-indigo-400">1. <strong>Lead with a clear definition</strong> — Start with "[Topic] is..." or "[Topic] refers to...". AI engines extract the first 1-2 sentences as the definition snippet.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">2. <strong>Keep the definition upfront</strong> — Don't bury it after an intro paragraph. The definition should be the very first thing.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">3. <strong>Follow with context</strong> — After the definition, explain why it matters or how it works. Use short paragraphs.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">This is the #1 section AI engines cite for "What is..." queries.</p>
                </div>
                <SectionEditor value={whatIs} onChange={setWhatIs} placeholder="[Topic] is the process of..." section={section} />
              </>
            )}
          </div>
        )

      case 'why_it_matters':
        return (
          <div className="space-y-4">
            <ContextualBanner step={step} enabled={enabledSections.why_it_matters} onToggle={() => toggleSection('why_it_matters')} />
            {enabledSections.why_it_matters && (
              <>
                {guideline && <GuidelineTip guideline={guideline} expanded={expandedTip === step.id} onToggle={() => setExpandedTip(expandedTip === step.id ? null : step.id)} />}
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-xs space-y-1.5">
                  <p className="font-medium text-indigo-700 dark:text-indigo-300">How to write for AI visibility:</p>
                  <p className="text-indigo-600 dark:text-indigo-400">1. <strong>Start with a 1-sentence hook</strong> — "Understanding [topic] is critical because..." AI engines extract the opening line for context.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">2. <strong>Use bullet points for impacts</strong> — List security, operational, and business impacts. AI engines love extractable bullet lists.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">3. <strong>Be specific, not generic</strong> — Instead of "it saves money", say "reduces SaaS costs by eliminating unused licenses." Specific claims get cited.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">This section answers "Why should I care?" — a common AI search follow-up query.</p>
                </div>
                <SectionEditor value={whyItMatters} onChange={setWhyItMatters} placeholder="Start with a brief intro, then list impacts as bullet points..." section={section} />
              </>
            )}
          </div>
        )

      case 'step_by_step':
        return (
          <div className="space-y-4">
            <ContextualBanner step={step} enabled={enabledSections.step_by_step} onToggle={() => toggleSection('step_by_step')} />
            {enabledSections.step_by_step && (
              <>
                {guideline && <GuidelineTip guideline={guideline} expanded={expandedTip === step.id} onToggle={() => setExpandedTip(expandedTip === step.id ? null : step.id)} />}
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-xs space-y-1.5">
                  <p className="font-medium text-indigo-700 dark:text-indigo-300">How to write for AI visibility:</p>
                  <p className="text-indigo-600 dark:text-indigo-400">1. <strong>Use numbered steps</strong> — AI engines parse numbered lists as step-by-step instructions and cite them directly in "How to..." answers.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">2. <strong>Start each step with an action verb</strong> — "Navigate to...", "Click on...", "Select...". Clear UI language makes steps extractable.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">3. <strong>Keep steps concise</strong> — Each step should be a short, standalone instruction. AI engines can't cite a wall of text.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">4. <strong>Can split into methods</strong> — Multiple approach sections (Method 1, Method 2) work well for "best way to..." queries.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">Procedural content with clear numbered steps triggers HowTo schema — a major AI visibility boost.</p>
                </div>
                <SectionEditor value={stepByStep} onChange={setStepByStep} placeholder="1. Log in to your admin console and navigate to..." section={section} />
              </>
            )}
          </div>
        )

      case 'common_issues':
        return (
          <div className="space-y-4">
            <ContextualBanner step={step} enabled={enabledSections.common_issues} onToggle={() => toggleSection('common_issues')} />
            {enabledSections.common_issues && (
              <>
                {guideline && <GuidelineTip guideline={guideline} expanded={expandedTip === step.id} onToggle={() => setExpandedTip(expandedTip === step.id ? null : step.id)} />}
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-xs space-y-1.5">
                  <p className="font-medium text-indigo-700 dark:text-indigo-300">How to write for AI visibility:</p>
                  <p className="text-indigo-600 dark:text-indigo-400">1. <strong>Use bullet list format</strong> — Each issue as a bold title + 1-2 sentence explanation. AI engines extract individual bullet items as answers.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">2. <strong>Name the issue specifically</strong> — "Permission denied errors" is better than "Access problems". Specific names match real user search queries.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">3. <strong>Include solutions inline</strong> — For each issue, briefly mention the fix. AI engines cite problem + solution pairs together.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">This section captures troubleshooting queries like "Why can't I..." and "[topic] not working".</p>
                </div>
                <SectionEditor value={commonIssues} onChange={setCommonIssues} placeholder="List common issues users face..." section={section} />
              </>
            )}
          </div>
        )

      case 'best_practices':
        return (
          <div className="space-y-4">
            <ContextualBanner step={step} enabled={enabledSections.best_practices} onToggle={() => toggleSection('best_practices')} />
            {enabledSections.best_practices && (
              <>
                {guideline && <GuidelineTip guideline={guideline} expanded={expandedTip === step.id} onToggle={() => setExpandedTip(expandedTip === step.id ? null : step.id)} />}
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-xs space-y-1.5">
                  <p className="font-medium text-indigo-700 dark:text-indigo-300">How to write for AI visibility:</p>
                  <p className="text-indigo-600 dark:text-indigo-400">1. <strong>Use a numbered or bullet list</strong> — "5 Best Practices for..." format is highly extractable. AI engines cite individual tips directly.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">2. <strong>Each tip: bold title + explanation</strong> — "<strong>Monitor regularly</strong> — Set up automated alerts..." This structure makes each tip a standalone citable snippet.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">3. <strong>Focus on prevention over fixing</strong> — "How to prevent" content gets cited more than "how to fix" because AI engines prefer proactive advice.</p>
                  <p className="text-indigo-600 dark:text-indigo-400">This section targets "best practices for [topic]" queries — one of the most common AI search patterns.</p>
                </div>
                <SectionEditor value={bestPractices} onChange={setBestPractices} placeholder="Proactive recommendations to prevent issues..." section={section} />
              </>
            )}
          </div>
        )

      case 'custom_body':
        return (
          <div className="space-y-4">
            <ContextualBanner step={step} enabled={enabledSections.custom_body} onToggle={() => toggleSection('custom_body')} />
            {enabledSections.custom_body && (
              <>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Free-Form Body Content</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    Use this section when the predefined sections above don't fit your blog's topic. Write your main body content here with your own H2 and H3 headings.
                  </p>
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 space-y-1 mt-2">
                    <p className="font-medium">Tips for CSABF compliance:</p>
                    <p>- Use H2 headings (4–10 total across the article, ideal 6–8)</p>
                    <p>- Add H3 subheadings within H2s for better organization</p>
                    <p>- Keep paragraphs short (3–4 lines max)</p>
                    <p>- Use bullet/numbered lists for scannability</p>
                    <p>- Include a clear definition block if explaining a concept</p>
                    <p>- Focus on clear structure over word count</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <ReactQuill
                    value={customBody}
                    onChange={setCustomBody}
                    theme="snow"
                    placeholder="Write your main body content here. Use the toolbar to add H2/H3 headings, lists, and formatting..."
                    modules={quillModulesFull}
                    style={{ minHeight: '300px' }}
                  />
                  <div className="flex items-center justify-between">
                    <WordCountBadge current={wcRich(customBody)} />
                    <span className="text-xs text-gray-400">
                      Use H2/H3 from toolbar to structure your content
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )

      case 'faqs':
        return (
          <div className="space-y-4">
            {guideline && <GuidelineTip guideline={guideline} expanded={expandedTip === step.id} onToggle={() => setExpandedTip(expandedTip === step.id ? null : step.id)} />}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-xs space-y-1.5">
              <p className="font-medium text-indigo-700 dark:text-indigo-300">How to write for AI visibility:</p>
              <p className="text-indigo-600 dark:text-indigo-400">1. <strong>Use real search questions</strong> — Write questions people actually type into AI search ("How do I...", "What is the best way to..."). AI engines match FAQs directly to queries.</p>
              <p className="text-indigo-600 dark:text-indigo-400">2. <strong>Answer in 2-3 sentences</strong> — Concise, direct answers get cited. Long answers get ignored. Start with the answer, then add context.</p>
              <p className="text-indigo-600 dark:text-indigo-400">3. <strong>Don't repeat article content</strong> — FAQs should cover questions the article didn't fully address. This captures additional search queries.</p>
              <p className="text-indigo-600 dark:text-indigo-400">4. <strong>4-7 questions is ideal</strong> — Enough for coverage without diluting quality.</p>
              <p className="text-indigo-600 dark:text-indigo-400">FAQ schema markup is critical — it enables your answers to appear directly in AI-generated responses.</p>
            </div>
            <div className="space-y-3">
              {faqs.map((f, i) => {
                const answerWc = countWords(f.answer)
                return (
                  <div key={i} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">FAQ #{i + 1}</span>
                      <div className="flex items-center gap-2">
                        {f.answer.trim() && (
                          <span className={`text-xs ${answerWc > 80 ? 'text-amber-500' : 'text-gray-500'}`}>
                            {answerWc}w{answerWc > 80 ? ' — consider trimming' : ''}
                          </span>
                        )}
                        {faqs.length > 4 && (
                          <button onClick={() => setFaqs(faqs.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="text"
                      value={f.question}
                      onChange={e => {
                        const updated = [...faqs]; updated[i] = { ...updated[i], question: e.target.value }; setFaqs(updated)
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                      placeholder="Question (e.g., How long does cloud migration take?)"
                    />
                    <textarea
                      value={f.answer}
                      onChange={e => {
                        const updated = [...faqs]; updated[i] = { ...updated[i], answer: e.target.value }; setFaqs(updated)
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none"
                      rows={2}
                      placeholder="Answer (concise, conversational style)"
                    />
                  </div>
                )
              })}
            </div>
            {faqs.length < 7 && (
              <button onClick={() => setFaqs([...faqs, { question: '', answer: '' }])}
                className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium">
                <Plus className="w-4 h-4" /> Add FAQ
              </button>
            )}
            <p className="text-xs text-gray-500">
              {faqs.filter(f => f.question.trim() && f.answer.trim()).length}/4–7 FAQs completed
            </p>
          </div>
        )

      case 'cloudfuze_helps':
        return (
          <div className="space-y-4">
            <ContextualBanner step={step} enabled={enabledSections.cloudfuze_helps} onToggle={() => toggleSection('cloudfuze_helps')} />
            {enabledSections.cloudfuze_helps && (
              <>
                {guideline && <GuidelineTip guideline={guideline} expanded={expandedTip === step.id} onToggle={() => setExpandedTip(expandedTip === step.id ? null : step.id)} />}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <p className="font-medium">Rules:</p>
                  <p>- Soft positioning only</p>
                  <p>- No aggressive CTA</p>
                  <p>- Mention automation, scale, reporting</p>
                  <p>- Tie to admin workflow</p>
                </div>
                <SectionEditor value={cloudfuzeHelps} onChange={setCloudfuzeHelps} placeholder="CloudFuze simplifies this process by..." section={section} />
              </>
            )}
            {!enabledSections.cloudfuze_helps && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-300">
                <p className="font-medium">Tip: You can embed CloudFuze positioning into your Conclusion section instead.</p>
                <p className="mt-1 text-amber-600 dark:text-amber-400">Just mention CloudFuze capabilities naturally within the conclusion paragraph.</p>
              </div>
            )}
          </div>
        )

      case 'conclusion':
        return (
          <div className="space-y-4">
            {guideline && <GuidelineTip guideline={guideline} expanded={expandedTip === step.id} onToggle={() => setExpandedTip(expandedTip === step.id ? null : step.id)} />}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <p className="font-medium">Structure:</p>
              <p>- Quick summary</p>
              <p>- Reinforce best practice</p>
              <p>- Light forward-looking statement</p>
              <p className="text-red-400 mt-1">No marketing pitch.</p>
            </div>
            {!enabledSections.cloudfuze_helps && (
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-xs text-indigo-600 dark:text-indigo-400">
                <p className="font-medium text-indigo-700 dark:text-indigo-300">CloudFuze positioning merged here</p>
                <p className="mt-1">Since the standalone CloudFuze section is off, weave CloudFuze mentions naturally into your conclusion. Example: "Tools like CloudFuze can automate this process at scale..."</p>
              </div>
            )}
            <SectionEditor value={conclusion} onChange={setConclusion} placeholder="To summarize, the key steps for..." section={section} />
          </div>
        )

      case 'links':
        return (
          <div className="space-y-4">
            {guideline && <GuidelineTip guideline={guideline} expanded={expandedTip === step.id} onToggle={() => setExpandedTip(expandedTip === step.id ? null : step.id)} />}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <p className="font-medium">CSABF Linking Rules:</p>
              <p>- 3–5 internal links total</p>
              <p>- 1 link to related migration page</p>
              <p>- 1 link to platform comparison page</p>
              <p>- 1 link to SaaS management page (if relevant)</p>
              <p className="text-amber-500 mt-1">Descriptive anchor text only — never "click here"</p>
            </div>
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={l.type}
                    onChange={e => {
                      const updated = [...links]; updated[i] = { ...updated[i], type: e.target.value }; setLinks(updated)
                    }}
                    className="w-32 px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100"
                  >
                    <option value="migration">Migration</option>
                    <option value="comparison">Comparison</option>
                    <option value="saas">SaaS Mgmt</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    type="text"
                    value={l.anchor}
                    onChange={e => {
                      const updated = [...links]; updated[i] = { ...updated[i], anchor: e.target.value }; setLinks(updated)
                    }}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Descriptive anchor text"
                  />
                  <input
                    type="url"
                    value={l.url}
                    onChange={e => {
                      const updated = [...links]; updated[i] = { ...updated[i], url: e.target.value }; setLinks(updated)
                    }}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="https://cloudfuze.com/..."
                  />
                  {links.length > 3 && (
                    <button onClick={() => setLinks(links.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {links.length < 5 && (
              <button onClick={() => setLinks([...links, { anchor: '', url: '', type: 'other' }])}
                className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium">
                <Plus className="w-4 h-4" /> Add link
              </button>
            )}
            {links.some(l => ['click here', 'here', 'read more', 'link'].includes(l.anchor.trim().toLowerCase())) && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Generic anchor text detected! Use descriptive text.
              </p>
            )}
          </div>
        )

      case 'checklist':
        return (
          <div className="space-y-4">
            {/* Total Word Count */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Word Count</span>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {getTotalWordCount()} words
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                Structure quality matters more than word count. Focus on clear, extractable content over length.
              </p>
            </div>

            {/* Section checklist */}
            <div className="grid gap-2">
              {STEPS.slice(0, -1).map(s => {
                const passed = getStepStatus(s.id)
                const isSkipped = s.contextual && !enabledSections[s.id]
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors cursor-pointer
                      ${isSkipped
                        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 opacity-60'
                        : passed
                          ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                          : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                      }`}
                    onClick={() => setActiveStep(STEPS.findIndex(st => st.id === s.id))}
                  >
                    {isSkipped
                      ? <Circle className="w-5 h-5 text-gray-300 flex-shrink-0" />
                      : passed
                        ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                        : <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    }
                    <span className={`text-sm font-medium ${
                      isSkipped
                        ? 'text-gray-400 dark:text-gray-500 line-through'
                        : passed
                          ? 'text-green-700 dark:text-green-300'
                          : 'text-red-700 dark:text-red-300'
                    }`}>
                      {s.title}
                    </span>
                    <span className="ml-auto text-xs text-gray-500">
                      {isSkipped ? 'Skipped' : passed ? 'CSABF Compliant' : 'Incomplete'}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Schema reminder */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">Schema Requirements</p>
              <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                <li>- Article schema: mandatory</li>
                <li>- FAQ schema: mandatory</li>
                <li>- HowTo schema: optional (if procedural steps included)</li>
              </ul>
            </div>

            {/* Export buttons */}
            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={copyToClipboard}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
                <Copy className="w-4 h-4" /> Copy as Markdown
              </button>
              <button onClick={downloadMarkdown}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <Download className="w-4 h-4" /> Download .md
              </button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  // ─── Main Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CSABF Content Builder</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-medium">
              CloudFuze Standard AI Blog Framework
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-save status */}
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              {saveStatus === 'saved' && (
                <>
                  <Save className="w-3 h-3 text-green-500" />
                  <span className="text-green-500">Draft saved</span>
                </>
              )}
              {saveStatus === '' && getLastSavedTime() && (
                <>
                  <Save className="w-3 h-3" />
                  <span>Last saved {getLastSavedTime()}</span>
                </>
              )}
              {!getLastSavedTime() && saveStatus === '' && (
                <span className="text-gray-400">Auto-save enabled</span>
              )}
            </div>
            {/* Clear draft button */}
            <button
              onClick={clearDraft}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Clear all content and start fresh"
            >
              <RotateCcw className="w-3.5 h-3.5" /> New Draft
            </button>
          </div>
        </div>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Build AI-optimized blog content following the CSABF structure. Toggle contextual sections on/off based on your blog's topic — not every section is needed for every article.
        </p>
      </div>

      {/* CSABF Reference Guide (collapsible) */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            <div className="text-left">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">CSABF Reference Guide</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Non-negotiable rules, section structure, schema & AI citation requirements</p>
            </div>
          </div>
          {showGuide ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        {showGuide && (
          <div className="px-6 pb-6 space-y-6 border-t border-gray-200 dark:border-gray-800 pt-4">
            {/* Rules Grid */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">CSABF Non-Negotiable Rules</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Every blog post must pass these validation checks for full framework compliance.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {csabfRules.map((group, gi) => (
                  <div key={gi} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      {gi === 0 && <FileText className="w-4 h-4 text-indigo-500" />}
                      {gi === 1 && <ListChecks className="w-4 h-4 text-emerald-500" />}
                      {gi === 2 && <Search className="w-4 h-4 text-amber-500" />}
                      {gi === 3 && <Zap className="w-4 h-4 text-purple-500" />}
                      {group.section}
                    </h4>
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

            {/* H2 Sections */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">H2 Sections (Core + Contextual)</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Core sections are always required. Contextual sections are suggested based on what the content is about.</p>

              <h4 className="text-xs uppercase tracking-wider font-semibold text-green-600 dark:text-green-400 mb-2">Core (Always Required)</h4>
              <div className="grid gap-2 sm:grid-cols-2 mb-4">
                {coreSections.map((s, i) => (
                  <div key={i} className={`flex flex-col gap-1 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 ${
                    s.type === 'flexible' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-green-50 dark:bg-green-900/20'
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        s.type === 'flexible'
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                          : 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400'
                      }`}>{i + 1}</span>
                      <span>{s.name} <span className="text-gray-400">({s.words})</span></span>
                    </div>
                    {s.note && <span className="text-xs text-gray-400 dark:text-gray-500 ml-9">{s.note}</span>}
                  </div>
                ))}
              </div>

              <h4 className="text-xs uppercase tracking-wider font-semibold text-amber-600 dark:text-amber-400 mb-2">Contextual (Suggested When Relevant)</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {contextualSections.map((s, i) => (
                  <div key={i} className="flex flex-col gap-1 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/15 text-sm text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">?</span>
                      <span>{s.name} <span className="text-gray-400">({s.words})</span></span>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-7">{s.when}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Schema + AI Citation */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-500" />
                  Schema Requirements
                </h3>
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

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-500" />
                  AI-Citation Optimization
                </h3>
                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <p>Content must be optimized for AI engines to extract, cite, and display:</p>
                  <ul className="space-y-1.5 mt-2">
                    {['Clear 40–60 word definition block', 'Structured numbered steps', 'Bullet summaries for key points', 'Task-oriented throughout', 'No marketing-heavy tone', 'No generic thought leadership'].map((item, i) => (
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
        )}
      </div>

      {/* Progress + Total WC */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            CSABF Progress: {completedSteps}/{totalSteps} sections
          </span>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500">
              Total: {getTotalWordCount()}w
            </span>
            <span className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
              {Math.round((completedSteps / totalSteps) * 100)}%
            </span>
          </div>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-500"
            style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Step sidebar */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 h-fit lg:sticky lg:top-4">
          <nav className="space-y-0.5">
            {STEPS.map((step, i) => {
              const passed = getStepStatus(step.id)
              const isActive = activeStep === i
              const isSkipped = step.contextual && !enabledSections[step.id]
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(i)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors
                    ${isActive
                      ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium'
                      : isSkipped
                        ? 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                >
                  {isSkipped
                    ? <Circle className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                    : passed
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      : <Circle className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                  }
                  <span className={`truncate ${isSkipped ? 'line-through opacity-50' : ''}`}>{step.title}</span>
                  {step.contextual && (
                    <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      enabledSections[step.id]
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                    }`}>
                      {enabledSections[step.id] ? 'ON' : 'OFF'}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Step content */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {STEPS[activeStep].title}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Section {activeStep + 1} of {STEPS.length}
              </p>
            </div>
            {getStepStatus(STEPS[activeStep].id) && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> CSABF Compliant
              </span>
            )}
          </div>

          {renderStepContent(STEPS[activeStep])}

          {/* Navigation buttons */}
          {activeStep < STEPS.length - 1 && (
            <div className="flex justify-between mt-8 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
                disabled={activeStep === 0}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setActiveStep(Math.min(STEPS.length - 1, activeStep + 1))}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Next Section
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ContextualBanner({ step, enabled, onToggle }) {
  return (
    <div className={`rounded-lg border p-3 flex items-center justify-between ${
      enabled
        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
        : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            enabled
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
          }`}>
            Contextual Section
          </span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{step.title}</span>
        </div>
        {step.hint && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-0.5">{step.hint}</p>
        )}
      </div>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
          enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    </div>
  )
}

function GuidelineTip({ guideline, expanded, onToggle }) {
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
        <Lightbulb className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300 flex-1">
          CSABF: {guideline.title}
        </span>
        {expanded ? <ChevronDown className="w-4 h-4 text-blue-400" /> : <ChevronRight className="w-4 h-4 text-blue-400" />}
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-1.5">
          <p className="text-sm text-blue-600 dark:text-blue-400">{guideline.description}</p>
          <p className="text-xs text-blue-500 dark:text-blue-400/70 italic">{guideline.tip}</p>
        </div>
      )}
    </div>
  )
}
