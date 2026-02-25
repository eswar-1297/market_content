// Microsoft Tech Community Alternative Sources
// RSS Feeds + Internal API for fresher, more accurate results

import { containsBrandMention } from './commentChecker.js'

// Microsoft Tech Community board IDs for RSS feeds
// Extended list to maximize thread pool (target: 200-300 threads)
const MICROSOFT_BOARDS = [
  // Core Microsoft 365 products
  { id: 'Microsoft365', name: 'Microsoft 365' },
  { id: 'Office', name: 'Office' },
  { id: 'OneDrive', name: 'OneDrive' },
  { id: 'SharePoint', name: 'SharePoint' },
  { id: 'Teams', name: 'Microsoft Teams' },
  { id: 'Outlook', name: 'Outlook' },
  { id: 'Exchange', name: 'Exchange' },
  { id: 'Word', name: 'Word' },
  { id: 'Excel', name: 'Excel' },
  { id: 'PowerPoint', name: 'PowerPoint' },
  // Azure & Cloud
  { id: 'Azure', name: 'Azure' },
  { id: 'AzureActiveDirectory', name: 'Azure AD' },
  { id: 'AzureStorage', name: 'Azure Storage' },
  // Windows
  { id: 'Windows11', name: 'Windows 11' },
  { id: 'Windows10', name: 'Windows 10' },
  { id: 'WindowsServer', name: 'Windows Server' },
  // Management & Security
  { id: 'Intune', name: 'Intune' },
  { id: 'MicrosoftEndpointManager', name: 'Endpoint Manager' },
  { id: 'SecurityComplianceandIdentity', name: 'Security & Compliance' },
  { id: 'Defender', name: 'Microsoft Defender' },
  // Power Platform
  { id: 'PowerApps', name: 'Power Apps' },
  { id: 'PowerAutomate', name: 'Power Automate' },
  { id: 'PowerBI', name: 'Power BI' },
  // Other
  { id: 'Dynamics365', name: 'Dynamics 365' },
  { id: 'MicrosoftLearn', name: 'Microsoft Learn' },
  { id: 'Viva', name: 'Microsoft Viva' },
  { id: 'SQL', name: 'SQL Server' },
  { id: 'VisualStudio', name: 'Visual Studio' }
]

// Microsoft Q&A product areas
const MS_QA_PRODUCTS = [
  'azure',
  'microsoft-365',
  'windows',
  'power-platform',
  'dynamics-365',
  'sql-server',
  'visual-studio',
  'dotnet'
]

/**
 * Parse RSS XML to extract threads
 * @param {string} xml - RSS XML content
 * @param {string} boardId - Board identifier
 * @returns {Object[]} Parsed threads
 */
function parseRSSFeed(xml, boardId) {
  const threads = []
  
  // Simple regex-based XML parsing (no external dependencies)
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i
  const linkRegex = /<link>(.*?)<\/link>/i
  const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/i
  const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/i
  const guidRegex = /<guid[^>]*>(.*?)<\/guid>/i
  
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1]
    
    const titleMatch = item.match(titleRegex)
    const linkMatch = item.match(linkRegex)
    const descMatch = item.match(descRegex)
    const dateMatch = item.match(pubDateRegex)
    const guidMatch = item.match(guidRegex)
    
    const title = titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : ''
    const url = linkMatch ? linkMatch[1].trim() : ''
    const description = descMatch ? (descMatch[1] || descMatch[2] || '').replace(/<[^>]*>/g, '').trim() : ''
    const pubDate = dateMatch ? new Date(dateMatch[1]) : null
    const guid = guidMatch ? guidMatch[1].trim() : url
    
    if (url && title) {
      // Extract thread ID from URL
      const threadIdMatch = url.match(/\/(\d+)(?:\/|$)/) || url.match(/id=(\d+)/)
      const threadId = threadIdMatch ? threadIdMatch[1] : guid.replace(/\D/g, '').slice(-10)
      
      threads.push({
        id: `ms-rss-${boardId}-${threadId}`,
        threadId,
        title,
        snippet: description.slice(0, 300),
        url,
        forum: boardId,
        product: boardId,
        type: 'discussion',
        domain: 'techcommunity.microsoft.com',
        source: 'rss',
        sources: ['rss'],
        publishedDate: pubDate,
        freshness: pubDate ? calculateFreshness(pubDate) : 'unknown'
      })
    }
  }
  
  return threads
}

