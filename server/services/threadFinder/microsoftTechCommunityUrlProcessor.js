// URL Processor - Normalization, Validation, and Deduplication for Microsoft Tech Community URLs

import { containsBrandMention } from './commentChecker.js'

/**
 * Valid Microsoft Tech Community domains
 */
const VALID_DOMAINS = [
  'techcommunity.microsoft.com',
  'answers.microsoft.com',
  'learn.microsoft.com'
]

/**
 * Microsoft product categories
 */
const PRODUCT_CATEGORIES = {
  'microsoft-365': 'Microsoft 365',
  'microsoft365': 'Microsoft 365',
  'm365': 'Microsoft 365',
  'office-365': 'Office 365',
  'office365': 'Office 365',
  'sharepoint': 'SharePoint',
  'onedrive': 'OneDrive',
  'teams': 'Microsoft Teams',
  'exchange': 'Exchange',
  'outlook': 'Outlook',
  'azure': 'Azure',
  'windows': 'Windows',
  'dynamics': 'Dynamics 365',
  'power-platform': 'Power Platform',
  'powerplatform': 'Power Platform',
  'security': 'Security',
  'compliance': 'Compliance',
  'intune': 'Intune',
  'endpoint-manager': 'Endpoint Manager'
}

/**
 * Extract thread info from Microsoft Tech Community URL
 * 
 * Supported URL formats:
 * - techcommunity.microsoft.com/t5/{forum}/[title]/td-p/{id}
 * - techcommunity.microsoft.com/t5/{forum}/[title]/m-p/{id}
 * - answers.microsoft.com/en-us/{product}/forum/.../{id}
 * 
 * @param {string} url - URL to parse
 * @returns {Object|null} Extracted info or null
 */
export function extractThreadInfo(url) {
  try {
    if (!url) return null
    
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const path = parsed.pathname
    
    // Tech Community format: /t5/{forum}/{title}/td-p/{id} or /m-p/{id}
    const techCommunityMatch = path.match(/\/t5\/([^\/]+)\/[^\/]+\/(td-p|m-p)\/(\d+)/i)
    if (techCommunityMatch && hostname.includes('techcommunity.microsoft.com')) {
      return {
        threadId: techCommunityMatch[3],
        forum: techCommunityMatch[1],
        type: techCommunityMatch[2] === 'td-p' ? 'discussion' : 'message',
        domain: 'techcommunity'
      }
    }
    
    // Answers format: /en-us/{product}/forum/...
    const answersMatch = path.match(/\/[a-z]{2}-[a-z]{2}\/([^\/]+)\/forum\/[^\/]+\/[^\/]+\/([a-f0-9-]+)/i)
    if (answersMatch && hostname.includes('answers.microsoft.com')) {
      return {
        threadId: answersMatch[2],
        product: answersMatch[1],
        type: 'answer',
        domain: 'answers'
      }
    }
    
    // Alternative Tech Community format without td-p/m-p
    const altMatch = path.match(/\/t5\/([^\/]+)\/([^\/]+)\/ta-p\/(\d+)/i)
    if (altMatch && hostname.includes('techcommunity.microsoft.com')) {
      return {
        threadId: altMatch[3],
        forum: altMatch[1],
        type: 'article',
        domain: 'techcommunity'
      }
    }
    
    return null
  } catch (error) {
    return null
  }
}

/**
 * Normalize Microsoft Tech Community URL
 * @param {string} url - Raw URL
 * @returns {string|null} Normalized URL or null
 */
export function normalizeUrl(url) {
  try {
    if (!url || typeof url !== 'string') return null
    
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    
    // Check valid domain
    const isValid = VALID_DOMAINS.some(domain => hostname.includes(domain))
    if (!isValid) return null
    
    // Remove tracking parameters
    const cleanUrl = url.split('?')[0].split('#')[0]
    
    return cleanUrl
  } catch (error) {
    return null
  }
}

/**
 * Validate if URL is a valid Microsoft Tech Community thread
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
export function validateMicrosoftTechUrl(url) {
  if (!url) return false
  
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    
    // Check domain
    const isValidDomain = VALID_DOMAINS.some(domain => hostname.includes(domain))
    if (!isValidDomain) return false
    
    // Skip invalid pages
    const invalidPaths = [
      '/user/',
      '/users/',
      '/tag/',
      '/tags/',
      '/search',
      '/about',
      '/contact',
      '/privacy',
      '/terms',
      '/category/',
      '/categories/',
      '/badge/',
      '/badges/'
    ]
    
    for (const invalid of invalidPaths) {
      if (path.includes(invalid)) return false
    }
    
    // Must have thread ID
    const info = extractThreadInfo(url)
    return info !== null && info.threadId !== null
  } catch (error) {
    return false
  }
}

/**
 * Normalize product name
 * @param {string} product - Raw product name
 * @returns {string} Normalized product name
 */
