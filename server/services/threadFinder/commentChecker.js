// Comment Checker - Check for brand mentions (CloudFuze) in comments/answers across platforms
// Supports: Reddit, Quora, Google Community, Stack Overflow, Microsoft Tech Community

const REDDIT_USER_AGENT = 'RedditThreadFinder/1.0.0'
const STACK_EXCHANGE_API_BASE = 'https://api.stackexchange.com/2.3'
const BRAND_KEYWORDS = ['cloudfuze', 'cloud fuze', 'cloud-fuze']

/**
 * Check if text contains brand mention
 * @param {string} text - Text to check
 * @returns {boolean} True if brand is mentioned
 */
export function containsBrandMention(text) {
  if (!text) return false
  const lowerText = text.toLowerCase()
  return BRAND_KEYWORDS.some(keyword => lowerText.includes(keyword))
}

// ============================================
// REDDIT COMMENT CHECKER
// ============================================

/**
 * Fetch Reddit thread with all comments
 * @param {string} threadId - Reddit thread ID
 * @returns {Promise<Object|null>} Thread data with comments or null
 */
async function fetchRedditComments(threadId) {
  try {
    // Fetch thread with comments (limit=500 gets most comments)
    const url = `https://www.reddit.com/comments/${threadId}.json?limit=500&depth=10`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': REDDIT_USER_AGENT,
        'Accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      console.log(`   ⚠️ Failed to fetch Reddit comments for ${threadId}: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    return data
  } catch (error) {
    console.log(`   ⚠️ Error fetching Reddit comments for ${threadId}: ${error.message}`)
    return null
  }
}

/**
 * Extract all comment text from Reddit response
 * @param {Object} commentData - Reddit comment listing
 * @returns {string[]} Array of comment texts
 */
function extractRedditCommentTexts(commentData) {
  const texts = []
  
  if (!commentData?.data?.children) return texts
  
  for (const child of commentData.data.children) {
    if (child.kind === 't1' && child.data) {
      // t1 = comment
      const comment = child.data
      if (comment.body) {
        texts.push(comment.body)
      }
      
      // Check nested replies
      if (comment.replies && comment.replies.data) {
        texts.push(...extractRedditCommentTexts(comment.replies))
      }
    }
  }
  
  return texts
}

/**
 * Check if a Reddit thread has brand mentions in comments
 * @param {string} threadId - Reddit thread ID
 * @returns {Promise<{hasBrandMention: boolean, mentionCount: number}>}
 */
export async function checkRedditCommentsForBrand(threadId) {
  const data = await fetchRedditComments(threadId)
  
  if (!data || !Array.isArray(data) || data.length < 2) {
    return { hasBrandMention: false, mentionCount: 0, error: 'Failed to fetch' }
  }
  
  // data[0] = thread info, data[1] = comments
  const commentTexts = extractRedditCommentTexts(data[1])
  
  let mentionCount = 0
  for (const text of commentTexts) {
    if (containsBrandMention(text)) {
      mentionCount++
    }
  }
  
  return {
    hasBrandMention: mentionCount > 0,
    mentionCount,
    commentCount: commentTexts.length
  }
}

/**
 * Batch check multiple Reddit threads for brand mentions
 * @param {string[]} threadIds - Array of thread IDs
 * @param {number} concurrency - Max concurrent requests (default 5)
 * @returns {Promise<Map<string, {hasBrandMention: boolean, mentionCount: number}>>}
 */
export async function batchCheckRedditComments(threadIds, concurrency = 5) {
  const results = new Map()
  
  // Process in batches to avoid rate limiting
  for (let i = 0; i < threadIds.length; i += concurrency) {
    const batch = threadIds.slice(i, i + concurrency)
    
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100 * (batch.indexOf(id))))
        const result = await checkRedditCommentsForBrand(id)
        return { id, result }
      })
    )
    
    for (const { id, result } of batchResults) {
      results.set(id, result)
    }
    
    // Rate limit between batches
    if (i + concurrency < threadIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  return results
}

