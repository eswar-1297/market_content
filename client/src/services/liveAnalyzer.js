/**
 * Client-side live content analyzer.
 * Runs instantly on every typing pause (~500ms) — zero API calls.
 * Provides real-time feedback on structure, keywords, tone, and framework progress.
 */

const MARKETING_PHRASES = [
  /industry.leading/i, /best.in.class/i, /cutting.edge/i,
  /revolutionary/i, /game.changer/i, /seamless(?:ly)?/i,
  /unparalleled/i, /world.class/i, /state.of.the.art/i,
  /comprehensive\s+guide/i, /ultimate\s+guide/i,
  /look\s+no\s+further/i, /one.stop.shop/i,
  /second\s+to\s+none/i, /best\s+of\s+breed/i,
  /next.generation/i, /robust\s+solution/i
]

const FILLER_PHRASES = [
  /in\s+today'?s\s+(world|age|era|landscape)/i,
  /it\s+is\s+(important|essential|crucial)\s+to\s+note/i,
  /needless\s+to\s+say/i,
  /at\s+the\s+end\s+of\s+the\s+day/i,
  /in\s+order\s+to/i,
  /as\s+a\s+matter\s+of\s+fact/i,
  /it\s+goes\s+without\s+saying/i,
  /when\s+it\s+comes\s+to/i,
]

const PASSIVE_PATTERN = /\b(is|are|was|were|been|being)\s+(\w+ed|written|known|built|made|done|seen|given|taken|shown|found|held|told|brought|thought|kept|left|meant|set|run|put|paid|sent|read|led|understood|begun|grown)\b/gi

const TRANSITION_WORDS = [
  // Addition
  'furthermore', 'moreover', 'additionally', 'also', 'besides', 'in addition',
  // Contrast
  'however', 'nevertheless', 'on the other hand', 'in contrast', 'conversely', 'although', 'whereas', 'despite', 'yet', 'but',
  // Cause/effect
  'therefore', 'consequently', 'as a result', 'thus', 'hence', 'because', 'since', 'due to',
  // Sequence
  'first', 'second', 'third', 'finally', 'next', 'then', 'meanwhile', 'subsequently',
  // Example
  'for example', 'for instance', 'specifically', 'in particular', 'such as',
  // Summary
  'in conclusion', 'to summarize', 'in summary', 'overall', 'in short',
  // Emphasis
  'importantly', 'significantly', 'notably', 'especially', 'particularly'
]

const COMPLEX_WORD_EXCEPTIONS = new Set([
  'another', 'area', 'being', 'business', 'company', 'data', 'different',
  'every', 'following', 'general', 'important', 'interest', 'management',
  'number', 'people', 'possible', 'several', 'something', 'together', 'using'
])

