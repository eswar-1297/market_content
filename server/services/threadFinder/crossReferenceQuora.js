// Cross-Reference Engine for Quora - Search API Based
// Uses Bing Web Search (primary) + Google CSE (secondary)
// No AI/LLM - direct search API for real URLs

import { expandQuery, buildSearchQueries } from './queryExpander.js'
import { searchBingMultiQuery } from './bingSearch.js'
import { searchGoogleCSEMultiQuery } from './googleCSE.js'
import { processSearchResults } from './urlProcessor.js'
import { withCache } from './quoraSearchCache.js'
import { batchCheckQuoraAnswers, containsBrandMention } from './commentChecker.js'

/**
 * Check which search APIs are configured
 */
function getConfiguredAPIs() {
  return {
    bing: !!process.env.BING_API_KEY,
    google: !!(process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_CSE_KEY) && !!(process.env.GOOGLE_CSE_ID || process.env.GOOGLE_CSE_CX)
  }
}

/**
 * Main Quora search function using Search APIs
 * 
 * Workflow:
 * 1. Expand user query into variants
 * 2. Build search queries with site:quora.com
 * 3. Execute Bing search (if configured)
 * 4. Execute Google CSE search (if configured)
 * 5. Process, deduplicate, validate URLs
 * 6. Return aggregated results
 * 
 * @param {string} query - User's search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with questions and stats
 */
