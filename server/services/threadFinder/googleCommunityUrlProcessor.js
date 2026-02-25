// URL Processor - Normalization, Validation, and Deduplication for Google Community URLs

import { normalizeProductName } from './googleCommunity.js'
import { containsBrandMention } from './commentChecker.js'

/**
 * Normalize a Google Community URL to a canonical format (includes Groups and Issue Tracker)
 * 
 * @param {string} url - Raw URL
 * @returns {string|null} Normalized URL or null if invalid
 */
export function normalizeGoogleCommunityUrl(url) {
  try {
    if (!url || typeof url !== 'string') return null
    
    // Parse the URL
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    
    // Valid Google Community domains (including Groups and Issue Tracker)
    const validDomains = [
      'support.google.com',
      'productforums.google.com',
      'googleproductforums.com',
      'groups.google.com',
      'issuetracker.google.com'
    ]
    
    const isValid = validDomains.some(domain => hostname.includes(domain))
    if (!isValid) return null
    
    // For Google Groups with hash, keep the hash
    if (hostname === 'groups.google.com' && parsed.hash) {
      return `${parsed.origin}${parsed.pathname}${parsed.hash}`
    }
    
    // Remove tracking parameters but keep essential ones
    const cleanUrl = url.split('?')[0].split('#')[0]
    
    return cleanUrl
  } catch (error) {
    return null
  }
}

/**
 * Validate if a URL is a valid Google Community page (includes Groups and Issue Tracker)
 * 
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid Google Community URL
 */
export function validateGoogleCommunityUrl(url) {
  if (!url) return false
  
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    const hash = parsed.hash.toLowerCase()
    
    // Google Groups - new format
    if (hostname === 'groups.google.com') {
      // Valid: /g/GROUP/c/THREAD or /forum/#!topic/
      return path.includes('/g/') && path.includes('/c/') ||
             hash.includes('!topic/') || hash.includes('!msg/')
    }
    
    // Google Issue Tracker
    if (hostname === 'issuetracker.google.com') {
      return path.includes('/issues/')
    }
    
    // Valid support domains
    const validDomains = [
      'support.google.com',
      'productforums.google.com',
      'googleproductforums.com'
    ]
    
    const isValidDomain = validDomains.some(domain => hostname.includes(domain))
    if (!isValidDomain) return false
    
    // Must contain thread or community content
    const validPathPatterns = [
      '/thread/',
      '/community',
      '/forum/'
    ]
    
    const hasValidPath = validPathPatterns.some(pattern => path.includes(pattern))
    
    // Skip invalid pages
    const invalidPaths = [
      '/announcements',
      '/guidelines',
      '/contact',
      '/about',
      '/policy',
      '/troubleshooter',
      '/answer/',
      '/legal'
    ]
    
    const hasInvalidPath = invalidPaths.some(invalid => path.includes(invalid))
    
    return hasValidPath && !hasInvalidPath
  } catch (error) {
    return false
  }
}

/**
 * Estimate if a thread is likely still open based on thread ID
 * Google thread IDs are roughly sequential - higher = newer
 * 
 * Based on analysis:
 * - Thread IDs around 400,000,000+ are from late 2024/2025
 * - Thread IDs around 370,000,000+ are from mid 2024
 * - Thread IDs around 340,000,000+ are from early 2024
 * - Thread IDs below 300,000,000 are likely 2023 or older
 * 
 * @param {string} threadId - Thread ID
 * @returns {boolean} True if likely recent (within 1 year)
 */
export function isLikelyRecentThread(threadId) {
  if (!threadId) return true // Can't determine, let it through
  
  const id = parseInt(threadId, 10)
  if (isNaN(id)) return true
  
  // Thread IDs above 300 million are from 2024+ (within 1 year)
  // Thread IDs below 300 million are likely older than 1 year
  const ONE_YEAR_THRESHOLD = 300000000  // ~early 2024
  
  return id >= ONE_YEAR_THRESHOLD
}

/**
 * Extract thread info from Google Community URL
 * 
 * @param {string} url - Google Community URL
 * @returns {Object|null} Thread info or null
 */
