// Gemini API with Google Search grounding
// Extracts REAL URLs from grounding metadata (actual Google search results)

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

export async function searchWithGemini(query) {
  const apiKey = process.env.GEMINI_API_KEY
  
  console.log('\n🔵 ========== GEMINI SEARCH ==========')
  console.log('🔵 Query:', query)
  
  if (!apiKey) {
    console.log('🔵 ❌ No API key - skipping Gemini')
    return { threads: [], source: 'gemini' }
  }
  
  try {
    // Use Google Search grounding with explicit search request
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Search for: site:reddit.com ${query}

Find Reddit discussion threads about "${query}". 
List the Reddit thread URLs you find from search results.
Format each URL as: https://www.reddit.com/r/subreddit/comments/postid/title/`
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192
        },
        tools: [{
          google_search: {}
        }]
      })
    })
    
    console.log('🔵 Response status:', response.status)
    
    if (!response.ok) {
      const error = await response.text()
      console.log('🔵 ❌ API Error:', error)
      return { threads: [], source: 'gemini' }
    }
    
    const data = await response.json()
    
    // Get all text parts
    const parts = data?.candidates?.[0]?.content?.parts || []
    let textContent = parts.map(p => p.text || '').join('\n')
    
    console.log('🔵 Response length:', textContent.length)
    console.log('🔵 Response preview:', textContent.substring(0, 500))
    
    // Check grounding metadata for REAL URLs
    const grounding = data?.candidates?.[0]?.groundingMetadata
    let threads = []
    
    if (grounding) {
      console.log('🔵 ✅ Grounding metadata found')
      
      // Extract from grounding chunks (may be redirect URLs or direct URLs)
      if (grounding.groundingChunks) {
        console.log('🔵 Grounding chunks:', grounding.groundingChunks.length)
        for (const chunk of grounding.groundingChunks) {
          const uri = chunk.web?.uri
          const title = chunk.web?.title || ''
          
          if (uri) {
            console.log('🔵 Chunk:', title.substring(0, 50), '|', uri.substring(0, 80))
            
            // Direct Reddit URL
            if (uri.includes('reddit.com') && uri.includes('/comments/')) {
              const thread = parseRedditUrl(uri)
              if (thread) threads.push(thread)
            }
            // Redirect URL - try to follow it
            else if (uri.includes('grounding-api-redirect')) {
              try {
                const realUrl = await followRedirect(uri)
                if (realUrl && realUrl.includes('reddit.com') && realUrl.includes('/comments/')) {
                  console.log('🔵 Redirect resolved:', realUrl)
                  const thread = parseRedditUrl(realUrl)
                  if (thread) threads.push(thread)
                }
              } catch (e) {
                // Skip if redirect fails
              }
            }
          }
        }
      }
      
      // Extract from search entry point HTML
      if (grounding.searchEntryPoint?.renderedContent) {
        const html = grounding.searchEntryPoint.renderedContent
        const urlMatches = html.match(/https?:\/\/(?:www\.)?reddit\.com\/r\/[\w]+\/comments\/[\w]+[^"'\s<>]*/gi) || []
        console.log('🔵 URLs from search entry HTML:', urlMatches.length)
        urlMatches.forEach(url => {
          const thread = parseRedditUrl(url)
          if (thread && !threads.find(t => t.id === thread.id)) {
            threads.push(thread)
          }
        })
      }
      
      // Extract from grounding supports
      if (grounding.groundingSupports) {
        grounding.groundingSupports.forEach(support => {
          const uri = support.segment?.text
          if (uri && uri.includes('reddit.com')) {
            const matches = uri.match(/https?:\/\/(?:www\.)?reddit\.com\/r\/[\w]+\/comments\/[\w]+[^\s]*/gi) || []
            matches.forEach(url => {
              const thread = parseRedditUrl(url)
              if (thread && !threads.find(t => t.id === thread.id)) {
                threads.push(thread)
              }
            })
          }
        })
      }
      
      console.log('🔵 URLs from grounding:', threads.length)
    }
    
    // Also extract from generated text (as fallback)
    const textUrls = extractUrlsFromText(textContent)
    console.log('🔵 URLs from text:', textUrls.length)
    
    textUrls.forEach(thread => {
      if (!threads.find(t => t.id === thread.id)) {
        threads.push(thread)
      }
    })
    
    console.log('🔵 ✅ Total extracted:', threads.length, 'URLs')
    threads.slice(0, 5).forEach(t => console.log('🔵   -', t.url))
    
    console.log('🔵 ========== END GEMINI ==========\n')
    return { threads, source: 'gemini' }
    
  } catch (error) {
    console.log('🔵 ❌ Error:', error.message)
    return { threads: [], source: 'gemini' }
  }
}

