// Cross-Reference Engine for Spiceworks
// Uses Bing + Google CSE (no native API available)

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
 * Spiceworks categories
 */
const SPICEWORKS_CATEGORIES = {
  'cloud': 'Cloud Computing',
  'networking': 'Networking',
  'security': 'Security',
  'hardware': 'Hardware',
  'software': 'Software',
  'windows': 'Windows',
  'linux': 'Linux',
  'mac': 'Mac',
  'virtualization': 'Virtualization',
  'storage': 'Storage',
  'backup': 'Backup & Recovery',
  'email': 'Email',
  'office-365': 'Office 365',
  'google-workspace': 'Google Workspace',
  'help-desk': 'Help Desk',
  'general': 'General IT'
}

/**
 * Extract topic info from Spiceworks URL
 * @param {string} url - URL to parse
 * @returns {Object|null} Extracted info
 */
function extractTopicInfo(url) {
  try {
    if (!url) return null
    
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const path = parsed.pathname
    
    if (!hostname.includes('spiceworks.com') && !hostname.includes('community.spiceworks.com')) {
      return null
    }
    
    // Format: /topic/{topic-id}-{slug}
    const topicMatch = path.match(/\/topic\/(\d+)(?:-(.+))?/i)
    if (topicMatch) {
      return {
        topicId: topicMatch[1],
        slug: topicMatch[2] || '',
        type: 'topic'
      }
    }
    
    // Format: /how_to/{id}
    const howToMatch = path.match(/\/how_to\/(\d+)/i)
    if (howToMatch) {
      return {
        topicId: howToMatch[1],
        type: 'how_to'
      }
    }
    
    // Format: /questions/{id}
    const questionMatch = path.match(/\/questions\/(\d+)/i)
    if (questionMatch) {
      return {
        topicId: questionMatch[1],
        type: 'question'
      }
    }
    
    return null
  } catch (error) {
    return null
  }
}

/**
 * Normalize Spiceworks URL
 * @param {string} url - Raw URL
 * @returns {string|null} Normalized URL
 */
function normalizeUrl(url) {
  try {
    if (!url || typeof url !== 'string') return null
    
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    
    if (!hostname.includes('spiceworks.com')) return null
    
    // Remove tracking parameters
    const cleanUrl = url.split('?')[0].split('#')[0]
    
    return cleanUrl
  } catch (error) {
    return null
  }
}

/**
 * Validate if URL is a valid Spiceworks topic
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
function validateSpiceworksUrl(url) {
  if (!url) return false
  
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    
    if (!hostname.includes('spiceworks.com')) return false
    
    // Skip invalid pages
    const invalidPaths = [
      '/profile/',
      '/profiles/',
      '/user/',
      '/users/',
      '/tag/',
      '/tags/',
      '/search',
      '/about',
      '/privacy',
      '/terms',
      '/category',
      '/vendors/',
      '/products/',
      '/reviews/',
      '/company/'
    ]
    
    for (const invalid of invalidPaths) {
      if (path.includes(invalid)) return false
    }
    
    // Must have topic ID or be a question/how_to
    const info = extractTopicInfo(url)
    return info !== null && info.topicId !== null
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
  
  if (content.includes('office 365') || content.includes('microsoft 365') || content.includes('o365')) {
    return 'Office 365'
  }
  if (content.includes('google workspace') || content.includes('g suite')) {
    return 'Google Workspace'
  }
  if (content.includes('cloud') || content.includes('aws') || content.includes('azure')) {
    return 'Cloud Computing'
  }
  if (content.includes('backup') || content.includes('recovery') || content.includes('disaster')) {
    return 'Backup & Recovery'
  }
  if (content.includes('security') || content.includes('firewall') || content.includes('virus')) {
    return 'Security'
  }
  if (content.includes('network') || content.includes('switch') || content.includes('router')) {
    return 'Networking'
  }
  if (content.includes('storage') || content.includes('nas') || content.includes('san')) {
    return 'Storage'
  }
  if (content.includes('virtual') || content.includes('vmware') || content.includes('hyper-v')) {
    return 'Virtualization'
  }
  if (content.includes('windows server') || content.includes('active directory')) {
    return 'Windows'
  }
  if (content.includes('linux') || content.includes('ubuntu') || content.includes('centos')) {
    return 'Linux'
  }
  if (content.includes('email') || content.includes('exchange') || content.includes('smtp')) {
    return 'Email'
  }
  
  return 'General IT'
}

/**
 * Build search queries with Spiceworks site prefix
 * @param {string[]} variants - Query variants
 * @param {string} categoryFilter - Optional category filter
 * @returns {string[]} Search queries
 */
