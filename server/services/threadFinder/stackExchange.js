// Stack Exchange API Service
// Native API integration for Stack Overflow search
// Documentation: https://api.stackexchange.com/docs

const STACK_EXCHANGE_API_BASE = 'https://api.stackexchange.com/2.3'

/**
 * Check if Stack Exchange API key is configured
 * @returns {boolean}
 */
export function isStackExchangeConfigured() {
  // API works without key (300 requests/day), but key increases limit to 10,000/day
  return true // Always available, key is optional
}

/**
 * Get API key parameter if configured
 * @returns {string}
 */
function getApiKeyParam() {
  const key = process.env.STACKEXCHANGE_API_KEY
  return key ? `&key=${key}` : ''
}

/**
 * Search Stack Overflow for questions
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with questions
 */
export async function searchStackOverflow(query, options = {}) {
  const {
    site = 'stackoverflow',
    tagged = '',           // Comma-separated tags (e.g., 'saas,cloud-storage')
    sort = 'relevance',    // relevance, votes, creation, activity
    order = 'desc',
    pageSize = 50,
    page = 1,
    minScore = 0,
    fromDate = null,       // Unix timestamp
    accepted = null,       // true = has accepted answer, false = no accepted, null = both
    closed = false,        // Include closed questions
    filter = '!nNPvSNVZJS' // Custom filter to include body_markdown
  } = options

  try {
    // Build URL with parameters
    let url = `${STACK_EXCHANGE_API_BASE}/search/advanced?`
    url += `site=${site}`
    url += `&q=${encodeURIComponent(query)}`
    url += `&sort=${sort}`
    url += `&order=${order}`
    url += `&pagesize=${pageSize}`
    url += `&page=${page}`
    url += `&filter=${filter}`
    url += getApiKeyParam()
    
    if (tagged) {
      url += `&tagged=${encodeURIComponent(tagged)}`
    }
    
    if (minScore > 0) {
      url += `&min=${minScore}`
    }
    
    if (fromDate) {
      url += `&fromdate=${fromDate}`
    }
    
    if (accepted !== null) {
      url += `&accepted=${accepted}`
    }
    
    if (!closed) {
      url += `&closed=false`
    }
    
    console.log(`🔶 Stack Exchange API: Searching "${query.substring(0, 50)}..."`)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate'
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Stack Exchange API error:', response.status, errorText)
      return { items: [], has_more: false, quota_remaining: 0, error: errorText }
    }
    
    const data = await response.json()
    
    console.log(`🔶 Stack Exchange API: Found ${data.items?.length || 0} questions (quota: ${data.quota_remaining})`)
    
    // Transform to normalized format
    const questions = (data.items || []).map(item => ({
      id: item.question_id.toString(),
      title: item.title,
      body: item.body_markdown || item.body || '',
      url: item.link,
      score: item.score,
      answerCount: item.answer_count,
      viewCount: item.view_count,
      isAnswered: item.is_answered,
      acceptedAnswerId: item.accepted_answer_id,
      createdAt: item.creation_date,
      lastActivityAt: item.last_activity_date,
      tags: item.tags || [],
      owner: item.owner?.display_name || 'Unknown',
      closedReason: item.closed_reason,
      closedDate: item.closed_date,
      duplicateId: item.closed_details?.original_questions?.[0]?.question_id,
      source: 'stackexchange',
      sources: ['stackexchange']
    }))
    
    return {
      items: questions,
      has_more: data.has_more,
      quota_remaining: data.quota_remaining,
      total: data.total || questions.length
    }
    
  } catch (error) {
    console.error('Stack Exchange API error:', error.message)
    return { items: [], has_more: false, quota_remaining: 0, error: error.message }
  }
}

/**
 * Search with multiple queries in parallel
 * @param {string[]} queries - Array of search queries
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Combined results
 */
export async function searchStackOverflowMultiQuery(queries, options = {}) {
  const { delayMs = 200 } = options
  
  const allResults = []
  
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i]
    
    // Add delay between requests to avoid rate limiting
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
    
    const result = await searchStackOverflow(query, options)
    
    if (result.items) {
      allResults.push(...result.items)
    }
    
    // Check quota
    if (result.quota_remaining !== undefined && result.quota_remaining < 10) {
      console.warn('⚠️ Stack Exchange API quota running low:', result.quota_remaining)
      break
    }
  }
  
  return {
    results: allResults,
    source: 'stackexchange'
  }
}

/**
 * Fetch answers for a specific question
 * @param {string|number} questionId - Question ID
 * @param {Object} options - Options
 * @returns {Promise<Object>} Answers
 */
