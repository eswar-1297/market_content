// OpenAI API with Web Search
// Uses web search to find REAL Reddit thread URLs

export async function searchWithOpenAI(query) {
  const apiKey = process.env.OPENAI_API_KEY
  
  console.log('\n🟢 ========== OPENAI SEARCH ==========')
  console.log('🟢 Query:', query)
  
  if (!apiKey) {
    console.log('🟢 ❌ No API key - skipping OpenAI')
    return { threads: [], source: 'openai' }
  }
  
  try {
    // Try Responses API with web search first
    console.log('🟢 Trying Responses API with web_search...')
    
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        tools: [{ type: 'web_search' }],
        input: `Search for Reddit threads about: "${query}"

Find at least 20 Reddit discussion threads related to this topic. For each thread, provide:
- The exact Reddit URL (format: https://www.reddit.com/r/subreddit/comments/id/title/)

Return as many relevant Reddit thread URLs as possible. Aim for 20 or more URLs.`
      })
    })
    
    console.log('🟢 Response status:', response.status)
    
    if (response.ok) {
      const data = await response.json()
      
      // Extract text from Responses API format
      let textContent = ''
      if (data.output) {
        data.output.forEach(item => {
          if (item.type === 'message' && item.content) {
            item.content.forEach(c => {
              if (c.type === 'output_text' || c.type === 'text') {
                textContent += c.text + '\n'
              }
            })
          }
        })
      }
      
      console.log('🟢 Response length:', textContent.length)
      console.log('🟢 Response preview:', textContent.substring(0, 500))
      
      const threads = extractRedditUrls(textContent)
      
      console.log('🟢 ✅ Extracted', threads.length, 'URLs')
      threads.slice(0, 5).forEach(t => console.log('🟢   -', t.url))
      
      console.log('🟢 ========== END OPENAI ==========\n')
      return { threads, source: 'openai' }
    }
    
    // Fallback to Chat Completions with web_search_preview
    console.log('🟢 Responses API failed, trying Chat Completions...')
    
    const fallbackResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-search-preview',
        web_search_options: {
          search_context_size: 'high'
        },
        messages: [{
          role: 'user',
          content: `Search for Reddit threads about: "${query}"

Find at least 20 Reddit discussion threads related to this topic. For each thread, provide:
- The exact Reddit URL (format: https://www.reddit.com/r/subreddit/comments/id/title/)

Return as many relevant Reddit thread URLs as possible. Aim for 20 or more URLs.`
        }]
      })
    })
    
    console.log('🟢 Fallback response status:', fallbackResponse.status)
    
    if (!fallbackResponse.ok) {
      const error = await fallbackResponse.text()
      console.log('🟢 ❌ API Error:', error)
      return { threads: [], source: 'openai' }
    }
    
    const fallbackData = await fallbackResponse.json()
    const textContent = fallbackData?.choices?.[0]?.message?.content || ''
    
    console.log('🟢 Response length:', textContent.length)
    console.log('🟢 Response preview:', textContent.substring(0, 500))
    
    const threads = extractRedditUrls(textContent)
    
    console.log('🟢 ✅ Extracted', threads.length, 'URLs')
    threads.slice(0, 5).forEach(t => console.log('🟢   -', t.url))
    
    console.log('🟢 ========== END OPENAI ==========\n')
    return { threads, source: 'openai' }
    
  } catch (error) {
    console.log('🟢 ❌ Error:', error.message)
    return { threads: [], source: 'openai' }
  }
}

function extractRedditUrls(text) {
  const threads = []
  const seenIds = new Set()
  
  // Find all Reddit URLs in the text
  const urlPattern = /https?:\/\/(?:www\.)?reddit\.com\/r\/[\w]+\/comments\/[\w]+(?:\/[\w\-_]*)?/gi
  const matches = text.match(urlPattern) || []
  
  console.log('🟢 URLs found in text:', matches.length)
  
  matches.forEach(url => {
    url = url.split('?')[0].split('#')[0]
    
    const match = url.match(/reddit\.com\/r\/([\w]+)\/comments\/([\w]+)/)
    if (!match) return
    
    const id = match[2]
    if (seenIds.has(id)) return
    
    seenIds.add(id)
    threads.push({
      id,
      subreddit: match[1],
      url: `https://www.reddit.com/r/${match[1]}/comments/${id}`,
      source: 'openai',
      ai_sources: ['openai']
    })
  })
  
  return threads
}

// ============================================
// QUORA SEARCH FUNCTIONS
// ============================================

