// Google Community Alternative Sources
// RSS Feeds + Direct Scraping for fresher, more accurate results
// Now includes: Unanswered Questions, Google Groups, Issue Tracker

import { containsBrandMention } from './commentChecker.js'

// Google product forums - used for unanswered questions scraping
const GOOGLE_PRODUCTS = [
  { id: 'drive', name: 'Google Drive', forumId: 'google-drive-help' },
  { id: 'gmail', name: 'Gmail', forumId: 'gmail' },
  { id: 'chrome', name: 'Chrome', forumId: 'chrome' },
  { id: 'photos', name: 'Google Photos', forumId: 'photos' },
  { id: 'calendar', name: 'Google Calendar', forumId: 'calendar' },
  { id: 'docs', name: 'Google Docs', forumId: 'docs' },
  { id: 'sheets', name: 'Google Sheets', forumId: 'sheets' },
  { id: 'youtube', name: 'YouTube', forumId: 'youtube' },
  { id: 'android', name: 'Android', forumId: 'android' },
  { id: 'play', name: 'Google Play', forumId: 'googleplay' },
  { id: 'meet', name: 'Google Meet', forumId: 'meet' },
  { id: 'workspace', name: 'Google Workspace', forumId: 'google-workspace' },
  { id: 'admin', name: 'Admin Console', forumId: 'admin-console' },
  { id: 'cloud', name: 'Google Cloud', forumId: 'google-cloud' },
  { id: 'maps', name: 'Google Maps', forumId: 'maps' },
  { id: 'search', name: 'Google Search', forumId: 'websearch' }
]

/**
 * Parse Google support forum RSS/Atom feed
 * @param {string} xml - Feed content
 * @param {string} productId - Product identifier
 * @returns {Object[]} Parsed threads
 */
function parseGoogleFeed(xml, productId) {
  const threads = []
  
  // Try Atom format first (Google often uses Atom)
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi
  const titleRegex = /<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i
  const linkRegex = /<link[^>]*href="([^"]+)"[^>]*(?:rel="alternate")?[^>]*\/?>/i
  const altLinkRegex = /<link[^>]*rel="alternate"[^>]*href="([^"]+)"[^>]*\/?>/i
  const summaryRegex = /<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i
  const contentRegex = /<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i
  const updatedRegex = /<updated>([^<]+)<\/updated>/i
  const publishedRegex = /<published>([^<]+)<\/published>/i
  const idRegex = /<id>([^<]+)<\/id>/i
  
  let match
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1]
    
    const titleMatch = entry.match(titleRegex)
    const linkMatch = entry.match(altLinkRegex) || entry.match(linkRegex)
    const summaryMatch = entry.match(summaryRegex) || entry.match(contentRegex)
    const dateMatch = entry.match(publishedRegex) || entry.match(updatedRegex)
    const idMatch = entry.match(idRegex)
    
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : ''
    let url = linkMatch ? linkMatch[1].trim() : ''
    const summary = summaryMatch ? summaryMatch[1].replace(/<[^>]*>/g, '').trim() : ''
    const pubDate = dateMatch ? new Date(dateMatch[1]) : null
    const entryId = idMatch ? idMatch[1].trim() : url
    
    // Fix relative URLs
    if (url && !url.startsWith('http')) {
      url = `https://support.google.com${url.startsWith('/') ? '' : '/'}${url}`
    }
    
    if (url && title) {
      // Extract thread ID
      const threadIdMatch = url.match(/\/thread\/(\d+)/) || url.match(/\/(\d+)(?:\?|$)/)
      const threadId = threadIdMatch ? threadIdMatch[1] : entryId.replace(/\D/g, '').slice(-10) || `${Date.now()}`
      
      threads.push({
        id: `google-rss-${productId}-${threadId}`,
        threadId,
        title,
        snippet: summary.slice(0, 300),
        url,
        forum: productId,
        product: productId,
        type: 'question',
        domain: 'support.google.com',
        source: 'rss',
        sources: ['rss'],
        publishedDate: pubDate,
        freshness: pubDate ? calculateFreshness(pubDate) : 'unknown'
      })
    }
  }
  
  // Try RSS format if Atom didn't find anything
  if (threads.length === 0) {
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi
    const rssTitleRegex = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i
    const rssLinkRegex = /<link>([^<]+)<\/link>/i
    const descRegex = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i
    const pubDateRegex = /<pubDate>([^<]+)<\/pubDate>/i
    const guidRegex = /<guid[^>]*>([^<]+)<\/guid>/i
    
    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1]
      
      const titleMatch = item.match(rssTitleRegex)
      const linkMatch = item.match(rssLinkRegex)
      const descMatch = item.match(descRegex)
      const dateMatch = item.match(pubDateRegex)
      const guidMatch = item.match(guidRegex)
      
      const title = titleMatch ? titleMatch[1].trim() : ''
      let url = linkMatch ? linkMatch[1].trim() : ''
      const description = descMatch ? descMatch[1].replace(/<[^>]*>/g, '').trim() : ''
      const pubDate = dateMatch ? new Date(dateMatch[1]) : null
      const guid = guidMatch ? guidMatch[1].trim() : url
      
      if (url && !url.startsWith('http')) {
        url = `https://support.google.com${url.startsWith('/') ? '' : '/'}${url}`
      }
      
      if (url && title) {
        const threadIdMatch = url.match(/\/thread\/(\d+)/)
        const threadId = threadIdMatch ? threadIdMatch[1] : guid.replace(/\D/g, '').slice(-10)
        
        threads.push({
          id: `google-rss-${productId}-${threadId}`,
          threadId,
          title,
          snippet: description.slice(0, 300),
          url,
          forum: productId,
          product: productId,
          type: 'question',
          domain: 'support.google.com',
          source: 'rss',
          sources: ['rss'],
          publishedDate: pubDate,
          freshness: pubDate ? calculateFreshness(pubDate) : 'unknown'
        })
      }
    }
  }
  
  return threads
}

