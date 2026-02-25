// Cross-Reference Engine for Stack Overflow - Hybrid Search
// Uses Stack Exchange API (primary) + Bing + Google CSE for comprehensive coverage

import { expandQuery } from './queryExpander.js'
import { searchStackOverflow, fetchMultipleQuestionsAnswers, fetchQuestionsByIds } from './stackExchange.js'
import { searchBingMultiQuery } from './bingSearch.js'
import { searchGoogleCSEMultiQuery } from './googleCSE.js'
import { processSearchResults, extractQuestionInfo } from './stackOverflowUrlProcessor.js'
import { batchCheckStackOverflowAnswers, containsBrandMention } from './commentChecker.js'

/**
 * Check which APIs are configured
 */
function getConfiguredAPIs() {
  return {
    stackexchange: true, // Always available (no key required, just rate limited)
    bing: !!process.env.BING_API_KEY,
    google: !!(process.env.GOOGLE_CSE_API_KEY || process.env.GOOGLE_CSE_KEY) && !!(process.env.GOOGLE_CSE_ID || process.env.GOOGLE_CSE_CX)
  }
}

/**
 * Build search queries with site:stackoverflow.com prefix for web search
 * @param {string[]} variants - Query variants
 * @returns {string[]} Search queries with site prefix
 */
function buildStackOverflowSearchQueries(variants) {
  const sitePrefix = 'site:stackoverflow.com'
  return variants.map(variant => `${sitePrefix} ${variant}`)
}

/**
 * Transform Bing/Google results to normalized format
 * @param {Object[]} results - Raw search results
 * @param {string} source - Source identifier (bing/google)
 * @returns {Object[]} Normalized results
 */
function transformWebSearchResults(results, source) {
  return results
    .filter(r => r.url && r.url.includes('stackoverflow.com'))
    .map(result => {
      const info = extractQuestionInfo(result.url)
      if (!info || !info.questionId) return null
      
      return {
        id: info.questionId,
        title: result.title?.replace(/ - Stack Overflow$/, '').trim() || '',
        snippet: result.snippet || '',
        url: result.url,
        source: source,
        sources: [source]
      }
    })
    .filter(Boolean)
}

/**
 * Main Stack Overflow cross-reference search function
 * 
 * Workflow:
 * 1. Expand query into variants
 * 2. Search Stack Exchange API (primary)
 * 3. Search Bing with site:stackoverflow.com
 * 4. Search Google CSE with site:stackoverflow.com
 * 5. Merge, deduplicate, enrich with full details
 * 6. Check answers for CloudFuze mentions
 * 7. Filter and score results
 * 
 * @param {string} query - User search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results
 */
