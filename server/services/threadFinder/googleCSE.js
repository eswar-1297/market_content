// Google Custom Search Engine (CSE) API Integration
// Secondary/fallback search engine for discovering Quora URLs

const GOOGLE_CSE_API_URL = 'https://www.googleapis.com/customsearch/v1'

/**
 * Search Google CSE for Quora URLs
 * @param {string} query - Search query (should include site:quora.com)
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with URLs
 */
export async function searchGoogleCSE(query, options = {}) {
  const apiKey = (process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_CSE_KEY) || process.env.GOOGLE_CSE_KEY
  const cseId = process.env.GOOGLE_CSE_ID || process.env.GOOGLE_CSE_CX
  
  if (!apiKey || !cseId) {
    console.log('🟢 Google CSE: No API key or CSE ID configured, skipping...')
    return { results: [], source: 'google', error: 'No API key or CSE ID' }
  }
  
  const {
    num = 10,           // Results per page (max 10 for Google CSE)
    start = 1,          // Start index (1-based)
    safe = 'active',    // Safe search level
    dateRestrict = null // Time filter: d[number], w[number], m[number], y[number]
  } = options
  
  console.log(`🟢 Google: Searching "${query.substring(0, 60)}..."${dateRestrict ? ` (dateRestrict: ${dateRestrict})` : ''}`)
  
  try {
    const params = new URLSearchParams({
      key: apiKey,
      cx: cseId,
      q: query,
      num: Math.min(num, 10).toString(),
      start: start.toString(),
      safe
    })
    
    // Add date restriction if specified
    if (dateRestrict) {
      params.append('dateRestrict', dateRestrict)
    }
    
    const response = await fetch(`${GOOGLE_CSE_API_URL}?${params}`)
    
    if (!response.ok) {
      const error = await response.json()
      console.error('🟢 Google CSE API error:', response.status, error.error?.message)
      return { results: [], source: 'google', error: `API error: ${response.status}` }
    }
    
    const data = await response.json()
    
    // Extract search results
    const items = data.items || []
    
    const results = items.map(item => ({
      url: item.link,
      title: item.title,
      snippet: item.snippet,
      displayUrl: item.displayLink,
      source: 'google'
    }))
    
    console.log(`🟢 Google: Found ${results.length} results`)
    
    // Check if there are more results
    const totalResults = parseInt(data.searchInformation?.totalResults || '0')
    const currentEnd = start + results.length - 1
    
    return {
      results,
      source: 'google',
      totalResults,
      hasMore: currentEnd < Math.min(totalResults, 100) // Google CSE limits to 100 results
    }
    
  } catch (error) {
    console.error('🟢 Google CSE search error:', error.message)
    return { results: [], source: 'google', error: error.message }
  }
}

/**
 * Search Google CSE with pagination to get more results
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum total results to fetch (max 100 for Google CSE)
 * @returns {Promise<Object>} Aggregated search results
 */
export async function searchGoogleCSEWithPagination(query, maxResults = 50) {
  const allResults = []
  let start = 1
  const pageSize = 10 // Google CSE max is 10 per request
  
  // Google CSE only allows up to 100 results total
  const effectiveMax = Math.min(maxResults, 100)
  
  while (allResults.length < effectiveMax) {
    const { results, hasMore, error } = await searchGoogleCSE(query, {
      num: pageSize,
      start
    })
    
    if (error || results.length === 0) {
      break
    }
    
    allResults.push(...results)
    
    if (!hasMore) {
      break
    }
    
    start += pageSize
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  
  return {
    results: allResults.slice(0, effectiveMax),
    source: 'google',
    totalFetched: allResults.length
  }
}

/**
 * Search Google CSE with multiple query variants and pagination
 * Runs queries in parallel batches for better performance
 * @param {string[]} queries - Array of search queries
 * @param {number} resultsPerQuery - Max results per query (will use pagination if > 10)
 * @param {Object} options - Additional options (dateRestrict, etc.)
 * @returns {Promise<Object>} Combined results from all queries
 */
export async function searchGoogleCSEMultiQuery(queries, resultsPerQuery = 10, options = {}) {
  const { dateRestrict = null } = options
  
  console.log(`\n🟢 ========== GOOGLE CSE MULTI-QUERY SEARCH ==========`)
  console.log(`🟢 Running ${queries.length} queries with up to ${resultsPerQuery} results each...`)
  if (dateRestrict) console.log(`🟢 Date restriction: ${dateRestrict}`)
  
  // Helper function to fetch results for a single query with pagination
  const fetchQueryResults = async (query) => {
    const queryResults = []
    
    if (resultsPerQuery > 10) {
      let start = 1
      const maxPages = Math.ceil(Math.min(resultsPerQuery, 50) / 10)  // Increased to 5 pages (50 results max)
      
      for (let page = 0; page < maxPages; page++) {
        const { results, hasMore, error } = await searchGoogleCSE(query, { 
          num: 10, 
          start, 
          dateRestrict 
        })
        
        if (error || results.length === 0) break
        
        queryResults.push(...results)
        
        if (!hasMore || queryResults.length >= resultsPerQuery) break
        
        start += 10
        // Small delay between pagination requests
        await new Promise(resolve => setTimeout(resolve, 150))
      }
    } else {
      // Single request for 10 or fewer results
      const { results, error } = await searchGoogleCSE(query, { num: resultsPerQuery, dateRestrict })
      if (!error) {
        queryResults.push(...results)
      }
    }
    
    return queryResults
  }
  
  // Run queries in parallel batches (5 queries at a time to avoid rate limits)
  const batchSize = 5
  const allResults = []
  
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize)
    const batchPromises = batch.map(query => fetchQueryResults(query))
    const batchResults = await Promise.all(batchPromises)
    
    batchResults.forEach(results => allResults.push(...results))
    
    // Delay between batches to respect rate limits
    if (i + batchSize < queries.length) {
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }
  
  console.log(`🟢 Total raw results: ${allResults.length}`)
  console.log(`🟢 ========== END GOOGLE CSE ==========\n`)
  
  return {
    results: allResults,
    source: 'google',
    queriesExecuted: queries.length
  }
}