/**
 * Calculate freshness label
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
 * Fetch RSS/Atom feed from Google product forum
 * @param {Object} product - Product info
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object[]>} Threads from feed
 */
async function fetchGoogleProductFeed(product, timeout = 8000) {
  // Google doesn't provide public RSS feeds anymore - return empty
  // This function is kept for potential future use if feeds become available
  return []
}

/**
 * Fetch Google Support Community feeds in parallel
 * Note: Google doesn't provide public RSS feeds anymore, so this returns empty
 * @param {string[]} productIds - Product IDs to fetch (or 'all')
 * @param {string} searchQuery - Optional search query to filter
 * @returns {Promise<Object[]>} Combined threads
 */
export async function fetchGoogleCommunityRSSFeeds(productIds = 'all', searchQuery = '') {
  // Google removed public RSS feeds - return empty immediately
  // This avoids wasting time on 404 requests
  return []
}

/**
 * Scrape Google Support search directly
 * @param {string} query - Search query
 * @param {string} product - Optional product filter
 * @returns {Promise<Object[]>} Threads
 */
export async function scrapeGoogleSupportSearch(query, product = '') {
  // Try multiple search URL formats
  const searchUrls = product 
    ? [
        `https://support.google.com/${product}/community?hl=en&q=${encodeURIComponent(query)}`,
        `https://support.google.com/${product}/search?q=${encodeURIComponent(query)}&hl=en`
      ]
    : [
        `https://support.google.com/search?q=${encodeURIComponent(query)}&hl=en`,
        `https://support.google.com/community?hl=en&q=${encodeURIComponent(query)}`
      ]
  
  console.log(`\n🔍 Scraping Google Support search...`)
  
  for (const searchUrl of searchUrls) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 12000)
      
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) continue
      
      const html = await response.text()
      const threads = []
      
      // Multiple patterns to catch different Google Support page formats
      const patterns = [
        // Pattern 1: Thread links
        /href="((?:https:\/\/support\.google\.com)?\/[^"]*\/thread\/\d+[^"]*)"\s*[^>]*>([^<]+)/gi,
        // Pattern 2: Community thread links
        /<a[^>]*href="([^"]*support\.google\.com[^"]*\/thread\/\d+[^"]*)"[^>]*>\s*([^<]+)/gi,
        // Pattern 3: Any thread URLs in JSON data
        /"url"\s*:\s*"(https:\/\/support\.google\.com\/[^"]*\/thread\/\d+[^"]*)"\s*,\s*"title"\s*:\s*"([^"]+)"/gi
      ]
      
      for (const pattern of patterns) {
        let match
        while ((match = pattern.exec(html)) !== null) {
          let url = match[1]
          const title = match[2]
            .replace(/&amp;/g, '&')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/<[^>]*>/g, '')
            .trim()
          
          // Make URL absolute
          if (url.startsWith('/')) {
            url = `https://support.google.com${url}`
          }
          
          if (url && title && title.length > 5 && 
              url.includes('support.google.com') && 
              !containsBrandMention(title)) {
            const exists = threads.some(t => t.url === url)
            if (!exists) {
              const threadIdMatch = url.match(/\/thread\/(\d+)/)
              const productMatch = url.match(/support\.google\.com\/([^/]+)\//)
              
              threads.push({
                id: `google-support-${threadIdMatch?.[1] || threads.length}`,
                threadId: threadIdMatch?.[1] || `support-${threads.length}`,
                title,
                snippet: '',
                url,
                forum: productMatch?.[1] || 'general',
                product: productMatch?.[1] || 'general',
                type: 'question',
                domain: 'support.google.com',
                source: 'support',
                sources: ['support'],
                freshness: 'unknown'
              })
            }
          }
        }
      }
      
      if (threads.length > 0) {
        console.log(`✅ Google Support scrape: ${threads.length} results`)
        return threads
      }
    } catch (error) {
      // Continue to next URL
    }
  }
  
  console.log(`⚠️ Google Support scrape: No results found`)
  return []
}

