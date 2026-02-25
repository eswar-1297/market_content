// URL Processor - Normalization, Validation, and Deduplication for Stack Overflow URLs

import { containsBrandMention } from './commentChecker.js'

/**
 * Valid Stack Exchange domains
 */
const VALID_DOMAINS = [
  'stackoverflow.com',
  'stackexchange.com',
  'superuser.com',
  'serverfault.com',
  'askubuntu.com',
  'mathoverflow.net'
]

/**
 * Extract question ID from various Stack Overflow URL formats
 * Supported formats:
 * - /questions/12345/title-slug
 * - /questions/12345
 * - /q/12345
 * - /a/12345 (answer - returns null, needs parent question)
 * 
 * @param {string} url - Stack Overflow URL
 * @returns {Object|null} { questionId, slug, isAnswer }
 */
export function extractQuestionInfo(url) {
  try {
    if (!url) return null
    
    const parsed = new URL(url)
    const path = parsed.pathname
    
    // Match /questions/12345/slug or /questions/12345
    const questionsMatch = path.match(/\/questions\/(\d+)(?:\/([^\/\?]+))?/i)
    if (questionsMatch) {
      return {
        questionId: questionsMatch[1],
        slug: questionsMatch[2] || null,
        isAnswer: false
      }
    }
    
    // Match /q/12345 (short URL)
    const shortMatch = path.match(/\/q\/(\d+)/i)
    if (shortMatch) {
      return {
        questionId: shortMatch[1],
        slug: null,
        isAnswer: false
      }
    }
    
    // Match /a/12345 (answer URL - we can't use this directly)
    const answerMatch = path.match(/\/a\/(\d+)/i)
    if (answerMatch) {
      return {
        answerId: answerMatch[1],
        questionId: null,
        isAnswer: true
      }
    }
    
    return null
  } catch (error) {
    return null
  }
}

/**
 * Normalize a Stack Overflow URL to canonical format
 * 
 * @param {string} url - Raw URL
 * @returns {string|null} Normalized URL or null if invalid
 */
export function normalizeUrl(url) {
  try {
    if (!url || typeof url !== 'string') return null
    
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    
    // Check if it's a valid Stack Exchange domain
    const isValid = VALID_DOMAINS.some(domain => hostname.includes(domain))
    if (!isValid) return null
    
    // Extract question info
    const info = extractQuestionInfo(url)
    if (!info || !info.questionId) return null
    
    // Build canonical URL
    const baseDomain = hostname.includes('stackoverflow.com') 
      ? 'stackoverflow.com' 
      : hostname
    
    let canonical = `https://${baseDomain}/questions/${info.questionId}`
    if (info.slug) {
      canonical += `/${info.slug}`
    }
    
    return canonical
  } catch (error) {
    return null
  }
}

/**
 * Validate if a URL is a valid Stack Overflow question page
 * 
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
export function validateStackOverflowUrl(url) {
  if (!url) return false
  
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    
    // Check domain
    const isValidDomain = VALID_DOMAINS.some(domain => hostname.includes(domain))
    if (!isValidDomain) return false
    
    // Must be a question page
    const isQuestionPage = path.includes('/questions/') || path.match(/\/q\/\d+/)
    if (!isQuestionPage) return false
    
    // Skip invalid pages
    const invalidPaths = [
      '/questions/ask',
      '/questions/tagged',
      '/users/',
      '/tags/',
      '/search',
      '/help/',
      '/tour',
      '/company'
    ]
    
    for (const invalid of invalidPaths) {
      if (path.includes(invalid)) return false
    }
    
    // Extract and validate question ID
    const info = extractQuestionInfo(url)
    if (!info || !info.questionId) return false
    
    return true
  } catch (error) {
    return false
  }
}

/**
 * Check if a question should be excluded
 * @param {Object} question - Question object
 * @returns {boolean} True if should be excluded
 */
function shouldExcludeQuestion(question) {
  // Exclude closed questions
  if (question.closedReason || question.closedDate) {
    return true
  }
  
  // Exclude if brand is mentioned in title or body
  const title = (question.title || '').toLowerCase()
  const body = (question.body || question.snippet || '').toLowerCase()
  const content = title + ' ' + body
  
  if (containsBrandMention(content)) {
    return true
  }
  
  return false
}

