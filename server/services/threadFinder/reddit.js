// Reddit Public JSON API - No authentication required!

const USER_AGENT = 'RedditThreadFinder/1.0.0 (by /u/contentmarketing)'

// Rate limiting helper
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 2000 // 2 seconds between requests

async function rateLimitedFetch(url) {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
  }
  
  lastRequestTime = Date.now()
  
  console.log('Fetching:', url.substring(0, 100) + '...')
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    }
  })
  
  if (!response.ok) {
    console.error('Reddit API error:', response.status, response.statusText)
    throw new Error(`Reddit API error: ${response.status} ${response.statusText}`)
  }
  
  return response.json()
}

// Check if thread is relevant to the search query
function isRelevantToQuery(thread, query) {
  const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2)
  const title = thread.title.toLowerCase()
  const selftext = (thread.selftext || '').toLowerCase()
  const content = title + ' ' + selftext
  
  // Count how many search terms appear in the content
  const matchedTerms = searchTerms.filter(term => content.includes(term))
  
  // Require at least 50% of significant terms to match, or at least 2 terms
  const minRequired = Math.max(2, Math.floor(searchTerms.length * 0.5))
  return matchedTerms.length >= Math.min(minRequired, searchTerms.length)
}

// Check if thread should be excluded (archived, locked, or mentions CloudFuze)
function shouldExcludeThread(thread) {
  // Filter out archived threads (can't comment on them)
  if (thread.archived) {
    return true
  }
  
  // Filter out locked threads (can't comment on them)
  if (thread.locked) {
    return true
  }
  
  // Filter out threads that mention CloudFuze (already have content)
  const title = (thread.title || '').toLowerCase()
  const selftext = (thread.selftext || '').toLowerCase()
  const content = title + ' ' + selftext
  
  if (content.includes('cloudfuze')) {
    return true
  }
  
  return false
}

// Calculate relevance score based on keyword matches
function calculateRelevanceScore(thread, query) {
  const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2)
  const title = thread.title.toLowerCase()
  const selftext = (thread.selftext || '').toLowerCase()
  
  let score = 0
  
  searchTerms.forEach(term => {
    // Title matches are worth more
    if (title.includes(term)) {
      score += 10
    }
    // Content matches
    if (selftext.includes(term)) {
      score += 5
    }
  })
  
  // Exact phrase match in title is highly valuable
  if (title.includes(query.toLowerCase())) {
    score += 50
  }
  
  return score
}

