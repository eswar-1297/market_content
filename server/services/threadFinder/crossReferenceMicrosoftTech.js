// Cross-Reference Engine for Microsoft Tech Community
// Uses Bing + Google CSE + Gemini + OpenAI + RSS + APIs + Scraping - ALL IN PARALLEL

import { expandQuery } from './queryExpander.js'
import { searchBingMultiQuery } from './bingSearch.js'
import { searchGoogleCSEMultiQuery } from './googleCSE.js'
import { processSearchResults, extractThreadInfo } from './microsoftTechCommunityUrlProcessor.js'
import { batchCheckMicrosoftTechReplies, containsBrandMention } from './commentChecker.js'
import {
  fetchMicrosoftRSSFeeds,
  fetchMicrosoftQAAPI,
  fetchMicrosoftAnswersSearch,
  scrapeMicrosoftTechCommunitySearch
} from './microsoftTechAlternativeSources.js'
import { searchMicrosoftWithAI } from './aiSearchMicrosoft.js'

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
 * Build search queries with Microsoft Tech Community site prefixes
 * @param {string[]} variants - Query variants
 * @param {string} productFilter - Optional product filter
 * @returns {string[]} Search queries
 */
function buildMicrosoftTechSearchQueries(variants, productFilter = '') {
  // Search both techcommunity and answers.microsoft.com
  const sitePrefixes = [
    'site:techcommunity.microsoft.com',
    'site:answers.microsoft.com'
  ]
  
  const queries = []
  
  for (const variant of variants) {
    for (const prefix of sitePrefixes) {
      let query = `${prefix} ${variant}`
      if (productFilter && productFilter !== 'all') {
        query += ` ${productFilter}`
      }
      queries.push(query)
    }
  }
  
  return queries
}

/**
 * Transform web search results to normalized format
 * @param {Object[]} results - Raw results
 * @param {string} source - Source identifier
 * @returns {Object[]} Normalized results
 */
function transformWebSearchResults(results, source) {
  return results
    .filter(r => r.url && (
      r.url.includes('techcommunity.microsoft.com') ||
      r.url.includes('answers.microsoft.com')
    ))
    .map(result => {
      const info = extractThreadInfo(result.url)
      if (!info) return null
      
      return {
        id: `${info.domain}-${info.threadId}`,
        threadId: info.threadId,
        title: result.title?.replace(/ - Microsoft Tech Community$/, '').replace(/ - Microsoft Community$/, '').trim() || '',
        snippet: result.snippet || '',
        url: result.url,
        forum: info.forum,
        product: info.product,
        type: info.type,
        domain: info.domain,
        source: source,
        sources: [source]
      }
    })
    .filter(Boolean)
}

/**
 * Main Microsoft Tech Community cross-reference search
 * NOW RUNS ALL SOURCES IN PARALLEL for best performance!
 * 
 * Sources:
 * - Bing Web Search (if configured)
 * - Google CSE (if configured)
 * - RSS Feeds (free, fresh content)
 * - Microsoft Q&A API (free, direct)
 * - Microsoft Answers Search (free, direct)
 * - Tech Community Scraping (free, direct)
 * 
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results
 */