export async function crossReferenceStackOverflowSearch(query, options = {}) {
  const configuredAPIs = getConfiguredAPIs()
  
  console.log('\n========================================')
  console.log('STACK OVERFLOW CROSS-REFERENCE SEARCH')
  console.log('Query:', query)
  console.log('Configured APIs:',
    '✅ Stack Exchange',
    configuredAPIs.bing ? '✅ Bing' : '❌ Bing',
    configuredAPIs.google ? '✅ Google' : '❌ Google'
  )
  console.log('========================================\n')
  
  const {
    useStackExchange = true,
    useBing = configuredAPIs.bing,
    useGoogle = configuredAPIs.google,
    maxVariants = 6,
    resultsPerQuery = 30,
    limit = 150,
    timeFilter = 'all',
    tags = '',            // Comma-separated tags for Stack Exchange
    minScore = 0,
    minAnswers = 0
  } = options
  
  // Convert timeFilter to API-specific formats
  const getTimeParams = (filter) => {
    const now = Math.floor(Date.now() / 1000)
    switch (filter) {
      case '1month':
        return { 
          seFromDate: now - 30 * 24 * 60 * 60,
          bingFreshness: 'Month', 
          googleDateRestrict: 'm1' 
        }
      case '3months':
        return { 
          seFromDate: now - 90 * 24 * 60 * 60,
          bingFreshness: 'Month', 
          googleDateRestrict: 'm3' 
        }
      case '6months':
        return { 
          seFromDate: now - 180 * 24 * 60 * 60,
          bingFreshness: null, 
          googleDateRestrict: 'm6' 
        }
      case '1year':
        return { 
          seFromDate: now - 365 * 24 * 60 * 60,
          bingFreshness: null, 
          googleDateRestrict: 'y1' 
        }
      default:
        return { seFromDate: null, bingFreshness: null, googleDateRestrict: null }
    }
  }
  
  const timeParams = getTimeParams(timeFilter)
  
  // Step 1: Expand query into variants
  console.log('📝 Step 1: Query Expansion')
  const variants = expandQuery(query, maxVariants)
  
  // Build web search queries
  const webSearchQueries = buildStackOverflowSearchQueries(variants)
  console.log(`   Generated ${variants.length} variants, ${webSearchQueries.length} web queries`)
  
  // Step 2-4: Execute searches in parallel
  console.log('\n🌐 Step 2-4: Executing Searches')
  
  const searchPromises = []
  
  // Stack Exchange API search
  if (useStackExchange) {
    console.log('🔶 Starting Stack Exchange API search...')
    searchPromises.push(
      searchStackOverflow(query, {
        tagged: tags,
        pageSize: 50,
        fromDate: timeParams.seFromDate,
        closed: false
      })
      .then(result => ({
        results: result.items || [],
        source: 'stackexchange'
      }))
      .catch(err => {
        console.error('Stack Exchange search failed:', err.message)
        return { results: [], source: 'stackexchange' }
      })
    )
  }
  
  // Bing search
  if (useBing) {
    console.log('🔵 Starting Bing search...')
    searchPromises.push(
      searchBingMultiQuery(webSearchQueries, resultsPerQuery, { 
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
  
  // Google CSE search
  if (useGoogle) {
    console.log('🟢 Starting Google CSE search...')
    searchPromises.push(
      searchGoogleCSEMultiQuery(webSearchQueries, Math.min(resultsPerQuery, 10), {
        dateRestrict: timeParams.googleDateRestrict
      })
      .then(result => ({
        results: transformWebSearchResults(result.results || [], 'google'),
        source: 'google'
      }))
      .catch(err => {
        console.error('Google CSE search failed:', err.message)
        return { results: [], source: 'google' }
      })
    )
  }
  
  const searchResults = await Promise.all(searchPromises)
  
  // Separate results by source
  const stackExchangeResults = searchResults.find(r => r.source === 'stackexchange')?.results || []
  const bingResults = searchResults.find(r => r.source === 'bing')?.results || []
  const googleResults = searchResults.find(r => r.source === 'google')?.results || []
  
  console.log(`\n📊 Raw results: SE=${stackExchangeResults.length}, Bing=${bingResults.length}, Google=${googleResults.length}`)
  
  // Step 5: Process, deduplicate, filter
  console.log('\n🔧 Step 5: Processing Results')
  let { questions, stats } = processSearchResults(
    stackExchangeResults, 
    bingResults, 
    googleResults, 
    query
  )
  
  // Step 6: Enrich questions from web search with Stack Exchange data
  console.log('\n📥 Step 6: Enriching questions with Stack Exchange data...')
  const questionsNeedingEnrichment = questions.filter(q => 
    !q.sources.includes('stackexchange') && q.id
  )
  
  if (questionsNeedingEnrichment.length > 0) {
    const idsToEnrich = questionsNeedingEnrichment.slice(0, 50).map(q => q.id)
    console.log(`   Fetching details for ${idsToEnrich.length} questions...`)
    
    try {
      const enriched = await fetchQuestionsByIds(idsToEnrich)
      
      if (enriched.items) {
        const enrichedMap = new Map(enriched.items.map(q => [q.id, q]))
        
        questions = questions.map(q => {
          const enrichedData = enrichedMap.get(q.id)
          if (enrichedData) {
            return {
              ...q,
              title: enrichedData.title || q.title,
              body: enrichedData.body || q.body,
              score: enrichedData.score ?? q.score,
              answerCount: enrichedData.answerCount ?? q.answerCount,
              viewCount: enrichedData.viewCount ?? q.viewCount,
              isAnswered: enrichedData.isAnswered ?? q.isAnswered,
              acceptedAnswerId: enrichedData.acceptedAnswerId ?? q.acceptedAnswerId,
              tags: enrichedData.tags || q.tags,
              owner: enrichedData.owner || q.owner,
              closedReason: enrichedData.closedReason,
              lastActivityAt: enrichedData.lastActivityAt
            }
          }
          return q
        })
        
        // Filter out closed questions that were discovered
        const beforeClosed = questions.length
        questions = questions.filter(q => !q.closedReason)
        if (questions.length < beforeClosed) {
          console.log(`   Filtered out ${beforeClosed - questions.length} closed questions`)
        }
      }
    } catch (error) {
      console.error('   Error enriching questions:', error.message)
    }
  }
  
  // Step 7: Check answers for CloudFuze mentions
  console.log('\n🔍 Step 7: Checking answers for CloudFuze mentions...')
  
  if (questions.length > 0) {
    try {
      const idsToCheck = questions.slice(0, 40).map(q => q.id).filter(Boolean)
      console.log(`   Checking ${idsToCheck.length} questions for answer mentions...`)
      
      const answerCheckResults = await batchCheckStackOverflowAnswers(idsToCheck)
      
      const questionsWithBrandInAnswers = Array.from(answerCheckResults.values())
        .filter(r => r.hasBrandMention).length
      console.log(`   Found ${questionsWithBrandInAnswers} questions with CloudFuze in answers`)
      
      // Filter out questions with CloudFuze in answers
      const beforeFilter = questions.length
      questions = questions.filter(q => {
        const checkResult = answerCheckResults.get(q.id)
        return !checkResult || !checkResult.hasBrandMention
      })
      console.log(`   After filtering: ${questions.length} (removed ${beforeFilter - questions.length})`)
    } catch (error) {
      console.error('   Error checking answers:', error.message)
    }
  }
  
  // Step 8: Apply filters and limit
  if (minScore > 0) {
    questions = questions.filter(q => (q.score || 0) >= minScore)
  }
  if (minAnswers > 0) {
    questions = questions.filter(q => (q.answerCount || 0) >= minAnswers)
  }
  
  const limitedQuestions = questions.slice(0, limit)
  
  // Final stats
  const finalStats = {
    total: limitedQuestions.length,
    stackexchange: limitedQuestions.filter(q => q.sources.includes('stackexchange')).length,
    bing: limitedQuestions.filter(q => q.sources.includes('bing')).length,
    google: limitedQuestions.filter(q => q.sources.includes('google')).length,
    multiSource: limitedQuestions.filter(q => q.sources.length > 1).length
  }
  
  // Log results
  console.log('\n--- TOP 5 RESULTS ---')
  limitedQuestions.slice(0, 5).forEach((q, i) => {
    console.log(`${i + 1}. [${q.sources.join('+')}] [${q.score}⬆ ${q.answerCount}💬] ${q.title?.substring(0, 50)}...`)
  })
  console.log('\n--- STATS ---')
  console.log(`Total: ${finalStats.total} | SE: ${finalStats.stackexchange} | Bing: ${finalStats.bing} | Google: ${finalStats.google} | Multi: ${finalStats.multiSource}`)
  console.log('========================================\n')
  
  return {
    questions: limitedQuestions,
    stats: finalStats,
    query,
    variants
  }
}

/**
 * Get search configuration status
 */
export function getStackOverflowSearchConfigStatus() {
  return {
    stackexchange: {
      configured: true,
      name: 'Stack Exchange API',
      note: 'Always available (rate limited without API key)'
    },
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

export default {
  crossReferenceStackOverflowSearch,
  getStackOverflowSearchConfigStatus
}