export function extractThreadInfo(url) {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname
    
    // Extract thread ID from support.google.com/[product]/thread/[id]
    const threadMatch = path.match(/\/([^\/]+)\/thread\/(\d+)/i)
    if (threadMatch) {
      return {
        product: threadMatch[1],
        threadId: threadMatch[2],
        type: 'thread'
      }
    }
    
    // Extract from productforums
    const forumMatch = url.match(/forum\/#!topic\/([^\/]+)\/([^\/\?]+)/i)
    if (forumMatch) {
      return {
        product: forumMatch[1],
        threadId: forumMatch[2],
        type: 'forum'
      }
    }
    
    // Community page (no specific thread)
    const communityMatch = path.match(/\/([^\/]+)\/community/i)
    if (communityMatch) {
      return {
        product: communityMatch[1],
        threadId: null,
        type: 'community'
      }
    }
    
    return null
  } catch (error) {
    return null
  }
}

/**
 * Deduplicate search results by URL
 * Merges metadata from multiple sources
 * 
 * @param {Object[]} results - Array of search results
 * @returns {Object[]} Deduplicated results
 */
export function deduplicateResults(results) {
  const urlMap = new Map()
  
  for (const result of results) {
    // Normalize the URL
    const normalizedUrl = normalizeGoogleCommunityUrl(result.url)
    if (!normalizedUrl) continue
    
    // Validate it's a community URL
    if (!validateGoogleCommunityUrl(normalizedUrl)) continue
    
    const threadInfo = extractThreadInfo(normalizedUrl)
    const uniqueKey = threadInfo?.threadId || normalizedUrl
    
    if (urlMap.has(uniqueKey)) {
      // Merge sources
      const existing = urlMap.get(uniqueKey)
      
      // Add source to list
      if (!existing.sources.includes(result.source)) {
        existing.sources.push(result.source)
      }
      
      // Keep the better title (longer usually means more complete)
      if (result.title && result.title.length > (existing.title?.length || 0)) {
        existing.title = result.title
      }
      
      // Keep the better snippet
      if (result.snippet && result.snippet.length > (existing.snippet?.length || 0)) {
        existing.snippet = result.snippet
      }
    } else {
      // Extract product name from URL
      const product = threadInfo?.product || 'general'
      
      // New URL
      urlMap.set(uniqueKey, {
        id: uniqueKey,
        threadId: threadInfo?.threadId,
        product: normalizeProductName(product),
        url: normalizedUrl,
        title: result.title || '',
        snippet: result.snippet || '',
        sources: [result.source],
        discoveredAt: new Date().toISOString()
      })
    }
  }
  
  return Array.from(urlMap.values())
}

/**
 * Check if a question should be excluded (mentions CloudFuze in title/snippet or is locked)
 * Note: Full reply checking is done separately via batchCheckGoogleCommunityReplies
 * @param {Object} question - Question object with title and snippet
 * @param {Map} replyCheckResults - Pre-fetched reply check results (optional)
 * @returns {boolean} True if should be excluded
 */
function shouldExcludeQuestion(question, replyCheckResults = null) {
  const title = (question.title || '').toLowerCase()
  const snippet = (question.snippet || '').toLowerCase()
  const content = title + ' ' + snippet
  
  // Filter out questions that mention CloudFuze in title/snippet
  if (containsBrandMention(content)) {
    return true
  }
  
  // Check if replies contain brand mention (if results are available)
  if (replyCheckResults && question.url) {
    const checkResult = replyCheckResults.get(question.url)
    if (checkResult?.hasBrandMention) {
      return true
    }
  }
  
  // Filter out locked threads
  // Common patterns that indicate a locked Google Community thread
  const lockedPatterns = [
    'locked',
    'this thread has been locked',
    'this post has been locked',
    'thread is locked',
    'post is locked',
    'comments are disabled',
    'replies are disabled',
    'this question is locked',
    '[locked]',
    '(locked)',
    'no longer accepting',
    'closed for comments',
    'closed for replies'
  ]
  
  for (const pattern of lockedPatterns) {
    if (content.includes(pattern)) {
      return true
    }
  }
  
  return false
}

/**
 * Check if a question is relevant to the search query
 * @param {Object} question - Question object with title and snippet
 * @param {string} query - Original search query
 * @returns {boolean} True if relevant
 */
