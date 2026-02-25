// Bing Web Search API Integration
// Primary search engine for discovering Quora URLs

const BING_API_URL = 'https://api.bing.microsoft.com/v7.0/search'

/**
 * Search Bing for Quora URLs
 * @param {string} query - Search query (should include site:quora.com)
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with URLs
 */
export async function searchBing(query, options = {}) {
  const apiKey = process.env.BING_API_KEY
  
  if (!apiKey) {
    console.log('🔵 Bing: No API key configured, skipping...')
    return { results: [], source: 'bing', error: 'No API key' }
  }
  
  const {
    count = 50,          // Results per page (max 50)
    offset = 0,          // Pagination offset
    market = 'en-US',    // Market/locale
    safeSearch = 'Moderate',
    freshness = null     // Time filter: Day, Week, Month, or date range (YYYY-MM-DD..YYYY-MM-DD)
  } = options
  
  console.log(`🔵 Bing: Searching "${query.substring(0, 60)}..."${freshness ? ` (freshness: ${freshness})` : ''}`)
  
  try {
    const params = new URLSearchParams({
      q: query,
      count: Math.min(count, 50).toString(),
      offset: offset.toString(),
      mkt: market,
      safeSearch
    })
    
    // Add freshness filter if specified
    if (freshness) {
      params.append('freshness', freshness)
    }
    
    const response = await fetch(`${BING_API_URL}?${params}`, {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey
      }
    })
    
    if (!response.ok) {
      const error = await response.text()
      console.error('🔵 Bing API error:', response.status, error)
      return { results: [], source: 'bing', error: `API error: ${response.status}` }
    }
    
    const data = await response.json()
    
    // Extract web results
    const webPages = data.webPages?.value || []
    
    const results = webPages.map(page => ({
      url: page.url,
      title: page.name,
      snippet: page.snippet,
      displayUrl: page.displayUrl,
      dateLastCrawled: page.dateLastCrawled,
      source: 'bing'
    }))
    
    console.log(`🔵 Bing: Found ${results.length} results`)
    
    return {
      results,
      source: 'bing',
      totalEstimatedMatches: data.webPages?.totalEstimatedMatches || 0,
      hasMore: offset + results.length < (data.webPages?.totalEstimatedMatches || 0)
    }
    
  } catch (error) {
    console.error('🔵 Bing search error:', error.message)
    return { results: [], source: 'bing', error: error.message }
  }
}

/**
 * Search Bing with pagination to get more results
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum total results to fetch
 * @returns {Promise<Object>} Aggregated search results
 */
export async function searchBingWithPagination(query, maxResults = 100) {
  const allResults = []
  let offset = 0
  const pageSize = 50
  
  while (allResults.length < maxResults) {
    const { results, hasMore, error } = await searchBing(query, {
      count: pageSize,
      offset
    })
    
    if (error || results.length === 0) {
      break
    }
    
    allResults.push(...results)
    
    if (!hasMore) {
      break
    }
    
    offset += pageSize
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  return {
    results: allResults.slice(0, maxResults),
    source: 'bing',
    totalFetched: allResults.length
  }
}

/**
 * Search Bing with multiple query variants
 * Runs queries in parallel batches for better performance
 * @param {string[]} queries - Array of search queries
 * @param {number} resultsPerQuery - Max results per query (max 50)
 * @param {Object} options - Additional options (freshness, etc.)
 * @returns {Promise<Object>} Combined results from all queries
 */
export async function searchBingMultiQuery(queries, resultsPerQuery = 50, options = {}) {
  // Skip early if no API key
  if (!process.env.BING_API_KEY) {
    console.log('🔵 Bing: Skipping (no API key configured)')
    return { results: [], source: 'bing', queriesExecuted: 0 }
  }
  
  const { freshness = null } = options
  
  console.log(`\n🔵 ========== BING MULTI-QUERY SEARCH ==========`)
  console.log(`🔵 Running ${queries.length} queries with up to ${resultsPerQuery} results each...`)
  if (freshness) console.log(`🔵 Freshness filter: ${freshness}`)
  
  // Helper function to fetch results for a single query
  const fetchQueryResults = async (query) => {
    const { results } = await searchBing(query, { 
      count: Math.min(resultsPerQuery, 50),  // Bing max is 50 per request
      freshness 
    })
    return results
  }
  
  // Run queries in parallel batches (8 queries at a time - Bing is more lenient)
  const batchSize = 8
  const allResults = []
  
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize)
    const batchPromises = batch.map(query => fetchQueryResults(query))
    const batchResults = await Promise.all(batchPromises)
    
    batchResults.forEach(results => allResults.push(...results))
    
    // Delay between batches to respect rate limits
    if (i + batchSize < queries.length) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  
  console.log(`🔵 Total raw results: ${allResults.length}`)
  console.log(`🔵 ========== END BING ==========\n`)
  
  return {
    results: allResults,
    source: 'bing',
    queriesExecuted: queries.length
  }
}