/**
 * Calculate freshness label based on publish date
 */
function calculateFreshness(date) {
  const now = new Date()
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24))
  
  if (diffDays <= 1) return 'today'
  if (diffDays <= 7) return 'this_week'
  if (diffDays <= 30) return 'this_month'
  if (diffDays <= 90) return 'recent'
  return 'older'
}

/**
 * Fetch RSS feed from Microsoft Tech Community board
 * Tries multiple URL formats since Microsoft changes these frequently
 * @param {string} boardId - Board ID
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object[]>} Threads from RSS
 */
async function fetchMicrosoftRSSFeed(boardId, timeout = 10000) {
  // Try multiple RSS URL formats - Microsoft changes these frequently
  const rssUrls = [
    `https://techcommunity.microsoft.com/t5/${boardId}/bd-p/${boardId}/rss`,
    `https://techcommunity.microsoft.com/plugins/custom/microsoft/o365/rss/board?board.id=${boardId}`,
    `https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=${boardId}`,
    `https://techcommunity.microsoft.com/gxcuf89792/rss/board?board.id=${boardId}`
  ]
  
  for (const url of rssUrls) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const xml = await response.text()
        // Check if it's valid RSS/Atom content
        if (xml.includes('<rss') || xml.includes('<feed') || xml.includes('<channel>')) {
          const threads = parseRSSFeed(xml, boardId)
          if (threads.length > 0) {
            console.log(`✅ RSS ${boardId}: ${threads.length} threads`)
            return threads
          }
        }
      }
    } catch (error) {
      // Continue to next URL
    }
  }
  
  // Silently return empty - don't spam console with 404s
  return []
}

/**
 * Fetch multiple RSS feeds in parallel
 * Fetches from ALL boards to maximize results (200-300 threads)
 * Applies same filtering as other sources
 * @param {string[]} boardIds - Board IDs to fetch (or 'all' for all boards)
 * @param {string} searchQuery - Search query to filter relevant results
 * @returns {Promise<Object[]>} Combined threads matching the query
 */
export async function fetchMicrosoftRSSFeeds(boardIds = 'all', searchQuery = '') {
  // Fetch from ALL boards to maximize the pool of threads (target: 200-300)
  const boards = boardIds === 'all' 
    ? MICROSOFT_BOARDS  // All 15 boards
    : MICROSOFT_BOARDS.filter(b => boardIds.includes(b.id))
  
  console.log(`\n📡 Fetching ${boards.length} Microsoft RSS feeds (target: 200-300 threads)...`)
  
  // Fetch all feeds in parallel with reasonable timeout
  const promises = boards.map(board => fetchMicrosoftRSSFeed(board.id, 8000))
  const results = await Promise.all(promises)
  
  // Flatten results
  let allThreads = results.flat()
  const totalFetched = allThreads.length
  console.log(`   Raw RSS threads fetched: ${totalFetched}`)
  
  // SAME FILTERING AS OTHER SOURCES:
  // 1. Filter by query keywords (must match at least ONE)
  if (searchQuery) {
    // Extract meaningful keywords (3+ chars, not common stop words)
    const stopWords = ['the', 'and', 'for', 'with', 'how', 'what', 'why', 'can', 'does', 'this', 'that', 'from', 'have', 'has', 'are', 'was', 'were', 'been', 'being', 'not', 'but', 'they', 'their', 'you', 'your']
    const queryTerms = searchQuery.toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 2 && !stopWords.includes(t))
    
    if (queryTerms.length > 0) {
      const beforeKeywordFilter = allThreads.length
      allThreads = allThreads.filter(thread => {
        const text = `${thread.title} ${thread.snippet}`.toLowerCase()
        // Must match at least ONE keyword
        return queryTerms.some(term => text.includes(term))
      })
      console.log(`   After keyword filter: ${allThreads.length} (removed ${beforeKeywordFilter - allThreads.length})`)
      
      // Score by how many terms match
      allThreads = allThreads.map(thread => {
        const text = `${thread.title} ${thread.snippet}`.toLowerCase()
        const matchCount = queryTerms.filter(term => text.includes(term)).length
        return {
          ...thread,
          queryRelevance: matchCount / queryTerms.length,
          matchedTerms: matchCount
        }
      })
      
      // Sort by relevance (most matches first)
      allThreads.sort((a, b) => b.matchedTerms - a.matchedTerms)
    }
  }
  
  // 2. Filter out CloudFuze mentions (same as other sources)
  const beforeBrandFilter = allThreads.length
  allThreads = allThreads.filter(thread => {
    const content = `${thread.title} ${thread.snippet}`.toLowerCase()
    return !containsBrandMention(content)
  })
  if (beforeBrandFilter !== allThreads.length) {
    console.log(`   After brand filter: ${allThreads.length} (removed ${beforeBrandFilter - allThreads.length} with CloudFuze)`)
  }
  
  // 3. Filter locked/retired/archived threads (same patterns as other sources)
  const lockedPatterns = [
    'locked', 'archived', 'retired', 'closed',
    'this thread has been locked', 'this discussion has been locked',
    'no longer accepting replies', 'no longer accepting comments',
    'this question has been retired', 'has been retired',
    'migrated from', 'read-only'
  ]
  
  const beforeLockedFilter = allThreads.length
  allThreads = allThreads.filter(thread => {
    const content = `${thread.title} ${thread.snippet}`.toLowerCase()
    return !lockedPatterns.some(pattern => content.includes(pattern))
  })
  if (beforeLockedFilter !== allThreads.length) {
    console.log(`   After locked filter: ${allThreads.length} (removed ${beforeLockedFilter - allThreads.length} locked/retired)`)
  }
  
  console.log(`📊 RSS Final: ${allThreads.length} relevant threads (from ${totalFetched} fetched)`)
  
  return allThreads
}

