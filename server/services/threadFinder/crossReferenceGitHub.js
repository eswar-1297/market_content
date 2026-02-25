// Cross-Reference Engine for GitHub Discussions
// Uses GitHub Search API + Bing + Google CSE

import { expandQuery } from './queryExpander.js'
import { searchBingMultiQuery } from './bingSearch.js'
import { searchGoogleCSEMultiQuery } from './googleCSE.js'
import { containsBrandMention } from './commentChecker.js'

const GITHUB_API_BASE = 'https://api.github.com'

/**
 * Check which APIs are configured
 */
function getConfiguredAPIs() {
  return {
    github: true, // GitHub API is public (rate limited without token)
    bing: !!process.env.BING_API_KEY,
    google: !!(process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_CSE_KEY) && !!(process.env.GOOGLE_CSE_ID || process.env.GOOGLE_CSE_CX)
  }
}

/**
 * Extract discussion/issue info from GitHub URL
 * @param {string} url - URL to parse
 * @returns {Object|null} Extracted info
 */
function extractGitHubInfo(url) {
  try {
    if (!url) return null
    
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const path = parsed.pathname
    
    if (!hostname.includes('github.com')) {
      return null
    }
    
    // Discussion: /{owner}/{repo}/discussions/{number}
    const discussionMatch = path.match(/\/([^\/]+)\/([^\/]+)\/discussions\/(\d+)/i)
    if (discussionMatch) {
      return {
        owner: discussionMatch[1],
        repo: discussionMatch[2],
        number: discussionMatch[3],
        type: 'discussion'
      }
    }
    
    // Issue: /{owner}/{repo}/issues/{number}
    const issueMatch = path.match(/\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/i)
    if (issueMatch) {
      return {
        owner: issueMatch[1],
        repo: issueMatch[2],
        number: issueMatch[3],
        type: 'issue'
      }
    }
    
    // Pull request: /{owner}/{repo}/pull/{number}
    const prMatch = path.match(/\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/i)
    if (prMatch) {
      return {
        owner: prMatch[1],
        repo: prMatch[2],
        number: prMatch[3],
        type: 'pull_request'
      }
    }
    
    return null
  } catch (error) {
    return null
  }
}

/**
 * Normalize GitHub URL
 * @param {string} url - Raw URL
 * @returns {string|null} Normalized URL
 */
function normalizeUrl(url) {
  try {
    if (!url || typeof url !== 'string') return null
    
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    
    if (!hostname.includes('github.com')) return null
    
    // Remove tracking parameters
    const cleanUrl = url.split('?')[0].split('#')[0]
    
    return cleanUrl
  } catch (error) {
    return null
  }
}

/**
 * Validate if URL is a valid GitHub discussion/issue
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
function validateGitHubUrl(url) {
  if (!url) return false
  
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    
    if (!hostname.includes('github.com')) return false
    
    // Skip invalid pages
    const invalidPaths = [
      '/login',
      '/signup',
      '/settings',
      '/notifications',
      '/search',
      '/explore',
      '/trending',
      '/marketplace',
      '/sponsors',
      '/pricing',
      '/features',
      '/enterprise',
      '/orgs/',
      '/users/'
    ]
    
    for (const invalid of invalidPaths) {
      if (path.startsWith(invalid)) return false
    }
    
    // Must have valid content type
    const info = extractGitHubInfo(url)
    return info !== null && info.number !== null
  } catch (error) {
    return false
  }
}

/**
 * Search GitHub using public search API
 * @param {string} query - Search query
 * @param {Object} options - Options
 * @returns {Promise<Object[]>} Results
 */