export async function searchQuoraWithOpenAI(query) {
  const apiKey = process.env.OPENAI_API_KEY
  
  console.log('\n🟢 ========== OPENAI QUORA SEARCH ==========')
  console.log('🟢 Query:', query)
  
  if (!apiKey) {
    console.log('🟢 ❌ No API key - skipping OpenAI')
    return { questions: [], source: 'openai' }
  }
  
  try {
    // Try Responses API with web search first
    console.log('🟢 Trying Responses API with web_search...')
    
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        tools: [{ type: 'web_search' }],
        input: `Search the web for: quora "${query}"

Find REAL Quora question pages that discuss "${query}".

CRITICAL INSTRUCTIONS:
- Search for actual Quora questions indexed by search engines
- Return ONLY real URLs that exist - do NOT make up or guess URLs
- Each URL format: https://www.quora.com/Actual-Question-Title-Here
- List 10-20 different Quora question URLs if available
- If you cannot find actual Quora URLs, say so - do not fabricate them`
      })
    })
    
    console.log('🟢 Response status:', response.status)
    
    if (response.ok) {
      const data = await response.json()
      
      // Extract text from Responses API format
      let textContent = ''
      if (data.output) {
        data.output.forEach(item => {
          if (item.type === 'message' && item.content) {
            item.content.forEach(c => {
              if (c.type === 'output_text' || c.type === 'text') {
                textContent += c.text + '\n'
              }
            })
          }
        })
      }
      
      console.log('🟢 Response length:', textContent.length)
      console.log('🟢 Response preview:', textContent.substring(0, 500))
      
      const questions = extractQuoraUrls(textContent)
      
      console.log('🟢 ✅ Extracted', questions.length, 'URLs')
      questions.slice(0, 5).forEach(q => console.log('🟢   -', q.url))
      
      console.log('🟢 ========== END OPENAI QUORA ==========\n')
      return { questions, source: 'openai' }
    }
    
    // Fallback to Chat Completions with web_search_preview
    console.log('🟢 Responses API failed, trying Chat Completions...')
    
    const fallbackResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-search-preview',
        web_search_options: {
          search_context_size: 'high'
        },
        messages: [{
          role: 'user',
          content: `Search the web for: quora "${query}"

Find REAL Quora question pages that discuss "${query}".

CRITICAL INSTRUCTIONS:
- Search for actual Quora questions indexed by search engines
- Return ONLY real URLs that exist - do NOT make up or guess URLs
- Each URL format: https://www.quora.com/Actual-Question-Title-Here
- List 10-20 different Quora question URLs if available
- If you cannot find actual Quora URLs, say so - do not fabricate them`
        }]
      })
    })
    
    console.log('🟢 Fallback response status:', fallbackResponse.status)
    
    if (!fallbackResponse.ok) {
      const error = await fallbackResponse.text()
      console.log('🟢 ❌ API Error:', error)
      return { questions: [], source: 'openai' }
    }
    
    const fallbackData = await fallbackResponse.json()
    const textContent = fallbackData?.choices?.[0]?.message?.content || ''
    
    console.log('🟢 Response length:', textContent.length)
    console.log('🟢 Response preview:', textContent.substring(0, 500))
    
    const questions = extractQuoraUrls(textContent)
    
    console.log('🟢 ✅ Extracted', questions.length, 'URLs')
    questions.slice(0, 5).forEach(q => console.log('🟢   -', q.url))
    
    console.log('🟢 ========== END OPENAI QUORA ==========\n')
    return { questions, source: 'openai' }
    
  } catch (error) {
    console.log('🟢 ❌ Error:', error.message)
    return { questions: [], source: 'openai' }
  }
}

function extractQuoraUrls(text) {
  const questions = []
  const seenIds = new Set()
  
  // Find all Quora URLs in the text
  const urlPattern = /https?:\/\/(?:www\.)?quora\.com\/(?:unanswered\/)?[A-Za-z0-9\-]+(?:\/answer\/[A-Za-z0-9\-]+)?/gi
  const matches = text.match(urlPattern) || []
  
  console.log('🟢 Quora URLs found in text:', matches.length)
  
  matches.forEach(url => {
    url = url.split('?')[0].split('#')[0]
    
    const match = url.match(/quora\.com\/(?:unanswered\/)?([A-Za-z0-9\-]+)(?:\/answer\/[A-Za-z0-9\-]+)?$/i)
    if (!match) return
    
    const slug = match[1]
    
    // Skip non-question pages
    const skipPatterns = ['profile', 'topic', 'space', 'q', 'search', 'about', 'contact', 'privacy', 'terms', 'settings', 'notifications']
    if (skipPatterns.includes(slug.toLowerCase())) return
    
    // Skip very short slugs
    if (slug.length < 5) return
    
    // Skip placeholder/fake URLs that AI models sometimes generate
    const fakeSlugs = ['Exact-Question-Title', 'Question-Title-Here', 'Actual-Question-Title-Here', 'Example-Question', 'Your-Question-Here']
    if (fakeSlugs.some(fake => slug.toLowerCase() === fake.toLowerCase())) {
      console.log('🟢 Skipping fake URL:', slug)
      return
    }
    
    if (seenIds.has(slug)) return
    
    seenIds.add(slug)
    questions.push({
      id: slug,
      slug,
      url: `https://www.quora.com/${slug}`,
      title: slug.replace(/-/g, ' '),
      source: 'openai',
      ai_sources: ['openai']
    })
  })
  
  return questions
}
