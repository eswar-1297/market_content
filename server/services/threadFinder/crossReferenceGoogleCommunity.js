// Cross-Reference Engine for Google Community - Search API Based
// Uses Bing + Google CSE + Gemini + OpenAI + RSS + APIs + Scraping - ALL IN PARALLEL
// NEW: Unanswered Questions + Google Groups + Issue Tracker for OPEN threads

import { expandQuery } from './queryExpander.js'
import { searchBingMultiQuery } from './bingSearch.js'
import { searchGoogleCSEMultiQuery } from './googleCSE.js'
import { processGoogleCommunityResults } from './googleCommunityUrlProcessor.js'
import { batchCheckGoogleCommunityReplies, containsBrandMention } from './commentChecker.js'
import {
  fetchGoogleCommunityRSSFeeds,
  fetchGoogleCommunityAPI,
  scrapeGoogleSupportSearch,
  scrapeGoogleProductForums,
  // NEW: Sources that target OPEN/unanswered threads
  scrapeGoogleUnansweredQuestions,
  scrapeGoogleGroups,
  scrapeGoogleIssueTracker
} from './googleCommunityAlternativeSources.js'
import { searchGoogleCommunityWithAI } from './aiSearchGoogle.js'

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
 * Build search queries with site: prefix for Google Community
 * Simplified to reduce API quota usage - AI is now primary source
 * 
 * @param {string[]} variants - Query variants
 * @returns {string[]} Search queries with site prefix
 */
function buildGoogleCommunitySearchQueries(variants) {
  // Only search support.google.com threads - AI handles Groups and Issue Tracker
  const supportPrefix = 'site:support.google.com inurl:thread'
  
  // Limit to first 10 variants to stay within quota
  return variants.slice(0, 10).map(variant => `${supportPrefix} ${variant}`)
}

/**
 * Main Google Community search function
 * NOW RUNS ALL SOURCES IN PARALLEL for best performance!
 * 
 * Sources:
 * - Bing Web Search (if configured)
 * - Google CSE (if configured)
 * - RSS Feeds (free, fresh content)
 * - Google Community API (free, direct)
 * - Google Support Scraping (free, direct)
 * - Product Forums Scraping (free, direct)
 * 
 * @param {string} query - User's search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with questions and stats
 */
