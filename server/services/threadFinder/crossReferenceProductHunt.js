// Cross-Reference Engine for Product Hunt
// Uses Bing + Google CSE (Product Hunt API requires OAuth)

import { expandQuery } from './queryExpander.js'
import { searchBingMultiQuery } from './bingSearch.js'
import { searchGoogleCSEMultiQuery } from './googleCSE.js'
import { containsBrandMention } from './commentChecker.js'

/**
 * Check which APIs are configured
 */
function getConfiguredAPIs() {
  return {
    bing: !!process.env.BING_API_KEY,
    google: !!(process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_CSE_KEY) && !!(process.env.GOOGLE_CSE_ID || process.env.GOOGLE_CSE_CX)
  }
}

/**
 * Product Hunt content types
 */
const CONTENT_TYPES = {
  'posts': 'Product Launch',
  'discussions': 'Discussion',
  'stories': 'Story',
  'questions': 'Question',
  'reviews': 'Review'
}

/**
 * Extract post/discussion info from Product Hunt URL
 * @param {string} url - URL to parse
 * @returns {Object|null} Extracted info
 */
function extractPostInfo(url) {
  try {
    if (!url) return null
    
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const path = parsed.pathname
    
    if (!hostname.includes('producthunt.com')) {
      return null
    }
    
    // Product post: /posts/{slug}
    const postMatch = path.match(/\/posts\/([^\/\?]+)/i)
    if (postMatch) {
      return {
        id: postMatch[1],
        slug: postMatch[1],
        type: 'posts'
      }
    }
    
    // Discussion: /discussions/{id}
    const discussionMatch = path.match(/\/discussions\/(\d+)/i)
    if (discussionMatch) {
      return {
        id: discussionMatch[1],
        type: 'discussions'
      }
    }
    
    // Story: /stories/{id}
    const storyMatch = path.match(/\/stories\/(\d+)/i)
    if (storyMatch) {
      return {
        id: storyMatch[1],
        type: 'stories'
      }
    }
    
    // Questions: /questions/{slug} or /ask/{slug}
    const questionMatch = path.match(/\/(questions|ask)\/([^\/\?]+)/i)
    if (questionMatch) {
      return {
        id: questionMatch[2],
        slug: questionMatch[2],
        type: 'questions'
      }
    }
    
    // Product page: /products/{slug}
    const productMatch = path.match(/\/products\/([^\/\?]+)/i)
    if (productMatch) {
      return {
        id: productMatch[1],
        slug: productMatch[1],
        type: 'products'
      }
    }
    
    return null
  } catch (error) {
    return null
  }
}

/**
 * Normalize Product Hunt URL
 * @param {string} url - Raw URL
 * @returns {string|null} Normalized URL
 */
function normalizeUrl(url) {
  try {
    if (!url || typeof url !== 'string') return null
    
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    
    if (!hostname.includes('producthunt.com')) return null
    
    // Remove tracking parameters
    const cleanUrl = url.split('?')[0].split('#')[0]
    
    return cleanUrl
  } catch (error) {
    return null
  }
}

/**
 * Validate if URL is a valid Product Hunt page
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
function validateProductHuntUrl(url) {
  if (!url) return false
  
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    
    if (!hostname.includes('producthunt.com')) return false
    
    // Skip invalid pages
    const invalidPaths = [
      '/login',
      '/signup',
      '/settings',
      '/notifications',
      '/search',
      '/@',  // User profiles
      '/topics/',
      '/newsletter',
      '/about',
      '/terms',
      '/privacy',
      '/ship',  // Ship by Product Hunt
      '/makers/',
      '/golden-kitty'
    ]
    
    for (const invalid of invalidPaths) {
      if (path.startsWith(invalid) || path.includes(invalid)) return false
    }
    
    // Must have valid content type
    const info = extractPostInfo(url)
    return info !== null && info.id !== null
  } catch (error) {
    return false
  }
}

/**
 * Detect category from content
 * @param {string} title - Title
 * @param {string} snippet - Snippet
 * @returns {string} Category
 */