export async function searchReddit({ 
  query, 
  subreddit, 
  timeFilter = 'all', 
  sort = 'relevance', 
  limit = 200,
  minScore = 0,
  minComments = 0,
  aiOptimized = false 
}) {
  try {
    console.log('\n=== NEW SEARCH ===')
    console.log('Query:', query)
    console.log('AI Optimized:', aiOptimized)
    
    let allThreads = []
    
    if (aiOptimized) {
      // Search with different sort options
      const sortOptions = ['relevance', 'top', 'comments']
      
      for (const sortOption of sortOptions) {
        const results = await fetchRedditSearch(query, subreddit, 'all', sortOption, 100)
        allThreads.push(...results)
      }
      
      // Remove duplicates
      const uniqueMap = new Map()
      allThreads.forEach(thread => {
        if (!uniqueMap.has(thread.id)) {
          uniqueMap.set(thread.id, thread)
        }
      })
      allThreads = Array.from(uniqueMap.values())
    } else {
      allThreads = await fetchRedditSearch(query, subreddit, timeFilter, sort, limit)
    }
    
    console.log(`Raw results: ${allThreads.length} threads`)
    
    // FILTER: Exclude archived, locked, and CloudFuze-mentioned threads
    let activeThreads = allThreads.filter(thread => !shouldExcludeThread(thread))
    console.log(`After excluding archived/locked/CloudFuze: ${activeThreads.length} threads`)
    
    // FILTER: Only keep threads that are actually relevant to the query
    let relevantThreads = activeThreads.filter(thread => isRelevantToQuery(thread, query))
    
    console.log(`After relevance filter: ${relevantThreads.length} threads`)
    
    // Add relevance score to each thread
    relevantThreads = relevantThreads.map(thread => ({
      ...thread,
      relevance_score: calculateRelevanceScore(thread, query),
      // Combined score for AI visibility (relevance + engagement)
      ai_visibility_score: calculateRelevanceScore(thread, query) * 10 + thread.score + (thread.num_comments * 5)
    }))
    
    // Sort by combined score (relevance + engagement)
    if (aiOptimized) {
      relevantThreads.sort((a, b) => b.ai_visibility_score - a.ai_visibility_score)
    } else {
      // Keep original relevance order but boost highly relevant ones
      relevantThreads.sort((a, b) => b.relevance_score - a.relevance_score)
    }
    
    // Apply minimum score/comment filters
    let filteredThreads = relevantThreads.filter(thread => 
      thread.score >= minScore && thread.num_comments >= minComments
    )
    
    // Limit results
    filteredThreads = filteredThreads.slice(0, limit)
    
    console.log(`Final results: ${filteredThreads.length} threads`)
    
    // Log sample titles
    console.log('Top 5 results:')
    filteredThreads.slice(0, 5).forEach(t => 
      console.log(`  [${t.score}↑ ${t.num_comments}💬] ${t.title.substring(0, 70)}...`)
    )

    return {
      threads: filteredThreads,
      count: filteredThreads.length,
      totalFound: allThreads.length,
      query,
      subreddit: subreddit || 'all'
    }
  } catch (error) {
    console.error('Reddit search error:', error)
    throw new Error(`Failed to search Reddit: ${error.message}`)
  }
}

async function fetchRedditSearch(query, subreddit, timeFilter, sort, limit) {
  let url
  
  if (subreddit && subreddit.trim()) {
    url = `https://www.reddit.com/r/${encodeURIComponent(subreddit.trim())}/search.json?` + 
      `q=${encodeURIComponent(query)}&restrict_sr=on&sort=${sort}&t=${timeFilter}&limit=${Math.min(limit, 100)}`
  } else {
    url = `https://www.reddit.com/search.json?` +
      `q=${encodeURIComponent(query)}&sort=${sort}&t=${timeFilter}&limit=${Math.min(limit, 100)}`
  }
  
  try {
    const data = await rateLimitedFetch(url)
    
    if (!data || !data.data || !data.data.children) {
      return []
    }
    
    return data.data.children.map(child => {
      const post = child.data
      return {
        id: post.id,
        title: post.title,
        selftext: post.selftext ? post.selftext.substring(0, 500) : '',
        author: post.author,
        subreddit: post.subreddit,
        score: post.score,
        upvote_ratio: post.upvote_ratio,
        num_comments: post.num_comments,
        created_utc: post.created_utc,
        url: `https://reddit.com${post.permalink}`,
        permalink: post.permalink,
        is_self: post.is_self,
        thumbnail: post.thumbnail,
        link_flair_text: post.link_flair_text,
        archived: post.archived,
        locked: post.locked,
        ai_visibility_score: post.score + (post.num_comments * 5)
      }
    })
  } catch (error) {
    console.error(`Error fetching search results:`, error.message)
    return []
  }
}

export async function getSubredditSuggestions(query) {
  try {
    const url = `https://www.reddit.com/api/subreddit_autocomplete_v2.json?query=${encodeURIComponent(query)}&include_over_18=false`
    const data = await rateLimitedFetch(url)
    
    if (!data.data || !data.data.children) {
      return []
    }
    
    return data.data.children
      .filter(child => child.kind === 't5')
      .map(child => ({
        name: child.data.display_name,
        title: child.data.title,
        subscribers: child.data.subscribers,
        description: child.data.public_description?.substring(0, 100) || ''
      }))
  } catch (error) {
    console.error('Subreddit search error:', error)
    return []
  }
}