/**
 * Scrape Google Product Forums (legacy forums)
 * @param {string} query - Search query
 * @returns {Promise<Object[]>} Threads
 */
export async function scrapeGoogleProductForums(query) {
  const searchUrl = `https://productforums.google.com/forum/#!search/${encodeURIComponent(query)}`
  
  // Product Forums uses JavaScript, try alternative approach
  const altUrl = `https://www.google.com/search?q=site:support.google.com+inurl:thread+${encodeURIComponent(query)}`
  
  console.log(`\n🔍 Scraping Google Product Forums...`)
  
  try {
    // Try direct Google search as fallback
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    
    const response = await fetch(altUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      console.log(`⚠️ Product Forums scrape: HTTP ${response.status}`)
      return []
    }
    
    const html = await response.text()
    const threads = []
    
    // Parse Google search results for support.google.com threads
    const urlRegex = /https:\/\/support\.google\.com\/[^"'\s]+\/thread\/\d+[^"'\s]*/g
    const urls = html.match(urlRegex) || []
    
    // Dedupe URLs
    const uniqueUrls = [...new Set(urls)]
    
    for (const url of uniqueUrls.slice(0, 30)) {
      const threadIdMatch = url.match(/\/thread\/(\d+)/)
      const productMatch = url.match(/support\.google\.com\/([^/]+)\//)
      
      if (threadIdMatch && !threads.some(t => t.url === url)) {
        threads.push({
          id: `google-forums-${threadIdMatch[1]}`,
          threadId: threadIdMatch[1],
          title: `Thread in ${productMatch?.[1] || 'Google'} Community`,
          snippet: '',
          url,
          forum: productMatch?.[1] || 'general',
          product: productMatch?.[1] || 'general',
          type: 'question',
          domain: 'support.google.com',
          source: 'forums',
          sources: ['forums'],
          freshness: 'unknown'
        })
      }
    }
    
    console.log(`✅ Product Forums scrape: ${threads.length} results`)
    return threads
    
  } catch (error) {
    console.log(`❌ Product Forums scrape: ${error.message}`)
    return []
  }
}

/**
 * Try Google's internal community API
 * @param {string} query - Search query
 * @param {string} product - Product name
 * @returns {Promise<Object[]>} Threads
 */
export async function fetchGoogleCommunityAPI(query, product = '') {
  // Try different internal API endpoints
  const endpoints = [
    `https://support.google.com/s/community/search?hl=en&q=${encodeURIComponent(query)}${product ? `&product=${product}` : ''}`,
    `https://support.google.com/community/api/threads?q=${encodeURIComponent(query)}&limit=50`
  ]
  
  console.log(`\n🔍 Trying Google Community API...`)
  
  for (const url of endpoints) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/html',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const contentType = response.headers.get('content-type') || ''
        
        if (contentType.includes('json')) {
          const data = await response.json()
          
          let items = []
          if (Array.isArray(data)) items = data
          else if (data.threads) items = data.threads
          else if (data.results) items = data.results
          else if (data.items) items = data.items
          
          if (items.length > 0) {
            console.log(`✅ Community API: ${items.length} results`)
            return items.map((item, idx) => ({
              id: `google-api-${item.id || item.threadId || idx}`,
              threadId: item.id || item.threadId || `api-${idx}`,
              title: item.title || item.subject || '',
              snippet: item.body || item.content || item.snippet || '',
              url: item.url || item.link || `https://support.google.com/thread/${item.id}`,
              forum: item.product || product || 'general',
              product: item.product || product || 'general',
              type: 'question',
              domain: 'support.google.com',
              source: 'api',
              sources: ['api'],
              freshness: 'unknown'
            })).filter(t => t.title && !containsBrandMention(`${t.title} ${t.snippet}`))
          }
        }
      }
    } catch (error) {
      // Continue to next endpoint
    }
  }
  
  console.log(`⚠️ Community API: No results from any endpoint`)
  return []
}