function detectCategory(title = '', snippet = '') {
  const content = (title + ' ' + snippet).toLowerCase()
  
  if (content.includes('saas') || content.includes('software as a service')) {
    return 'SaaS'
  }
  if (content.includes('productivity') || content.includes('workflow')) {
    return 'Productivity'
  }
  if (content.includes('developer') || content.includes('api') || content.includes('coding')) {
    return 'Developer Tools'
  }
  if (content.includes('ai') || content.includes('artificial intelligence') || content.includes('machine learning')) {
    return 'AI & ML'
  }
  if (content.includes('marketing') || content.includes('seo') || content.includes('growth')) {
    return 'Marketing'
  }
  if (content.includes('design') || content.includes('ui') || content.includes('ux')) {
    return 'Design'
  }
  if (content.includes('finance') || content.includes('fintech') || content.includes('payment')) {
    return 'Finance'
  }
  if (content.includes('cloud') || content.includes('storage') || content.includes('backup')) {
    return 'Cloud'
  }
  if (content.includes('collaboration') || content.includes('team') || content.includes('remote')) {
    return 'Collaboration'
  }
  if (content.includes('analytics') || content.includes('data') || content.includes('metrics')) {
    return 'Analytics'
  }
  
  return 'Tech'
}

/**
 * Build search queries with Product Hunt site prefix
 * @param {string[]} variants - Query variants
 * @param {string} contentType - Optional content type filter
 * @returns {string[]} Search queries
 */
function buildProductHuntSearchQueries(variants, contentType = '') {
  const sitePrefix = 'site:producthunt.com'
  
  return variants.map(variant => {
    let query = `${sitePrefix} ${variant}`
    if (contentType && contentType !== 'all') {
      query += ` inurl:${contentType}`
    }
    return query
  })
}

/**
 * Transform web search results to normalized format
 * @param {Object[]} results - Raw results
 * @param {string} source - Source identifier
 * @returns {Object[]} Normalized results
 */
function transformWebSearchResults(results, source) {
  return results
    .filter(r => r.url && r.url.includes('producthunt.com'))
    .filter(r => validateProductHuntUrl(r.url))
    .map(result => {
      const info = extractPostInfo(result.url)
      if (!info) return null
      
      const normalizedUrl = normalizeUrl(result.url)
      const title = result.title
        ?.replace(/ \| Product Hunt$/i, '')
        .replace(/ - Product Hunt$/i, '')
        .trim() || ''
      
      return {
        id: `ph-${info.type}-${info.id}`,
        postId: info.id,
        slug: info.slug,
        title: title,
        snippet: result.snippet || '',
        url: normalizedUrl,
        type: info.type,
        typeName: CONTENT_TYPES[info.type] || 'Post',
        category: detectCategory(title, result.snippet),
        source: source,
        sources: [source],
        discoveredAt: new Date().toISOString()
      }
    })
    .filter(Boolean)
}

/**
 * Check if post should be excluded
 * @param {Object} post - Post object
 * @returns {boolean} True if should be excluded
 */
function shouldExcludePost(post) {
  const title = (post.title || '').toLowerCase()
  const snippet = (post.snippet || '').toLowerCase()
  const content = title + ' ' + snippet
  
  // Filter CloudFuze mentions
  if (containsBrandMention(content)) {
    return true
  }
  
  return false
}

/**
 * Check if post is relevant
 * @param {Object} post - Post object
 * @param {string} query - Search query
 * @returns {boolean} True if relevant
 */