export function normalizeProductName(product) {
  if (!product) return 'General'
  
  const lower = product.toLowerCase().replace(/-/g, '')
  
  for (const [key, value] of Object.entries(PRODUCT_CATEGORIES)) {
    if (lower.includes(key.replace(/-/g, ''))) {
      return value
    }
  }
  
  // Capitalize first letter of each word
  return product.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/**
 * Check if thread should be excluded
 * @param {Object} thread - Thread object
 * @param {Map} replyCheckResults - Optional reply check results (may contain locked status)
 * @returns {boolean} True if should be excluded
 */
function shouldExcludeThread(thread, replyCheckResults = null) {
  const title = (thread.title || '').toLowerCase()
  const snippet = (thread.snippet || thread.body || '').toLowerCase()
  const url = (thread.url || '').toLowerCase()
  const content = title + ' ' + snippet
  
  // Filter CloudFuze mentions
  if (containsBrandMention(content)) {
    return true
  }
  
  // Filter locked/archived/retired threads - comprehensive patterns for Microsoft Tech Community
  // NOTE: Only include patterns that truly indicate LOCKED/RETIRED threads (cannot reply)
  // DO NOT include 'answered', 'solved', 'resolved' - these can still accept replies
  const lockedPatterns = [
    'locked',
    'archived',
    'retired',
    'this thread has been locked',
    'this discussion has been locked',
    'this thread is locked',
    'this discussion is locked',
    'this post has been locked',
    'this post is locked',
    'no longer accepting replies',
    'no longer accepting responses',
    'no longer accepting comments',
    'closed for comments',
    'closed for replies',
    'comments are disabled',
    'replies are disabled',
    'replies have been turned off',
    'this question is closed',
    'this thread is closed',
    'thread closed',
    'discussion closed',
    '[locked]',
    '[closed]',
    '[archived]',
    '[retired]',
    '(locked)',
    '(closed)',
    '(archived)',
    '(retired)',
    'read-only',
    'read only mode',
    // Microsoft specific locked indicators
    'this question has been closed',
    'comments have been disabled',
    'commenting is disabled',
    'this content is locked',
    'thread has been archived',
    // MIGRATED questions are LOCKED - very important!
    'migrated from',
    'was migrated',
    'question was migrated',
    'migrated from the microsoft',
    'can\'t add comments or replies',
    'cannot add comments or replies',
    'you can\'t add comments',
    'you cannot add comments',
    'locked question',
    // RETIRED questions - cannot engage at all!
    'this question has been retired',
    'question has been retired',
    'has been retired',
    'content has been retired',
    'this content has been retired',
    'page has been retired',
    'retired question',
    'retired content',
    'question you\'re looking for has been retired',
    'we\'re not migrating all the content'
  ]
  
  for (const pattern of lockedPatterns) {
    if (content.includes(pattern)) {
      return true
    }
  }
  
  // Check URL patterns that indicate archived/retired/old content
  const lockedUrlPatterns = [
    '/archive/',
    '/archived/',
    '/legacy/',
    '/old/',
    '/retired/',
    'view=archived',
    'view=retired',
    'status=retired'
  ]
  
  for (const pattern of lockedUrlPatterns) {
    if (url.includes(pattern)) {
      return true
    }
  }
  
  // Check if reply check results indicate locked status
  if (replyCheckResults && thread.url) {
    const checkResult = replyCheckResults.get(thread.url)
    if (checkResult?.isLocked) {
      return true
    }
  }
  
  return false
}

/**
 * Check if thread is relevant to query
 * @param {Object} thread - Thread object
 * @param {string} query - Search query
 * @returns {boolean} True if relevant
 */
function isRelevantThread(thread, query) {
  if (!thread.title || !query) return true
  
  const title = thread.title.toLowerCase()
  const snippet = (thread.snippet || thread.body || '').toLowerCase()
  const product = (thread.product || '').toLowerCase()
  const content = title + ' ' + snippet + ' ' + product
  
  const stopWords = ['the', 'and', 'for', 'from', 'with', 'how', 'what', 'why', 'can', 'you', 'your', 'are', 'was', 'were', 'has', 'have', 'had', 'been', 'is', 'it', 'to', 'of', 'in', 'that', 'this', 'do', 'does', 'best', 'way', 'ways', 'microsoft']
  
  const searchTerms = query.toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 2)
    .filter(term => !stopWords.includes(term))
  
  if (searchTerms.length === 0) return true
  
  const matchedTerms = searchTerms.filter(term => content.includes(term))
  return matchedTerms.length >= 1
}

/**
 * Calculate relevance score
 * @param {Object} thread - Thread object
 * @param {string} query - Search query
 * @returns {number} Score
 */
