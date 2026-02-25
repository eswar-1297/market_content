// Cross-Reference Engine for Hacker News
// Uses HN Algolia API (primary) + Bing/Google (secondary)

import { expandQuery } from './queryExpander.js'
import { searchHackerNews, searchHackerNewsMultiQuery, fetchHNComments } from './hackerNews.js'
import { searchBingMultiQuery } from './bingSearch.js'
import { searchGoogleCSEMultiQuery } from './googleCSE.js'
import { containsBrandMention } from './commentChecker.js'

/**
 * Check which APIs are configured
 */
function getConfiguredAPIs() {
  return {
    hackernews: true, // Always available (public API)
    bing: !!process.env.BING_API_KEY,
    google: !!(process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_CSE_KEY) && !!(process.env.GOOGLE_CSE_ID || process.env.GOOGLE_CSE_CX)
  }
}

/**
 * Build search queries for web search
 * @param {string[]} variants - Query variants
 * @returns {string[]} Search queries
 */
function buildHNSearchQueries(variants) {
  return variants.map(variant => `site:news.ycombinator.com ${variant}`)
}

/**
 * Extract HN item ID from URL
 * @param {string} url - HN URL
 * @returns {string|null} Item ID
 */
function extractHNItemId(url) {
  if (!url) return null
  
  // Match news.ycombinator.com/item?id=12345
  const match = url.match(/news\.ycombinator\.com\/item\?id=(\d+)/i)
  return match ? match[1] : null
}

/**
 * Transform web search results
 * @param {Object[]} results - Raw results
 * @param {string} source - Source identifier
 * @returns {Object[]} Normalized results
 */
function transformWebSearchResults(results, source) {
  return results
    .filter(r => r.url && r.url.includes('news.ycombinator.com'))
    .map(result => {
      const itemId = extractHNItemId(result.url)
      if (!itemId) return null
      
      return {
        id: itemId,
        title: result.title?.replace(/ \| Hacker News$/, '').trim() || '',
        snippet: result.snippet || '',
        url: result.url,
        hnUrl: `https://news.ycombinator.com/item?id=${itemId}`,
        source: source,
        sources: [source]
      }
    })
    .filter(Boolean)
}

/**
 * Check if story should be excluded
 * @param {Object} story - Story object
 * @returns {boolean} True if should be excluded
 */
function shouldExcludeStory(story) {
  const title = (story.title || '').toLowerCase()
  const text = (story.storyText || story.snippet || '').toLowerCase()
  const content = title + ' ' + text
  
  // Filter CloudFuze mentions
  if (containsBrandMention(content)) {
    return true
  }
  
  // Filter dead/flagged stories
  if (story.dead || story.deleted) {
    return true
  }
  
  return false
}

/**
 * Check if story is relevant
 * @param {Object} story - Story object
 * @param {string} query - Search query
 * @returns {boolean} True if relevant
 */
function isRelevantStory(story, query) {
  if (!story.title || !query) return true
  
  const title = story.title.toLowerCase()
  const text = (story.storyText || story.snippet || '').toLowerCase()
  const content = title + ' ' + text
  
  const stopWords = ['the', 'and', 'for', 'from', 'with', 'how', 'what', 'why', 'can', 'you', 'your', 'are', 'was', 'were', 'has', 'have', 'had', 'been', 'is', 'it', 'to', 'of', 'in', 'that', 'this', 'do', 'does', 'best', 'way', 'ways']
  
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
 * @param {Object} story - Story object
 * @param {string} query - Search query
 * @returns {number} Score
 */
function calculateRelevanceScore(story, query) {
  if (!story.title || !query) return 0
  
  const title = story.title.toLowerCase()
  const text = (story.storyText || story.snippet || '').toLowerCase()
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
    if (text.includes(term)) score += 5
  })
  
  // Source bonus
  const sources = story.sources || []
  if (sources.includes('hackernews')) score += 30
  if (sources.includes('bing')) score += 20
  if (sources.includes('google')) score += 20
  
  // Multi-source bonus
  if (sources.length >= 2) score += 25
  
  // Engagement bonus (capped)
  score += Math.min((story.points || 0) / 10, 30)
  score += Math.min((story.numComments || 0) / 5, 20)
  
  // Ask HN / Show HN bonus (better for engagement)
  if (story.type === 'ask_hn') score += 15
  if (story.type === 'show_hn') score += 10
  
  return Math.round(score)
}