/**
 * Try Microsoft Learn Q&A internal API
 * @param {string} query - Search query
 * @param {number} take - Number of results
 * @returns {Promise<Object[]>} Threads from API
 */
export async function fetchMicrosoftQAAPI(query, take = 50) {
  // Try multiple API endpoints
  const endpoints = [
    `https://learn.microsoft.com/api/questions/search?query=${encodeURIComponent(query)}&take=${take}`,
    `https://learn.microsoft.com/api/contentbrowser/search?search=${encodeURIComponent(query)}&$top=${take}&facet=products,tags`,
    `https://docs.microsoft.com/api/search?search=${encodeURIComponent(query)}&$top=${take}&scope=Q%26A`
  ]
  
  console.log(`\n🔍 Trying Microsoft Q&A API for: "${query}"`)
  
  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)
      
      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const data = await response.json()
        
        // Try to parse different response formats
        let items = []
        if (Array.isArray(data)) {
          items = data
        } else if (data.results) {
          items = data.results
        } else if (data.value) {
          items = data.value
        } else if (data.questions) {
          items = data.questions
        }
        
        if (items.length > 0) {
          console.log(`✅ Q&A API: ${items.length} results`)
          return items.map((item, idx) => ({
            id: `ms-api-${item.id || idx}`,
            threadId: item.id || `api-${idx}`,
            title: item.title || item.name || item.question || '',
            snippet: item.body || item.description || item.answer || '',
            url: item.url || item.link || `https://learn.microsoft.com/answers/questions/${item.id}`,
            forum: item.product || 'Q&A',
            product: item.product || item.tags?.[0] || 'general',
            type: 'question',
            domain: 'learn.microsoft.com',
            source: 'api',
            sources: ['api'],
            freshness: 'unknown'
          })).filter(t => t.title && !containsBrandMention(`${t.title} ${t.snippet}`))
        }
      }
    } catch (error) {
      // Continue to next endpoint
    }
  }
  
  console.log(`⚠️ Q&A API: No results from any endpoint`)
  return []
}

/**
 * Try Microsoft Answers internal search
 * @param {string} query - Search query
 * @returns {Promise<Object[]>} Threads
 */