// ============================================
// OPTION 1: UNANSWERED QUESTIONS PAGES
// ============================================

/**
 * Scrape "Unanswered Questions" page from a Google product forum
 * These are threads that are KNOWN to be open and need answers
 * @param {Object} product - Product info {id, name, forumId}
 * @param {string} query - Optional search query to filter results
 * @returns {Promise<Object[]>} Unanswered threads
 */
async function scrapeUnansweredQuestionsPage(product, query = '') {
  // Multiple URL formats for unanswered questions
  const urls = [
    `https://support.google.com/${product.id}/community?filter=unanswered&hl=en`,
    `https://support.google.com/${product.id}/threads?filter=unanswered&hl=en`,
    `https://support.google.com/${product.forumId}/community?filter=unanswered&hl=en`
  ]
  
  for (const url of urls) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) continue
      
      const html = await response.text()
      const threads = []
      
      // Multiple patterns to extract thread info from unanswered pages
      const patterns = [
        // Pattern 1: Thread cards with href and title
        /href="(\/[^"]*\/thread\/\d+[^"]*)"\s*[^>]*>\s*([^<]+)/gi,
        // Pattern 2: Thread links
        /<a[^>]*href="([^"]*\/thread\/(\d+)[^"]*)"[^>]*>([^<]+)/gi,
        // Pattern 3: JSON embedded data
        /"threadUrl"\s*:\s*"([^"]+)"\s*,\s*"title"\s*:\s*"([^"]+)"/gi,
        // Pattern 4: Data attributes
        /data-thread-url="([^"]+)"[^>]*data-title="([^"]+)"/gi,
        // Pattern 5: Thread ID with nearby title
        /\/thread\/(\d+)[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)/gi
      ]
      
      for (const pattern of patterns) {
        let match
        while ((match = pattern.exec(html)) !== null) {
          let url = match[1]
          let title = match[2] || match[3] || ''
          
          // Clean title
          title = title
            .replace(/&amp;/g, '&')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/<[^>]*>/g, '')
            .trim()
          
          // Make URL absolute
          if (url && !url.startsWith('http')) {
            url = `https://support.google.com${url.startsWith('/') ? '' : '/'}${url}`
          }
          
          // Extract thread ID
          const threadIdMatch = url.match(/\/thread\/(\d+)/)
          
          if (url && threadIdMatch && title && title.length > 5 && 
              !containsBrandMention(title)) {
            const exists = threads.some(t => t.threadId === threadIdMatch[1])
            if (!exists) {
              // If query provided, check if title matches
              if (query) {
                const queryLower = query.toLowerCase()
                const titleLower = title.toLowerCase()
                const queryWords = queryLower.split(/\s+/)
                const matches = queryWords.some(word => titleLower.includes(word))
                if (!matches) continue
              }
              
              threads.push({
                id: `google-unanswered-${threadIdMatch[1]}`,
                threadId: threadIdMatch[1],
                title,
                snippet: '',
                url: url.split('?')[0],
                forum: product.id,
                product: product.name,
                type: 'question',
                domain: 'support.google.com',
                source: 'unanswered',
                sources: ['unanswered'],
                isOpen: true, // These are KNOWN to be open
                freshness: 'recent'
              })
            }
          }
        }
      }
      
      if (threads.length > 0) {
        return threads
      }
    } catch (error) {
      // Continue to next URL format
    }
  }
  
  return []
}

