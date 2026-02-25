// URL Processor - Normalization, Validation, and Deduplication for Quora URLs

import { containsBrandMention } from './commentChecker.js'

/**
 * Normalize a Quora URL to a canonical format
 * - Convert to lowercase (domain only)
 * - Remove tracking parameters
 * - Normalize trailing slashes
 * - Ensure https://www.quora.com format
 * 
 * @param {string} url - Raw URL
 * @returns {string|null} Normalized URL or null if invalid
 */
export function normalizeUrl(url) {
  try {
    if (!url || typeof url !== 'string') return null
    
    // Parse the URL
    const parsed = new URL(url)
    
    // Ensure it's a Quora URL
    if (!parsed.hostname.includes('quora.com')) {
      return null
    }
    
    // Extract the path
    let path = parsed.pathname
    
    // Remove trailing slash
    path = path.replace(/\/+$/, '')
    
    // Remove /answer/... suffix if present (we want the question, not specific answer)
    path = path.replace(/\/answer\/[^\/]+$/, '')
    
    // Build canonical URL
    const canonical = `https://www.quora.com${path}`
    
    return canonical
  } catch (error) {
    return null
  }
}

/**
 * Validate if a URL is a valid Quora question page
 * 
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid Quora question URL
 */
export function validateQuoraUrl(url) {
  if (!url) return false
  
  try {
    const parsed = new URL(url)
    
    // Must be quora.com domain
    if (!parsed.hostname.includes('quora.com')) {
      return false
    }
    
    const path = parsed.pathname
    
    // Skip non-question pages
    const invalidPaths = [
      '/profile/',
      '/topic/',
      '/space/',
      '/search',
      '/about',
      '/contact',
      '/privacy',
      '/terms',
      '/settings',
      '/notifications',
      '/answer_requests',
      '/content',
      '/stats',
      '/log',
      '/followers',
      '/following',
      '/edits',
      '/all_posts'
    ]
    
    for (const invalid of invalidPaths) {
      if (path.toLowerCase().includes(invalid)) {
        return false
      }
    }
    
    // Path should have a question slug (at least one segment after /)
    const segments = path.split('/').filter(s => s.length > 0)
    if (segments.length === 0) {
      return false
    }
    
    // Question slug should be reasonably long (not just a short code)
    const slug = segments[0]
    if (slug.length < 5) {
      return false
    }
    
    // Should contain hyphens or be a readable question
    // Most Quora questions have hyphens: "How-do-I-learn-programming"
    // But some older ones might not
    
    return true
  } catch (error) {
    return false
  }
}

/**
 * Extract question slug from Quora URL
 * 
 * @param {string} url - Quora URL
 * @returns {string|null} Question slug or null
 */
export function extractSlug(url) {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname
    
    // Remove leading slash and get first segment
    const segments = path.split('/').filter(s => s.length > 0)
    
    // Handle /unanswered/Question-Slug format
    if (segments[0] === 'unanswered' && segments.length > 1) {
      return segments[1]
    }
    
    return segments[0] || null
  } catch (error) {
    return null
  }
}

/**
 * Convert slug to readable title
 * "How-do-I-learn-programming" -> "How do I learn programming"
 * 
 * @param {string} slug - URL slug
 * @returns {string} Readable title
 */
export function slugToTitle(slug) {
  if (!slug) return ''
  return slug.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
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
    const normalizedUrl = normalizeUrl(result.url)
    if (!normalizedUrl) continue
    
    // Validate it's a question URL
    if (!validateQuoraUrl(normalizedUrl)) continue
    
    const slug = extractSlug(normalizedUrl)
    if (!slug) continue
    
    if (urlMap.has(normalizedUrl)) {
      // Merge sources
      const existing = urlMap.get(normalizedUrl)
      
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
      // New URL
      urlMap.set(normalizedUrl, {
        id: slug,
        slug,
        url: normalizedUrl,
        title: result.title || slugToTitle(slug),
        snippet: result.snippet || '',
        sources: [result.source],
        discoveredAt: new Date().toISOString()
      })
    }
  }
  
  return Array.from(urlMap.values())
}

/**
 * Check if a Quora question should be excluded (mentions CloudFuze in title/snippet)
 * Note: Full answer checking is done separately via batchCheckQuoraAnswers
 * @param {Object} question - Question object with title and snippet
 * @param {Map} answerCheckResults - Pre-fetched answer check results (optional)
 * @returns {boolean} True if should be excluded
 */