// ============================================
// QUORA ANSWER CHECKER
// ============================================

/**
 * Fetch Quora page content and extract answers
 * Note: Quora heavily uses JavaScript, so this may not get all content
 * @param {string} url - Quora question URL
 * @returns {Promise<string|null>} Page content or null
 */
async function fetchQuoraPageContent(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    
    if (!response.ok) return null
    
    const html = await response.text()
    return html
  } catch (error) {
    console.log(`   ⚠️ Error fetching Quora page: ${error.message}`)
    return null
  }
}

/**
 * Extract text content from HTML (basic extraction)
 * @param {string} html - HTML content
 * @returns {string} Extracted text
 */
function extractTextFromHtml(html) {
  if (!html) return ''
  
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ')
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#\d+;/g, '')
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim()
  
  return text
}

/**
 * Check if a Quora question has brand mentions in answers
 * @param {string} url - Quora question URL
 * @returns {Promise<{hasBrandMention: boolean, checked: boolean}>}
 */
export async function checkQuoraAnswersForBrand(url) {
  const html = await fetchQuoraPageContent(url)
  
  if (!html) {
    return { hasBrandMention: false, checked: false, error: 'Failed to fetch' }
  }
  
  const text = extractTextFromHtml(html)
  const hasBrandMention = containsBrandMention(text)
  
  return {
    hasBrandMention,
    checked: true
  }
}

/**
 * Batch check multiple Quora questions for brand mentions
 * @param {string[]} urls - Array of Quora URLs
 * @param {number} concurrency - Max concurrent requests (default 3)
 * @returns {Promise<Map<string, {hasBrandMention: boolean, checked: boolean}>>}
 */
export async function batchCheckQuoraAnswers(urls, concurrency = 3) {
  const results = new Map()
  
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        await new Promise(resolve => setTimeout(resolve, 200 * (batch.indexOf(url))))
        const result = await checkQuoraAnswersForBrand(url)
        return { url, result }
      })
    )
    
    for (const { url, result } of batchResults) {
      results.set(url, result)
    }
    
    // Rate limit between batches
    if (i + concurrency < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
  }
  
  return results
}

// ============================================
// GOOGLE COMMUNITY REPLY CHECKER
// ============================================

// Patterns that indicate a locked thread (Google Community, Microsoft Tech, etc.)
const LOCKED_PATTERNS = [
  // Text patterns (case-insensitive match on extracted text)
  'this thread has been locked',
  'this post has been locked',
  'this question has been locked',
  'this question is locked',  // Google Community exact format
  'this thread is locked',
  'this post is locked',
  'thread is locked',
  'post is locked',
  'question is locked',
  'replying has been disabled',  // Google Community exact format
  'replies are disabled',
  'replies have been disabled',
  'comments are disabled',
  'comments have been disabled',
  'responding has been disabled',
  'no longer accepting replies',
  'no longer accepting comments',
  'closed for comments',
  'closed for replies',
  'locked by',
  'this conversation has been locked',
  'this conversation is locked',
  'thread locked',
  'question locked',
  'post locked',
  // Microsoft specific patterns
  'locked question',
  'migrated from',
  'was migrated from',
  'question was migrated',
  'migrated from the microsoft',
  'can\'t add comments or replies',
  'cannot add comments or replies',
  'you can\'t add comments',
  'you cannot add comments',
  'you can vote on whether it\'s helpful, but you can\'t add',
  'can\'t add comments or replies or follow',
  // RETIRED questions
  'retired',
  'this question has been retired',
  'question has been retired',
  'has been retired',
  'content has been retired',
  'this content has been retired',
  'retired question',
  'retired content',
  'question you\'re looking for has been retired',
  'we\'re not migrating all the content'
]