/**
 * Check if a question is relevant to the search query
 * @param {Object} question - Question object
 * @param {string} query - Search query
 * @returns {boolean} True if relevant
 */
function isRelevantQuestion(question, query) {
  if (!question.title || !query) return true
  
  const title = question.title.toLowerCase()
  const body = (question.body || question.snippet || '').toLowerCase()
  const tags = (question.tags || []).join(' ').toLowerCase()
  const content = title + ' ' + body + ' ' + tags
  
  // Stop words
  const stopWords = ['the', 'and', 'for', 'from', 'with', 'how', 'what', 'why', 'can', 'you', 'your', 'are', 'was', 'were', 'has', 'have', 'had', 'been', 'is', 'it', 'to', 'of', 'in', 'that', 'this', 'do', 'does', 'best', 'way', 'ways']
  
  const searchTerms = query.toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 2)
    .filter(term => !stopWords.includes(term))
  
  if (searchTerms.length === 0) return true
  
  const matchedTerms = searchTerms.filter(term => content.includes(term))
  
  // Require at least 1 term match for SO (technical queries are more specific)
  return matchedTerms.length >= 1
}

/**
 * Calculate relevance score for sorting
 * @param {Object} question - Question object
 * @param {string} query - Search query
 * @returns {number} Score
 */
function calculateRelevanceScore(question, query) {
  if (!question.title || !query) return 0
  
  const title = question.title.toLowerCase()
  const body = (question.body || question.snippet || '').toLowerCase()
  const queryLower = query.toLowerCase()
  
  let score = 0
  
  // Exact query match in title
  if (title.includes(queryLower)) {
    score += 100
  }
  
  // Word matches
  const searchTerms = queryLower.split(/\s+/).filter(t => t.length > 2)
  searchTerms.forEach(term => {
    if (title.includes(term)) score += 20
    if (body.includes(term)) score += 5
  })
  
  // Source bonus
  const sources = question.sources || []
  if (sources.includes('stackexchange')) score += 30
  if (sources.includes('bing')) score += 20
  if (sources.includes('google')) score += 20
  
  // Multi-source bonus
  if (sources.length >= 3) score += 50
  else if (sources.length >= 2) score += 25
  
  // Engagement bonus (capped)
  score += Math.min((question.score || 0) / 10, 30)
  score += Math.min((question.answerCount || 0) * 2, 20)
  
  // No accepted answer bonus (better opportunity)
  if (!question.acceptedAnswerId && !question.isAnswered) {
    score += 15
  }
  
  // Recency bonus
  if (question.lastActivityAt) {
    const daysSinceActivity = (Date.now() / 1000 - question.lastActivityAt) / 86400
    if (daysSinceActivity < 30) score += 20
    else if (daysSinceActivity < 90) score += 10
    else if (daysSinceActivity < 365) score += 5
  }
  
  return Math.round(score)
}

/**
 * Deduplicate search results by question ID
 * Merges metadata from multiple sources
 * 
 * @param {Object[]} results - Array of search results
 * @returns {Object[]} Deduplicated results
 */
