// Hacker News API Service
// Uses the official Firebase-based API: https://github.com/HackerNews/API

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0'
const ALGOLIA_API_BASE = 'https://hn.algolia.com/api/v1'

/**
 * Search Hacker News using Algolia API (better for search)
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results
 */
export async function searchHackerNews(query, options = {}) {
  const {
    tags = 'story',     // story, comment, poll, show_hn, ask_hn, front_page
    page = 0,
    hitsPerPage = 50,
    numericFilters = '' // e.g., 'points>10,num_comments>5'
  } = options
  
  try {
    let url = `${ALGOLIA_API_BASE}/search?`
    url += `query=${encodeURIComponent(query)}`
    url += `&tags=${tags}`
    url += `&page=${page}`
    url += `&hitsPerPage=${hitsPerPage}`
    
    if (numericFilters) {
      url += `&numericFilters=${encodeURIComponent(numericFilters)}`
    }
    
    console.log(`📰 Hacker News Algolia: Searching "${query.substring(0, 50)}..."`)
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      console.error('HN Algolia API error:', response.status)
      return { hits: [], nbHits: 0, error: `HTTP ${response.status}` }
    }
    
    const data = await response.json()
    
    console.log(`📰 Hacker News Algolia: Found ${data.nbHits} total, returned ${data.hits?.length || 0}`)
    
    // Transform to normalized format
    const stories = (data.hits || []).map(hit => ({
      id: hit.objectID,
      title: hit.title || '',
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      hnUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      points: hit.points || 0,
      numComments: hit.num_comments || 0,
      author: hit.author || 'Unknown',
      createdAt: hit.created_at_i,
      createdAtISO: hit.created_at,
      storyText: hit.story_text || '',
      type: hit._tags?.includes('ask_hn') ? 'ask_hn' : 
            hit._tags?.includes('show_hn') ? 'show_hn' : 'story',
      source: 'hackernews',
      sources: ['hackernews']
    }))
    
    return {
      items: stories,
      totalHits: data.nbHits,
      page: data.page,
      nbPages: data.nbPages
    }
    
  } catch (error) {
    console.error('HN Algolia API error:', error.message)
    return { items: [], totalHits: 0, error: error.message }
  }
}

/**
 * Search with multiple queries
 * @param {string[]} queries - Array of queries
 * @param {Object} options - Options
 * @returns {Promise<Object>} Combined results
 */
export async function searchHackerNewsMultiQuery(queries, options = {}) {
  const { delayMs = 200, hitsPerPage = 30 } = options
  
  const allResults = []
  const seenIds = new Set()
  
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i]
    
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
    
    const result = await searchHackerNews(query, { ...options, hitsPerPage })
    
    if (result.items) {
      for (const item of result.items) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id)
          allResults.push(item)
        }
      }
    }
  }
  
  return {
    results: allResults,
    source: 'hackernews'
  }
}

/**
 * Fetch a single HN item by ID
 * @param {string|number} itemId - Item ID
 * @returns {Promise<Object|null>} Item data
 */
export async function fetchHNItem(itemId) {
  try {
    const url = `${HN_API_BASE}/item/${itemId}.json`
    
    const response = await fetch(url)
    if (!response.ok) return null
    
    const item = await response.json()
    return item
  } catch (error) {
    console.log(`   ⚠️ Error fetching HN item ${itemId}: ${error.message}`)
    return null
  }
}

/**
 * Fetch comments for a story
 * @param {string|number} storyId - Story ID
 * @param {number} maxDepth - Maximum comment depth
 * @returns {Promise<string[]>} Array of comment texts
 */
export async function fetchHNComments(storyId, maxDepth = 3) {
  const commentTexts = []
  
  async function fetchCommentTree(itemId, depth = 0) {
    if (depth > maxDepth) return
    
    const item = await fetchHNItem(itemId)
    if (!item) return
    
    if (item.text) {
      // Remove HTML tags for text comparison
      const text = item.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      commentTexts.push(text)
    }
    
    // Fetch child comments (limit to avoid too many requests)
    if (item.kids && item.kids.length > 0 && depth < maxDepth) {
      const kidsToFetch = item.kids.slice(0, 10) // Limit kids per level
      await Promise.all(kidsToFetch.map(kidId => fetchCommentTree(kidId, depth + 1)))
    }
  }
  
  const story = await fetchHNItem(storyId)
  if (story && story.kids) {
    // Fetch top-level comments
    const topComments = story.kids.slice(0, 20) // Limit top-level comments
    await Promise.all(topComments.map(kidId => fetchCommentTree(kidId, 1)))
  }
  
  return commentTexts
}

/**
 * Get top/new/best stories
 * @param {string} type - 'top', 'new', 'best', 'ask', 'show'
 * @param {number} limit - Max stories to return
 * @returns {Promise<Object[]>} Stories
 */
export async function getHNStories(type = 'top', limit = 30) {
  try {
    const typeMap = {
      'top': 'topstories',
      'new': 'newstories',
      'best': 'beststories',
      'ask': 'askstories',
      'show': 'showstories'
    }
    
    const endpoint = typeMap[type] || 'topstories'
    const url = `${HN_API_BASE}/${endpoint}.json`
    
    const response = await fetch(url)
    if (!response.ok) return []
    
    const ids = await response.json()
    const limitedIds = ids.slice(0, limit)
    
    // Fetch item details in parallel (with batching)
    const stories = []
    const batchSize = 10
    
    for (let i = 0; i < limitedIds.length; i += batchSize) {
      const batch = limitedIds.slice(i, i + batchSize)
      const batchStories = await Promise.all(batch.map(fetchHNItem))
      
      for (const item of batchStories) {
        if (item && item.type === 'story') {
          stories.push({
            id: item.id.toString(),
            title: item.title || '',
            url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
            hnUrl: `https://news.ycombinator.com/item?id=${item.id}`,
            points: item.score || 0,
            numComments: item.descendants || 0,
            author: item.by || 'Unknown',
            createdAt: item.time,
            storyText: item.text || '',
            type: item.title?.startsWith('Ask HN:') ? 'ask_hn' : 
                  item.title?.startsWith('Show HN:') ? 'show_hn' : 'story',
            source: 'hackernews',
            sources: ['hackernews']
          })
        }
      }
    }
    
    return stories
    
  } catch (error) {
    console.error('Error fetching HN stories:', error.message)
    return []
  }
}

export default {
  searchHackerNews,
  searchHackerNewsMultiQuery,
  fetchHNItem,
  fetchHNComments,
  getHNStories
}
