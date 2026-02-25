// Google Community URL parsing utilities
// Since Google Community has no public API, we extract info from URLs

/**
 * Parse a Google Community question URL and extract relevant info
 * URL patterns:
 *   - https://support.google.com/drive/thread/12345678
 *   - https://support.google.com/mail/community?hl=en
 *   - https://support.google.com/a/users/thread/12345
 *   - https://www.googleproductforums.com/forum/#!topic/apps/abcdef
 *   - https://productforums.google.com/forum/#!topic/gmail/12345
 */
export function parseGoogleCommunityUrl(url) {
  try {
    // Clean URL
    url = url.split('#')[0].split('?')[0]
    
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const path = parsed.pathname
    
    // Check if it's a Google Community URL
    const validDomains = [
      'support.google.com',
      'productforums.google.com',
      'googleproductforums.com',
      'www.googleproductforums.com'
    ]
    
    const isValidDomain = validDomains.some(domain => hostname.includes(domain))
    if (!isValidDomain) return null
    
    // Extract thread ID and product
    let threadId = null
    let product = 'general'
    let title = ''
    
    // Pattern 1: support.google.com/[product]/thread/[id]
    const supportThreadMatch = path.match(/\/([^\/]+)\/thread\/(\d+)/i)
    if (supportThreadMatch) {
      product = supportThreadMatch[1]
      threadId = supportThreadMatch[2]
    }
    
    // Pattern 2: support.google.com/[product]/community (general community page)
    const communityMatch = path.match(/\/([^\/]+)\/community/i)
    if (communityMatch && !threadId) {
      product = communityMatch[1]
    }
    
    // Pattern 3: productforums.google.com/forum/#!topic/[product]/[id]
    const forumMatch = url.match(/forum\/#!topic\/([^\/]+)\/([^\/\?]+)/i)
    if (forumMatch) {
      product = forumMatch[1]
      threadId = forumMatch[2]
    }
    
    // Skip non-thread pages
    const skipPatterns = ['announcements', 'guidelines', 'about', 'contact', 'help', 'policy']
    if (skipPatterns.some(pattern => path.toLowerCase().includes(pattern))) {
      return null
    }
    
    // Generate unique ID
    const id = threadId || `${product}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    return {
      id,
      threadId,
      product: normalizeProductName(product),
      url: url,
      title,
      source: 'google-community'
    }
  } catch (error) {
    return null
  }
}

/**
 * Normalize product names to readable format
 */
export function normalizeProductName(product) {
  const productMap = {
    'drive': 'Google Drive',
    'mail': 'Gmail',
    'gmail': 'Gmail',
    'docs': 'Google Docs',
    'sheets': 'Google Sheets',
    'slides': 'Google Slides',
    'calendar': 'Google Calendar',
    'meet': 'Google Meet',
    'chat': 'Google Chat',
    'photos': 'Google Photos',
    'chrome': 'Google Chrome',
    'android': 'Android',
    'youtube': 'YouTube',
    'maps': 'Google Maps',
    'search': 'Google Search',
    'ads': 'Google Ads',
    'analytics': 'Google Analytics',
    'cloud': 'Google Cloud',
    'workspace': 'Google Workspace',
    'a': 'Google Workspace Admin',
    'users': 'Google Workspace Users',
    'apps': 'Google Apps',
    'play': 'Google Play',
    'store': 'Google Play Store',
    'fi': 'Google Fi',
    'nest': 'Google Nest',
    'home': 'Google Home',
    'assistant': 'Google Assistant',
    'pixel': 'Google Pixel',
    'one': 'Google One',
    'adsense': 'Google AdSense',
    'admob': 'Google AdMob',
    'merchants': 'Google Merchant Center',
    'business': 'Google Business Profile'
  }
  
  return productMap[product.toLowerCase()] || product.charAt(0).toUpperCase() + product.slice(1)
}

/**
 * Extract Google Community URLs from text
 */
export function extractGoogleCommunityUrls(text) {
  const questions = []
  const seenIds = new Set()
  
  // Google Community URL patterns
  const urlPatterns = [
    /https?:\/\/support\.google\.com\/[^\/\s]+\/thread\/\d+[^\s]*/gi,
    /https?:\/\/support\.google\.com\/[^\/\s]+\/community[^\s]*/gi,
    /https?:\/\/(?:www\.)?productforums\.google\.com\/[^\s]+/gi,
    /https?:\/\/(?:www\.)?googleproductforums\.com\/[^\s]+/gi
  ]
  
  for (const pattern of urlPatterns) {
    const matches = text.match(pattern) || []
    
    matches.forEach(url => {
      const question = parseGoogleCommunityUrl(url)
      if (question && !seenIds.has(question.id)) {
        seenIds.add(question.id)
        questions.push({
          ...question,
          sources: ['google-community']
        })
      }
    })
  }
  
  return questions
}

/**
 * Check if a question is relevant to the search query
 */
export function isRelevantToQuery(question, query) {
  if (!question.title) return true // Be lenient if no title
  
  // Split query into words, filter out very short and common words
  const stopWords = ['the', 'and', 'for', 'from', 'with', 'how', 'what', 'why', 'can', 'you', 'your', 'are', 'was', 'were', 'has', 'have', 'had', 'been', 'is', 'it', 'to', 'of', 'in', 'that', 'this', 'do', 'does', 'google']
  const searchTerms = query.toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 2)
    .filter(term => !stopWords.includes(term))
  
  // If no significant search terms, accept the question
  if (searchTerms.length === 0) return true
  
  const title = question.title.toLowerCase()
  const snippet = (question.snippet || '').toLowerCase()
  const product = (question.product || '').toLowerCase()
  const content = `${title} ${snippet} ${product}`
  
  // Count how many search terms appear in the content
  const matchedTerms = searchTerms.filter(term => content.includes(term))
  
  // Be lenient: require at least 1 term to match
  return matchedTerms.length >= 1
}

/**
 * Calculate relevance score for a question
 */
export function calculateRelevanceScore(question, query) {
  if (!question.title && !question.snippet) return 0
  
  const searchTerms = query.toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 2)
  
  const title = (question.title || '').toLowerCase()
  const snippet = (question.snippet || '').toLowerCase()
  
  let score = 0
  
  searchTerms.forEach(term => {
    if (title.includes(term)) score += 20
    if (snippet.includes(term)) score += 10
  })
  
  // Exact phrase match in title is very valuable
  if (title.includes(query.toLowerCase())) {
    score += 100
  }
  
  // Multi-source bonus
  const sourceCount = question.sources?.length || 1
  score += sourceCount * 15
  
  return score
}