const GRAMMAR_PATTERNS = [
  { pattern: /\b(its|it's)\s+(a|the|very|really|quite|not|been|own)\b/gi, check: (match) => match[1] === "its" && ['a','the','very','really','quite','not','been'].includes(match[2].toLowerCase()) ? `"its ${match[2]}" → should be "it's ${match[2]}"` : null },
  { pattern: /\bit's\s+(own)\b/gi, msg: '"it\'s own" → should be "its own"' },
  { pattern: /\byour\s+welcome\b/gi, msg: '"your welcome" → should be "you\'re welcome"' },
  { pattern: /\bcould\s+of\b/gi, msg: '"could of" → should be "could have"' },
  { pattern: /\bshould\s+of\b/gi, msg: '"should of" → should be "should have"' },
  { pattern: /\bwould\s+of\b/gi, msg: '"would of" → should be "would have"' },
  { pattern: /\bthen\b(?=\s+\w+er\b)/gi, msg: '"then" used in comparison → should be "than"' },
  { pattern: /\ba\s+(?=(?:hour|honest|heir|herb)\b)/gi, msg: '"a" before silent-h word → should be "an"' },
  { pattern: /\ban\s+(?=(?:unique|universal|user|useful|united|uniform)\b)/gi, msg: '"an" before "yu" sound → should be "a"' },
  { pattern: /\beffect\b(?=\s+(?:the|a|your|our|their|this|that|how|what))/gi, check: (match, line) => /\b(?:will|can|may|might|could|to|not)\s+effect\b/i.test(line) ? '"effect" used as verb → should be "affect"' : null },
  { pattern: /\b(\w+)\s+\1\b/gi, check: (match) => !['that','had','very'].includes(match[1].toLowerCase()) ? `Repeated word: "${match[1]} ${match[1]}"` : null },
  { pattern: /\balot\b/gi, msg: '"alot" → should be "a lot"' },
  { pattern: /\bthier\b/gi, msg: '"thier" → should be "their"' },
  { pattern: /\brecieve\b/gi, msg: '"recieve" → should be "receive"' },
  { pattern: /\boccured\b/gi, msg: '"occured" → should be "occurred"' },
  { pattern: /\bseperately?\b/gi, msg: '"seperate" → should be "separate"' },
  { pattern: /\bneccessary\b/gi, msg: '"neccessary" → should be "necessary"' },
  { pattern: /\baccommodate\b/gi, msg: null }, // correct spelling, skip
  { pattern: /\baccomodate\b/gi, msg: '"accomodate" → should be "accommodate"' },
  { pattern: /\bdefinately\b/gi, msg: '"definately" → should be "definitely"' },
]

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '')
  if (word.length <= 3) return 1
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
  word = word.replace(/^y/, '')
  const matches = word.match(/[aeiouy]{1,2}/g)
  return matches ? matches.length : 1
}

function isComplexWord(word) {
  if (word.length < 4) return false
  if (COMPLEX_WORD_EXCEPTIONS.has(word.toLowerCase())) return false
  return countSyllables(word) >= 3
}

export function analyzeLive(text, targetKeywords, frameworkSections) {
  if (!text || text.trim().length === 0) {
    return { issues: [], metrics: getEmptyMetrics(), wordCount: 0 }
  }

  const lines = text.split('\n')
  const words = text.split(/\s+/).filter(Boolean)
  const wordCount = words.length

  const issues = []
  const metrics = {
    wordCount,
    h1Count: 0,
    h2Count: 0,
    h3Count: 0,
    paragraphCount: 0,
    bulletListCount: 0,
    numberedListCount: 0,
    avgParagraphLength: 0,
    headings: [],
    keywordUsage: null,
    frameworkProgress: null
  }

  // --- Heading detection ---
  const headings = []
  lines.forEach((line, idx) => {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim(), line: idx })
    }
  })
  metrics.headings = headings
  metrics.h1Count = headings.filter(h => h.level === 1).length
  metrics.h2Count = headings.filter(h => h.level === 2).length
  metrics.h3Count = headings.filter(h => h.level === 3).length

  // H1 checks
  if (metrics.h1Count === 0 && wordCount > 50) {
    issues.push({
      type: 'correction', severity: 'critical', line: 0,
      message: 'Missing H1 heading',
      detail: 'Start with a clear H1 (# Heading) that matches the primary search intent.',
      category: 'structure'
    })
  }
  if (metrics.h1Count > 1) {
    const secondH1 = headings.filter(h => h.level === 1)[1]
    issues.push({
      type: 'correction', severity: 'critical', line: secondH1?.line || 0,
      message: 'Multiple H1 headings detected',
      detail: 'Only use one H1. Convert extra H1s to H2 (##).',
      category: 'structure'
    })
  }

  // H2 checks
  if (wordCount > 200 && metrics.h2Count < 2) {
    issues.push({
      type: 'suggestion', severity: 'warning', line: 0,
      message: `Only ${metrics.h2Count} H2 sections — aim for 4-10`,
      detail: 'AI engines use H2 headings to understand content structure. Add more sections.',
      category: 'structure'
    })
  }

  // --- Paragraph analysis ---
  let currentPara = []
  let paraStart = 0
  let totalParaLines = 0
  let paraCount = 0

  const checkParagraph = () => {
    if (currentPara.length > 0) {
      paraCount++
      totalParaLines += currentPara.length
      if (currentPara.length > 5) {
        issues.push({
          type: 'suggestion', severity: 'warning', line: paraStart,
          message: `Paragraph is ${currentPara.length} lines long (max 5 recommended)`,
          detail: 'AI engines extract short paragraphs. Break this into 2-3 shorter ones for better extractability.',
          category: 'extractability'
        })
      }
      const paraWordCount = currentPara.join(' ').split(/\s+/).filter(Boolean).length
      if (paraWordCount > 120) {
        issues.push({
          type: 'suggestion', severity: 'warning', line: paraStart,
          message: `Paragraph has ${paraWordCount} words (max 120 recommended)`,
          detail: 'Dense paragraphs reduce AI extractability. Split into focused, quotable blocks.',
          category: 'extractability'
        })
      }
    }
    currentPara = []
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.match(/^#{1,6}\s/)) {
      checkParagraph()
      paraStart = idx + 1
    } else {
      if (currentPara.length === 0) paraStart = idx
      currentPara.push(trimmed)
    }
  })
  checkParagraph()

  metrics.paragraphCount = paraCount
  metrics.avgParagraphLength = paraCount > 0 ? Math.round(totalParaLines / paraCount) : 0

  // --- List detection ---
  let inBullet = false
  let inNumbered = false
  lines.forEach(line => {
    const trimmed = line.trim()
    if (/^[-*+]\s/.test(trimmed)) {
      if (!inBullet) { metrics.bulletListCount++; inBullet = true }
      inNumbered = false
    } else if (/^\d+[.)]\s/.test(trimmed)) {
      if (!inNumbered) { metrics.numberedListCount++; inNumbered = true }
      inBullet = false
    } else if (trimmed === '') {
      inBullet = false
      inNumbered = false
    }
  })

  if (wordCount > 300 && metrics.bulletListCount === 0) {
    issues.push({
      type: 'suggestion', severity: 'info', line: 0,
      message: 'No bullet lists detected',
      detail: 'AI engines love extracting bullet lists. Add at least 2 bullet lists for key points.',
      category: 'extractability'
    })
  }

  // --- Marketing tone detection ---
  lines.forEach((line, idx) => {
    for (const pattern of MARKETING_PHRASES) {
      const match = line.match(pattern)
      if (match) {
        issues.push({
          type: 'correction', severity: 'warning', line: idx,
          message: `Marketing tone: "${match[0]}"`,
          detail: 'AI engines skip salesy language. Use factual, direct phrasing instead.',
          category: 'tone', original: match[0]
        })
        break
      }
    }
  })

  // --- Filler phrase detection ---
  lines.forEach((line, idx) => {
    for (const pattern of FILLER_PHRASES) {
      const match = line.match(pattern)
      if (match) {
        issues.push({
          type: 'suggestion', severity: 'info', line: idx,
          message: `Filler phrase: "${match[0]}"`,
          detail: 'Remove filler phrases to make content more direct and AI-extractable.',
          category: 'directness', original: match[0]
        })
        break
      }
    }
  })

  // --- Passive voice detection ---
  let totalPassiveCount = 0
  lines.forEach((line, idx) => {
    const matches = line.match(PASSIVE_PATTERN)
    if (matches) {
      totalPassiveCount += matches.length
      if (matches.length >= 2) {
        issues.push({
          type: 'suggestion', severity: 'info', line: idx,
          message: 'Multiple passive voice constructions',
          detail: 'AI engines prefer direct, active statements. Consider rewriting for clarity.',
          category: 'readability'
        })
      }
    }
  })

  // --- Readability metrics ---
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5)
  const sentenceCount = sentences.length

  // Sentence length analysis
  const sentenceLengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length)
  const avgSentenceLength = sentenceCount > 0 ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceCount : 0

  // Word complexity (percentage of 3+ syllable words)
  const allWords = words.map(w => w.replace(/[^a-zA-Z]/g, '')).filter(w => w.length > 0)
  const complexWords = allWords.filter(w => isComplexWord(w))
  const complexWordPct = allWords.length > 0 ? (complexWords.length / allWords.length) * 100 : 0

  // Transition words
  const textLower = text.toLowerCase()
  let transitionCount = 0
  for (const tw of TRANSITION_WORDS) {
    const regex = new RegExp(`\\b${tw.replace(/\s+/g, '\\s+')}\\b`, 'gi')
    const matches = textLower.match(regex)
    if (matches) transitionCount += matches.length
  }
  const transitionPct = sentenceCount > 0 ? (transitionCount / sentenceCount) * 100 : 0

  // Passive voice percentage
  const passivePct = sentenceCount > 0 ? (totalPassiveCount / sentenceCount) * 100 : 0

  // Consecutive sentences (same length bucket: short<10, medium 10-20, long>20)
  let maxConsecutiveSame = 0
  let currentConsecutive = 1
  let consecutiveType = ''
  for (let i = 1; i < sentenceLengths.length; i++) {
    const prevBucket = sentenceLengths[i-1] < 10 ? 'short' : sentenceLengths[i-1] > 20 ? 'long' : 'medium'
    const currBucket = sentenceLengths[i] < 10 ? 'short' : sentenceLengths[i] > 20 ? 'long' : 'medium'
    if (prevBucket === currBucket) {
      currentConsecutive++
      if (currentConsecutive > maxConsecutiveSame) {
        maxConsecutiveSame = currentConsecutive
        consecutiveType = currBucket
      }
    } else {
      currentConsecutive = 1
    }
  }

  // Subheading distribution (words between headings)
  const headingLines = headings.map(h => h.line)
  const sectionGaps = []
  const checkPoints = [0, ...headingLines, lines.length - 1]
  for (let i = 0; i < checkPoints.length - 1; i++) {
    const sectionText = lines.slice(checkPoints[i], checkPoints[i + 1]).join(' ')
    const sectionWords = sectionText.split(/\s+/).filter(Boolean).length
    if (sectionWords > 30) sectionGaps.push(sectionWords)
  }
  const maxSectionWords = sectionGaps.length > 0 ? Math.max(...sectionGaps) : 0

  // Paragraph length stats
  const paraLengths = []
  let tempPara = []
  lines.forEach(line => {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.match(/^#{1,6}\s/)) {
      if (tempPara.length > 0) {
        paraLengths.push(tempPara.join(' ').split(/\s+/).filter(Boolean).length)
        tempPara = []
      }
    } else {
      tempPara.push(trimmed)
    }
  })
  if (tempPara.length > 0) paraLengths.push(tempPara.join(' ').split(/\s+/).filter(Boolean).length)
  const avgParagraphWords = paraLengths.length > 0 ? Math.round(paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length) : 0
  const longParagraphs = paraLengths.filter(p => p > 120).length

  // Grammar checks
  const grammarIssues = []
  lines.forEach((line, idx) => {
    for (const rule of GRAMMAR_PATTERNS) {
      let match
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags)
      while ((match = regex.exec(line)) !== null) {
        let msg = null
        if (rule.check) {
          msg = rule.check(match, line)
        } else {
          msg = rule.msg
        }
        if (msg) {
          grammarIssues.push({ line: idx, message: msg })
        }
      }
    }
  })

  // Build readability metrics object
  metrics.readability = {
    wordComplexity: { pct: Math.round(complexWordPct), status: complexWordPct > 25 ? 'high' : complexWordPct > 15 ? 'moderate' : 'good' },
    transitionWords: { count: transitionCount, pct: Math.round(transitionPct), status: transitionPct < 20 ? 'low' : transitionPct > 40 ? 'good' : 'ok' },
    passiveVoice: { pct: Math.round(passivePct), status: passivePct > 20 ? 'high' : passivePct > 10 ? 'moderate' : 'good' },
    consecutiveSentences: { max: maxConsecutiveSame, type: consecutiveType, status: maxConsecutiveSame >= 4 ? 'bad' : maxConsecutiveSame >= 3 ? 'warning' : 'good' },
    subheadingDistribution: { maxGap: maxSectionWords, status: maxSectionWords > 300 ? 'bad' : maxSectionWords > 200 ? 'warning' : 'good' },
    paragraphLength: { avg: avgParagraphWords, long: longParagraphs, status: longParagraphs > 2 ? 'bad' : avgParagraphWords > 100 ? 'warning' : 'good' },
    sentenceLength: { avg: Math.round(avgSentenceLength), status: avgSentenceLength > 25 ? 'long' : avgSentenceLength < 8 ? 'short' : 'good' },
    grammar: { issues: grammarIssues, count: grammarIssues.length }
  }

  // Add readability issues
  if (wordCount > 100) {
    if (complexWordPct > 25) {
      issues.push({ type: 'suggestion', severity: 'warning', line: 0, message: `${Math.round(complexWordPct)}% complex words — aim for under 15%`, detail: 'Too many multi-syllable words reduce readability. Use simpler alternatives where possible.', category: 'readability' })
    }
    if (transitionPct < 20 && sentenceCount > 5) {
      issues.push({ type: 'suggestion', severity: 'info', line: 0, message: `Low transition word usage (${Math.round(transitionPct)}%)`, detail: 'Add transition words (however, therefore, additionally) to improve flow between sentences.', category: 'readability' })
    }
    if (maxConsecutiveSame >= 4) {
      issues.push({ type: 'suggestion', severity: 'warning', line: 0, message: `${maxConsecutiveSame} consecutive ${consecutiveType} sentences`, detail: 'Vary sentence length — mix short punchy sentences with longer explanatory ones.', category: 'readability' })
    }
    if (maxSectionWords > 300) {
      issues.push({ type: 'suggestion', severity: 'warning', line: 0, message: `Section has ${maxSectionWords} words without a subheading`, detail: 'Break up long sections with H3 subheadings. Readers and AI engines scan by headings.', category: 'readability' })
    }
  }

  // Add grammar issues
  grammarIssues.slice(0, 5).forEach(gi => {
    issues.push({ type: 'correction', severity: 'warning', line: gi.line, message: `Grammar: ${gi.message}`, detail: 'Fix this grammar issue for professional quality.', category: 'grammar' })
  })

  // --- Keyword tracking ---
  if (targetKeywords) {
    metrics.keywordUsage = trackKeywordsClient(text, targetKeywords)
  }

  // --- Framework progress ---
  if (frameworkSections && frameworkSections.length > 0) {
    metrics.frameworkProgress = trackFrameworkProgress(headings, text, frameworkSections)
  }

  // Sort issues: critical first, then warning, then info
  const severityOrder = { critical: 0, warning: 1, info: 2 }
  issues.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2))

  return { issues, metrics, wordCount }
}