function calculateRelevanceScore(thread, query) {
  if (!thread.title || !query) return 0
  
  const title = thread.title.toLowerCase()
  const snippet = (thread.snippet || thread.body || '').toLowerCase()
  const queryLower = query.toLowerCase()
  
  let score = 0
  
  // Exact match in title
  if (title.includes(queryLower)) {
    score += 100
  }
  
  // Word matches
  const searchTerms = queryLower.split(/\s+/).filter(t => t.length > 2)
  searchTerms.forEach(term => {
    if (title.includes(term)) score += 20
    if (snippet.includes(term)) score += 5
  })
  
  // Source bonus
  const sources = thread.sources || []
  if (sources.includes('bing')) score += 20
  if (sources.includes('google')) score += 20
  
  // Multi-source bonus
  if (sources.length >= 2) score += 25
  
  // Microsoft 365 / OneDrive / SharePoint relevance bonus (for CloudFuze)
  const cloudRelevant = ['onedrive', 'sharepoint', 'microsoft 365', 'office 365', 'teams', 'migration']
  for (const term of cloudRelevant) {
    if (title.includes(term) || snippet.includes(term)) {
      score += 15
      break
    }
  }
  
  return Math.round(score)
}

/**
 * Deduplicate results
 * @param {Object[]} results - Search results
 * @returns {Object[]} Deduplicated results
 */
export function deduplicateResults(results) {
  const threadMap = new Map()
  
  for (const result of results) {
    const info = extractThreadInfo(result.url)
    if (!info || !info.threadId) continue
    
    const normalizedUrl = normalizeUrl(result.url)
    if (!normalizedUrl || !validateMicrosoftTechUrl(result.url)) continue
    
    const uniqueKey = `${info.domain}-${info.threadId}`
    
    if (threadMap.has(uniqueKey)) {
      const existing = threadMap.get(uniqueKey)
      const newSources = result.sources || [result.source || 'unknown']
      existing.sources = [...new Set([...existing.sources, ...newSources])]
      
      if (result.title && result.title.length > (existing.title?.length || 0)) {
        existing.title = result.title
      }
      if (result.snippet && result.snippet.length > (existing.snippet?.length || 0)) {
        existing.snippet = result.snippet
      }
    } else {
      const product = normalizeProductName(info.forum || info.product || '')
      
      threadMap.set(uniqueKey, {
        id: uniqueKey,
        threadId: info.threadId,
        product: product,
        forum: info.forum,
        type: info.type,
        domain: info.domain,
        url: normalizedUrl,
        title: result.title?.replace(/ - Microsoft Tech Community$/, '').replace(/ - Microsoft Community$/, '').trim() || '',
        snippet: result.snippet || '',
        sources: result.sources || [result.source || 'unknown'],
        discoveredAt: new Date().toISOString()
      })
    }
  }
  
  return Array.from(threadMap.values())
}

/**
 * Process search results through full pipeline
 * @param {Object[]} bingResults - Bing results
 * @param {Object[]} googleResults - Google results
 * @param {string} originalQuery - Search query
 * @returns {Object} Processed results
 */
export function processSearchResults(bingResults = [], googleResults = [], originalQuery = '') {
  console.log('\n📊 Processing Microsoft Tech Community search results...')
  console.log(`   Bing: ${bingResults.length}`)
  console.log(`   Google: ${googleResults.length}`)
  
  const allResults = [...bingResults, ...googleResults]
  
  // Deduplicate
  let processed = deduplicateResults(allResults)
  console.log(`   After deduplication: ${processed.length} unique threads`)
  
  // Filter exclusions
  const beforeExclusions = processed.length
  processed = processed.filter(t => !shouldExcludeThread(t))
  if (beforeExclusions - processed.length > 0) {
    console.log(`   Filtered out ${beforeExclusions - processed.length} excluded threads`)
  }
  
  // Filter relevance
  if (originalQuery) {
    const beforeRelevance = processed.length
    processed = processed.filter(t => isRelevantThread(t, originalQuery))
    if (beforeRelevance - processed.length > 0) {
      console.log(`   Filtered out ${beforeRelevance - processed.length} irrelevant threads`)
    }
  }
  
  // Score and sort
  processed = processed.map(t => ({
    ...t,
    relevanceScore: calculateRelevanceScore(t, originalQuery)
  }))
  
  processed.sort((a, b) => b.relevanceScore - a.relevanceScore)
  
  // Stats
  const stats = {
    total: processed.length,
    bing: processed.filter(t => t.sources.includes('bing')).length,
    google: processed.filter(t => t.sources.includes('google')).length,
    multiSource: processed.filter(t => t.sources.length > 1).length
  }
  
  console.log(`   Final: ${processed.length} threads`)
  console.log(`   Bing: ${stats.bing} | Google: ${stats.google} | Multi: ${stats.multiSource}`)
  
  return { threads: processed, stats }
}

export default {
  extractThreadInfo,
  normalizeUrl,
  validateMicrosoftTechUrl,
  normalizeProductName,
  deduplicateResults,
  processSearchResults
}