export async function fetchMicrosoftAnswersSearch(query) {
  // Try multiple search URL formats
  const searchUrls = [
    `https://answers.microsoft.com/en-us/search/search?SearchTerm=${encodeURIComponent(query)}&tab=All`,
    `https://answers.microsoft.com/en-us/search?q=${encodeURIComponent(query)}`,
    `https://answers.microsoft.com/search?q=${encodeURIComponent(query)}`
  ]
  
  console.log(`\n🔍 Trying Microsoft Answers search...`)
  
  for (const searchUrl of searchUrls) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 12000)
      
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) continue
      
      const html = await response.text()
      const threads = []
      
      // Multiple patterns to catch different Microsoft Answers page formats
      const patterns = [
        // Pattern 1: Direct thread links
        /href="(https?:\/\/answers\.microsoft\.com\/[^"]*\/thread\/[^"]+)"[^>]*>([^<]+)/gi,
        // Pattern 2: Thread links with class
        /<a[^>]*href="([^"]*\/thread\/[^"]+)"[^>]*class="[^"]*"[^>]*>([^<]+)<\/a>/gi,
        // Pattern 3: Search result items
        /<h[23][^>]*>\s*<a[^>]*href="([^"]*answers\.microsoft\.com[^"]*)"[^>]*>([^<]+)<\/a>/gi,
        // Pattern 4: List items with links
        /<li[^>]*>[\s\S]*?<a[^>]*href="(https?:\/\/answers\.microsoft\.com\/[^"]+)"[^>]*>([^<]+)<\/a>/gi
      ]
      
      for (const pattern of patterns) {
        let match
        while ((match = pattern.exec(html)) !== null) {
          let url = match[1]
          const title = match[2].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/<[^>]*>/g, '').trim()
          
          // Make URL absolute if needed
          if (url.startsWith('/')) {
            url = `https://answers.microsoft.com${url}`
          }
          
          if (url && title && title.length > 10 && 
              url.includes('answers.microsoft.com') && 
              !containsBrandMention(title)) {
            const exists = threads.some(t => t.url === url)
            if (!exists) {
              const threadIdMatch = url.match(/\/thread\/([a-zA-Z0-9-]+)/)
              threads.push({
                id: `ms-answers-${threadIdMatch?.[1] || threads.length}`,
                threadId: threadIdMatch?.[1] || `answers-${threads.length}`,
                title,
                snippet: '',
                url,
                forum: 'Microsoft Answers',
                product: 'general',
                type: 'question',
                domain: 'answers.microsoft.com',
                source: 'answers',
                sources: ['answers'],
                freshness: 'unknown'
              })
            }
          }
        }
      }
      
      if (threads.length > 0) {
        console.log(`✅ Answers search: ${threads.length} results`)
        return threads
      }
    } catch (error) {
      // Continue to next URL
    }
  }
  
  console.log(`⚠️ Answers search: No results found`)
  return []
}

/**
 * Scrape Microsoft Tech Community search page directly
 * @param {string} query - Search query
 * @returns {Promise<Object[]>} Threads
 */
