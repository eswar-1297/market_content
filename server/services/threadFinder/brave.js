// Brave Search API - Find Reddit threads indexed on the web
// Free tier: 2000 queries/month

const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search'

export async function searchWithBrave(query) {
  const apiKey = process.env.BRAVE_API_KEY
  
  if (!apiKey) {
    console.log('Brave: No API key configured, skipping...')
    return { threads: [], source: 'brave' }
  }
  
  console.log('Brave: Searching for Reddit threads about:', query)
  
  try {
    // Search specifically for Reddit results
    const searchQuery = `site:reddit.com ${query}`
    
    const params = new URLSearchParams({
      q: searchQuery,
      count: 20,
      safesearch: 'moderate'
    })
    
    const response = await fetch(`${BRAVE_API_URL}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey
      }
    })
    
    if (!response.ok) {
      const error = await response.text()
      console.error('Brave API error:', response.status, error)
      return { threads: [], source: 'brave' }
    }
    
    const data = await response.json()
    
    // Extract Reddit threads from results
    const threads = extractRedditThreads(data)
    
    console.log(`Brave: Found ${threads.length} Reddit threads`)
    
    return { threads, source: 'brave' }
  } catch (error) {
    console.error('Brave search error:', error.message)
    return { threads: [], source: 'brave' }
  }
}

function extractRedditThreads(braveResponse) {
  const threads = []
  
  try {
    const results = braveResponse?.web?.results || []
    
    results.forEach(result => {
      const url = result.url
      
      // Only process Reddit thread URLs
      if (url && url.includes('reddit.com/r/') && url.includes('/comments/')) {
        const subredditMatch = url.match(/reddit\.com\/r\/([\w]+)/)
        const subreddit = subredditMatch ? subredditMatch[1] : 'unknown'
        
        const idMatch = url.match(/comments\/([\w]+)/)
        const id = idMatch ? idMatch[1] : null
        
        if (id) {
          threads.push({
            id,
            url: url.split('?')[0],
            subreddit,
            title: result.title,
            description: result.description,
            source: 'brave',
            ai_sources: ['brave']
          })
        }
      }
    })
    
    return threads
  } catch (error) {
    console.error('Error extracting Reddit threads from Brave:', error)
    return []
  }
}