function shouldExcludeQuestion(question, answerCheckResults = null) {
  const title = (question.title || '').toLowerCase()
  const snippet = (question.snippet || '').toLowerCase()
  const content = title + ' ' + snippet
  
  // Filter out questions that mention CloudFuze in title/snippet
  if (containsBrandMention(content)) {
    return true
  }
  
  // Check if answers contain brand mention (if results are available)
  if (answerCheckResults && question.url) {
    const checkResult = answerCheckResults.get(question.url)
    if (checkResult?.hasBrandMention) {
      return true
    }
  }
  
  return false
}

/**
 * Check if a Quora question is relevant to the search query
 * @param {Object} question - Question object with title and snippet
 * @param {string} query - Original search query
 * @returns {boolean} True if relevant
 */
function isRelevantQuestion(question, query) {
  if (!question.title || !query) return true // Be lenient if no title/query
  
  const title = question.title.toLowerCase()
  const snippet = (question.snippet || '').toLowerCase()
  const content = title + ' ' + snippet
  
  // Stop words to ignore
  const stopWords = ['the', 'and', 'for', 'from', 'with', 'how', 'what', 'why', 'can', 'you', 'your', 'are', 'was', 'were', 'has', 'have', 'had', 'been', 'is', 'it', 'to', 'of', 'in', 'that', 'this', 'do', 'does', 'best', 'way', 'ways']
  
  // Get meaningful search terms
  const searchTerms = query.toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 2)
    .filter(term => !stopWords.includes(term))
  
  if (searchTerms.length === 0) return true // No meaningful terms, accept all
  
  // Count matches
  const matchedTerms = searchTerms.filter(term => content.includes(term))
  
  // Require at least 1 meaningful term to match (lenient for Quora since results are harder to get)
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
  
  // Count word matches in title (more valuable than snippet)
  const searchTerms = queryLower.split(/\s+/).filter(t => t.length > 2)
  searchTerms.forEach(term => {
    if (title.includes(term)) score += 20
    if (snippet.includes(term)) score += 5
  })
  
  // Multi-source bonus (found in both Bing + Google = more AI visible)
  score += (question.sources?.length || 1) * 15
  
  // Question format bonus (actual questions are better for AI visibility)
  if (title.includes('?') || title.toLowerCase().startsWith('how') || 
      title.toLowerCase().startsWith('what') || title.toLowerCase().startsWith('why') ||
      title.toLowerCase().startsWith('can') || title.toLowerCase().startsWith('should')) {
    score += 10
  }
  
  return score
}

/**
 * Process raw search results through the full pipeline
 * 1. Normalize URLs
 * 2. Validate as Quora questions
 * 3. Deduplicate across sources
 * 4. Filter out CloudFuze mentions
 * 5. Filter out irrelevant questions
 * 6. Sort by AI visibility score
 * 
 * @param {Object[]} bingResults - Results from Bing
 * @param {Object[]} googleResults - Results from Google CSE
 * @param {string} originalQuery - Original search query for relevance filtering
 * @returns {Object} Processed results with stats
 */
export function processSearchResults(bingResults = [], googleResults = [], originalQuery = '') {
  console.log('\n📊 Processing search results...')
  console.log(`   Raw Bing results: ${bingResults.length}`)
  console.log(`   Raw Google results: ${googleResults.length}`)
  
  // Combine all results
  const allResults = [...bingResults, ...googleResults]
  
  // Deduplicate and validate
  let processed = deduplicateResults(allResults)
  console.log(`   After deduplication: ${processed.length} unique questions`)
  
  // Filter out CloudFuze mentions
  const beforeCloudFuze = processed.length
  processed = processed.filter(q => !shouldExcludeQuestion(q))
  const cloudFuzeFiltered = beforeCloudFuze - processed.length
  if (cloudFuzeFiltered > 0) {
    console.log(`   Filtered out ${cloudFuzeFiltered} CloudFuze mentions`)
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
  
  // Calculate relevance scores and sort by AI visibility
  processed = processed.map(q => ({
    ...q,
    relevanceScore: calculateRelevanceScore(q, originalQuery)
  }))
  
  // Sort by relevance score (highest first) - prioritizes AI-visible questions
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