// HTML/attribute patterns that indicate locked status
const LOCKED_HTML_PATTERNS = [
  'data-locked="true"',
  'data-locked="1"',
  'class="locked"',
  'class="thread-locked"',
  'class="question-locked"',
  'aria-label="locked"',
  'aria-label="Locked"',
  'lock-icon',
  'locked-badge',
  'locked-label',
  'is-locked',
  '"isLocked":true',
  '"isLocked":1',
  '"locked":true',
  '"locked":1',
  '"state":"locked"',
  // Microsoft specific HTML patterns
  'locked-question',
  'question-locked',
  'migrated-question',
  'is-migrated',
  'data-migrated',
  'lia-component-locked',
  'lia-locked-post',
  'c-uhf-locked',
  '"threadState":"locked"',
  '"questionState":"locked"',
  '"status":"locked"',
  'data-is-locked',
  'data-locked',
  'thread-state-locked',
  '>Locked<',  // Button/badge text
  '>locked<',
  'Locked</span>',
  'Locked</button>',
  'Locked</div>',
  '"Locked"',  // JSON string
  'lock_outline',  // Material icon name for lock
  'locked_thread',
  'thread_locked',
  'question_locked',
  'lockIcon',
  'LockIcon'
]

/**
 * Check if page HTML indicates the thread is locked
 * @param {string} html - Raw HTML content
 * @param {string} text - Extracted text content
 * @returns {boolean} True if thread appears to be locked
 */
function isThreadLocked(html, text) {
  if (!html && !text) return false
  
  const lowerHtml = (html || '').toLowerCase()
  const lowerText = (text || '').toLowerCase()
  
  // Check HTML patterns (these are in the raw HTML, like attributes)
  for (const pattern of LOCKED_HTML_PATTERNS) {
    if (lowerHtml.includes(pattern.toLowerCase())) {
      return true
    }
  }
  
  // Check text patterns
  for (const pattern of LOCKED_PATTERNS) {
    if (lowerText.includes(pattern.toLowerCase())) {
      return true
    }
  }
  
  return false
}

/**
 * Fetch Google Community thread content
 * @param {string} url - Google Community thread URL
 * @returns {Promise<{html: string|null, is404: boolean}>} Page content and 404 status
 */
async function fetchGoogleCommunityContent(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    
    // Check for HTTP 404
    if (response.status === 404) {
      return { html: null, is404: true }
    }
    
    if (!response.ok) return { html: null, is404: false }
    
    const html = await response.text()
    
    // Check for soft 404 (page exists but shows "not found" message)
    const is404 = html.includes("Sorry, this page can't be found") ||
                  html.includes("page doesn't exist") ||
                  html.includes("This page does not exist") ||
                  html.includes("Page not found") ||
                  html.includes("404") && html.includes("not found")
    
    return { html: is404 ? null : html, is404 }
  } catch (error) {
    console.log(`   ⚠️ Error fetching Google Community page: ${error.message}`)
    return { html: null, is404: false }
  }
}

/**
 * Check if a Google Community thread has brand mentions in replies, is locked, or is 404
 * @param {string} url - Google Community thread URL
 * @returns {Promise<{hasBrandMention: boolean, isLocked: boolean, is404: boolean, checked: boolean}>}
 */
export async function checkGoogleCommunityRepliesForBrand(url) {
  const { html, is404 } = await fetchGoogleCommunityContent(url)
  
  // If page doesn't exist (404), mark it for filtering
  if (is404) {
    console.log(`   ❌ 404 page detected: ${url.substring(0, 60)}...`)
    return { hasBrandMention: false, isLocked: true, is404: true, checked: true }
  }
  
  if (!html) {
    return { hasBrandMention: false, isLocked: false, is404: false, checked: false, error: 'Failed to fetch' }
  }
  
  const text = extractTextFromHtml(html)
  const hasBrandMention = containsBrandMention(text)
  const isLocked = isThreadLocked(html, text)
  
  if (isLocked) {
    console.log(`   🔒 Locked thread detected: ${url.substring(0, 60)}...`)
  }
  
  return {
    hasBrandMention,
    isLocked,
    is404: false,
    checked: true
  }
}

