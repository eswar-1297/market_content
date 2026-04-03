// Reddit API with OAuth support (required since 2024)
// Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env for authenticated access
// Falls back to unauthenticated .json endpoint if no credentials (may get 403)

const APP_USER_AGENT = `CloudFuzeContentAgent/1.0 (by /u/${process.env.REDDIT_USERNAME || 'contentmarketing'})`

// OAuth token cache
let oauthToken = null
let tokenExpiry = 0

async function getRedditToken() {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  // Return cached token if still valid
  if (oauthToken && Date.now() < tokenExpiry) return oauthToken

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': APP_USER_AGENT
      },
      body: 'grant_type=client_credentials'
    })
    if (!res.ok) {
      console.error('Reddit OAuth failed:', res.status)
      return null
    }
    const data = await res.json()
    oauthToken = data.access_token
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
    console.log('Reddit OAuth token acquired, expires in', data.expires_in, 's')
    return oauthToken
  } catch (e) {
    console.error('Reddit OAuth error:', e.message)
    return null
  }
}

// Rate limiting helper
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 1200

async function rateLimitedFetch(url) {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest))
  }
  lastRequestTime = Date.now()

  const token = await getRedditToken()

  if (token) {
    // Use OAuth endpoint (oauth.reddit.com)
    const oauthUrl = url.replace('https://www.reddit.com/', 'https://oauth.reddit.com/')
    console.log('Fetching (OAuth):', oauthUrl.substring(0, 100) + '...')
    const response = await fetch(oauthUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': APP_USER_AGENT,
        'Accept': 'application/json'
      }
    })
    if (response.ok) return response.json()
    // If OAuth fails, token might be expired — clear and retry without auth
    console.warn('Reddit OAuth request failed:', response.status, '— falling back to public API')
    oauthToken = null
  }

  // Fallback: unauthenticated (may get 403)
  console.log('Fetching (public):', url.substring(0, 100) + '...')
  const response = await fetch(url, {
    headers: {
      'User-Agent': APP_USER_AGENT,
      'Accept': 'application/json'
    }
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Reddit API blocked (403). Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to .env for OAuth access. Create an app at https://www.reddit.com/prefs/apps/')
    }
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

// --- Google CSE search for Reddit threads ---
async function fetchRedditViaCSE(query, subreddit) {
  const cseKey = process.env.GOOGLE_CSE_KEY
  const cseCx = process.env.GOOGLE_CSE_CX
  if (!cseKey || !cseCx) return []

  const siteQuery = subreddit
    ? `site:reddit.com/r/${subreddit} ${query}`
    : `site:reddit.com ${query}`

  try {
    console.log(`  Reddit (CSE): "${siteQuery.substring(0, 60)}..."`)
    const url = `https://www.googleapis.com/customsearch/v1?key=${cseKey}&cx=${cseCx}&q=${encodeURIComponent(siteQuery)}&num=10`
    const res = await fetch(url, { timeout: 8000 })
    if (!res.ok) return []
    const data = await res.json()

    return (data.items || [])
      .filter(item => item.link && item.link.includes('reddit.com/r/') && item.link.includes('/comments/'))
      .map(item => {
        // Extract subreddit and post id from URL
        const match = item.link.match(/reddit\.com\/r\/([^/]+)\/comments\/([^/]+)/)
        return {
          id: match?.[2] || item.link,
          title: item.title?.replace(/ : .*$/, '').replace(/ - Reddit$/, '') || '',
          selftext: item.snippet || '',
          author: '',
          subreddit: match?.[1] || '',
          score: 0,
          upvote_ratio: 0,
          num_comments: 0,
          created_utc: 0,
          url: item.link,
          permalink: item.link.replace('https://www.reddit.com', '').replace('https://reddit.com', ''),
          is_self: true,
          thumbnail: '',
          link_flair_text: '',
          archived: false,
          locked: false,
          ai_visibility_score: 10,
          source: 'google_cse'
        }
      })
  } catch (e) {
    console.error('  Reddit CSE error:', e.message)
    return []
  }
}

// --- Direct Reddit API search ---
async function fetchRedditDirect(query, subreddit, timeFilter, sort, limit) {
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
    if (!data || !data.data || !data.data.children) return []

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
        ai_visibility_score: post.score + (post.num_comments * 5),
        source: 'reddit_api'
      }
    })
  } catch (error) {
    console.error(`  Reddit API error:`, error.message)
    return []
  }
}

// --- Hybrid: try both in parallel, merge & deduplicate ---
async function fetchRedditSearch(query, subreddit, timeFilter, sort, limit) {
  const [directResults, cseResults] = await Promise.allSettled([
    fetchRedditDirect(query, subreddit, timeFilter, sort, limit),
    fetchRedditViaCSE(query, subreddit)
  ])

  const direct = directResults.status === 'fulfilled' ? directResults.value : []
  const cse = cseResults.status === 'fulfilled' ? cseResults.value : []

  if (direct.length > 0) console.log(`  Reddit API: ${direct.length} results`)
  if (cse.length > 0) console.log(`  Reddit CSE: ${cse.length} results`)

  // Merge and deduplicate by id
  const seen = new Map()
  // Direct API results are richer (score, comments, author) — prefer them
  for (const r of direct) { if (!seen.has(r.id)) seen.set(r.id, r) }
  for (const r of cse) { if (!seen.has(r.id)) seen.set(r.id, r) }

  const merged = Array.from(seen.values())
  console.log(`  Reddit total (merged): ${merged.length} unique threads`)
  return merged
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