/**
 * Fetch unanswered questions from multiple Google product forums in parallel
 * @param {string} query - Search query to filter results
 * @param {string[]} productIds - Product IDs to check (default: relevant products)
 * @returns {Promise<Object[]>} All unanswered threads
 */
export async function scrapeGoogleUnansweredQuestions(query, productIds = []) {
  console.log(`\n🔍 Scraping Google Unanswered Questions pages...`)
  
  // Default to products most relevant for cloud/SaaS migration topics
  const relevantProductIds = productIds.length > 0 ? productIds : [
    'drive', 'workspace', 'admin', 'cloud', 'docs', 'sheets', 'gmail', 'photos'
  ]
  
  const productsToCheck = GOOGLE_PRODUCTS.filter(p => relevantProductIds.includes(p.id))
  
  // Scrape all products in parallel
  const results = await Promise.all(
    productsToCheck.map(product => scrapeUnansweredQuestionsPage(product, query))
  )
  
  // Combine and dedupe
  const allThreads = []
  const seenIds = new Set()
  
  for (const threads of results) {
    for (const thread of threads) {
      if (!seenIds.has(thread.threadId)) {
        seenIds.add(thread.threadId)
        allThreads.push(thread)
      }
    }
  }
  
  console.log(`✅ Unanswered Questions: ${allThreads.length} threads found`)
  
  return allThreads
}

// ============================================
// OPTION 5: GOOGLE GROUPS SCRAPING
// ============================================

// Popular Google Groups for tech/cloud discussions
const GOOGLE_GROUPS = [
  { id: 'google-apps-manager', name: 'Google Apps Manager' },
  { id: 'google-drive-help', name: 'Google Drive Help' },
  { id: 'google-workspace', name: 'Google Workspace' },
  { id: 'google-cloud-platform', name: 'Google Cloud Platform' },
  { id: 'gcp-users', name: 'GCP Users' },
  { id: 'google-apps-script-community', name: 'Apps Script Community' },
  { id: 'google-admin-sdk', name: 'Admin SDK' }
]

/**
 * Scrape a Google Group for recent discussions
 * @param {Object} group - Group info {id, name}
 * @param {string} query - Search query
 * @returns {Promise<Object[]>} Threads from the group
 */