function trackKeywordsClient(text, targetKeywords) {
  const textLower = text.toLowerCase()
  const words = text.split(/\s+/).filter(Boolean)
  const wordCount = words.length
  const result = { primary: null, secondary: [], lsi: [], missingCount: 0, usedCount: 0 }

  if (targetKeywords.primary) {
    const kw = targetKeywords.primary.toLowerCase()
    const count = countOccurrences(textLower, kw)
    const kwWords = kw.split(/\s+/).length
    const density = wordCount > 0 ? ((count * kwWords) / wordCount * 100) : 0
    let status = 'good'
    if (density < 0.8) status = 'low'
    else if (density > 2.0) status = 'high'

    result.primary = { keyword: targetKeywords.primary, count, density: density.toFixed(1), status }
  }

  const allSemanticKws = [
    ...(targetKeywords.secondary || []),
    ...(targetKeywords.lsi || [])
  ]

  for (const kw of allSemanticKws) {
    const used = textLower.includes(kw.toLowerCase())
    if (used) result.usedCount++
    else result.missingCount++

    const entry = { keyword: kw, used, count: used ? countOccurrences(textLower, kw.toLowerCase()) : 0 }
    if ((targetKeywords.secondary || []).includes(kw)) result.secondary.push(entry)
    else result.lsi.push(entry)
  }

  return result
}