export async function scrapeMicrosoftTechCommunitySearch(query) {
  // Try multiple search URL formats
  const searchUrls = [
    `https://techcommunity.microsoft.com/t5/forums/searchpage/tab/message?q=${encodeURIComponent(query)}&collapse_discussion=true`,
    `https://techcommunity.microsoft.com/t5/forums/searchpage/tab/message?filter=location&q=${encodeURIComponent(query)}`,
    `https://techcommunity.microsoft.com/t5/search/contributions/page?q=${encodeURIComponent(query)}`
  ]
  
  console.log(`\n🔍 Scraping Tech Community search...`)
  
  for (const searchUrl of searchUrls) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) continue
      
      const html = await response.text()
      const threads = []
      
      // Multiple patterns to catch Tech Community URLs
      const patterns = [
        // Pattern 1: Thread/discussion pages
        /href="((?:https:\/\/techcommunity\.microsoft\.com)?\/t5\/[^"]+\/(?:td|m|ba)-p\/\d+[^"]*)"\s*[^>]*>([^<]+)/gi,
        // Pattern 2: Board message links
        /<a[^>]*href="([^"]*techcommunity\.microsoft\.com[^"]*\/(?:td|m|ba)-p\/\d+[^"]*)"[^>]*>\s*([^<]+)/gi,
        // Pattern 3: Any Tech Community thread links
        /href="(https:\/\/techcommunity\.microsoft\.com\/[^"]+)"[^>]*class="[^"]*(?:lia-link|message-subject|page-link)[^"]*"[^>]*>([^<]+)/gi,
        // Pattern 4: JSON data in page
        /"url"\s*:\s*"(https:\/\/techcommunity\.microsoft\.com\/t5\/[^"]+)"\s*,\s*"title"\s*:\s*"([^"]+)"/gi
      ]
      
      for (const pattern of patterns) {
        let match
        while ((match = pattern.exec(html)) !== null) {
          let url = match[1]
          const title = match[2]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/<[^>]*>/g, '')
            .trim()
          
          // Make URL absolute
          if (url.startsWith('/t5/')) {
            url = `https://techcommunity.microsoft.com${url}`
          }
          
          if (url && title && title.length > 10 && 
              url.includes('techcommunity.microsoft.com') && 
              !containsBrandMention(title)) {
            const exists = threads.some(t => t.url === url)
            if (!exists) {
              const idMatch = url.match(/\/(?:td|m|ba)-p\/(\d+)/)
              const boardMatch = url.match(/\/t5\/([^/]+)\//)
              
              threads.push({
                id: `ms-tc-${idMatch?.[1] || threads.length}`,
                threadId: idMatch?.[1] || `tc-${threads.length}`,
                title,
                snippet: '',
                url,
                forum: boardMatch?.[1]?.replace(/-/g, ' ') || 'Tech Community',
                product: boardMatch?.[1] || 'general',
                type: 'discussion',
                domain: 'techcommunity.microsoft.com',
                source: 'scrape',
                sources: ['scrape'],
                freshness: 'unknown'
              })
            }
          }
        }
      }
      
      if (threads.length > 0) {
        console.log(`✅ Tech Community scrape: ${threads.length} results`)
        return threads
      }
    } catch (error) {
      // Continue to next URL
    }
  }
  
  console.log(`⚠️ Tech Community scrape: No results found`)
  return []
}

/**
 * Fetch all Microsoft sources in parallel
 * @param {string} query - Search query
 * @param {Object} options - Options
 * @returns {Promise<Object>} Combined results from all sources
 */
export async function fetchAllMicrosoftAlternativeSources(query, options = {}) {
  const {
    useRSS = true,
    useQAAPI = true,
    useAnswersSearch = true,
    useTechCommunityScrape = true,
    relevantBoards = 'all'
  } = options
  
  console.log('\n========================================')
  console.log('MICROSOFT ALTERNATIVE SOURCES')
  console.log('Query:', query)
  console.log('Sources:', [
    useRSS && 'RSS',
    useQAAPI && 'Q&A API',
    useAnswersSearch && 'Answers Search',
    useTechCommunityScrape && 'TC Scrape'
  ].filter(Boolean).join(', '))
  console.log('========================================\n')
  
  const startTime = Date.now()
  
  // Run all sources in parallel
  const promises = []
  const sourceNames = []
  
  if (useRSS) {
    promises.push(fetchMicrosoftRSSFeeds(relevantBoards, query))
    sourceNames.push('rss')
  }
  
  if (useQAAPI) {
    promises.push(fetchMicrosoftQAAPI(query))
    sourceNames.push('api')
  }
  
  if (useAnswersSearch) {
    promises.push(fetchMicrosoftAnswersSearch(query))
    sourceNames.push('answers')
  }
  
  if (useTechCommunityScrape) {
    promises.push(scrapeMicrosoftTechCommunitySearch(query))
    sourceNames.push('scrape')
  }
  
  // Wait for all to complete
  const results = await Promise.all(promises)
  
  // Combine results with source tracking
  const sourceResults = {}
  const allThreads = []
  
  results.forEach((threads, idx) => {
    const sourceName = sourceNames[idx]
    sourceResults[sourceName] = threads.length
    allThreads.push(...threads)
  })
  
  const elapsed = Date.now() - startTime
  
  console.log(`\n📊 Alternative Sources Summary:`)
  console.log(`   RSS: ${sourceResults.rss || 0} threads`)
  console.log(`   API: ${sourceResults.api || 0} threads`)
  console.log(`   Answers: ${sourceResults.answers || 0} threads`)
  console.log(`   Scrape: ${sourceResults.scrape || 0} threads`)
  console.log(`   Total: ${allThreads.length} threads`)
  console.log(`   Time: ${elapsed}ms`)
  
  return {
    threads: allThreads,
    stats: sourceResults,
    elapsed
  }
}

export { MICROSOFT_BOARDS, MS_QA_PRODUCTS }