function buildSpiceworksSearchQueries(variants, categoryFilter = '') {
  const sitePrefix = 'site:community.spiceworks.com OR site:spiceworks.com'
  
  return variants.map(variant => {
    let query = `(${sitePrefix}) ${variant}`
    if (categoryFilter && categoryFilter !== 'all') {
      query += ` ${categoryFilter}`
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
    .filter(r => r.url && r.url.includes('spiceworks.com'))
    .filter(r => validateSpiceworksUrl(r.url))
    .map(result => {
      const info = extractTopicInfo(result.url)
      if (!info) return null
      
      const normalizedUrl = normalizeUrl(result.url)
      const title = result.title
        ?.replace(/ \| Spiceworks$/i, '')
        .replace(/ - Spiceworks Community$/i, '')
        .trim() || ''
      
      return {
        id: `spiceworks-${info.topicId}`,
        topicId: info.topicId,
        title: title,
        snippet: result.snippet || '',
        url: normalizedUrl,
        type: info.type,
        category: detectCategory(title, result.snippet),
        source: source,
        sources: [source],
        discoveredAt: new Date().toISOString()
      }
    })
    .filter(Boolean)
}

/**
 * Check if topic should be excluded
 * @param {Object} topic - Topic object
 * @returns {boolean} True if should be excluded
 */
function shouldExcludeTopic(topic) {
  const title = (topic.title || '').toLowerCase()
  const snippet = (topic.snippet || '').toLowerCase()
  const content = title + ' ' + snippet
  
  // Filter CloudFuze mentions
  if (containsBrandMention(content)) {
    return true
  }
  
  // Filter closed/locked topics
  const lockedPatterns = [
    'locked',
    'closed',
    'archived',
    '[solved]',
    '[resolved]'
  ]
  
  for (const pattern of lockedPatterns) {
    if (title.includes(pattern)) {
      return true
    }
  }
  
  return false
}

/**
 * Check if topic is relevant
 * @param {Object} topic - Topic object
 * @param {string} query - Search query
 * @returns {boolean} True if relevant
 */
function isRelevantTopic(topic, query) {
  if (!topic.title || !query) return true
  
  const title = topic.title.toLowerCase()
  const snippet = (topic.snippet || '').toLowerCase()
  const content = title + ' ' + snippet
  
  const stopWords = ['the', 'and', 'for', 'from', 'with', 'how', 'what', 'why', 'can', 'you', 'your', 'are', 'was', 'were', 'has', 'have', 'had', 'been', 'is', 'it', 'to', 'of', 'in', 'that', 'this', 'do', 'does', 'best', 'way', 'ways', 'help', 'need', 'anyone']
  
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
 * @param {Object} topic - Topic object
 * @param {string} query - Search query
 * @returns {number} Score
 */
function calculateRelevanceScore(topic, query) {
  if (!topic.title || !query) return 0
  
  const title = topic.title.toLowerCase()
  const snippet = (topic.snippet || '').toLowerCase()
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
  const sources = topic.sources || []
  if (sources.includes('bing')) score += 20
  if (sources.includes('google')) score += 20
  
  // Multi-source bonus
  if (sources.length >= 2) score += 25
  
  // Category relevance bonus (for CloudFuze)
  const relevantCategories = ['Cloud Computing', 'Storage', 'Backup & Recovery', 'Office 365', 'Google Workspace']
  if (relevantCategories.includes(topic.category)) {
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
  const topicMap = new Map()
  
  for (const result of results) {
    const id = result.id || result.topicId
    if (!id) continue
    
    if (topicMap.has(id)) {
      const existing = topicMap.get(id)
      const newSources = result.sources || [result.source || 'unknown']
      existing.sources = [...new Set([...existing.sources, ...newSources])]
      
      if (result.title && result.title.length > (existing.title?.length || 0)) {
        existing.title = result.title
      }
      if (result.snippet && result.snippet.length > (existing.snippet?.length || 0)) {
        existing.snippet = result.snippet
      }
    } else {
      topicMap.set(id, {
        ...result,
        sources: result.sources || [result.source || 'unknown']
      })
    }
  }
  
  return Array.from(topicMap.values())
}

/**
 * Main Spiceworks cross-reference search
 * @param {string} query - Search query
 * @param {Object} options - Options
 * @returns {Promise<Object>} Results
 */
export async function crossReferenceSpiceworksSearch(query, options = {}) {
  const configuredAPIs = getConfiguredAPIs()
  
  console.log('\n========================================')
  console.log('SPICEWORKS CROSS-REFERENCE SEARCH')
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
      topics: [],
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
    categoryFilter = 'all'
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
  const searchQueries = buildSpiceworksSearchQueries(variants, categoryFilter)
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
  let topics = deduplicateResults([...bingResults, ...googleResults])
  console.log(`   After deduplication: ${topics.length}`)
  
  // Step 4: Filter exclusions
  const beforeExclusions = topics.length
  topics = topics.filter(t => !shouldExcludeTopic(t))
  if (beforeExclusions - topics.length > 0) {
    console.log(`   Filtered out ${beforeExclusions - topics.length} excluded topics`)
  }
  
  // Step 5: Filter relevance
  const beforeRelevance = topics.length
  topics = topics.filter(t => isRelevantTopic(t, query))
  if (beforeRelevance - topics.length > 0) {
    console.log(`   Filtered out ${beforeRelevance - topics.length} irrelevant topics`)
  }
  
  // Step 6: Score and sort
  topics = topics.map(t => ({
    ...t,
    relevanceScore: calculateRelevanceScore(t, query)
  }))
  
  topics.sort((a, b) => b.relevanceScore - a.relevanceScore)
  
  // Limit
  const limitedTopics = topics.slice(0, limit)
  
  // Stats
  const stats = {
    total: limitedTopics.length,
    bing: limitedTopics.filter(t => t.sources.includes('bing')).length,
    google: limitedTopics.filter(t => t.sources.includes('google')).length,
    multiSource: limitedTopics.filter(t => t.sources.length > 1).length
  }
  
  // Log results
  console.log('\n--- TOP 5 RESULTS ---')
  limitedTopics.slice(0, 5).forEach((t, i) => {
    console.log(`${i + 1}. [${t.sources.join('+')}] [${t.category}] ${t.title?.substring(0, 50)}...`)
  })
  console.log('\n--- STATS ---')
  console.log(`Total: ${stats.total} | Bing: ${stats.bing} | Google: ${stats.google} | Multi: ${stats.multiSource}`)
  console.log('========================================\n')
  
  return {
    topics: limitedTopics,
    stats,
    query,
    variants
  }
}

export default {
  crossReferenceSpiceworksSearch
}
