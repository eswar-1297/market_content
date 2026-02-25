// AI Search for Google Community / Google Support Forums
// Uses Gemini and OpenAI to find relevant thread URLs

import { containsBrandMention } from './commentChecker.js'

/**
 * Convert URL slug to readable title
 * e.g., "how-do-i-transfer-dropbox-files" -> "How do i transfer dropbox files"
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
 * Parse Google Groups URL
 */
function parseGoogleGroupsUrl(url) {
  if (!url || !url.includes('groups.google.com')) return null
  
  // Format: https://groups.google.com/g/GROUP_NAME/c/THREAD_ID
  const match = url.match(/groups\.google\.com\/g\/([^/]+)\/c\/([^/?#]+)/i)
  if (match) {
    const groupName = match[1].replace(/-/g, ' ')
    return {
      id: `groups-${match[2]}`,
      threadId: match[2],
      url: url.split('?')[0],
      product: match[1],
      forum: `Google Groups - ${groupName}`,
      title: `Discussion in ${groupName}`, // Fallback title
      domain: 'groups.google.com',
      type: 'discussion'
    }
  }
  
  // Legacy format: https://groups.google.com/forum/#!topic/GROUP/THREAD
  const legacyMatch = url.match(/groups\.google\.com\/forum\/#!topic\/([^/]+)\/([^/?#]+)/i)
  if (legacyMatch) {
    const groupName = legacyMatch[1].replace(/-/g, ' ')
    return {
      id: `groups-${legacyMatch[2]}`,
      threadId: legacyMatch[2],
      url: url.split('?')[0],
      product: legacyMatch[1],
      forum: `Google Groups - ${groupName}`,
      title: `Discussion in ${groupName}`, // Fallback title
      domain: 'groups.google.com',
      type: 'discussion'
    }
  }
  
  return null
}

/**
 * Parse Google Issue Tracker URL
 */
function parseIssueTrackerUrl(url) {
  if (!url || !url.includes('issuetracker.google.com')) return null
  
  // Format: https://issuetracker.google.com/issues/ISSUE_ID
  const match = url.match(/issuetracker\.google\.com\/issues\/(\d+)/i)
  if (match) {
    return {
      id: `issue-${match[1]}`,
      threadId: match[1],
      url: url.split('?')[0],
      product: 'Google Issue Tracker',
      forum: 'Issue Tracker',
      title: `Issue #${match[1]}`, // Fallback title with issue number
      domain: 'issuetracker.google.com',
      type: 'issue'
    }
  }
  
  return null
}

/**
 * Parse Google Support Community URL to extract thread info
 */
function parseGoogleCommunityUrl(url) {
  if (!url) return null
  
  // Google Support with title: https://support.google.com/PRODUCT/thread/THREAD_ID/TITLE-SLUG
  const supportWithTitleMatch = url.match(/support\.google\.com\/([^/]+)\/thread\/(\d+)\/([^/?#]+)/i)
  if (supportWithTitleMatch) {
    return {
      id: `google-${supportWithTitleMatch[2]}`,
      threadId: supportWithTitleMatch[2],
      url: url.split('?')[0],
      product: supportWithTitleMatch[1],
      forum: supportWithTitleMatch[1],
      title: slugToTitle(supportWithTitleMatch[3]),
      domain: 'support.google.com',
      type: 'thread'
    }
  }
  
  // Google Support without title: https://support.google.com/PRODUCT/thread/THREAD_ID
  const supportMatch = url.match(/support\.google\.com\/([^/]+)\/thread\/(\d+)/i)
  if (supportMatch) {
    return {
      id: `google-${supportMatch[2]}`,
      threadId: supportMatch[2],
      url: url.split('?')[0],
      product: supportMatch[1],
      forum: supportMatch[1],
      title: '',
      domain: 'support.google.com',
      type: 'thread'
    }
  }
  
  // Google Product Forums (legacy): https://productforums.google.com/forum/#!topic/PRODUCT/TOPIC_ID
  const forumMatch = url.match(/productforums\.google\.com\/[^/]*\/?(?:#!(?:topic|msg)\/)?([^/]+)\/([^/?\s]+)/i)
  if (forumMatch) {
    return {
      id: `forum-${forumMatch[2]}`,
      threadId: forumMatch[2],
      url: url.split('?')[0],
      product: forumMatch[1],
      forum: forumMatch[1],
      title: '',
      domain: 'productforums.google.com',
      type: 'thread'
    }
  }
  
  // Google Workspace Admin with title: https://support.google.com/a/thread/THREAD_ID/TITLE
  const workspaceWithTitleMatch = url.match(/support\.google\.com\/a\/thread\/(\d+)\/([^/?#]+)/i)
  if (workspaceWithTitleMatch) {
    return {
      id: `workspace-${workspaceWithTitleMatch[1]}`,
      threadId: workspaceWithTitleMatch[1],
      url: url.split('?')[0],
      product: 'Google Workspace Admin',
      forum: 'workspace-admin',
      title: slugToTitle(workspaceWithTitleMatch[2]),
      domain: 'support.google.com',
      type: 'thread'
    }
  }
  
  // Google Workspace Admin Help: https://support.google.com/a/thread/THREAD_ID
  const workspaceMatch = url.match(/support\.google\.com\/a\/thread\/(\d+)/i)
  if (workspaceMatch) {
    return {
      id: `workspace-${workspaceMatch[1]}`,
      threadId: workspaceMatch[1],
      url: url.split('?')[0],
      product: 'Google Workspace Admin',
      forum: 'workspace-admin',
      title: '',
      domain: 'support.google.com',
      type: 'thread'
    }
  }
  
  // Generic Google support URL with thread and title
  if (url.includes('support.google.com') && url.includes('/thread/')) {
    const idMatch = url.match(/\/thread\/(\d+)/)
    const productMatch = url.match(/support\.google\.com\/([^/]+)/)
    const titleMatch = url.match(/\/thread\/\d+\/([^/?#]+)/)
    return {
      id: `google-${idMatch?.[1] || Date.now()}`,
      threadId: idMatch?.[1] || `g-${Date.now()}`,
      url: url.split('?')[0],
      product: productMatch?.[1] || 'general',
      forum: productMatch?.[1] || 'general',
      title: titleMatch ? slugToTitle(titleMatch[1]) : '',
      domain: 'support.google.com',
      type: 'thread'
    }
  }
  
  return null
}

/**
 * Extract Google Community URLs from text (includes Groups and Issue Tracker)
 * Also extracts titles when provided in "TITLE: ... URL: ..." format
 */
function extractGoogleCommunityUrls(text) {
  const threads = []
  const seenIds = new Set()
  
  // First, try to extract TITLE: ... URL: ... pairs
  const titleUrlPattern = /TITLE:\s*([^\n]+)\s*\n\s*URL:\s*(https?:\/\/[^\s\n]+)/gi
  let match
  while ((match = titleUrlPattern.exec(text)) !== null) {
    const title = match[1].trim()
    let url = match[2].trim().replace(/[)\]"'<>,;:]+$/, '')
    
    let thread = null
    let threadId = null
    
    if (url.includes('groups.google.com')) {
      thread = parseGoogleGroupsUrl(url)
      threadId = thread?.threadId
    } else if (url.includes('issuetracker.google.com')) {
      thread = parseIssueTrackerUrl(url)
      threadId = thread?.threadId
    } else if (url.includes('support.google.com')) {
      thread = parseGoogleCommunityUrl(url)
      const idMatch = url.match(/\/thread\/(\d+)/)
      threadId = idMatch?.[1]
    }
    
    if (thread && threadId && !seenIds.has(threadId)) {
      thread.title = title // Use the title from AI response
      threads.push(thread)
      seenIds.add(threadId)
    }
  }
  
  // Then extract any remaining URLs without explicit titles
  const patterns = [
    // Google Support threads with title: /thread/ID/title-slug
    /https?:\/\/support\.google\.com\/[^/]+\/thread\/\d+(?:\/[a-z0-9\-%]+)?/gi,
    // Workspace admin threads with title
    /https?:\/\/support\.google\.com\/a\/thread\/\d+(?:\/[a-z0-9\-%]+)?/gi,
    // Google Product Forums
    /https?:\/\/productforums\.google\.com\/[^\s"'<>\]),]+/gi,
    // Google Groups new format
    /https?:\/\/groups\.google\.com\/g\/[^/]+\/c\/[^\s"'<>\]),]+/gi,
    // Google Groups legacy format
    /https?:\/\/groups\.google\.com\/forum\/#!topic\/[^\s"'<>\]),]+/gi,
    // Google Issue Tracker
    /https?:\/\/issuetracker\.google\.com\/issues\/\d+/gi
  ]
  
  for (const pattern of patterns) {
    const matches = text.match(pattern) || []
    for (const url of matches) {
      // Clean URL - remove trailing punctuation
      let cleanUrl = url
        .replace(/[)\]"'<>,;:]+$/, '')
        .replace(/\/+$/, '')
        .replace(/\)$/, '')
      
      // Try to parse as different URL types
      let thread = null
      let threadId = null
      
      if (cleanUrl.includes('groups.google.com')) {
        thread = parseGoogleGroupsUrl(cleanUrl)
        threadId = thread?.threadId
      } else if (cleanUrl.includes('issuetracker.google.com')) {
        thread = parseIssueTrackerUrl(cleanUrl)
        threadId = thread?.threadId
      } else {
        thread = parseGoogleCommunityUrl(cleanUrl)
        const idMatch = cleanUrl.match(/\/thread\/(\d+)/)
        threadId = idMatch?.[1]
      }
      
      // Skip if we've already seen this thread (by ID)
      if (threadId && seenIds.has(threadId)) continue
      if (threadId) seenIds.add(threadId)
      
      if (thread) {
        threads.push(thread)
      }
    }
  }
  
  return threads
}

/**
 * Search Google Community threads using Gemini with Google Search grounding
 */
export async function searchGoogleCommunityWithGemini(query) {
  const apiKey = process.env.GEMINI_API_KEY
  
  console.log('\n🔵 ========== GEMINI GOOGLE COMMUNITY SEARCH ==========')
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
            text: `Find Google community discussions about: ${query}

PRIORITIZE these sources (in order):
1. groups.google.com - Google Groups discussions (MOST IMPORTANT - many open threads here)
2. issuetracker.google.com/issues/* - Google Issue Tracker (open issues)
3. support.google.com/*/thread/* - Google Support Community (look for UNANSWERED/open threads)

REQUIREMENTS:
- ENGLISH language ONLY
- From 2025-2026 ONLY (last 12 months - recent threads are more likely to be UNLOCKED)
- MUST be OPEN for replies / UNANSWERED
- AVOID: locked threads, threads with "Recommended Answer", archived threads, anything before 2025

Focus on these Google Groups:
- google-apps-manager
- google-drive-help
- google-workspace
- google-cloud-platform
- gcp-users
- google-apps-script-community

IMPORTANT: For each thread, return BOTH the title AND URL in this format:
TITLE: [Thread title here]
URL: [Full URL here]

Example output:
TITLE: How to bulk migrate files from Dropbox to Google Drive
URL: https://groups.google.com/g/google-drive-help/c/abc123xyz

TITLE: Feature request - Dropbox connector for Workspace
URL: https://issuetracker.google.com/issues/123456789

TITLE: Need help with cloud storage migration
URL: https://support.google.com/drive/thread/987654321/cloud-storage-migration

Return at least 25 threads with their titles and URLs. Prioritize Google Groups and Issue Tracker.`
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
        
        // Handle Google Support threads
        if (uri && uri.includes('support.google.com') && uri.includes('/thread/')) {
          const thread = parseGoogleCommunityUrl(uri)
          if (thread) {
            thread.title = title
            threads.push(thread)
          }
        }
        // Handle Google Groups
        else if (uri && uri.includes('groups.google.com')) {
          const thread = parseGoogleGroupsUrl(uri)
          if (thread) {
            thread.title = title || thread.title
            threads.push(thread)
          }
        }
        // Handle Issue Tracker
        else if (uri && uri.includes('issuetracker.google.com')) {
          const thread = parseIssueTrackerUrl(uri)
          if (thread) {
            thread.title = title || thread.title
            threads.push(thread)
          }
        }
      }
    }
    
    // Also extract from text content
    const textThreads = extractGoogleCommunityUrls(textContent)
    
    // Merge, avoiding duplicates
    const seenUrls = new Set(threads.map(t => t.url))
    for (const t of textThreads) {
      if (!seenUrls.has(t.url)) {
        threads.push(t)
        seenUrls.add(t.url)
      }
    }
    
    // Filter out CloudFuze mentions
    threads = threads.filter(t => !containsBrandMention(`${t.title || ''} ${t.product}`))
    
    console.log('🔵 ✅ Found', threads.length, 'Google Community threads')
    threads.slice(0, 5).forEach(t => console.log('🔵   -', t.url))
    console.log('🔵 ========== END GEMINI GOOGLE COMMUNITY ==========\n')
    
    return { threads, source: 'gemini' }
    
  } catch (error) {
    console.log('🔵 ❌ Gemini error:', error.message)
    return { threads: [], source: 'gemini' }
  }
}

/**
 * Search Google Community threads using OpenAI with web search
 */
export async function searchGoogleCommunityWithOpenAI(query) {
  const apiKey = process.env.OPENAI_API_KEY
  
  console.log('\n🟢 ========== OPENAI GOOGLE COMMUNITY SEARCH ==========')
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
        input: `Search for Google community discussions about: "${query}"

PRIORITIZE these sources (in order of importance):

1. Google Groups: groups.google.com/g/*/c/* (MOST IMPORTANT - many open threads here)
   - Search groups: google-apps-manager, google-drive-help, google-workspace, google-cloud-platform, gcp-users
2. Google Issue Tracker: issuetracker.google.com/issues/* (open issues/feature requests)
3. Google Support Community: support.google.com/*/thread/* (only UNANSWERED/open threads)

REQUIREMENTS:
- ENGLISH language ONLY
- From 2025-2026 ONLY (last 12 months - recent threads are more likely to be UNLOCKED)
- MUST be OPEN for replies / UNANSWERED
- AVOID: locked threads, archived threads, threads with "Recommended Answer", anything before 2025

IMPORTANT: For EACH thread found, return BOTH the title AND URL like this:

TITLE: How to bulk migrate files from Dropbox to Google Drive
URL: https://groups.google.com/g/google-drive-help/c/abc123xyz

TITLE: Feature request - Dropbox integration for Workspace
URL: https://issuetracker.google.com/issues/987654321

TITLE: Need help with cloud storage migration
URL: https://support.google.com/drive/thread/123456789/cloud-migration

Return at least 25 threads. Prioritize Google Groups and Issue Tracker over Support Community.`
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
      
      let threads = extractGoogleCommunityUrls(textContent)
      threads = threads.filter(t => !containsBrandMention(`${t.title || ''} ${t.product}`))
      
      console.log('🟢 ✅ Found', threads.length, 'Google Community threads')
      threads.slice(0, 5).forEach(t => console.log('🟢   -', t.url))
      console.log('🟢 ========== END OPENAI GOOGLE COMMUNITY ==========\n')
      
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
          content: `Search for Google community discussions about: "${query}"

PRIORITIZE these sources:
1. Google Groups (groups.google.com) - MOST IMPORTANT
2. Google Issue Tracker (issuetracker.google.com/issues/*)
3. Google Support (support.google.com/*/thread/*)

Focus on:
- OPEN/unanswered threads only
- ENGLISH language only
- From 2025-2026 ONLY (last 12 months - older threads are locked)

Return TITLE and URL for each:
TITLE: [Title here]
URL: [URL here]

Return at least 20 relevant threads.`
        }]
      })
    })
    
    if (fallbackResponse.ok) {
      const data = await fallbackResponse.json()
      const textContent = data.choices?.[0]?.message?.content || ''
      
      let threads = extractGoogleCommunityUrls(textContent)
      threads = threads.filter(t => !containsBrandMention(`${t.title || ''} ${t.product}`))
      
      console.log('🟢 ✅ Found', threads.length, 'Google Community threads (fallback)')
      console.log('🟢 ========== END OPENAI GOOGLE COMMUNITY ==========\n')
      
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
 * Search Google Community using both Gemini and OpenAI in parallel
 */
export async function searchGoogleCommunityWithAI(query) {
  console.log('\n🤖 Starting AI search for Google Community threads...')
  
  const [geminiResult, openaiResult] = await Promise.all([
    searchGoogleCommunityWithGemini(query),
    searchGoogleCommunityWithOpenAI(query)
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
  
  console.log(`🤖 AI Total: ${allThreads.length} unique Google Community threads`)
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