function isRelevantQuestion(question, query) {
  if (!question.title || !query) return true
  
  const title = question.title.toLowerCase()
  const snippet = (question.snippet || '').toLowerCase()
  const product = (question.product || '').toLowerCase()
  const content = title + ' ' + snippet + ' ' + product
  
  // Stop words to ignore
  const stopWords = ['the', 'and', 'for', 'from', 'with', 'how', 'what', 'why', 'can', 'you', 'your', 'are', 'was', 'were', 'has', 'have', 'had', 'been', 'is', 'it', 'to', 'of', 'in', 'that', 'this', 'do', 'does', 'best', 'way', 'ways', 'google']
  
  // Get meaningful search terms
  const searchTerms = query.toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 2)
    .filter(term => !stopWords.includes(term))
  
  if (searchTerms.length === 0) return true
  
  // Count matches
  const matchedTerms = searchTerms.filter(term => content.includes(term))
  
  // Require at least 1 meaningful term to match
  return matchedTerms.length >= 1
}

/**
 * Calculate relevance score for sorting
 * @param {Object} question - Question object
 * @param {string} query - Search query
 * @returns {number} Relevance score (higher = more relevant)
 */
function calculateRelevanceScore(question, query) {
  if (!question.title || !query) return 0
  
  const title = question.title.toLowerCase()
  const snippet = (question.snippet || '').toLowerCase()
  const queryLower = query.toLowerCase()
  
  let score = 0
  
  // Exact query match in title = highest score
  if (title.includes(queryLower)) {
    score += 100
  }
  
  // Count word matches
  const searchTerms = queryLower.split(/\s+/).filter(t => t.length > 2)
  searchTerms.forEach(term => {
    if (title.includes(term)) score += 20
    if (snippet.includes(term)) score += 5
  })
  
  // Multi-source bonus
  score += (question.sources?.length || 1) * 15
  
  // Question format bonus
  if (title.includes('?') || title.toLowerCase().startsWith('how') || 
      title.toLowerCase().startsWith('what') || title.toLowerCase().startsWith('why')) {
    score += 10
  }
  
  return score
}

/**
 * Process raw search results through the full pipeline
 * 
 * @param {Object[]} bingResults - Results from Bing
 * @param {Object[]} googleResults - Results from Google CSE
 * @param {string} originalQuery - Original search query
 * @returns {Object} Processed results with stats
 */
export function processGoogleCommunityResults(bingResults = [], googleResults = [], originalQuery = '') {
  console.log('\n📊 Processing Google Community search results...')
  console.log(`   Raw Bing results: ${bingResults.length}`)
  console.log(`   Raw Google results: ${googleResults.length}`)
  
  // Combine all results
  const allResults = [...bingResults, ...googleResults]
  
  // Deduplicate and validate
  let processed = deduplicateResults(allResults)
  console.log(`   After deduplication: ${processed.length} unique questions`)
  
  // Filter out CloudFuze mentions and locked threads
  const beforeExclusions = processed.length
  processed = processed.filter(q => !shouldExcludeQuestion(q))
  const exclusionsFiltered = beforeExclusions - processed.length
  if (exclusionsFiltered > 0) {
    console.log(`   Filtered out ${exclusionsFiltered} excluded questions (CloudFuze mentions or locked threads)`)
  }
  
  // Filter out irrelevant questions
  if (originalQuery) {
    const beforeRelevance = processed.length
    processed = processed.filter(q => isRelevantQuestion(q, originalQuery))
    const irrelevantFiltered = beforeRelevance - processed.length
    if (irrelevantFiltered > 0) {
      console.log(`   Filtered out ${irrelevantFiltered} irrelevant questions`)
    }
  }
  
  // Calculate relevance scores and sort
  processed = processed.map(q => ({
    ...q,
    relevanceScore: calculateRelevanceScore(q, originalQuery)
  }))
  
  // Sort by relevance score (highest first)
  processed.sort((a, b) => b.relevanceScore - a.relevanceScore)
  
  // Calculate stats
  const stats = {
    total: processed.length,
    bing: processed.filter(r => r.sources.includes('bing')).length,
    google: processed.filter(r => r.sources.includes('google')).length,
    multiSource: processed.filter(r => r.sources.length > 1).length
  }
  
  console.log(`   After processing: ${processed.length} unique questions`)
  console.log(`   From Bing: ${stats.bing}`)
  console.log(`   From Google: ${stats.google}`)
  console.log(`   Multi-source: ${stats.multiSource}`)
  
  return {
    questions: processed,
    stats
  }
}