async function searchGitHubAPI(query, options = {}) {
  const {
    type = 'discussions', // discussions, issues
    sort = 'updated',
    order = 'desc',
    perPage = 30
  } = options
  
  try {
    // Build search query
    let searchQuery = query
    if (type === 'discussions') {
      searchQuery += ' is:discussion'
    } else if (type === 'issues') {
      searchQuery += ' is:issue is:open'
    }
    
    const url = `${GITHUB_API_BASE}/search/issues?q=${encodeURIComponent(searchQuery)}&sort=${sort}&order=${order}&per_page=${perPage}`
    
    console.log(`🐙 GitHub API: Searching "${query.substring(0, 50)}..."`)
    
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ThreadFinder/1.0'
    }
    
    // Add token if available (increases rate limit)
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`
    }
    
    const response = await fetch(url, { headers })
    
    if (!response.ok) {
      if (response.status === 403) {
        console.log('   GitHub API rate limit reached')
        return []
      }
      console.error('GitHub API error:', response.status)
      return []
    }
    
    const data = await response.json()
    
    console.log(`🐙 GitHub API: Found ${data.total_count} total, returned ${data.items?.length || 0}`)
    
    // Transform to normalized format
    return (data.items || []).map(item => {
      const urlParts = item.html_url.split('/')
      const owner = urlParts[3]
      const repo = urlParts[4]
      
      return {
        id: `gh-${item.id}`,
        number: item.number,
        owner,
        repo,
        repoFullName: `${owner}/${repo}`,
        title: item.title || '',
        body: item.body?.substring(0, 500) || '',
        url: item.html_url,
        state: item.state,
        comments: item.comments || 0,
        reactions: item.reactions?.total_count || 0,
        author: item.user?.login || 'Unknown',
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        labels: (item.labels || []).map(l => l.name),
        type: item.html_url.includes('/discussions/') ? 'discussion' : 
              item.pull_request ? 'pull_request' : 'issue',
        source: 'github',
        sources: ['github']
      }
    })
    
  } catch (error) {
    console.error('GitHub API error:', error.message)
    return []
  }
}

/**
 * Build search queries for web search
 * @param {string[]} variants - Query variants
 * @param {string} contentType - Content type filter
 * @returns {string[]} Search queries
 */
function buildGitHubSearchQueries(variants, contentType = 'all') {
  const sitePrefix = 'site:github.com'
  
  return variants.map(variant => {
    let query = `${sitePrefix} ${variant}`
    if (contentType === 'discussions') {
      query += ' inurl:discussions'
    } else if (contentType === 'issues') {
      query += ' inurl:issues'
    }
    return query
  })
}

/**
 * Transform web search results
 * @param {Object[]} results - Raw results
 * @param {string} source - Source identifier
 * @returns {Object[]} Normalized results
 */
function transformWebSearchResults(results, source) {
  return results
    .filter(r => r.url && r.url.includes('github.com'))
    .filter(r => validateGitHubUrl(r.url))
    .map(result => {
      const info = extractGitHubInfo(result.url)
      if (!info) return null
      
      const normalizedUrl = normalizeUrl(result.url)
      const title = result.title
        ?.replace(/ · Issue #\d+ · .+$/i, '')
        .replace(/ · Discussion #\d+ · .+$/i, '')
        .replace(/ · Pull Request #\d+ · .+$/i, '')
        .replace(/ - GitHub$/i, '')
        .trim() || ''
      
      return {
        id: `gh-${info.owner}-${info.repo}-${info.number}`,
        number: info.number,
        owner: info.owner,
        repo: info.repo,
        repoFullName: `${info.owner}/${info.repo}`,
        title: title,
        snippet: result.snippet || '',
        url: normalizedUrl,
        type: info.type,
        source: source,
        sources: [source],
        discoveredAt: new Date().toISOString()
      }
    })
    .filter(Boolean)
}

/**
 * Check if item should be excluded
 * @param {Object} item - Item object
 * @returns {boolean} True if should be excluded
 */
function shouldExcludeItem(item) {
  const title = (item.title || '').toLowerCase()
  const body = (item.body || item.snippet || '').toLowerCase()
  const content = title + ' ' + body
  
  // Filter CloudFuze mentions
  if (containsBrandMention(content)) {
    return true
  }
  
  // Filter closed/merged items (if we have state info)
  if (item.state === 'closed' && item.type !== 'discussion') {
    return true
  }
  
  return false
}

/**
 * Check if item is relevant
 * @param {Object} item - Item object
 * @param {string} query - Search query
 * @returns {boolean} True if relevant
 */
function isRelevantItem(item, query) {
  if (!item.title || !query) return true
  
  const title = item.title.toLowerCase()
  const body = (item.body || item.snippet || '').toLowerCase()
  const content = title + ' ' + body
  
  const stopWords = ['the', 'and', 'for', 'from', 'with', 'how', 'what', 'why', 'can', 'you', 'your', 'are', 'was', 'were', 'has', 'have', 'had', 'been', 'is', 'it', 'to', 'of', 'in', 'that', 'this', 'do', 'does', 'best', 'way', 'ways', 'fix', 'bug', 'feature', 'request']
  
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
 * @param {Object} item - Item object
 * @param {string} query - Search query
 * @returns {number} Score
 */
function calculateRelevanceScore(item, query) {
  if (!item.title || !query) return 0
  
  const title = item.title.toLowerCase()
  const body = (item.body || item.snippet || '').toLowerCase()
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
    if (body.includes(term)) score += 5
  })
  
  // Source bonus
  const sources = item.sources || []
  if (sources.includes('github')) score += 30
  if (sources.includes('bing')) score += 20
  if (sources.includes('google')) score += 20
  
  // Multi-source bonus
  if (sources.length >= 2) score += 25
  
  // Engagement bonus
  score += Math.min((item.comments || 0) * 2, 20)
  score += Math.min((item.reactions || 0), 15)
  
  // Discussion type bonus (better for engagement)
  if (item.type === 'discussion') {
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
  const itemMap = new Map()
  
  for (const result of results) {
    // Create unique key based on repo and number
    const key = result.repoFullName && result.number 
      ? `${result.repoFullName}-${result.number}`
      : result.id
    
    if (!key) continue
    
    if (itemMap.has(key)) {
      const existing = itemMap.get(key)
      const newSources = result.sources || [result.source || 'unknown']
      existing.sources = [...new Set([...existing.sources, ...newSources])]
      
      // Keep better data
      if (result.title && result.title.length > (existing.title?.length || 0)) {
        existing.title = result.title
      }
      if (result.body && result.body.length > (existing.body?.length || 0)) {
        existing.body = result.body
      }
      if (result.comments && (!existing.comments || result.comments > existing.comments)) {
        existing.comments = result.comments
      }
    } else {
      itemMap.set(key, {
        ...result,
        sources: result.sources || [result.source || 'unknown']
      })
    }
  }
  
  return Array.from(itemMap.values())
}

/**
 * Main GitHub cross-reference search
 * @param {string} query - Search query
 * @param {Object} options - Options
 * @returns {Promise<Object>} Results
 */
export async function crossReferenceGitHubSearch(query, options = {}) {
  const configuredAPIs = getConfiguredAPIs()
  
  console.log('\n========================================')
  console.log('GITHUB CROSS-REFERENCE SEARCH')
  console.log('Query:', query)
  console.log('Configured APIs:',
    '✅ GitHub API',
    configuredAPIs.bing ? '✅ Bing' : '❌ Bing',
    configuredAPIs.google ? '✅ Google' : '❌ Google'
  )
  console.log('========================================\n')
  
  const {
    useGitHub = true,
    useBing = configuredAPIs.bing,
    useGoogle = configuredAPIs.google,
    maxVariants = 4,
    resultsPerQuery = 30,
    limit = 150,
    timeFilter = 'all',
    contentType = 'all'  // all, discussions, issues
  } = options
  
  // Time filter for web search
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
  console.log(`   Generated ${variants.length} variants`)
  
  // Step 2: Execute searches
  console.log('\n🌐 Step 2: Executing Searches')
  
  const searchPromises = []
  
  // GitHub API search
  if (useGitHub) {
    console.log('🐙 Starting GitHub API search...')
    searchPromises.push(
      (async () => {
        const results = []
        for (const variant of variants.slice(0, 3)) { // Limit API calls
          const items = await searchGitHubAPI(variant, {
            type: contentType === 'all' ? 'discussions' : contentType,
            perPage: 20
          })
          results.push(...items)
          await new Promise(r => setTimeout(r, 500)) // Rate limit
        }
        return { results, source: 'github' }
      })()
      .catch(err => {
        console.error('GitHub search failed:', err.message)
        return { results: [], source: 'github' }
      })
    )
  }
  
  // Bing search
  if (useBing) {
    console.log('🔵 Starting Bing search...')
    const ghQueries = buildGitHubSearchQueries(variants, contentType)
    searchPromises.push(
      searchBingMultiQuery(ghQueries, resultsPerQuery, {
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
  
  // Google search
  if (useGoogle) {
    console.log('🟢 Starting Google CSE search...')
    const ghQueries = buildGitHubSearchQueries(variants, contentType)
    searchPromises.push(
      searchGoogleCSEMultiQuery(ghQueries, Math.min(resultsPerQuery, 10), {
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
  
  const ghResults = searchResults.find(r => r.source === 'github')?.results || []
  const bingResults = searchResults.find(r => r.source === 'bing')?.results || []
  const googleResults = searchResults.find(r => r.source === 'google')?.results || []
  
  console.log(`\n📊 Raw results: GitHub=${ghResults.length}, Bing=${bingResults.length}, Google=${googleResults.length}`)
  
  // Step 3: Deduplicate
  console.log('\n🔧 Step 3: Processing Results')
  let items = deduplicateResults([...ghResults, ...bingResults, ...googleResults])
  console.log(`   After deduplication: ${items.length}`)
  
  // Step 4: Filter exclusions
  const beforeExclusions = items.length
  items = items.filter(i => !shouldExcludeItem(i))
  if (beforeExclusions - items.length > 0) {
    console.log(`   Filtered out ${beforeExclusions - items.length} excluded items`)
  }
  
  // Step 5: Filter relevance
  const beforeRelevance = items.length
  items = items.filter(i => isRelevantItem(i, query))
  if (beforeRelevance - items.length > 0) {
    console.log(`   Filtered out ${beforeRelevance - items.length} irrelevant items`)
  }
  
  // Step 6: Score and sort
  items = items.map(i => ({
    ...i,
    relevanceScore: calculateRelevanceScore(i, query)
  }))
  
  items.sort((a, b) => b.relevanceScore - a.relevanceScore)
  
  // Limit
  const limitedItems = items.slice(0, limit)
  
  // Stats
  const stats = {
    total: limitedItems.length,
    github: limitedItems.filter(i => i.sources.includes('github')).length,
    bing: limitedItems.filter(i => i.sources.includes('bing')).length,
    google: limitedItems.filter(i => i.sources.includes('google')).length,
    multiSource: limitedItems.filter(i => i.sources.length > 1).length
  }
  
  // Log results
  console.log('\n--- TOP 5 RESULTS ---')
  limitedItems.slice(0, 5).forEach((i, idx) => {
    console.log(`${idx + 1}. [${i.sources.join('+')}] [${i.type}] ${i.repoFullName}: ${i.title?.substring(0, 40)}...`)
  })
  console.log('\n--- STATS ---')
  console.log(`Total: ${stats.total} | GitHub: ${stats.github} | Bing: ${stats.bing} | Google: ${stats.google} | Multi: ${stats.multiSource}`)
  console.log('========================================\n')
  
  return {
    items: limitedItems,
    stats,
    query,
    variants
  }
}

export default {
  crossReferenceGitHubSearch
}