export async function crossReferenceQuoraSearch(query, options = {}) {
  // Auto-detect configured APIs
  const configuredAPIs = getConfiguredAPIs()
  
  console.log('\n========================================')
  console.log('QUORA SEARCH API WORKFLOW')
  console.log('Query:', query)
  console.log('Configured APIs:', 
    configuredAPIs.bing ? '✅ Bing' : '❌ Bing',
    configuredAPIs.google ? '✅ Google' : '❌ Google'
  )
  console.log('========================================\n')
  
  // Check if at least one API is configured
  if (!configuredAPIs.bing && !configuredAPIs.google) {
    console.error('❌ No search APIs configured! Add BING_API_KEY or GOOGLE_CSE_API_KEY to .env')
    return {
      questions: [],
      stats: { total: 0, bing: 0, google: 0, multiSource: 0 },
      query,
      error: 'No search APIs configured. Please add API keys to .env file.'
    }
  }
  
  const {
    useBing = configuredAPIs.bing,  // Auto-detect
    useGoogle = configuredAPIs.google,  // Auto-detect
    maxVariants = 8,
    resultsPerQuery = 30,
    limit = 150,
    useCache = true,
    timeFilter = 'all'  // Time filter: all, 1month, 3months, 6months, 1year, older
  } = options
  
  // Convert timeFilter to API-specific formats
  const getTimeParams = (filter) => {
    switch (filter) {
      case '1month':
        return { bingFreshness: 'Month', googleDateRestrict: 'm1' }
      case '3months':
        return { bingFreshness: 'Month', googleDateRestrict: 'm3' }  // Bing doesn't have 3 month, use Month
      case '6months':
        return { bingFreshness: null, googleDateRestrict: 'm6' }  // Use date range for Bing
      case '1year':
        return { bingFreshness: null, googleDateRestrict: 'y1' }
      case 'older':
        // For "older than a year", we can't easily filter - return null
        return { bingFreshness: null, googleDateRestrict: null }
      default:
        return { bingFreshness: null, googleDateRestrict: null }
    }
  }
  
  const timeParams = getTimeParams(timeFilter)
  
  // Use cache wrapper
  const searchFn = async () => {
    // Step 1: Expand query into variants
    console.log('📝 Step 1: Query Expansion')
    const variants = expandQuery(query, maxVariants)
    
    // Step 2: Build search queries with site:quora.com prefix
    console.log('\n🔍 Step 2: Building Search Queries')
    const searchQueries = buildSearchQueries(variants)
    console.log(`   Generated ${searchQueries.length} search queries`)
    
    // Step 3 & 4: Execute searches in parallel
    console.log('\n🌐 Step 3-4: Executing Searches')
    
    const searchPromises = []
    
    if (useBing) {
      searchPromises.push(
        searchBingMultiQuery(searchQueries, resultsPerQuery, { freshness: timeParams.bingFreshness })
          .catch(err => {
            console.error('Bing search failed:', err.message)
            return { results: [], source: 'bing' }
          })
      )
    }
    
    if (useGoogle) {
      searchPromises.push(
        searchGoogleCSEMultiQuery(searchQueries, Math.min(resultsPerQuery, 10), { dateRestrict: timeParams.googleDateRestrict })
          .catch(err => {
            console.error('Google CSE search failed:', err.message)
            return { results: [], source: 'google' }
          })
      )
    }
    
    const searchResults = await Promise.all(searchPromises)
    
    // Separate results by source
    const bingResults = searchResults.find(r => r.source === 'bing')?.results || []
    const googleResults = searchResults.find(r => r.source === 'google')?.results || []
    
    // Step 5: Process, normalize, deduplicate, validate, filter
    console.log('\n🔧 Step 5: Processing Results')
    const { questions, stats } = processSearchResults(bingResults, googleResults, query)
    
    // Step 6: Skip answer checking — it causes timeouts scraping Quora pages
    // CloudFuze mentions in answers don't reduce thread value for content research
    console.log('\n✅ Step 6: Skipping answer checking (speed optimization)')
    let filteredQuestions = questions

    if (false && questions.length > 0) {
      try {
        const urlsToCheck = questions.slice(0, 30).map(q => q.url).filter(Boolean)
        console.log(`   Checking ${urlsToCheck.length} questions for answer mentions...`)

        const answerCheckResults = await batchCheckQuoraAnswers(urlsToCheck, 3)

        const questionsWithBrandInAnswers = Array.from(answerCheckResults.values())
          .filter(r => r.hasBrandMention).length
        console.log(`   Found ${questionsWithBrandInAnswers} questions with CloudFuze in answers`)

        const beforeFilter = questions.length
        filteredQuestions = questions.filter(q => {
          const checkResult = answerCheckResults.get(q.url)
          return !checkResult || !checkResult.checked || !checkResult.hasBrandMention
        })
        console.log(`   After filtering: ${filteredQuestions.length} (removed ${beforeFilter - filteredQuestions.length})`)
      } catch (error) {
        console.error('   ⚠️ Error checking answers:', error.message)
        // Continue with unfiltered results on error
      }
    }
    
    // Step 7: Limit results
    const limitedQuestions = filteredQuestions.slice(0, limit)
    
    // Final stats
    const finalStats = {
      total: limitedQuestions.length,
      bing: limitedQuestions.filter(q => q.sources.includes('bing')).length,
      google: limitedQuestions.filter(q => q.sources.includes('google')).length,
      multiSource: limitedQuestions.filter(q => q.sources.length > 1).length,
      queriesExecuted: searchQueries.length
    }
    
    // Log results
    console.log('\n--- TOP 5 RESULTS ---')
    limitedQuestions.slice(0, 5).forEach((q, i) => {
      console.log(`${i + 1}. [${q.sources.join('+')}] ${q.title?.substring(0, 60)}...`)
    })
    console.log('\n--- STATS ---')
    console.log(`Total: ${finalStats.total} | Bing: ${finalStats.bing} | Google: ${finalStats.google} | Multi: ${finalStats.multiSource}`)
    console.log('========================================\n')
    
    return {
      questions: limitedQuestions,
      stats: finalStats,
      query,
      variants
    }
  }
  
  // Execute with or without cache
  if (useCache) {
    return await withCache(query, searchFn)
  } else {
    return await searchFn()
  }
}

/**
 * Get search configuration status
 * @returns {Object} Configuration status for Bing and Google
 */
export function getSearchConfigStatus() {
  return {
    bing: {
      configured: !!process.env.BING_API_KEY,
      name: 'Bing Web Search API'
    },
    google: {
      configured: !!(process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_CSE_KEY) && !!(process.env.GOOGLE_CSE_ID || process.env.GOOGLE_CSE_CX),
      name: 'Google Custom Search API'
    }
  }
}