/**
 * Batch check multiple Google Community threads for brand mentions, locked status, and 404s
 * @param {string[]} urls - Array of Google Community URLs
 * @param {number} concurrency - Max concurrent requests (default 5)
 * @returns {Promise<Map<string, {hasBrandMention: boolean, isLocked: boolean, is404: boolean, checked: boolean}>>}
 */
export async function batchCheckGoogleCommunityReplies(urls, concurrency = 5) {
  const results = new Map()
  const totalBatches = Math.ceil(urls.length / concurrency)
  let lockedCount = 0
  let brandCount = 0
  let notFoundCount = 0
  
  for (let i = 0; i < urls.length; i += concurrency) {
    const batchNum = Math.floor(i / concurrency) + 1
    const batch = urls.slice(i, i + concurrency)
    
    // Log progress every 5 batches
    if (batchNum % 5 === 1 || batchNum === 1) {
      console.log(`   📊 Progress: batch ${batchNum}/${totalBatches} (${i}/${urls.length} threads checked)`)
    }
    
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        await new Promise(resolve => setTimeout(resolve, 100 * (batch.indexOf(url))))
        const result = await checkGoogleCommunityRepliesForBrand(url)
        return { url, result }
      })
    )
    
    for (const { url, result } of batchResults) {
      results.set(url, result)
      if (result.is404) notFoundCount++
      else if (result.isLocked) lockedCount++
      if (result.hasBrandMention) brandCount++
    }
    
    // Rate limit between batches (reduced delay for faster processing)
    if (i + concurrency < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 800))
    }
  }
  
  console.log(`   ✅ Finished checking ${urls.length} threads: ${notFoundCount} not found (404), ${lockedCount} locked, ${brandCount} with brand mentions`)
  
  return results
}

// ============================================
// STACK OVERFLOW ANSWER CHECKER
// ============================================

/**
 * Get Stack Exchange API key parameter if configured
 * @returns {string}
 */
function getStackExchangeApiKeyParam() {
  const key = process.env.STACKEXCHANGE_API_KEY
  return key ? `&key=${key}` : ''
}

/**
 * Fetch answers for a Stack Overflow question
 * @param {string} questionId - Question ID
 * @returns {Promise<Object>} Answers data
 */
async function fetchStackOverflowAnswers(questionId) {
  try {
    let url = `${STACK_EXCHANGE_API_BASE}/questions/${questionId}/answers?`
    url += 'site=stackoverflow'
    url += '&sort=votes'
    url += '&order=desc'
    url += '&pagesize=100'
    url += '&filter=!nNPvSNe7ya' // Include body_markdown
    url += getStackExchangeApiKeyParam()
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate'
      }
    })
    
    if (!response.ok) {
      return { items: [], error: `HTTP ${response.status}` }
    }
    
    const data = await response.json()
    return {
      items: data.items || [],
      quota_remaining: data.quota_remaining
    }
  } catch (error) {
    console.log(`   ⚠️ Error fetching SO answers for ${questionId}: ${error.message}`)
    return { items: [], error: error.message }
  }
}

/**
 * Check if a Stack Overflow question has brand mentions in answers
 * @param {string} questionId - Question ID
 * @returns {Promise<{hasBrandMention: boolean, checked: boolean, answerCount: number}>}
 */
export async function checkStackOverflowAnswersForBrand(questionId) {
  const result = await fetchStackOverflowAnswers(questionId)
  
  if (result.error) {
    return { hasBrandMention: false, checked: false, answerCount: 0, error: result.error }
  }
  
  const answers = result.items || []
  let mentionCount = 0
  
  for (const answer of answers) {
    const body = answer.body_markdown || answer.body || ''
    if (containsBrandMention(body)) {
      mentionCount++
    }
  }
  
  return {
    hasBrandMention: mentionCount > 0,
    mentionCount,
    answerCount: answers.length,
    checked: true
  }
}

