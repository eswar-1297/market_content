// AI Search for Microsoft Tech Community / Microsoft Answers
// Uses Gemini and OpenAI to find relevant thread URLs

import { containsBrandMention } from './commentChecker.js'

/**
 * Convert URL slug to readable title
 * e.g., "dropbox-to-onedrive-migration" -> "Dropbox to onedrive migration"
 */
function slugToTitle(slug) {
  if (!slug) return ''
  return decodeURIComponent(slug)
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, c => c.toUpperCase()) // Capitalize first letter
}

/**
 * Parse Microsoft Tech Community URL to extract thread info
 */
function parseMicrosoftUrl(url) {
  if (!url) return null
  
  // NEW FORMAT: Tech Community: https://techcommunity.microsoft.com/discussions/BOARD/TITLE/ID
  const newTcMatch = url.match(/techcommunity\.microsoft\.com\/discussions\/([^/]+)\/([^/]+)\/(\d+)/i)
  if (newTcMatch) {
    return {
      id: `tc-${newTcMatch[3]}`,
      threadId: newTcMatch[3],
      url: url.split('?')[0],
      forum: slugToTitle(newTcMatch[1]),
      title: slugToTitle(newTcMatch[2]),
      domain: 'techcommunity.microsoft.com',
      type: 'discussion'
    }
  }
  
  // OLD FORMAT: Tech Community: https://techcommunity.microsoft.com/t5/BOARD/TITLE/td-p/ID
  const tcMatch = url.match(/techcommunity\.microsoft\.com\/(?:t5\/)?([^/]+)\/([^/]+)\/(?:td|m|ba)-p\/(\d+)/i)
  if (tcMatch) {
    return {
      id: `tc-${tcMatch[3]}`,
      threadId: tcMatch[3],
      url: url.split('?')[0],
      forum: slugToTitle(tcMatch[1]),
      title: slugToTitle(tcMatch[2]),
      domain: 'techcommunity.microsoft.com',
      type: 'discussion'
    }
  }
  
  // Microsoft Answers: https://answers.microsoft.com/en-us/PRODUCT/forum/SUBFORUM/TITLE/GUID
  const answersMatch = url.match(/answers\.microsoft\.com\/[^/]+\/([^/]+)\/forum\/([^/]+)\/([^/]+)\/([a-f0-9-]+)/i)
  if (answersMatch) {
    return {
      id: `answers-${answersMatch[4]}`,
      threadId: answersMatch[4],
      url: url.split('?')[0],
      forum: answersMatch[1],
      title: slugToTitle(answersMatch[3]),
      domain: 'answers.microsoft.com',
      type: 'question'
    }
  }
  
  // Microsoft Answers simple: https://answers.microsoft.com/en-us/PRODUCT/thread/GUID
  const answersSimple = url.match(/answers\.microsoft\.com\/[^/]+\/([^/]+)\/thread\/([a-f0-9-]+)/i)
  if (answersSimple) {
    return {
      id: `answers-${answersSimple[2]}`,
      threadId: answersSimple[2],
      url: url.split('?')[0],
      forum: answersSimple[1],
      title: '',
      domain: 'answers.microsoft.com',
      type: 'question'
    }
  }
  
  // Microsoft Learn Q&A: https://learn.microsoft.com/en-us/answers/questions/ID/TITLE
  const learnMatch = url.match(/learn\.microsoft\.com\/[^/]+\/answers\/questions\/(\d+)\/([^/?]+)/i)
  if (learnMatch) {
    return {
      id: `learn-${learnMatch[1]}`,
      threadId: learnMatch[1],
      url: url.split('?')[0],
      forum: 'Microsoft Q&A',
      title: slugToTitle(learnMatch[2]),
      domain: 'learn.microsoft.com',
      type: 'question'
    }
  }
  
  // Generic Tech Community URL with any /discussions/ path
  if (url.includes('techcommunity.microsoft.com/discussions/')) {
    const idMatch = url.match(/\/(\d+)(?:[/?]|$)/)
    const boardMatch = url.match(/\/discussions\/([^/]+)\//)
    const titleMatch = url.match(/\/discussions\/[^/]+\/([^/]+)\//)
    return {
      id: `tc-${idMatch?.[1] || Date.now()}`,
      threadId: idMatch?.[1] || `tc-${Date.now()}`,
      url: url.split('?')[0],
      forum: boardMatch?.[1] ? slugToTitle(boardMatch[1]) : 'Tech Community',
      title: titleMatch?.[1] ? slugToTitle(titleMatch[1]) : '',
      domain: 'techcommunity.microsoft.com',
      type: 'discussion'
    }
  }
  
  // Generic Microsoft URL with thread/discussion pattern
  if (url.includes('microsoft.com') && (url.includes('/thread') || url.includes('/discussion') || url.includes('/td-p/') || url.includes('/m-p/'))) {
    const idMatch = url.match(/\/(\d+)(?:[/?]|$)/) || url.match(/([a-f0-9-]{36})/i)
    return {
      id: `ms-${idMatch?.[1] || Date.now()}`,
      threadId: idMatch?.[1] || `ms-${Date.now()}`,
      url: url.split('?')[0],
      forum: 'Microsoft',
      title: '',
      domain: new URL(url).hostname,
      type: 'thread'
    }
  }
  
  return null
}

/**
 * Extract Microsoft URLs from text
 */
function extractMicrosoftUrls(text) {
  const threads = []
  const seenUrls = new Set()
  
  // Multiple patterns to match Microsoft URLs
  const patterns = [
    // Tech Community - new format with /discussions/
    /https?:\/\/techcommunity\.microsoft\.com\/discussions\/[^\s"'<>\])+,]+/gi,
    // Tech Community - old format with /t5/
    /https?:\/\/techcommunity\.microsoft\.com\/t5\/[^\s"'<>\])+,]+/gi,
    // Tech Community - any other format
    /https?:\/\/techcommunity\.microsoft\.com\/[^\s"'<>\])+,]+/gi,
    // Microsoft Answers
    /https?:\/\/answers\.microsoft\.com\/[^\s"'<>\])+,]+/gi,
    // Microsoft Learn Q&A
    /https?:\/\/learn\.microsoft\.com\/[^/]+\/answers\/[^\s"'<>\])+,]+/gi
  ]
  
  for (const pattern of patterns) {
    const matches = text.match(pattern) || []
    for (const url of matches) {
      // Clean URL - remove trailing punctuation and brackets
      let cleanUrl = url
        .replace(/[)\]"'<>,;:]+$/, '')
        .replace(/\/+$/, '')
        .replace(/\)$/, '')
      
      // Skip if already seen
      if (seenUrls.has(cleanUrl)) continue
      
      // Skip non-thread URLs
      if (!cleanUrl.includes('/discussions/') && 
          !cleanUrl.includes('/t5/') && 
          !cleanUrl.includes('/thread/') && 
          !cleanUrl.includes('/answers/questions/') &&
          !cleanUrl.includes('/td-p/') &&
          !cleanUrl.includes('/m-p/')) {
        continue
      }
      
      seenUrls.add(cleanUrl)
      
      const thread = parseMicrosoftUrl(cleanUrl)
      if (thread) {
        threads.push(thread)
      }
    }
  }
  
  return threads
}

/**
 * Search Microsoft threads using Gemini with Google Search grounding
 */
export async function searchMicrosoftWithGemini(query) {
  const apiKey = process.env.GEMINI_API_KEY
  
  console.log('\n🔵 ========== GEMINI MICROSOFT SEARCH ==========')
  console.log('🔵 Query:', query)
  
  if (!apiKey) {
    console.log('🔵 ❌ No Gemini API key - skipping')
    return { threads: [], source: 'gemini' }
  }
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Search for: site:techcommunity.microsoft.com OR site:answers.microsoft.com OR site:learn.microsoft.com/answers ${query}

Find Microsoft Tech Community and Microsoft Answers threads about "${query}".

List ALL the thread URLs you find. Include threads from:
- techcommunity.microsoft.com (format: https://techcommunity.microsoft.com/t5/BOARD/TITLE/td-p/ID)
- answers.microsoft.com (format: https://answers.microsoft.com/...)
- learn.microsoft.com/answers (format: https://learn.microsoft.com/en-us/answers/questions/...)

Return at least 20 relevant thread URLs.`
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
    
    // Check grounding metadata for REAL URLs
    const grounding = data?.candidates?.[0]?.groundingMetadata
    let threads = []
    
    if (grounding?.groundingChunks) {
      console.log('🔵 ✅ Grounding chunks:', grounding.groundingChunks.length)
      for (const chunk of grounding.groundingChunks) {
        const uri = chunk.web?.uri
        const title = chunk.web?.title || ''
        console.log('🔵   Chunk URL:', uri?.substring(0, 80))
        
        if (uri && (uri.includes('techcommunity.microsoft.com') || 
                    uri.includes('answers.microsoft.com') || 
                    (uri.includes('learn.microsoft.com/') && uri.includes('/answers')))) {
          const thread = parseMicrosoftUrl(uri)
          if (thread) {
            thread.title = title || thread.title
            threads.push(thread)
            console.log('🔵   ✓ Parsed:', thread.url)
          } else {
            console.log('🔵   ✗ Failed to parse URL')
          }
        }
      }
    }
    
    // Also extract from text content
    const textThreads = extractMicrosoftUrls(textContent)
    
    // Merge, avoiding duplicates
    const seenUrls = new Set(threads.map(t => t.url))
    for (const t of textThreads) {
      if (!seenUrls.has(t.url)) {
        threads.push(t)
        seenUrls.add(t.url)
      }
    }
    
    // Filter out CloudFuze mentions
    threads = threads.filter(t => !containsBrandMention(`${t.title} ${t.forum}`))
    
    console.log('🔵 ✅ Found', threads.length, 'Microsoft threads')
    threads.slice(0, 5).forEach(t => console.log('🔵   -', t.url))
    console.log('🔵 ========== END GEMINI MICROSOFT ==========\n')
    
    return { threads, source: 'gemini' }
    
  } catch (error) {
    console.log('🔵 ❌ Gemini error:', error.message)
    return { threads: [], source: 'gemini' }
  }
}

/**
 * Search Microsoft threads using OpenAI with web search
 */
export async function searchMicrosoftWithOpenAI(query) {
  const apiKey = process.env.OPENAI_API_KEY
  
  console.log('\n🟢 ========== OPENAI MICROSOFT SEARCH ==========')
  console.log('🟢 Query:', query)
  
  if (!apiKey) {
    console.log('🟢 ❌ No OpenAI API key - skipping')
    return { threads: [], source: 'openai' }
  }
  
  try {
    // Try Responses API with web search
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
        input: `Search for Microsoft Tech Community and Microsoft Answers threads about: "${query}"

Find at least 20 discussion threads from:
1. techcommunity.microsoft.com - Microsoft Tech Community forums
2. answers.microsoft.com - Microsoft Answers community
3. learn.microsoft.com/answers - Microsoft Q&A

For each thread provide the exact URL. Focus on threads where users are:
- Asking questions about ${query}
- Discussing problems or solutions related to ${query}
- Sharing experiences with ${query}

Return as many relevant thread URLs as possible.`
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
      
      let threads = extractMicrosoftUrls(textContent)
      threads = threads.filter(t => !containsBrandMention(`${t.title} ${t.forum}`))
      
      console.log('🟢 ✅ Found', threads.length, 'Microsoft threads')
      threads.slice(0, 5).forEach(t => console.log('🟢   -', t.url))
      console.log('🟢 ========== END OPENAI MICROSOFT ==========\n')
      
      return { threads, source: 'openai' }
    }
    
    // Fallback to Chat Completions
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
          content: `Search for Microsoft Tech Community and Microsoft Answers threads about: "${query}"

Find discussion threads from:
- techcommunity.microsoft.com
- answers.microsoft.com  
- learn.microsoft.com/answers

Return the exact URLs of at least 15 relevant threads.`
        }]
      })
    })
    
    if (fallbackResponse.ok) {
      const data = await fallbackResponse.json()
      const textContent = data.choices?.[0]?.message?.content || ''
      
      let threads = extractMicrosoftUrls(textContent)
      threads = threads.filter(t => !containsBrandMention(`${t.title} ${t.forum}`))
      
      console.log('🟢 ✅ Found', threads.length, 'Microsoft threads (fallback)')
      console.log('🟢 ========== END OPENAI MICROSOFT ==========\n')
      
      return { threads, source: 'openai' }
    }
    
    console.log('🟢 ❌ Both APIs failed')
    return { threads: [], source: 'openai' }
    
  } catch (error) {
    console.log('🟢 ❌ OpenAI error:', error.message)
    return { threads: [], source: 'openai' }
  }
}

/**
 * Search Microsoft using both Gemini and OpenAI in parallel
 */
export async function searchMicrosoftWithAI(query) {
  console.log('\n🤖 Starting AI search for Microsoft threads...')
  
  const [geminiResult, openaiResult] = await Promise.all([
    searchMicrosoftWithGemini(query),
    searchMicrosoftWithOpenAI(query)
  ])
  
  // Combine results
  const allThreads = []
  const seenUrls = new Set()
  
  // Add Gemini threads
  for (const thread of geminiResult.threads) {
    if (!seenUrls.has(thread.url)) {
      thread.sources = ['gemini']
      allThreads.push(thread)
      seenUrls.add(thread.url)
    }
  }
  
  // Add OpenAI threads (merge if duplicate)
  for (const thread of openaiResult.threads) {
    if (seenUrls.has(thread.url)) {
      const existing = allThreads.find(t => t.url === thread.url)
      if (existing && !existing.sources.includes('openai')) {
        existing.sources.push('openai')
      }
    } else {
      thread.sources = ['openai']
      allThreads.push(thread)
      seenUrls.add(thread.url)
    }
  }
  
  console.log(`🤖 AI Total: ${allThreads.length} unique Microsoft threads`)
  console.log(`   Gemini: ${geminiResult.threads.length}, OpenAI: ${openaiResult.threads.length}`)
  
  return {
    threads: allThreads,
    stats: {
      gemini: geminiResult.threads.length,
      openai: openaiResult.threads.length,
      total: allThreads.length
    }
  }
}
