// Quora URL parsing utilities
// Since Quora has no public API, we extract info from URLs

/**
 * Parse a Quora question URL and extract relevant info
 * URL patterns:
 *   - https://www.quora.com/What-is-the-best-programming-language
 *   - https://www.quora.com/What-is-the-best-programming-language/answer/John-Doe
 *   - https://quora.com/unanswered/What-is-machine-learning
 */
export function parseQuoraUrl(url) {
  try {
    // Clean URL
    url = url.split('?')[0].split('#')[0]
    
    // Match Quora question URLs
    const questionMatch = url.match(/quora\.com\/(?:unanswered\/)?([A-Za-z0-9\-]+)(?:\/answer\/[A-Za-z0-9\-]+)?$/i)
    
    if (!questionMatch) return null
    
    const slug = questionMatch[1]
    
    // Skip non-question pages
    const skipPatterns = ['profile', 'topic', 'space', 'q', 'search', 'about', 'contact', 'privacy', 'terms', 'settings', 'notifications']
    if (skipPatterns.includes(slug.toLowerCase())) {
      return null
    }
    
    // Skip very short slugs (likely not real questions)
    if (slug.length < 5) {
      return null
    }
    
    // Convert slug to readable title
    const title = slugToTitle(slug)
    
    return {
      id: slug,
      slug,
      url: `https://www.quora.com/${slug}`,
      title,
      source: 'quora'
    }
  } catch (error) {
    return null
  }
}

/**
 * Convert URL slug to readable title
 * "What-is-the-best-programming-language" -> "What is the best programming language"
 */
export function slugToTitle(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extract Quora question URLs from text
 */
export function extractQuoraUrls(text) {
  const questions = []
  const seenIds = new Set()
  
  // Quora question URL pattern
  const urlPattern = /https?:\/\/(?:www\.)?quora\.com\/(?:unanswered\/)?[A-Za-z0-9\-]+(?:\/answer\/[A-Za-z0-9\-]+)?/gi
  const matches = text.match(urlPattern) || []
  
  matches.forEach(url => {
    const question = parseQuoraUrl(url)
    if (question && !seenIds.has(question.id)) {
      seenIds.add(question.id)
      questions.push({
        ...question,
        ai_sources: ['quora']
      })
    }
  })
  
  return questions
}

/**
 * Check if a question is relevant to the search query
 * More lenient than Reddit since Quora results are harder to get
 */
export function isRelevantToQuery(question, query) {
  if (!question.title) return false
  
  // Split query into words, filter out very short and common words
  const stopWords = ['the', 'and', 'for', 'from', 'with', 'how', 'what', 'why', 'can', 'you', 'your', 'are', 'was', 'were', 'has', 'have', 'had', 'been', 'is', 'it', 'to', 'of', 'in', 'that', 'this']
  const searchTerms = query.toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 2)
    .filter(term => !stopWords.includes(term))
  
  // If no significant search terms, accept the question
  if (searchTerms.length === 0) return true
  
  const title = question.title.toLowerCase()
  
  // Count how many search terms appear in the title
  const matchedTerms = searchTerms.filter(term => title.includes(term))
  
  // Be lenient: require at least 1 term to match (since Quora results are scarce)
  return matchedTerms.length >= 1
}

/**
 * Calculate relevance score for a question
 */
export function calculateRelevanceScore(question, query) {
  if (!question.title) return 0
  
  const searchTerms = query.toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 2)
  
  const title = question.title.toLowerCase()
  
  let score = 0
  
  searchTerms.forEach(term => {
    if (title.includes(term)) score += 15
  })
  
  // Exact phrase match in title is very valuable
  if (title.includes(query.toLowerCase())) {
    score += 100
  }
  
  return score
}

/**
 * Calculate AI visibility score for Quora questions
 * Since we don't have engagement metrics, focus on AI source presence
 */
export function calculateAIVisibilityScore(question, query) {
  let score = 0
  
  // Relevance score (most important for Quora)
  score += calculateRelevanceScore(question, query)
  
  // Source points
  const sourcePoints = { gemini: 35, openai: 35 }
  question.ai_sources.forEach(source => {
    score += sourcePoints[source] || 10
  })
  
  // Multi-source bonus (found in both Gemini and OpenAI)
  if (question.ai_sources.length >= 2) score += 40
  
  return Math.round(score)
}