export async function crossReferenceMicrosoftTechSearch(query, options = {}) {
  const configuredAPIs = getConfiguredAPIs()
  
  // Check AI API keys
  const hasGemini = !!process.env.GEMINI_API_KEY
  const hasOpenAI = !!process.env.OPENAI_API_KEY
  
  console.log('\n========================================')
  console.log('MICROSOFT TECH COMMUNITY SEARCH (PARALLEL)')
  console.log('Query:', query)
  console.log('Search APIs:',
    configuredAPIs.bing ? '✅ Bing' : '❌ Bing',
    configuredAPIs.google ? '✅ Google CSE' : '❌ Google CSE'
  )
  console.log('AI APIs:',
    hasGemini ? '✅ Gemini' : '❌ Gemini',
    hasOpenAI ? '✅ OpenAI' : '❌ OpenAI'
  )
  console.log('Alternative Sources: ✅ RSS, ✅ Q&A API, ✅ Answers, ✅ Scrape')
  console.log('========================================\n')
  
  const {
    useBing = configuredAPIs.bing,
    useGoogle = configuredAPIs.google,
    useGemini = hasGemini,
    useOpenAI = hasOpenAI,
    useRSS = true,
    useQAAPI = true,
    useAnswersSearch = true,
    useTechCommunityScrape = true,
    maxVariants = 15,
    resultsPerQuery = 50,
    limit = 300,
    timeFilter = 'all',
    productFilter = 'all'
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
  const startTime = Date.now()
  
  // Step 1: Query expansion
  console.log('📝 Step 1: Query Expansion')
  const variants = expandQuery(query, maxVariants)
  
  // Build search queries for web search APIs
  const searchQueries = buildMicrosoftTechSearchQueries(variants, productFilter)
  console.log(`   Generated ${variants.length} variants, ${searchQueries.length} search queries`)
  
  // Step 2: Execute ALL searches IN PARALLEL
  console.log('\n🚀 Step 2: Executing ALL Searches in Parallel')
  
  const allPromises = []
  const sourceNames = []
  
  // Bing Search
  if (useBing) {
    console.log('   🔵 Starting Bing search...')
    allPromises.push(
      searchBingMultiQuery(searchQueries, resultsPerQuery, {
        freshness: timeParams.bingFreshness
      })
      .then(result => transformWebSearchResults(result.results || [], 'bing'))
      .catch(err => {
        console.error('   ❌ Bing failed:', err.message)
        return []
      })
    )
    sourceNames.push('bing')
  }
  
  // Google CSE Search
  if (useGoogle) {
    console.log('   🟢 Starting Google CSE search...')
    allPromises.push(
      searchGoogleCSEMultiQuery(searchQueries, Math.min(resultsPerQuery, 10), {
        dateRestrict: timeParams.googleDateRestrict
      })
      .then(result => transformWebSearchResults(result.results || [], 'google'))
      .catch(err => {
        console.error('   ❌ Google CSE failed:', err.message)
        return []
      })
    )
    sourceNames.push('google')
  }
  
  // RSS Feeds (FREE - always try)
  if (useRSS) {
    console.log('   📡 Starting RSS feeds...')
    allPromises.push(
      fetchMicrosoftRSSFeeds('all', query)
        .catch(err => {
          console.error('   ❌ RSS failed:', err.message)
          return []
        })
    )
    sourceNames.push('rss')
  }
  
  // Microsoft Q&A API (FREE)
  if (useQAAPI) {
    console.log('   🔍 Starting Q&A API...')
    allPromises.push(
      fetchMicrosoftQAAPI(query)
        .catch(err => {
          console.error('   ❌ Q&A API failed:', err.message)
          return []
        })
    )
    sourceNames.push('api')
  }
  
  // Microsoft Answers Search (FREE)
  if (useAnswersSearch) {
    console.log('   🔎 Starting Answers search...')
    allPromises.push(
      fetchMicrosoftAnswersSearch(query)
        .catch(err => {
          console.error('   ❌ Answers search failed:', err.message)
          return []
        })
    )
    sourceNames.push('answers')
  }
  
  // Tech Community Scraping (FREE)
  if (useTechCommunityScrape) {
    console.log('   🌐 Starting Tech Community scrape...')
    allPromises.push(
      scrapeMicrosoftTechCommunitySearch(query)
        .catch(err => {
          console.error('   ❌ Scrape failed:', err.message)
          return []
        })
    )
    sourceNames.push('scrape')
  }
  
  // AI Search (Gemini + OpenAI) - runs in parallel
  if (useGemini || useOpenAI) {
    console.log('   🤖 Starting AI search (Gemini + OpenAI)...')
    allPromises.push(
      searchMicrosoftWithAI(query)
        .then(result => result.threads)
        .catch(err => {
          console.error('   ❌ AI search failed:', err.message)
          return []
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
  sourceNames.forEach((name, idx) => {
    sourceResults[name] = allResults[idx] || []
    console.log(`   ${name}: ${sourceResults[name].length} results`)
  })
  
  // Step 3: Combine and deduplicate results
  console.log('\n🔧 Step 3: Combining & Deduplicating Results')
  
  // Merge Bing + Google through existing processor
  const bingResults = sourceResults.bing || []
  const googleResults = sourceResults.google || []
  let { threads, stats } = processSearchResults(bingResults, googleResults, query)
  
  // Add results from alternative sources (including AI)
  const alternativeSources = ['rss', 'api', 'answers', 'scrape', 'ai']
  const altThreads = []
  
  for (const source of alternativeSources) {
    const results = sourceResults[source] || []
    for (const thread of results) {
      // For AI results, preserve the original sources (gemini/openai)
      // For other sources, use the source name
      const threadSources = (source === 'ai' && thread.sources?.length > 0) 
        ? thread.sources 
        : [source]
      
      // Normalize the thread structure
      altThreads.push({
        id: thread.id || `${source}-${thread.threadId || Date.now()}`,
        threadId: thread.threadId || thread.id,
        title: thread.title || '',
        snippet: thread.snippet || thread.body || '',
        url: thread.url || '',
        forum: thread.forum || 'general',
        product: thread.product || 'general',
        type: thread.type || 'question',
        domain: thread.domain || 'microsoft.com',
        source: threadSources[0],  // Primary source
        sources: threadSources,
        freshness: thread.freshness || 'unknown',
        publishedDate: thread.publishedDate
      })
    }
  }
  
  // Deduplicate by URL
  const urlMap = new Map()
  
  // Add existing threads first (from Bing/Google)
  for (const thread of threads) {
    const normalizedUrl = normalizeUrl(thread.url)
    if (normalizedUrl) {
      urlMap.set(normalizedUrl, thread)
    }
  }
  
  // Add alternative threads (merge sources if URL exists)
  for (const thread of altThreads) {
    const normalizedUrl = normalizeUrl(thread.url)
    if (!normalizedUrl) continue
    
    if (urlMap.has(normalizedUrl)) {
      // Merge sources
      const existing = urlMap.get(normalizedUrl)
      if (!existing.sources.includes(thread.source)) {
        existing.sources.push(thread.source)
      }
      // Use better title/snippet if available
      if (!existing.title && thread.title) existing.title = thread.title
      if (!existing.snippet && thread.snippet) existing.snippet = thread.snippet
      if (thread.freshness && thread.freshness !== 'unknown') {
        existing.freshness = thread.freshness
      }
    } else {
      urlMap.set(normalizedUrl, thread)
    }
  }
  
  threads = Array.from(urlMap.values())
  console.log(`   Combined total: ${threads.length} unique threads`)
  
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
    
    // Common non-English words (strong indicators)
    const nonEnglishWords = [
      /\b(como|não|você|está|para|porque|quero|tenho|minha|fazer|estou|isso)\b/i,  // Portuguese
      /\b(cómo|qué|está|porque|quiero|tengo|hacer|estoy|esto)\b/i,    // Spanish  
      /\b(récupérer|erreur|mes|fichiers|vous|les|une|des|mon|pas|que|pour)\b/i,  // French
      /\b(perda|recuperar|apaguei|preciso|arquivos|fotos)\b/i,  // Portuguese
      /\b(cara|saya|tidak|ingin|bagaimana)\b/i,  // Indonesian
    ]
    
    let nonEnglishScore = 0
    for (const pattern of nonEnglishWords) {
      if (pattern.test(text)) nonEnglishScore++
    }
    
    return nonEnglishScore < 2
  }
  
  const beforeLangFilter = threads.length
  threads = threads.filter(t => {
    const titleIsEnglish = isEnglishText(t.title || '')
    const snippetIsEnglish = isEnglishText(t.snippet || '')
    return titleIsEnglish && (snippetIsEnglish || !t.snippet)
  })
  console.log(`   After English filter: ${threads.length} (removed ${beforeLangFilter - threads.length} non-English)`)
  
  // Step 4: Check replies for brand mentions AND locked status
  // Check ALL threads including AI results (increased limit from 40 to 60)
  console.log('\n🔍 Step 4: Checking for CloudFuze mentions and locked threads...')
  
  if (threads.length > 0) {
    try {
      const urlsToCheck = threads.slice(0, 60).map(t => t.url).filter(Boolean)
      console.log(`   Checking ${urlsToCheck.length} threads (including AI results)...`)
      
      const replyCheckResults = await batchCheckMicrosoftTechReplies(urlsToCheck, 5)
      
      const threadsWithBrand = Array.from(replyCheckResults.values())
        .filter(r => r.hasBrandMention).length
      const notFoundThreads = Array.from(replyCheckResults.values())
        .filter(r => r.is404).length
      const lockedThreads = Array.from(replyCheckResults.values())
        .filter(r => r.isLocked && !r.is404).length
      
      console.log(`   Found ${threadsWithBrand} threads with CloudFuze in replies`)
      console.log(`   Found ${notFoundThreads} threads with 404 (page not found)`)
      console.log(`   Found ${lockedThreads} locked threads`)
      
      // Filter out threads with brand mention OR locked OR 404 pages
      const beforeFilter = threads.length
      threads = threads.filter(t => {
        const checkResult = replyCheckResults.get(t.url)
        if (!checkResult || !checkResult.checked) return true
        return !checkResult.hasBrandMention && !checkResult.isLocked && !checkResult.is404
      })
      console.log(`   After filtering: ${threads.length} (removed ${beforeFilter - threads.length})`)
    } catch (error) {
      console.error('   Error checking replies:', error.message)
    }
  }
  
  // Sort by source priority: AI first (OpenAI, Gemini), then traditional search (Google, Bing)
  threads.sort((a, b) => {
    // Source priority: openai > gemini > rss > api > google > bing
    const sourcePriority = {
      'openai': 0,
      'gemini': 1,
      'rss': 2,
      'api': 3,
      'answers': 4,
      'scrape': 5,
      'google': 6,
      'bing': 7
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
  const limitedThreads = threads.slice(0, limit)
  
  // Final stats
  const finalStats = {
    total: limitedThreads.length,
    bing: limitedThreads.filter(t => t.sources.includes('bing')).length,
    google: limitedThreads.filter(t => t.sources.includes('google')).length,
    gemini: limitedThreads.filter(t => t.sources.includes('gemini')).length,
    openai: limitedThreads.filter(t => t.sources.includes('openai')).length,
    ai: limitedThreads.filter(t => t.sources.includes('ai') || t.sources.includes('gemini') || t.sources.includes('openai')).length,
    rss: limitedThreads.filter(t => t.sources.includes('rss')).length,
    api: limitedThreads.filter(t => t.sources.includes('api')).length,
    answers: limitedThreads.filter(t => t.sources.includes('answers')).length,
    scrape: limitedThreads.filter(t => t.sources.includes('scrape')).length,
    multiSource: limitedThreads.filter(t => t.sources.length > 1).length
  }
  
  const totalTime = Date.now() - startTime
  
  // Log results
  console.log('\n--- TOP 5 RESULTS ---')
  limitedThreads.slice(0, 5).forEach((t, i) => {
    console.log(`${i + 1}. [${t.sources.join('+')}] [${t.freshness || 'N/A'}] ${t.title?.substring(0, 50)}...`)
  })
  console.log('\n--- STATS ---')
  console.log(`Total: ${finalStats.total} | Multi-source: ${finalStats.multiSource}`)
  console.log(`Bing: ${finalStats.bing} | Google CSE: ${finalStats.google} | Gemini: ${finalStats.gemini} | OpenAI: ${finalStats.openai}`)
  console.log(`RSS: ${finalStats.rss} | API: ${finalStats.api} | Answers: ${finalStats.answers} | Scrape: ${finalStats.scrape}`)
  console.log(`Total time: ${totalTime}ms`)
  console.log('========================================\n')
  
  return {
    threads: limitedThreads,
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
    // Remove tracking params, normalize
    parsed.search = ''
    parsed.hash = ''
    return parsed.href.toLowerCase().replace(/\/+$/, '')
  } catch {
    return url.toLowerCase().replace(/\/+$/, '')
  }
}

/**
 * Get search configuration status
 */
export function getMicrosoftTechSearchConfigStatus() {
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

export default {
  crossReferenceMicrosoftTechSearch,
  getMicrosoftTechSearchConfigStatus
}