function trackFrameworkProgress(headings, text, frameworkSections) {
  return frameworkSections.map(section => {
    const sectionLower = section.heading.toLowerCase()
    const found = headings.some(h => {
      const hLower = h.text.toLowerCase()
      return hLower.includes(sectionLower) || sectionLower.includes(hLower) ||
        wordsOverlap(hLower, sectionLower)
    })
    return {
      id: section.id,
      heading: section.heading,
      level: section.level,
      required: section.required,
      completed: found
    }
  })
}

function wordsOverlap(a, b) {
  const aSet = new Set(a.split(/\s+/).filter(w => w.length > 3))
  const bSet = new Set(b.split(/\s+/).filter(w => w.length > 3))
  if (aSet.size === 0 || bSet.size === 0) return false
  let matches = 0
  for (const w of aSet) { if (bSet.has(w)) matches++ }
  return matches >= Math.min(2, Math.min(aSet.size, bSet.size))
}

function countOccurrences(text, keyword) {
  if (!keyword) return 0
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (text.match(new RegExp(escaped, 'gi')) || []).length
}

function getEmptyMetrics() {
  return {
    wordCount: 0, h1Count: 0, h2Count: 0, h3Count: 0,
    paragraphCount: 0, bulletListCount: 0, numberedListCount: 0,
    avgParagraphLength: 0, headings: [],
    keywordUsage: null, frameworkProgress: null,
    readability: null
  }
}