async function scrapeGoogleGroup(group, query = '') {
  // Try multiple URL formats
  const urls = query ? [
    `https://groups.google.com/g/${group.id}/search?q=${encodeURIComponent(query)}`,
    `https://groups.google.com/forum/#!searchin/${group.id}/${encodeURIComponent(query)}`
  ] : [
    `https://groups.google.com/g/${group.id}`,
    `https://groups.google.com/forum/#!forum/${group.id}`
  ]
  
  for (const url of urls) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) continue
      
      const html = await response.text()
      const threads = []
      
      // Patterns for Google Groups
      const patterns = [
        // New format: /g/GROUP/c/THREAD_ID
        /href="(\/g\/[^"]+\/c\/[^"]+)"[^>]*>([^<]+)/gi,
        // Legacy format: #!topic/GROUP/THREAD
        /href="([^"]*#!topic\/[^"\/]+\/[^"]+)"[^>]*>([^<]+)/gi,
        // JSON data
        /"conversationUrl"\s*:\s*"([^"]+)"\s*,\s*"subject"\s*:\s*"([^"]+)"/gi,
        // Thread links with titles
        /groups\.google\.com\/g\/([^/]+)\/c\/([^"'\s]+)[^>]*>([^<]+)/gi
      ]
      
      for (const pattern of patterns) {
        let match
        while ((match = pattern.exec(html)) !== null) {
          let threadUrl = match[1]
          let title = match[2] || match[3] || ''
          
          // Clean title
          title = title
            .replace(/&amp;/g, '&')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/<[^>]*>/g, '')
            .trim()
          
          // Make URL absolute
          if (threadUrl && !threadUrl.startsWith('http')) {
            threadUrl = `https://groups.google.com${threadUrl.startsWith('/') ? '' : '/'}${threadUrl}`
          }
          
          // Extract thread ID
          const threadIdMatch = threadUrl.match(/\/c\/([^/?#]+)/) || 
                               threadUrl.match(/#!topic\/[^/]+\/([^/?#]+)/)
          
          if (threadUrl && threadIdMatch && title && title.length > 5 &&
              !containsBrandMention(title)) {
            const threadId = threadIdMatch[1]
            const exists = threads.some(t => t.threadId === threadId)
            
            if (!exists) {
              threads.push({
                id: `groups-${group.id}-${threadId}`,
                threadId,
                title,
                snippet: '',
                url: threadUrl.split('?')[0],
                forum: `Google Groups - ${group.name}`,
                product: group.id,
                type: 'discussion',
                domain: 'groups.google.com',
                source: 'groups',
                sources: ['groups'],
                freshness: 'unknown'
              })
            }
          }
        }
      }
      
      if (threads.length > 0) {
        return threads
      }
    } catch (error) {
      // Continue to next URL
    }
  }
  
  return []
}

/**
 * Search across multiple Google Groups
 * @param {string} query - Search query
 * @returns {Promise<Object[]>} Threads from all groups
 */
export async function scrapeGoogleGroups(query) {
  console.log(`\n🔍 Scraping Google Groups...`)
  
  // Search all groups in parallel
  const results = await Promise.all(
    GOOGLE_GROUPS.map(group => scrapeGoogleGroup(group, query))
  )
  
  // Combine results
  const allThreads = []
  const seenIds = new Set()
  
  for (const threads of results) {
    for (const thread of threads) {
      if (!seenIds.has(thread.threadId)) {
        seenIds.add(thread.threadId)
        allThreads.push(thread)
      }
    }
  }
  
  console.log(`✅ Google Groups: ${allThreads.length} threads found`)
  
  return allThreads
}

// ============================================
// OPTION 5: GOOGLE ISSUE TRACKER SCRAPING
// ============================================

/**
 * Search Google Issue Tracker for relevant issues
 * @param {string} query - Search query
 * @returns {Promise<Object[]>} Issues from tracker
 */
export async function scrapeGoogleIssueTracker(query) {
  console.log(`\n🔍 Searching Google Issue Tracker...`)
  
  // Issue Tracker search URL
  const searchUrl = `https://issuetracker.google.com/issues?q=${encodeURIComponent(query)}&s=created_time:desc`
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)
    
    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      console.log(`⚠️ Issue Tracker: HTTP ${response.status}`)
      return []
    }
    
    const html = await response.text()
    const issues = []
    
    // Patterns for Issue Tracker
    const patterns = [
      // Issue links: /issues/ISSUE_ID
      /href="(\/issues\/(\d+))"[^>]*>([^<]+)/gi,
      // Full URL
      /issuetracker\.google\.com\/issues\/(\d+)[^"'\s]*/gi,
      // JSON data
      /"issueId"\s*:\s*"?(\d+)"?\s*,\s*"title"\s*:\s*"([^"]+)"/gi,
      // Issue cards
      /data-issue-id="(\d+)"[^>]*>[\s\S]*?<[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)/gi
    ]
    
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(html)) !== null) {
        let issueId = match[1] || match[2]
        let title = match[2] || match[3] || ''
        
        // If issueId looks like a URL path, extract the number
        if (issueId && issueId.startsWith('/')) {
          const idMatch = issueId.match(/\/issues\/(\d+)/)
          issueId = idMatch ? idMatch[1] : issueId
        }
        
        // Clean title
        if (title) {
          title = title
            .replace(/&amp;/g, '&')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/<[^>]*>/g, '')
            .trim()
        }
        
        // If no title, create a placeholder
        if (!title || title.length < 3) {
          title = `Issue #${issueId}`
        }
        
        if (issueId && /^\d+$/.test(issueId) && !containsBrandMention(title)) {
          const exists = issues.some(i => i.threadId === issueId)
          
          if (!exists) {
            issues.push({
              id: `issue-tracker-${issueId}`,
              threadId: issueId,
              title,
              snippet: '',
              url: `https://issuetracker.google.com/issues/${issueId}`,
              forum: 'Issue Tracker',
              product: 'Google Issue Tracker',
              type: 'issue',
              domain: 'issuetracker.google.com',
              source: 'issuetracker',
              sources: ['issuetracker'],
              freshness: 'unknown'
            })
          }
        }
      }
    }
    
    console.log(`✅ Issue Tracker: ${issues.length} issues found`)
    
    return issues
    
  } catch (error) {
    console.log(`❌ Issue Tracker: ${error.message}`)
    return []
  }
}