export async function crossReferenceGoogleCommunitySearch(query, options = {}) {
  // Auto-detect configured APIs
  const configuredAPIs = getConfiguredAPIs()
  
  // Check AI API keys
  const hasGemini = !!process.env.GEMINI_API_KEY
  const hasOpenAI = !!process.env.OPENAI_API_KEY
  
  console.log('\n========================================')
  console.log('GOOGLE COMMUNITY SEARCH (PARALLEL)')
  console.log('Query:', query)
  console.log('Search APIs:', 
    configuredAPIs.bing ? '✅ Bing' : '❌ Bing',
    configuredAPIs.google ? '✅ Google CSE' : '❌ Google CSE'
  )
  console.log('AI APIs:',
    hasGemini ? '✅ Gemini' : '❌ Gemini',
    hasOpenAI ? '✅ OpenAI' : '❌ OpenAI'
  )
  console.log('Alternative Sources: ✅ RSS, ✅ API, ✅ Support Scrape, ✅ Forums Scrape')
  console.log('========================================\n')
  
  const {
    useBing = configuredAPIs.bing,
    useGoogle = configuredAPIs.google,
    useGemini = hasGemini,
    useOpenAI = hasOpenAI,
    useRSS = true,
    useAPI = true,
    useSupportScrape = true,
    useForumsScrape = true,
    maxVariants = 10,        // Reduced to stay within Google CSE free quota
    resultsPerQuery = 10,    // Reduced for quota management
    limit = 100,             // AI is primary source now
    timeFilter = 'all',
    productFilter = 'all'
  } = options
  
  // Convert timeFilter to API-specific formats
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
      case 'all':
      default:
        // Default to 1 year for broader results
        return { bingFreshness: null, googleDateRestrict: 'y1' }
    }
  }
  
  const timeParams = getTimeParams(timeFilter)
  const startTime = Date.now()
  
  // Step 1: Expand query into variants
  console.log('📝 Step 1: Query Expansion')
  const variants = expandQuery(query, maxVariants)
  
  // Add product-specific query if filter is set
  let searchVariants = variants
  if (productFilter && productFilter !== 'all') {
    searchVariants = variants.map(v => `${v} ${productFilter}`)
  }
  
  // Build search queries with site prefix
  const searchQueries = buildGoogleCommunitySearchQueries(searchVariants)
  console.log(`   Generated ${searchQueries.length} search queries`)
  
  // Step 2: Execute ALL searches IN PARALLEL
  console.log('\n🚀 Step 2: Executing ALL Searches in Parallel')
  
  const allPromises = []
  const sourceNames = []
  
  // Bing Search
  if (useBing) {
    console.log('   🔵 Starting Bing search...')
    allPromises.push(
      searchBingMultiQuery(searchQueries, resultsPerQuery, { freshness: timeParams.bingFreshness })
        .then(result => ({ results: result.results || [], source: 'bing' }))
        .catch(err => {
          console.error('   ❌ Bing failed:', err.message)
          return { results: [], source: 'bing' }
        })
    )
    sourceNames.push('bing')
  }
  
  // Google CSE Search
  if (useGoogle) {
    console.log('   🟢 Starting Google CSE search...')
    allPromises.push(
      searchGoogleCSEMultiQuery(searchQueries, resultsPerQuery, { dateRestrict: timeParams.googleDateRestrict })
        .then(result => ({ results: result.results || [], source: 'google' }))
        .catch(err => {
          console.error('   ❌ Google CSE failed:', err.message)
          return { results: [], source: 'google' }
        })
    )
    sourceNames.push('google')
  }
  
  // RSS Feeds (FREE)
  if (useRSS) {
    console.log('   📡 Starting RSS feeds...')
    allPromises.push(
      fetchGoogleCommunityRSSFeeds('all', query)
        .then(threads => ({ results: threads, source: 'rss' }))
        .catch(err => {
          console.error('   ❌ RSS failed:', err.message)
          return { results: [], source: 'rss' }
        })
    )
    sourceNames.push('rss')
  }
  
  // Google Community API (FREE)
  if (useAPI) {
    console.log('   🔍 Starting Community API...')
    allPromises.push(
      fetchGoogleCommunityAPI(query, productFilter !== 'all' ? productFilter : '')
        .then(threads => ({ results: threads, source: 'api' }))
        .catch(err => {
          console.error('   ❌ API failed:', err.message)
          return { results: [], source: 'api' }
        })
    )
    sourceNames.push('api')
  }
  
  // Support Scraping (FREE)
  if (useSupportScrape) {
    console.log('   🌐 Starting Support scrape...')
    allPromises.push(
      scrapeGoogleSupportSearch(query, productFilter !== 'all' ? productFilter : '')
        .then(threads => ({ results: threads, source: 'support' }))
        .catch(err => {
          console.error('   ❌ Support scrape failed:', err.message)
          return { results: [], source: 'support' }
        })
    )
    sourceNames.push('support')
  }
  
  // Product Forums Scraping (FREE)
  if (useForumsScrape) {
    console.log('   🌐 Starting Forums scrape...')
    allPromises.push(
      scrapeGoogleProductForums(query)
        .then(threads => ({ results: threads, source: 'forums' }))
        .catch(err => {
          console.error('   ❌ Forums scrape failed:', err.message)
          return { results: [], source: 'forums' }
        })
    )
    sourceNames.push('forums')
  }
  
  // NEW: Unanswered Questions Pages (FREE - targets KNOWN OPEN threads)
  console.log('   📭 Starting Unanswered Questions scrape (OPEN threads)...')
  allPromises.push(
    scrapeGoogleUnansweredQuestions(query)
      .then(threads => ({ results: threads, source: 'unanswered' }))
      .catch(err => {
        console.error('   ❌ Unanswered scrape failed:', err.message)
        return { results: [], source: 'unanswered' }
      })
  )
  sourceNames.push('unanswered')
  
  // NEW: Google Groups (FREE - high volume of open discussions)
  console.log('   👥 Starting Google Groups scrape...')
  allPromises.push(
    scrapeGoogleGroups(query)
      .then(threads => ({ results: threads, source: 'groups' }))
      .catch(err => {
        console.error('   ❌ Google Groups scrape failed:', err.message)
        return { results: [], source: 'groups' }
      })
  )
  sourceNames.push('groups')
  
  // NEW: Issue Tracker (FREE - feature requests & bug reports)
  console.log('   🐛 Starting Issue Tracker scrape...')
  allPromises.push(
    scrapeGoogleIssueTracker(query)
      .then(threads => ({ results: threads, source: 'issuetracker' }))
      .catch(err => {
        console.error('   ❌ Issue Tracker scrape failed:', err.message)
        return { results: [], source: 'issuetracker' }
      })
  )
  sourceNames.push('issuetracker')
  
  // AI Search (Gemini + OpenAI) - runs in parallel
  if (useGemini || useOpenAI) {
    console.log('   🤖 Starting AI search (Gemini + OpenAI)...')
    allPromises.push(
      searchGoogleCommunityWithAI(query)
        .then(result => ({ results: result.threads, source: 'ai' }))
        .catch(err => {
          console.error('   ❌ AI search failed:', err.message)
          return { results: [], source: 'ai' }
        })
    )
    sourceNames.push('ai')
  }
  
  // Wait for ALL sources to complete
  const allResults = await Promise.all(allPromises)
  
  const parallelTime = Date.now() - startTime
  console.log(`\n⏱️ All parallel fetches completed in ${parallelTime}ms`)
  
  // Collect results by source
  const sourceResults = {}
  allResults.forEach(result => {
    sourceResults[result.source] = result.results
    console.log(`   ${result.source}: ${result.results.length} results`)
  })
  
  // Step 3: Process and combine results
  console.log('\n🔧 Step 3: Combining & Deduplicating Results')
  
  // Process Bing + Google through existing processor
  const bingResults = sourceResults.bing || []
  const googleResults = sourceResults.google || []
  let { questions, stats } = processGoogleCommunityResults(bingResults, googleResults, query)
  
  // Add results from alternative sources (including AI and new OPEN sources)
  // Priority order: unanswered first (known open), then groups/issuetracker, then others
  const alternativeSources = ['unanswered', 'groups', 'issuetracker', 'rss', 'api', 'support', 'forums', 'ai']
  const altQuestions = []
  
  for (const source of alternativeSources) {
    const results = sourceResults[source] || []
    for (const thread of results) {
      // For AI results, preserve the original sources (gemini/openai)
      // For other sources, use the source name
      const threadSources = (source === 'ai' && thread.sources?.length > 0) 
        ? thread.sources 
        : [source]
      
      altQuestions.push({
        id: thread.id || `${source}-${thread.threadId || Date.now()}`,
        threadId: thread.threadId || thread.id,
        title: thread.title || '',
        snippet: thread.snippet || thread.body || '',
        url: thread.url || '',
        product: thread.product || thread.forum || 'general',
        type: thread.type || 'question',
        domain: thread.domain || 'support.google.com',
        source: threadSources[0],  // Primary source
        sources: threadSources,
        freshness: thread.freshness || 'unknown',
        publishedDate: thread.publishedDate,
        isOpen: thread.isOpen || (source === 'unanswered') // Mark unanswered threads as definitely open
      })
    }
  }
  
  // Deduplicate by URL
  const urlMap = new Map()
  
  // Add existing questions first (from Bing/Google)
  for (const q of questions) {
    const normalizedUrl = normalizeUrl(q.url)
    if (normalizedUrl) {
      urlMap.set(normalizedUrl, q)
    }
  }
  
  // Add alternative questions (merge sources if URL exists)
  for (const q of altQuestions) {
    const normalizedUrl = normalizeUrl(q.url)
    if (!normalizedUrl) continue
    
    if (urlMap.has(normalizedUrl)) {
      // Merge sources
      const existing = urlMap.get(normalizedUrl)
      if (!existing.sources.includes(q.source)) {
        existing.sources.push(q.source)
      }
      // Use better title/snippet if available
      if (!existing.title && q.title) existing.title = q.title
      if (!existing.snippet && q.snippet) existing.snippet = q.snippet
      if (q.freshness && q.freshness !== 'unknown') {
        existing.freshness = q.freshness
      }
    } else {
      urlMap.set(normalizedUrl, q)
    }
  }
  
  questions = Array.from(urlMap.values())
  console.log(`   Combined total: ${questions.length} unique questions`)
  
  // Step 3.5: Filter for English-only content
  const isEnglishText = (text) => {
    if (!text || text.length < 3) return true // Too short to determine
    
    // Check for common non-English characters/patterns
    const nonEnglishPatterns = [
      /[\u00C0-\u00FF]{3,}/,  // Extended Latin (French, Spanish, Portuguese accents)
      /[\u0400-\u04FF]/,      // Cyrillic (Russian)
      /[\u4E00-\u9FFF]/,      // Chinese
      /[\u3040-\u309F]/,      // Hiragana (Japanese)
      /[\u30A0-\u30FF]/,      // Katakana (Japanese)
      /[\uAC00-\uD7AF]/,      // Korean
      /[\u0600-\u06FF]/,      // Arabic
      /[\u0900-\u097F]/,      // Devanagari (Hindi)
      /[\u0E00-\u0E7F]/,      // Thai
    ]
    
    for (const pattern of nonEnglishPatterns) {
      if (pattern.test(text)) return false
    }
    
    // Check URL for non-English language codes
    if (text.includes('support.google.com')) {
      // Check if URL has non-English language prefix after support.google.com
      const langMatch = text.match(/support\.google\.com\/[^/]+\/thread/)
      if (langMatch) {
        // Allow only English product names
        return true
      }
    }
    
    // Common non-English words (strong indicators)
    const nonEnglishWords = [
      /\b(como|não|você|está|para|porque|quero|tenho|minha|fazer|quer|estou|isso)\b/i,  // Portuguese
      /\b(cómo|qué|está|para|porque|quiero|tengo|hacer|quiero|estoy|esto|como)\b/i,    // Spanish  
      /\b(comment|récupérer|erreur|mes|fichiers|vous|est|les|une|des|mon|pas|que|pour|je|ai)\b/i,  // French (but 'comment' is English too)
      /\b(perda|recuperar|apaguei|preciso|arquivos|fotos)\b/i,  // Portuguese
      /\b(cara|saya|tidak|ingin|bagaimana)\b/i,  // Indonesian
    ]
    
    let nonEnglishScore = 0
    for (const pattern of nonEnglishWords) {
      if (pattern.test(text)) nonEnglishScore++
    }
    
    // If multiple non-English words found, likely not English
    return nonEnglishScore < 2
  }
  
  const beforeLangFilter = questions.length
  questions = questions.filter(q => {
    const titleIsEnglish = isEnglishText(q.title || '')
    const snippetIsEnglish = isEnglishText(q.snippet || '')
    const urlIsEnglish = !q.url || !q.url.match(/\/[a-z]{2}-[a-z]{2}\//) || q.url.includes('/en-')
    
    // Must have English title (or no title) AND not have clearly non-English URL
    return titleIsEnglish && (snippetIsEnglish || !q.snippet) && urlIsEnglish
  })
  console.log(`   After English filter: ${questions.length} (removed ${beforeLangFilter - questions.length} non-English)`)
  
  // Step 4: Apply product filter if specified
  let filteredQuestions = questions
  if (productFilter && productFilter !== 'all') {
    filteredQuestions = questions.filter(q => 
      (q.product || '').toLowerCase().includes(productFilter.toLowerCase()) ||
      (q.url || '').toLowerCase().includes(productFilter.toLowerCase())
    )
    console.log(`   After product filter: ${filteredQuestions.length}`)
  }
  
  // Step 5: Check replies for CloudFuze mentions and locked threads
  // Check more threads due to higher volume (increased limit to 100)
  console.log('\n🔍 Step 5: Checking for CloudFuze mentions and locked status...')
  
  if (filteredQuestions.length > 0) {
    try {
      const urlsToCheck = filteredQuestions.slice(0, 100).map(q => q.url).filter(Boolean)
      console.log(`   Checking ${urlsToCheck.length} threads (including AI, Groups, Issue Tracker)...`)
      
      const replyCheckResults = await batchCheckGoogleCommunityReplies(urlsToCheck, 5)
      
      const threadsWithBrandInReplies = Array.from(replyCheckResults.values())
        .filter(r => r.hasBrandMention).length
      const notFoundThreads = Array.from(replyCheckResults.values())
        .filter(r => r.is404).length
      const lockedThreads = Array.from(replyCheckResults.values())
        .filter(r => r.isLocked && !r.is404).length
      
      console.log(`   Found ${threadsWithBrandInReplies} threads with CloudFuze in replies`)
      console.log(`   Found ${notFoundThreads} threads with 404 (page not found)`)
      console.log(`   Found ${lockedThreads} locked threads`)
      
      // Filter out threads with CloudFuze in replies OR locked threads OR 404 pages
      const beforeFilter = filteredQuestions.length
      filteredQuestions = filteredQuestions.filter(q => {
        const checkResult = replyCheckResults.get(q.url)
        if (!checkResult || !checkResult.checked) return true
        return !checkResult.hasBrandMention && !checkResult.isLocked && !checkResult.is404
      })
      
      console.log(`   After filtering: ${filteredQuestions.length} (removed ${beforeFilter - filteredQuestions.length})`)
    } catch (error) {
      console.error('   ⚠️ Error checking threads:', error.message)
    }
  }
  
  // Sort by source priority: Unanswered/Groups first (known OPEN), then AI, then traditional
  filteredQuestions.sort((a, b) => {
    // First: threads marked as definitely open
    if (a.isOpen && !b.isOpen) return -1
    if (!a.isOpen && b.isOpen) return 1
    
    // Source priority: unanswered > groups > issuetracker > openai > gemini > others
    const sourcePriority = {
      'unanswered': 0,  // Known OPEN threads - highest priority
      'groups': 1,      // Google Groups - usually open
      'issuetracker': 2, // Issue Tracker - open issues
      'openai': 3,
      'gemini': 4,
      'rss': 5,
      'api': 6,
      'support': 7,
      'forums': 8,
      'google': 9,
      'bing': 10
    }
    
    // Get the highest priority source for each thread
    const getPriority = (sources) => {
      let minPriority = 999
      for (const src of sources) {
        const p = sourcePriority[src] ?? 10
        if (p < minPriority) minPriority = p
      }
      return minPriority
    }
    
    const aPriority = getPriority(a.sources)
    const bPriority = getPriority(b.sources)
    
    // Sort by source priority first
    if (aPriority !== bPriority) {
      return aPriority - bPriority
    }
    
    // Multi-source threads second
    if (b.sources.length !== a.sources.length) {
      return b.sources.length - a.sources.length
    }
    
    // Then by freshness
    const freshnessOrder = { 'today': 0, 'this_week': 1, 'this_month': 2, 'recent': 3, 'older': 4, 'unknown': 5 }
    return (freshnessOrder[a.freshness] || 5) - (freshnessOrder[b.freshness] || 5)
  })
  
  // Limit results
  const limitedQuestions = filteredQuestions.slice(0, limit)
  
  // Final stats
  const finalStats = {
    total: limitedQuestions.length,
    // NEW: Priority sources (known OPEN threads)
    unanswered: limitedQuestions.filter(q => q.sources.includes('unanswered')).length,
    groups: limitedQuestions.filter(q => q.sources.includes('groups')).length,
    issuetracker: limitedQuestions.filter(q => q.sources.includes('issuetracker')).length,
    // AI sources
    gemini: limitedQuestions.filter(q => q.sources.includes('gemini')).length,
    openai: limitedQuestions.filter(q => q.sources.includes('openai')).length,
    ai: limitedQuestions.filter(q => q.sources.includes('ai') || q.sources.includes('gemini') || q.sources.includes('openai')).length,
    // Traditional sources
    bing: limitedQuestions.filter(q => q.sources.includes('bing')).length,
    google: limitedQuestions.filter(q => q.sources.includes('google')).length,
    rss: limitedQuestions.filter(q => q.sources.includes('rss')).length,
    api: limitedQuestions.filter(q => q.sources.includes('api')).length,
    support: limitedQuestions.filter(q => q.sources.includes('support')).length,
    forums: limitedQuestions.filter(q => q.sources.includes('forums')).length,
    multiSource: limitedQuestions.filter(q => q.sources.length > 1).length,
    knownOpen: limitedQuestions.filter(q => q.isOpen).length,
    queriesExecuted: searchQueries.length
  }
  
  const totalTime = Date.now() - startTime
  
  // Log results
  console.log('\n--- TOP 5 RESULTS ---')
  limitedQuestions.slice(0, 5).forEach((q, i) => {
    const openTag = q.isOpen ? ' 🟢OPEN' : ''
    console.log(`${i + 1}. [${q.sources.join('+')}]${openTag} [${q.freshness || 'N/A'}] ${q.title?.substring(0, 50)}...`)
  })
  console.log('\n--- STATS ---')
  console.log(`Total: ${finalStats.total} | Known OPEN: ${finalStats.knownOpen} | Multi-source: ${finalStats.multiSource}`)
  console.log(`🆕 Unanswered: ${finalStats.unanswered} | Groups: ${finalStats.groups} | Issue Tracker: ${finalStats.issuetracker}`)
  console.log(`Gemini: ${finalStats.gemini} | OpenAI: ${finalStats.openai} | Bing: ${finalStats.bing} | Google CSE: ${finalStats.google}`)
  console.log(`RSS: ${finalStats.rss} | API: ${finalStats.api} | Support: ${finalStats.support} | Forums: ${finalStats.forums}`)
  console.log(`Total time: ${totalTime}ms`)
  console.log('========================================\n')
  
  return {
    questions: limitedQuestions,
    stats: finalStats,
    query,
    variants,
    timing: { parallelFetch: parallelTime, total: totalTime }
  }
}

/**
 * Normalize URL for deduplication
 */
function normalizeUrl(url) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    parsed.search = ''
    parsed.hash = ''
    return parsed.href.toLowerCase().replace(/\/+$/, '')
  } catch {
    return url.toLowerCase().replace(/\/+$/, '')
  }
}

/**
 * Get search configuration status
 * @returns {Object} Configuration status for Bing and Google
 */
export function getGoogleCommunitySearchConfigStatus() {
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
