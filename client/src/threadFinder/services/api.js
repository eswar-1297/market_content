const API_BASE = '/api/threads'

// Basic Reddit search
export async function searchThreads({ 
  query, 
  subreddit, 
  timeFilter, 
  sort, 
  limit = 200,
  minScore = 0,
  minComments = 0,
  aiOptimized = false 
}) {
  const params = new URLSearchParams({
    q: query,
    ...(subreddit && { subreddit }),
    ...(timeFilter && { time: timeFilter }),
    ...(sort && { sort }),
    limit: limit.toString(),
    minScore: minScore.toString(),
    minComments: minComments.toString(),
    aiOptimized: aiOptimized.toString()
  })

  const response = await fetch(`${API_BASE}/search?${params}`)
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to search threads')
  }
  
  return response.json()
}

// AI Cross-Reference search (Gemini + OpenAI + Google)
export async function searchAIThreads({
  query,
  minScore = 0,
  minComments = 0,
  limit = 150,
  useGemini = true,
  useOpenAI = true,
  useGoogle = true
}) {
  const params = new URLSearchParams({
    q: query,
    minScore: minScore.toString(),
    minComments: minComments.toString(),
    limit: limit.toString(),
    gemini: useGemini.toString(),
    openai: useOpenAI.toString(),
    google: useGoogle.toString()
  })

  const response = await fetch(`${API_BASE}/search/ai?${params}`)
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to search AI threads')
  }
  
  return response.json()
}

// Quora search using Search APIs (Bing + Google CSE)
export async function searchQuoraQuestions({
  query,
  limit = 150,
  useBing = true,
  useGoogle = true,
  timeFilter = 'all'
}) {
  const params = new URLSearchParams({
    q: query,
    limit: limit.toString(),
    bing: useBing.toString(),
    google: useGoogle.toString(),
    time: timeFilter
  })

  const response = await fetch(`${API_BASE}/search/quora?${params}`)
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to search Quora questions')
  }
  
  return response.json()
}

// Google Community search using Search APIs (Bing + Google CSE)
export async function searchGoogleCommunityQuestions({
  query,
  limit = 150,
  useBing = true,
  useGoogle = true,
  timeFilter = 'all',
  productFilter = 'all'
}) {
  const params = new URLSearchParams({
    q: query,
    limit: limit.toString(),
    bing: useBing.toString(),
    google: useGoogle.toString(),
    time: timeFilter,
    product: productFilter
  })

  const response = await fetch(`${API_BASE}/search/google-community?${params}`)
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to search Google Community questions')
  }
  
  return response.json()
}

// COMMENTED OUT: Stack Overflow search - temporarily disabled
// export async function searchStackOverflowQuestions({
//   query,
//   limit = 150,
//   useStackExchange = true,
//   useBing = true,
//   useGoogle = true,
//   timeFilter = 'all',
//   tags = '',
//   minScore = 0,
//   minAnswers = 0
// }) {
//   const params = new URLSearchParams({
//     q: query,
//     limit: limit.toString(),
//     stackexchange: useStackExchange.toString(),
//     bing: useBing.toString(),
//     google: useGoogle.toString(),
//     time: timeFilter,
//     ...(tags && { tags }),
//     minScore: minScore.toString(),
//     minAnswers: minAnswers.toString()
//   })
//
//   const response = await fetch(`${API_BASE}/search/stackoverflow?${params}`)
//   
//   if (!response.ok) {
//     const error = await response.json()
//     throw new Error(error.message || 'Failed to search Stack Overflow questions')
//   }
//   
//   return response.json()
// }

// Microsoft Tech Community search using Bing + Google CSE
export async function searchMicrosoftTechQuestions({
  query,
  limit = 150,
  useBing = true,
  useGoogle = true,
  timeFilter = 'all',
  productFilter = 'all'
}) {
  const params = new URLSearchParams({
    q: query,
    limit: limit.toString(),
    bing: useBing.toString(),
    google: useGoogle.toString(),
    time: timeFilter,
    product: productFilter
  })

  const response = await fetch(`${API_BASE}/search/microsoft-tech?${params}`)
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to search Microsoft Tech Community')
  }
  
  return response.json()
}