export function deduplicateResults(results) {
  const questionMap = new Map()
  
  for (const result of results) {
    // Extract question ID
    let questionId = result.id || result.questionId
    
    if (!questionId && result.url) {
      const info = extractQuestionInfo(result.url)
      questionId = info?.questionId
    }
    
    if (!questionId) continue
    
    // Normalize URL
    const normalizedUrl = result.url ? normalizeUrl(result.url) : null
    if (result.url && !validateStackOverflowUrl(result.url)) continue
    
    if (questionMap.has(questionId)) {
      // Merge sources
      const existing = questionMap.get(questionId)
      const newSources = result.sources || [result.source || 'unknown']
      existing.sources = [...new Set([...existing.sources, ...newSources])]
      
      // Keep better data
      if (result.title && (!existing.title || result.title.length > existing.title.length)) {
        existing.title = result.title
      }
      if (result.body && (!existing.body || result.body.length > existing.body.length)) {
        existing.body = result.body
      }
      if (result.tags && result.tags.length > 0) {
        existing.tags = result.tags
      }
      // Prefer data from Stack Exchange API
      if (result.source === 'stackexchange') {
        existing.score = result.score ?? existing.score
        existing.answerCount = result.answerCount ?? existing.answerCount
        existing.viewCount = result.viewCount ?? existing.viewCount
        existing.isAnswered = result.isAnswered ?? existing.isAnswered
        existing.acceptedAnswerId = result.acceptedAnswerId ?? existing.acceptedAnswerId
        existing.lastActivityAt = result.lastActivityAt ?? existing.lastActivityAt
        existing.closedReason = result.closedReason ?? existing.closedReason
        existing.owner = result.owner ?? existing.owner
      }
    } else {
      // New question
      questionMap.set(questionId, {
        id: questionId,
        title: result.title || '',
        body: result.body || result.snippet || '',
        snippet: result.snippet || result.body?.substring(0, 300) || '',
        url: normalizedUrl || result.url || `https://stackoverflow.com/questions/${questionId}`,
        score: result.score || 0,
        answerCount: result.answerCount || 0,
        viewCount: result.viewCount || 0,
        isAnswered: result.isAnswered || false,
        acceptedAnswerId: result.acceptedAnswerId || null,
        createdAt: result.createdAt,
        lastActivityAt: result.lastActivityAt,
        tags: result.tags || [],
        owner: result.owner || 'Unknown',
        closedReason: result.closedReason,
        closedDate: result.closedDate,
        sources: result.sources || [result.source || 'unknown'],
        discoveredAt: new Date().toISOString()
      })
    }
  }
  
  return Array.from(questionMap.values())
}

/**
 * Process raw search results through the full pipeline
 * 
 * @param {Object[]} stackExchangeResults - Results from Stack Exchange API
 * @param {Object[]} bingResults - Results from Bing
 * @param {Object[]} googleResults - Results from Google CSE
 * @param {string} originalQuery - Original search query
 * @returns {Object} Processed results with stats
 */
export function processSearchResults(stackExchangeResults = [], bingResults = [], googleResults = [], originalQuery = '') {
  console.log('\n📊 Processing Stack Overflow search results...')
  console.log(`   Stack Exchange API: ${stackExchangeResults.length}`)
  console.log(`   Bing: ${bingResults.length}`)
  console.log(`   Google: ${googleResults.length}`)
  
  // Combine all results
  const allResults = [...stackExchangeResults, ...bingResults, ...googleResults]
  
  // Deduplicate
  let processed = deduplicateResults(allResults)
  console.log(`   After deduplication: ${processed.length} unique questions`)
  
  // Filter closed and brand mentions
  const beforeExclusions = processed.length
  processed = processed.filter(q => !shouldExcludeQuestion(q))
  const exclusionsFiltered = beforeExclusions - processed.length
  if (exclusionsFiltered > 0) {
    console.log(`   Filtered out ${exclusionsFiltered} excluded questions (closed or CloudFuze mentions)`)
  }
  
  // Filter by relevance
  if (originalQuery) {
    const beforeRelevance = processed.length
    processed = processed.filter(q => isRelevantQuestion(q, originalQuery))
    const irrelevantFiltered = beforeRelevance - processed.length
    if (irrelevantFiltered > 0) {
      console.log(`   Filtered out ${irrelevantFiltered} irrelevant questions`)
    }
  }
  
  // Calculate scores and sort
  processed = processed.map(q => ({
    ...q,
    relevanceScore: calculateRelevanceScore(q, originalQuery)
  }))
  
  processed.sort((a, b) => b.relevanceScore - a.relevanceScore)
  
  // Stats
  const stats = {
    total: processed.length,
    stackexchange: processed.filter(q => q.sources.includes('stackexchange')).length,
    bing: processed.filter(q => q.sources.includes('bing')).length,
    google: processed.filter(q => q.sources.includes('google')).length,
    multiSource: processed.filter(q => q.sources.length > 1).length
  }
  
  console.log(`   After processing: ${processed.length} questions`)
  console.log(`   Stack Exchange: ${stats.stackexchange} | Bing: ${stats.bing} | Google: ${stats.google} | Multi: ${stats.multiSource}`)
  
  return {
    questions: processed,
    stats
  }
}

export default {
  extractQuestionInfo,
  normalizeUrl,
  validateStackOverflowUrl,
  deduplicateResults,
  processSearchResults
}