/**
 * Batch check multiple Stack Overflow questions for brand mentions in answers
 * Uses Stack Exchange API's batch endpoint for efficiency
 * @param {string[]} questionIds - Array of question IDs
 * @param {number} batchSize - Questions per API request (max 100)
 * @returns {Promise<Map<string, {hasBrandMention: boolean, checked: boolean}>>}
 */
export async function batchCheckStackOverflowAnswers(questionIds, batchSize = 50) {
  const results = new Map()
  
  if (!questionIds.length) return results
  
  // Process in batches (Stack Exchange allows up to 100 IDs per request)
  for (let i = 0; i < questionIds.length; i += batchSize) {
    const batch = questionIds.slice(i, i + batchSize)
    const ids = batch.join(';')
    
    try {
      let url = `${STACK_EXCHANGE_API_BASE}/questions/${ids}/answers?`
      url += 'site=stackoverflow'
      url += '&sort=votes'
      url += '&order=desc'
      url += '&pagesize=100'
      url += '&filter=!nNPvSNe7ya'
      url += getStackExchangeApiKeyParam()
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate'
        }
      })
      
      if (!response.ok) {
        // Mark all in batch as unchecked
        for (const id of batch) {
          results.set(id, { hasBrandMention: false, checked: false, error: `HTTP ${response.status}` })
        }
        continue
      }
      
      const data = await response.json()
      
      // Group answers by question ID
      const answersByQuestion = new Map()
      for (const answer of (data.items || [])) {
        const qId = answer.question_id.toString()
        if (!answersByQuestion.has(qId)) {
          answersByQuestion.set(qId, [])
        }
        answersByQuestion.get(qId).push(answer)
      }
      
      // Check each question's answers for brand mention
      for (const id of batch) {
        const answers = answersByQuestion.get(id) || []
        let hasBrandMention = false
        
        for (const answer of answers) {
          const body = answer.body_markdown || answer.body || ''
          if (containsBrandMention(body)) {
            hasBrandMention = true
            break
          }
        }
        
        results.set(id, {
          hasBrandMention,
          answerCount: answers.length,
          checked: true
        })
      }
      
      // Check API quota
      if (data.quota_remaining !== undefined && data.quota_remaining < 10) {
        console.warn('   ⚠️ Stack Exchange API quota running low:', data.quota_remaining)
      }
      
    } catch (error) {
      console.log(`   ⚠️ Error batch checking SO answers: ${error.message}`)
      // Mark all in batch as unchecked
      for (const id of batch) {
        results.set(id, { hasBrandMention: false, checked: false, error: error.message })
      }
    }
    
    // Rate limit between batches
    if (i + batchSize < questionIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  
  return results
}

// ============================================
// MICROSOFT TECH COMMUNITY REPLY CHECKER
// ============================================

/**
 * Fetch Microsoft Tech Community page content with timeout and retry
 * @param {string} url - Thread URL
 * @param {number} timeout - Timeout in ms (default 10000)
 * @param {number} retries - Number of retries (default 1)
 * @returns {Promise<{html: string|null, is404: boolean}>} Page content and 404 status
 */
async function fetchMicrosoftTechContent(url, timeout = 10000, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      // Check for HTTP 404
      if (response.status === 404) {
        return { html: null, is404: true }
      }
      
      if (!response.ok) {
        if (attempt < retries) continue
        return { html: null, is404: false }
      }
      
      const html = await response.text()
      
      // Check for soft 404 (page exists but shows "not found" message)
      const is404 = html.includes("Page not found") ||
                    html.includes("Sorry, we couldn't find") ||
                    html.includes("does not exist") ||
                    html.includes("This page is no longer available") ||
                    (html.includes("404") && html.includes("not found"))
      
      return { html: is404 ? null : html, is404 }
    } catch (error) {
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 500))
        continue
      }
      console.log(`   ⚠️ Error fetching Microsoft Tech page: ${error.message}`)
      return { html: null, is404: false }
    }
  }
  return { html: null, is404: false }
}