// COMMENTED OUT: Hacker News search - temporarily disabled
// export async function searchHackerNewsStories({
//   query,
//   limit = 150,
//   useHackerNews = true,
//   useBing = true,
//   useGoogle = true,
//   timeFilter = 'all',
//   storyType = 'all',
//   minPoints = 0
// }) {
//   const params = new URLSearchParams({
//     q: query,
//     limit: limit.toString(),
//     hn: useHackerNews.toString(),
//     bing: useBing.toString(),
//     google: useGoogle.toString(),
//     time: timeFilter,
//     type: storyType,
//     minPoints: minPoints.toString()
//   })
//
//   const response = await fetch(`${API_BASE}/search/hackernews?${params}`)
//   
//   if (!response.ok) {
//     const error = await response.json()
//     throw new Error(error.message || 'Failed to search Hacker News')
//   }
//   
//   return response.json()
// }

// COMMENTED OUT: Spiceworks search - temporarily disabled
// export async function searchSpiceworksTopics({
//   query,
//   limit = 150,
//   useBing = true,
//   useGoogle = true,
//   timeFilter = 'all',
//   categoryFilter = 'all'
// }) {
//   const params = new URLSearchParams({
//     q: query,
//     limit: limit.toString(),
//     bing: useBing.toString(),
//     google: useGoogle.toString(),
//     time: timeFilter,
//     category: categoryFilter
//   })
//
//   const response = await fetch(`${API_BASE}/search/spiceworks?${params}`)
//   
//   if (!response.ok) {
//     const error = await response.json()
//     throw new Error(error.message || 'Failed to search Spiceworks')
//   }
//   
//   return response.json()
// }

// COMMENTED OUT: Product Hunt search - temporarily disabled
// export async function searchProductHuntPosts({
//   query,
//   limit = 150,
//   useBing = true,
//   useGoogle = true,
//   timeFilter = 'all',
//   contentType = 'all'
// }) {
//   const params = new URLSearchParams({
//     q: query,
//     limit: limit.toString(),
//     bing: useBing.toString(),
//     google: useGoogle.toString(),
//     time: timeFilter,
//     type: contentType
//   })
//
//   const response = await fetch(`${API_BASE}/search/producthunt?${params}`)
//   
//   if (!response.ok) {
//     const error = await response.json()
//     throw new Error(error.message || 'Failed to search Product Hunt')
//   }
//   
//   return response.json()
// }

// COMMENTED OUT: GitHub Discussions search - temporarily disabled
// export async function searchGitHubItems({
//   query,
//   limit = 150,
//   useGitHub = true,
//   useBing = true,
//   useGoogle = true,
//   timeFilter = 'all',
//   contentType = 'all'
// }) {
//   const params = new URLSearchParams({
//     q: query,
//     limit: limit.toString(),
//     gh: useGitHub.toString(),
//     bing: useBing.toString(),
//     google: useGoogle.toString(),
//     time: timeFilter,
//     type: contentType
//   })
//
//   const response = await fetch(`${API_BASE}/search/github?${params}`)
//   
//   if (!response.ok) {
//     const error = await response.json()
//     throw new Error(error.message || 'Failed to search GitHub')
//   }
//   
//   return response.json()
// }

export async function getBookmarks() {
  const response = await fetch(`${API_BASE}/bookmarks`)
  
  if (!response.ok) {
    throw new Error('Failed to fetch bookmarks')
  }
  
  return response.json()
}

export async function addBookmark(thread, notes = '') {
  const response = await fetch(`${API_BASE}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thread, notes })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to add bookmark')
  }
  
  return response.json()
}

export async function updateBookmark(id, updates) {
  const response = await fetch(`${API_BASE}/bookmarks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  })
  
  if (!response.ok) {
    throw new Error('Failed to update bookmark')
  }
  
  return response.json()
}

export async function deleteBookmark(id) {
  const response = await fetch(`${API_BASE}/bookmarks/${id}`, {
    method: 'DELETE'
  })
  
  if (!response.ok) {
    throw new Error('Failed to delete bookmark')
  }
  
  return response.json()
}

export async function exportBookmarks(format = 'csv') {
  const response = await fetch(`${API_BASE}/bookmarks/export?format=${format}`)
  
  if (!response.ok) {
    throw new Error('Failed to export bookmarks')
  }
  
  return response.blob()
}