// Follow redirect URL to get the real destination
async function followRedirect(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'RedditThreadFinder/1.0' }
    })
    return response.url
  } catch {
    // Try GET if HEAD fails
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'RedditThreadFinder/1.0' }
      })
      return response.url
    } catch {
      return null
    }
  }
}

function parseRedditUrl(url) {
  try {
    url = url.split('?')[0].split('#')[0]
    const match = url.match(/reddit\.com\/r\/([\w]+)\/comments\/([\w]+)/)
    if (!match) return null
    
    const id = match[2]
    
    // Skip fake/placeholder IDs
    if (id === 'postid' || id === 'id' || id.length < 5) {
      return null
    }
    
    return {
      id,
      subreddit: match[1],
      url: `https://www.reddit.com/r/${match[1]}/comments/${id}`,
      source: 'gemini',
      ai_sources: ['gemini']
    }
  } catch {
    return null
  }
}

function extractUrlsFromText(text) {
  const threads = []
  const seenIds = new Set()
  
  const urlPattern = /https?:\/\/(?:www\.)?reddit\.com\/r\/[\w]+\/comments\/[\w]+(?:\/[\w\-_]*)?/gi
  const matches = text.match(urlPattern) || []
  
  matches.forEach(url => {
    const thread = parseRedditUrl(url)
    if (thread && !seenIds.has(thread.id)) {
      seenIds.add(thread.id)
      threads.push(thread)
    }
  })
  
  return threads
}

// ============================================
// QUORA SEARCH FUNCTIONS
// ============================================