/**
 * Check if a Microsoft Tech Community thread has brand mentions in replies
 * Also checks if the thread is locked or returns 404
 * @param {string} url - Thread URL
 * @returns {Promise<{hasBrandMention: boolean, isLocked: boolean, is404: boolean, checked: boolean}>}
 */
export async function checkMicrosoftTechRepliesForBrand(url) {
  const { html, is404 } = await fetchMicrosoftTechContent(url)
  
  // Check for 404 pages first
  if (is404) {
    console.log(`   ❌ 404 page detected: ${url.substring(0, 60)}...`)
    return { hasBrandMention: false, isLocked: true, is404: true, checked: true }
  }
  
  if (!html) {
    return { hasBrandMention: false, isLocked: false, is404: false, checked: false, error: 'Failed to fetch' }
  }
  
  const text = extractTextFromHtml(html)
  const hasBrandMention = containsBrandMention(text)
  const isLocked = isThreadLocked(html, text)
  
  return {
    hasBrandMention,
    isLocked,
    is404: false,
    checked: true
  }
}

/**
 * Batch check multiple Microsoft Tech Community threads
 * @param {string[]} urls - Array of URLs
 * @param {number} concurrency - Max concurrent requests
 * @returns {Promise<Map<string, {hasBrandMention: boolean, isLocked: boolean, is404: boolean, checked: boolean}>>}
 */
export async function batchCheckMicrosoftTechReplies(urls, concurrency = 3) {
  const results = new Map()
  let lockedCount = 0
  let brandCount = 0
  let notFoundCount = 0
  
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        await new Promise(resolve => setTimeout(resolve, 200 * (batch.indexOf(url))))
        const result = await checkMicrosoftTechRepliesForBrand(url)
        return { url, result }
      })
    )
    
    for (const { url, result } of batchResults) {
      results.set(url, result)
      if (result.is404) notFoundCount++
      else if (result.isLocked) lockedCount++
      if (result.hasBrandMention) brandCount++
    }
    
    // Rate limit between batches
    if (i + concurrency < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  console.log(`   ✅ Finished checking ${urls.length} Microsoft threads: ${notFoundCount} not found (404), ${lockedCount} locked, ${brandCount} with brand mentions`)
  
  return results
}

// ============================================
// UNIFIED BRAND CHECK
// ============================================

/**
 * Check if thread/question should be excluded based on brand mention in content or comments
 * Works for all platforms
 * 
 * @param {Object} item - Thread/question object
 * @param {string} platform - 'reddit' | 'quora' | 'google-community'
 * @param {Map} commentCheckResults - Pre-fetched comment check results (optional)
 * @returns {boolean} True if should be excluded (brand already mentioned)
 */
export function shouldExcludeForBrandMention(item, platform, commentCheckResults = null) {
  // First check title and body/snippet (existing logic)
  const title = (item.title || '').toLowerCase()
  const body = (item.selftext || item.snippet || '').toLowerCase()
  const content = title + ' ' + body
  
  if (containsBrandMention(content)) {
    return true
  }
  
  // Then check comments if results are available
  if (commentCheckResults) {
    const key = platform === 'reddit' ? item.id : item.url
    const checkResult = commentCheckResults.get(key)
    
    if (checkResult?.hasBrandMention) {
      return true
    }
  }
  
  return false
}

export default {
  containsBrandMention,
  checkRedditCommentsForBrand,
  batchCheckRedditComments,
  checkQuoraAnswersForBrand,
  batchCheckQuoraAnswers,
  checkGoogleCommunityRepliesForBrand,
  batchCheckGoogleCommunityReplies,
  checkStackOverflowAnswersForBrand,
  batchCheckStackOverflowAnswers,
  checkMicrosoftTechRepliesForBrand,
  batchCheckMicrosoftTechReplies,
  shouldExcludeForBrandMention
}