function isRelevantPost(post, query) {
  if (!post.title || !query) return true
  
  const title = post.title.toLowerCase()
  const snippet = (post.snippet || '').toLowerCase()
  const content = title + ' ' + snippet
  
  const stopWords = ['the', 'and', 'for', 'from', 'with', 'how', 'what', 'why', 'can', 'you', 'your', 'are', 'was', 'were', 'has', 'have', 'had', 'been', 'is', 'it', 'to', 'of', 'in', 'that', 'this', 'do', 'does', 'best', 'way', 'ways', 'new', 'launch', 'launching']
  
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
 * @param {Object} post - Post object
 * @param {string} query - Search query
 * @returns {number} Score
 */
function calculateRelevanceScore(post, query) {
  if (!post.title || !query) return 0
  
  const title = post.title.toLowerCase()
  const snippet = (post.snippet || '').toLowerCase()
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
  const sources = post.sources || []
  if (sources.includes('bing')) score += 20
  if (sources.includes('google')) score += 20
  
  // Multi-source bonus
  if (sources.length >= 2) score += 25
  
  // Content type bonus
  if (post.type === 'discussions' || post.type === 'questions') {
    score += 15  // Better for engagement
  }
  
  // Category relevance bonus (for CloudFuze)
  const relevantCategories = ['SaaS', 'Cloud', 'Productivity', 'Collaboration']
  if (relevantCategories.includes(post.category)) {
    score += 15
  }
  
  return Math.round(score)
}

/**
 * Deduplicate results
 * @param {Object[]} results - Results
 * @returns {Object[]} Deduplicated
 */
function deduplicateResults(results) {
  const postMap = new Map()
  
  for (const result of results) {
    const id = result.id || result.postId
    if (!id) continue
    
    if (postMap.has(id)) {
      const existing = postMap.get(id)
      const newSources = result.sources || [result.source || 'unknown']
      existing.sources = [...new Set([...existing.sources, ...newSources])]
      
      if (result.title && result.title.length > (existing.title?.length || 0)) {
        existing.title = result.title
      }
      if (result.snippet && result.snippet.length > (existing.snippet?.length || 0)) {
        existing.snippet = result.snippet
      }
    } else {
      postMap.set(id, {
        ...result,
        sources: result.sources || [result.source || 'unknown']
      })
    }
  }
  
  return Array.from(postMap.values())
}

/**
 * Main Product Hunt cross-reference search
 * @param {string} query - Search query
 * @param {Object} options - Options
 * @returns {Promise<Object>} Results
 */
export async function crossReferenceProductHuntSearch(query, options = {}) {
  const configuredAPIs = getConfiguredAPIs()
  
  console.log('\n========================================')
  console.log('PRODUCT HUNT CROSS-REFERENCE SEARCH')
  console.log('Query:', query)
  console.log('Configured APIs:',
    configuredAPIs.bing ? '✅ Bing' : '❌ Bing',
    configuredAPIs.google ? '✅ Google' : '❌ Google'
  )
  console.log('========================================\n')
  
  // Check if at least one API is configured
  if (!configuredAPIs.bing && !configuredAPIs.google) {
    console.error('❌ No search APIs configured!')
    return {
      posts: [],
      stats: { total: 0, bing: 0, google: 0, multiSource: 0 },
      query,
      error: 'No search APIs configured. Please add API keys to .env file.'
    }
  }
  
  const {
    useBing = configuredAPIs.bing,
    useGoogle = configuredAPIs.google,
    maxVariants = 4,
    resultsPerQuery = 30,
    limit = 150,
    timeFilter = 'all',
    contentType = 'all'
  } = options
  
  // Time filter conversion
  const getTimeParams = (filter) => {
    switch (filter) {
      case '1month':
        return { bingFreshness: 'Month', googleDateRestrict: 'm1' }
      case '3months':
        return { bingFreshness: 'Month', googleDateRestrict: 'm3' }
      case '6months':
        return { bingFreshness: null, googleDateRestrict: 'm6' }
      case '1year':
        return { bingFreshness: null, googleDateRestrict: 'y1' }
      default:
        return { bingFreshness: null, googleDateRestrict: null }
    }
  }
  
  const timeParams = getTimeParams(timeFilter)
  
  // Step 1: Query expansion
  console.log('📝 Step 1: Query Expansion')
  const variants = expandQuery(query, maxVariants)
  
  // Build search queries
  const searchQueries = buildProductHuntSearchQueries(variants, contentType)
  console.log(`   Generated ${variants.length} variants, ${searchQueries.length} search queries`)
  
  // Step 2: Execute searches
  console.log('\n🌐 Step 2: Executing Searches')
  
  const searchPromises = []
  
  if (useBing) {
    console.log('🔵 Starting Bing search...')
    searchPromises.push(
      searchBingMultiQuery(searchQueries, resultsPerQuery, {
        freshness: timeParams.bingFreshness
      })
      .then(result => ({
        results: transformWebSearchResults(result.results || [], 'bing'),
        source: 'bing'
      }))
      .catch(err => {
        console.error('Bing search failed:', err.message)
        return { results: [], source: 'bing' }
      })
    )
  }
  
  if (useGoogle) {
    console.log('🟢 Starting Google CSE search...')
    searchPromises.push(
      searchGoogleCSEMultiQuery(searchQueries, Math.min(resultsPerQuery, 10), {
        dateRestrict: timeParams.googleDateRestrict
      })
      .then(result => ({
        results: transformWebSearchResults(result.results || [], 'google'),
        source: 'google'
      }))
      .catch(err => {
        console.error('Google search failed:', err.message)
        return { results: [], source: 'google' }
      })
    )
  }
  
  const searchResults = await Promise.all(searchPromises)
  
  const bingResults = searchResults.find(r => r.source === 'bing')?.results || []
  const googleResults = searchResults.find(r => r.source === 'google')?.results || []
  
  console.log(`\n📊 Raw results: Bing=${bingResults.length}, Google=${googleResults.length}`)
  
  // Step 3: Deduplicate
  console.log('\n🔧 Step 3: Processing Results')
  let posts = deduplicateResults([...bingResults, ...googleResults])
  console.log(`   After deduplication: ${posts.length}`)
  
  // Step 4: Filter exclusions
  const beforeExclusions = posts.length
  posts = posts.filter(p => !shouldExcludePost(p))
  if (beforeExclusions - posts.length > 0) {
    console.log(`   Filtered out ${beforeExclusions - posts.length} excluded posts`)
  }
  
  // Step 5: Filter relevance
  const beforeRelevance = posts.length
  posts = posts.filter(p => isRelevantPost(p, query))
  if (beforeRelevance - posts.length > 0) {
    console.log(`   Filtered out ${beforeRelevance - posts.length} irrelevant posts`)
  }
  
  // Step 6: Score and sort
  posts = posts.map(p => ({
    ...p,
    relevanceScore: calculateRelevanceScore(p, query)
  }))
  
  posts.sort((a, b) => b.relevanceScore - a.relevanceScore)
  
  // Limit
  const limitedPosts = posts.slice(0, limit)
  
  // Stats
  const stats = {
    total: limitedPosts.length,
    bing: limitedPosts.filter(p => p.sources.includes('bing')).length,
    google: limitedPosts.filter(p => p.sources.includes('google')).length,
    multiSource: limitedPosts.filter(p => p.sources.length > 1).length
  }
  
  // Log results
  console.log('\n--- TOP 5 RESULTS ---')
  limitedPosts.slice(0, 5).forEach((p, i) => {
    console.log(`${i + 1}. [${p.sources.join('+')}] [${p.typeName}] ${p.title?.substring(0, 50)}...`)
  })
  console.log('\n--- STATS ---')
  console.log(`Total: ${stats.total} | Bing: ${stats.bing} | Google: ${stats.google} | Multi: ${stats.multiSource}`)
  console.log('========================================\n')
  
  return {
    posts: limitedPosts,
    stats,
    query,
    variants
  }
}

export default {
  crossReferenceProductHuntSearch
}