export async function fetchQuestionAnswers(questionId, options = {}) {
  const {
    site = 'stackoverflow',
    sort = 'votes',
    order = 'desc',
    pageSize = 100,
    filter = '!nNPvSNe7ya' // Include body_markdown
  } = options
  
  try {
    let url = `${STACK_EXCHANGE_API_BASE}/questions/${questionId}/answers?`
    url += `site=${site}`
    url += `&sort=${sort}`
    url += `&order=${order}`
    url += `&pagesize=${pageSize}`
    url += `&filter=${filter}`
    url += getApiKeyParam()
    
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
    
    const answers = (data.items || []).map(item => ({
      id: item.answer_id.toString(),
      questionId: item.question_id.toString(),
      body: item.body_markdown || item.body || '',
      score: item.score,
      isAccepted: item.is_accepted,
      createdAt: item.creation_date,
      owner: item.owner?.display_name || 'Unknown'
    }))
    
    return {
      items: answers,
      quota_remaining: data.quota_remaining
    }
    
  } catch (error) {
    console.error('Error fetching SO answers:', error.message)
    return { items: [], error: error.message }
  }
}

/**
 * Fetch answers for multiple questions in one request
 * @param {string[]} questionIds - Array of question IDs (max 100)
 * @param {Object} options - Options
 * @returns {Promise<Object>} Answers grouped by question
 */
export async function fetchMultipleQuestionsAnswers(questionIds, options = {}) {
  const {
    site = 'stackoverflow',
    sort = 'votes',
    order = 'desc',
    pageSize = 100,
    filter = '!nNPvSNe7ya'
  } = options
  
  if (!questionIds.length) {
    return { answersByQuestion: new Map() }
  }
  
  // Stack Exchange API allows up to 100 IDs per request
  const ids = questionIds.slice(0, 100).join(';')
  
  try {
    let url = `${STACK_EXCHANGE_API_BASE}/questions/${ids}/answers?`
    url += `site=${site}`
    url += `&sort=${sort}`
    url += `&order=${order}`
    url += `&pagesize=${pageSize}`
    url += `&filter=${filter}`
    url += getApiKeyParam()
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate'
      }
    })
    
    if (!response.ok) {
      return { answersByQuestion: new Map(), error: `HTTP ${response.status}` }
    }
    
    const data = await response.json()
    
    // Group answers by question ID
    const answersByQuestion = new Map()
    
    for (const item of (data.items || [])) {
      const qId = item.question_id.toString()
      if (!answersByQuestion.has(qId)) {
        answersByQuestion.set(qId, [])
      }
      answersByQuestion.get(qId).push({
        id: item.answer_id.toString(),
        body: item.body_markdown || item.body || '',
        score: item.score,
        isAccepted: item.is_accepted,
        owner: item.owner?.display_name || 'Unknown'
      })
    }
    
    return {
      answersByQuestion,
      quota_remaining: data.quota_remaining
    }
    
  } catch (error) {
    console.error('Error fetching multiple SO answers:', error.message)
    return { answersByQuestion: new Map(), error: error.message }
  }
}

/**
 * Get question details by IDs
 * @param {string[]} questionIds - Array of question IDs
 * @param {Object} options - Options
 * @returns {Promise<Object>} Questions
 */
export async function fetchQuestionsByIds(questionIds, options = {}) {
  const {
    site = 'stackoverflow',
    filter = '!nNPvSNVZJS'
  } = options
  
  if (!questionIds.length) {
    return { items: [] }
  }
  
  const ids = questionIds.slice(0, 100).join(';')
  
  try {
    let url = `${STACK_EXCHANGE_API_BASE}/questions/${ids}?`
    url += `site=${site}`
    url += `&filter=${filter}`
    url += getApiKeyParam()
    
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
    
    const questions = (data.items || []).map(item => ({
      id: item.question_id.toString(),
      title: item.title,
      body: item.body_markdown || item.body || '',
      url: item.link,
      score: item.score,
      answerCount: item.answer_count,
      viewCount: item.view_count,
      isAnswered: item.is_answered,
      acceptedAnswerId: item.accepted_answer_id,
      createdAt: item.creation_date,
      lastActivityAt: item.last_activity_date,
      tags: item.tags || [],
      owner: item.owner?.display_name || 'Unknown',
      closedReason: item.closed_reason,
      closedDate: item.closed_date
    }))
    
    return {
      items: questions,
      quota_remaining: data.quota_remaining
    }
    
  } catch (error) {
    console.error('Error fetching SO questions by IDs:', error.message)
    return { items: [], error: error.message }
  }
}

export default {
  isStackExchangeConfigured,
  searchStackOverflow,
  searchStackOverflowMultiQuery,
  fetchQuestionAnswers,
  fetchMultipleQuestionsAnswers,
  fetchQuestionsByIds
}