/**
 * Fetch all Google Community sources in parallel
 * NOW INCLUDES: Unanswered Questions, Google Groups, Issue Tracker
 * @param {string} query - Search query
 * @param {Object} options - Options
 * @returns {Promise<Object>} Combined results
 */
export async function fetchAllGoogleAlternativeSources(query, options = {}) {
  const {
    useRSS = false,           // Disabled - Google removed RSS
    useAPI = true,
    useSupportScrape = true,
    useForumsScrape = true,
    useUnanswered = true,     // NEW: Unanswered Questions pages
    useGoogleGroups = true,   // NEW: Google Groups
    useIssueTracker = true,   // NEW: Issue Tracker
    relevantProducts = 'all',
    productFilter = ''
  } = options
  
  console.log('\n========================================')
  console.log('GOOGLE COMMUNITY ALTERNATIVE SOURCES')
  console.log('Query:', query)
  console.log('Sources:', [
    useUnanswered && '✅ Unanswered Pages',
    useGoogleGroups && '✅ Google Groups',
    useIssueTracker && '✅ Issue Tracker',
    useAPI && 'API',
    useSupportScrape && 'Support Scrape',
    useForumsScrape && 'Forums Scrape'
  ].filter(Boolean).join(', '))
  console.log('========================================\n')
  
  const startTime = Date.now()
  
  // Run all sources in parallel
  const promises = []
  const sourceNames = []
  
  // NEW: Unanswered Questions (PRIORITY - these are known open threads)
  if (useUnanswered) {
    promises.push(scrapeGoogleUnansweredQuestions(query))
    sourceNames.push('unanswered')
  }
  
  // NEW: Google Groups
  if (useGoogleGroups) {
    promises.push(scrapeGoogleGroups(query))
    sourceNames.push('groups')
  }
  
  // NEW: Issue Tracker
  if (useIssueTracker) {
    promises.push(scrapeGoogleIssueTracker(query))
    sourceNames.push('issuetracker')
  }
  
  if (useRSS) {
    promises.push(fetchGoogleCommunityRSSFeeds(relevantProducts, query))
    sourceNames.push('rss')
  }
  
  if (useAPI) {
    promises.push(fetchGoogleCommunityAPI(query, productFilter))
    sourceNames.push('api')
  }
  
  if (useSupportScrape) {
    promises.push(scrapeGoogleSupportSearch(query, productFilter))
    sourceNames.push('support')
  }
  
  if (useForumsScrape) {
    promises.push(scrapeGoogleProductForums(query))
    sourceNames.push('forums')
  }
  
  // Wait for all
  const results = await Promise.all(promises)
  
  // Combine with source tracking
  const sourceResults = {}
  const allThreads = []
  
  results.forEach((threads, idx) => {
    const sourceName = sourceNames[idx]
    sourceResults[sourceName] = threads.length
    allThreads.push(...threads)
  })
  
  const elapsed = Date.now() - startTime
  
  console.log(`\n📊 Alternative Sources Summary:`)
  console.log(`   🆕 Unanswered: ${sourceResults.unanswered || 0} threads (OPEN)`)
  console.log(`   🆕 Groups: ${sourceResults.groups || 0} threads`)
  console.log(`   🆕 Issue Tracker: ${sourceResults.issuetracker || 0} issues`)
  console.log(`   API: ${sourceResults.api || 0} threads`)
  console.log(`   Support: ${sourceResults.support || 0} threads`)
  console.log(`   Forums: ${sourceResults.forums || 0} threads`)
  console.log(`   Total: ${allThreads.length} threads`)
  console.log(`   Time: ${elapsed}ms`)
  
  return {
    threads: allThreads,
    stats: sourceResults,
    elapsed
  }
}

export { 
  GOOGLE_PRODUCTS, 
  GOOGLE_GROUPS
}