export async function searchQuoraWithGemini(query) {
  const apiKey = process.env.GEMINI_API_KEY
  
  console.log('\n🔵 ========== GEMINI QUORA SEARCH ==========')
  console.log('🔵 Query:', query)
  
  if (!apiKey) {
    console.log('🔵 ❌ No API key - skipping Gemini')
    return { questions: [], source: 'gemini' }
  }
  
  try {
    // Use Google Search grounding with Quora site search
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Search Google for: quora "${query}"

I need you to find REAL Quora question pages that discuss "${query}".

IMPORTANT: 
- Search for actual Quora questions indexed by Google
- Return the EXACT URLs you find, not summaries
- Each URL should be like: https://www.quora.com/How-do-I-migrate-from-Teams-to-Slack
- List at least 10-20 different Quora question URLs if available
- Do NOT make up URLs - only return URLs that actually exist in search results`
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192
        },
        tools: [{
          google_search: {}
        }]
      })
    })
    
    console.log('🔵 Response status:', response.status)
    
    if (!response.ok) {
      const error = await response.text()
      console.log('🔵 ❌ API Error:', error)
      return { questions: [], source: 'gemini' }
    }
    
    const data = await response.json()
    
    // Get all text parts
    const parts = data?.candidates?.[0]?.content?.parts || []
    let textContent = parts.map(p => p.text || '').join('\n')
    
    console.log('🔵 Response length:', textContent.length)
    console.log('🔵 Response preview:', textContent.substring(0, 500))
    
    // Check grounding metadata for REAL URLs
    const grounding = data?.candidates?.[0]?.groundingMetadata
    let questions = []
    
    if (grounding) {
      console.log('🔵 ✅ Grounding metadata found')
      
      // Extract from grounding chunks
      if (grounding.groundingChunks) {
        console.log('🔵 Grounding chunks:', grounding.groundingChunks.length)
        for (const chunk of grounding.groundingChunks) {
          const uri = chunk.web?.uri
          const title = chunk.web?.title || ''
          
          if (uri) {
            console.log('🔵 Chunk:', title.substring(0, 50), '|', uri.substring(0, 80))
            
            // Direct Quora URL
            if (uri.includes('quora.com') && !uri.includes('/profile/') && !uri.includes('/topic/')) {
              const question = parseQuoraUrlForGemini(uri, title)
              if (question) questions.push(question)
            }
            // Redirect URL - try to follow it
            else if (uri.includes('grounding-api-redirect')) {
              try {
                const realUrl = await followRedirect(uri)
                if (realUrl && realUrl.includes('quora.com')) {
                  console.log('🔵 Redirect resolved:', realUrl)
                  const question = parseQuoraUrlForGemini(realUrl, title)
                  if (question) questions.push(question)
                }
              } catch (e) {
                // Skip if redirect fails
              }
            }
          }
        }
      }
      
      // Extract from search entry point HTML
      if (grounding.searchEntryPoint?.renderedContent) {
        const html = grounding.searchEntryPoint.renderedContent
        const urlMatches = html.match(/https?:\/\/(?:www\.)?quora\.com\/[A-Za-z0-9\-]+[^"'\s<>]*/gi) || []
        console.log('🔵 URLs from search entry HTML:', urlMatches.length)
        urlMatches.forEach(url => {
          const question = parseQuoraUrlForGemini(url)
          if (question && !questions.find(q => q.id === question.id)) {
            questions.push(question)
          }
        })
      }
      
      console.log('🔵 URLs from grounding:', questions.length)
    }
    
    // Also extract from generated text (as fallback)
    const textUrls = extractQuoraUrlsFromText(textContent)
    console.log('🔵 URLs from text:', textUrls.length)
    
    textUrls.forEach(question => {
      if (!questions.find(q => q.id === question.id)) {
        questions.push(question)
      }
    })
    
    console.log('🔵 ✅ Total extracted:', questions.length, 'URLs')
    questions.slice(0, 5).forEach(q => console.log('🔵   -', q.url))
    
    console.log('🔵 ========== END GEMINI QUORA ==========\n')
    return { questions, source: 'gemini' }
    
  } catch (error) {
    console.log('🔵 ❌ Error:', error.message)
    return { questions: [], source: 'gemini' }
  }
}

function parseQuoraUrlForGemini(url, title = '') {
  try {
    url = url.split('?')[0].split('#')[0]
    
    // Match Quora question URLs
    const match = url.match(/quora\.com\/(?:unanswered\/)?([A-Za-z0-9\-]+)(?:\/answer\/[A-Za-z0-9\-]+)?$/i)
    if (!match) return null
    
    const slug = match[1]
    
    // Skip non-question pages
    const skipPatterns = ['profile', 'topic', 'space', 'q', 'search', 'about', 'contact', 'privacy', 'terms', 'settings', 'notifications']
    if (skipPatterns.includes(slug.toLowerCase())) {
      return null
    }
    
    // Skip very short slugs
    if (slug.length < 5) {
      return null
    }
    
    // Skip placeholder/fake URLs that AI models sometimes generate
    const fakeSlugs = ['Exact-Question-Title', 'Question-Title-Here', 'Actual-Question-Title-Here', 'Example-Question', 'Your-Question-Here']
    if (fakeSlugs.some(fake => slug.toLowerCase() === fake.toLowerCase())) {
      console.log('🔵 Skipping fake URL:', slug)
      return null
    }
    
    // Convert slug to readable title, or use provided title
    const questionTitle = title || slug.replace(/-/g, ' ')
    
    return {
      id: slug,
      slug,
      url: `https://www.quora.com/${slug}`,
      title: questionTitle,
      source: 'gemini',
      ai_sources: ['gemini']
    }
  } catch {
    return null
  }
}

function extractQuoraUrlsFromText(text) {
  const questions = []
  const seenIds = new Set()
  
  const urlPattern = /https?:\/\/(?:www\.)?quora\.com\/(?:unanswered\/)?[A-Za-z0-9\-]+(?:\/answer\/[A-Za-z0-9\-]+)?/gi
  const matches = text.match(urlPattern) || []
  
  matches.forEach(url => {
    const question = parseQuoraUrlForGemini(url)
    if (question && !seenIds.has(question.id)) {
      seenIds.add(question.id)
      questions.push(question)
    }
  })
  
  return questions
}