/**
 * Deduplicate results
 * @param {Object[]} results - Results
 * @returns {Object[]} Deduplicated
 */
function deduplicateResults(results) {
  const storyMap = new Map()
  
  for (const result of results) {
    const id = result.id
    if (!id) continue
    
    if (storyMap.has(id)) {
      const existing = storyMap.get(id)
      const newSources = result.sources || [result.source || 'unknown']
      existing.sources = [...new Set([...existing.sources, ...newSources])]
      
      // Keep better data
      if (result.title && result.title.length > (existing.title?.length || 0)) {
        existing.title = result.title
      }
      if (result.points && (!existing.points || result.points > existing.points)) {
        existing.points = result.points
      }
      if (result.numComments && (!existing.numComments || result.numComments > existing.numComments)) {
        existing.numComments = result.numComments
      }
    } else {
      storyMap.set(id, {
        ...result,
        sources: result.sources || [result.source || 'unknown']
      })
    }
  }
  
  return Array.from(storyMap.values())
}

/**
 * Main Hacker News cross-reference search
 * @param {string} query - Search query
 * @param {Object} options - Options
 * @returns {Promise<Object>} Results
 */
export async function crossReferenceHackerNewsSearch(query, options = {}) {
  const configuredAPIs = getConfiguredAPIs()
  
  console.log('\n========================================')
  console.log('HACKER NEWS CROSS-REFERENCE SEARCH')
  console.log('Query:', query)
  console.log('Configured APIs:',
    '✅ HN Algolia',
    configuredAPIs.bing ? '✅ Bing' : '❌ Bing',
    configuredAPIs.google ? '✅ Google' : '❌ Google'
  )
  console.log('========================================\n')
  
  const {
    useHackerNews = true,
    useBing = configuredAPIs.bing,
    useGoogle = configuredAPIs.google,
    maxVariants = 4,
    resultsPerQuery = 30,
    limit = 150,
    timeFilter = 'all',
    storyType = 'all',  // all, ask_hn, show_hn, story
    minPoints = 0
  } = options
  
  // Time filter for Algolia
  const getNumericFilters = () => {
    const now = Math.floor(Date.now() / 1000)
    const filters = []
    
    switch (timeFilter) {
      case '1month':
        filters.push(`created_at_i>${now - 30 * 24 * 60 * 60}`)
        break
      case '3months':
        filters.push(`created_at_i>${now - 90 * 24 * 60 * 60}`)
        break
      case '6months':
        filters.push(`created_at_i>${now - 180 * 24 * 60 * 60}`)
        break
      case '1year':
        filters.push(`created_at_i>${now - 365 * 24 * 60 * 60}`)
        break
    }
    
    if (minPoints > 0) {
      filters.push(`points>${minPoints}`)
    }
    
    return filters.join(',')
  }
  
  // Step 1: Query expansion
  console.log('📝 Step 1: Query Expansion')
  const variants = expandQuery(query, maxVariants)
  console.log(`   Generated ${variants.length} variants`)
  
  // Step 2: Execute searches
  console.log('\n🌐 Step 2: Executing Searches')
  
  const searchPromises = []
  
  // HN Algolia search
  if (useHackerNews) {
    console.log('📰 Starting Hacker News Algolia search...')
    
    // Determine tags based on story type
    let tags = 'story'
    if (storyType === 'ask_hn') tags = 'ask_hn'
    else if (storyType === 'show_hn') tags = 'show_hn'
    
    searchPromises.push(
      searchHackerNewsMultiQuery(variants, {
        tags,
        hitsPerPage: resultsPerQuery,
        numericFilters: getNumericFilters()
      })
      .then(result => ({
        results: result.results || [],
        source: 'hackernews'
      }))
      .catch(err => {
        console.error('HN search failed:', err.message)
        return { results: [], source: 'hackernews' }
      })
    )
  }
  
  // Bing search
  if (useBing) {
    console.log('🔵 Starting Bing search...')
    const hnQueries = buildHNSearchQueries(variants)
    searchPromises.push(
      searchBingMultiQuery(hnQueries, resultsPerQuery)
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
    const hnQueries = buildHNSearchQueries(variants)
    searchPromises.push(
      searchGoogleCSEMultiQuery(hnQueries, Math.min(resultsPerQuery, 10))
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
  
  const hnResults = searchResults.find(r => r.source === 'hackernews')?.results || []
  const bingResults = searchResults.find(r => r.source === 'bing')?.results || []
  const googleResults = searchResults.find(r => r.source === 'google')?.results || []
  
  console.log(`\n📊 Raw results: HN=${hnResults.length}, Bing=${bingResults.length}, Google=${googleResults.length}`)
  
  // Step 3: Deduplicate
  console.log('\n🔧 Step 3: Processing Results')
  let stories = deduplicateResults([...hnResults, ...bingResults, ...googleResults])
  console.log(`   After deduplication: ${stories.length}`)
  
  // Step 4: Filter exclusions
  const beforeExclusions = stories.length
  stories = stories.filter(s => !shouldExcludeStory(s))
  if (beforeExclusions - stories.length > 0) {
    console.log(`   Filtered out ${beforeExclusions - stories.length} excluded stories`)
  }
  
  // Step 5: Filter relevance
  const beforeRelevance = stories.length
  stories = stories.filter(s => isRelevantStory(s, query))
  if (beforeRelevance - stories.length > 0) {
    console.log(`   Filtered out ${beforeRelevance - stories.length} irrelevant stories`)
  }
  
  // Step 6: Check comments for brand mentions (limit to top 20 stories)
  console.log('\n🔍 Step 6: Checking comments for CloudFuze mentions...')
  if (stories.length > 0) {
    const storiesToCheck = stories.slice(0, 20)
    let brandMentionCount = 0
    
    for (const story of storiesToCheck) {
      try {
        const comments = await fetchHNComments(story.id, 2)
        const hasBrandMention = comments.some(c => containsBrandMention(c))
        
        if (hasBrandMention) {
          story.hasBrandMention = true
          brandMentionCount++
        }
        
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        // Continue on error
      }
    }
    
    console.log(`   Found ${brandMentionCount} stories with CloudFuze in comments`)
    
    // Filter
    const beforeFilter = stories.length
    stories = stories.filter(s => !s.hasBrandMention)
    console.log(`   After filtering: ${stories.length} (removed ${beforeFilter - stories.length})`)
  }
  
  // Step 7: Score and sort
  stories = stories.map(s => ({
    ...s,
    relevanceScore: calculateRelevanceScore(s, query)
  }))
  
  stories.sort((a, b) => b.relevanceScore - a.relevanceScore)
  
  // Limit
  const limitedStories = stories.slice(0, limit)
  
  // Stats
  const stats = {
    total: limitedStories.length,
    hackernews: limitedStories.filter(s => s.sources.includes('hackernews')).length,
    bing: limitedStories.filter(s => s.sources.includes('bing')).length,
    google: limitedStories.filter(s => s.sources.includes('google')).length,
    multiSource: limitedStories.filter(s => s.sources.length > 1).length
  }
  
  // Log results
  console.log('\n--- TOP 5 RESULTS ---')
  limitedStories.slice(0, 5).forEach((s, i) => {
    console.log(`${i + 1}. [${s.sources.join('+')}] [${s.points}⬆ ${s.numComments}💬] ${s.title?.substring(0, 50)}...`)
  })
  console.log('\n--- STATS ---')
  console.log(`Total: ${stats.total} | HN: ${stats.hackernews} | Bing: ${stats.bing} | Google: ${stats.google} | Multi: ${stats.multiSource}`)
  console.log('========================================\n')
  
  return {
    stories: limitedStories,
    stats,
    query,
    variants
  }
}

export default {
  crossReferenceHackerNewsSearch
}
