import { Router } from 'express'
import { searchReddit, getSubredditSuggestions } from '../services/threadFinder/reddit.js'
import { crossReferenceSearch } from '../services/threadFinder/crossReference.js'
import { crossReferenceQuoraSearch } from '../services/threadFinder/crossReferenceQuora.js'
import { crossReferenceGoogleCommunitySearch } from '../services/threadFinder/crossReferenceGoogleCommunity.js'
import { crossReferenceMicrosoftTechSearch } from '../services/threadFinder/crossReferenceMicrosoftTech.js'
import {
  getAllBookmarks,
  getBookmarkById,
  getBookmarkByRedditId,
  createBookmark,
  updateBookmark,
  deleteBookmark
} from '../db/database.js'

const router = Router()

// ═══ SEARCH ROUTES ═══

router.get('/search', async (req, res, next) => {
  try {
    const { q, subreddit, time, sort, limit, minScore, minComments, aiOptimized } = req.query
    if (!q || !q.trim()) return res.status(400).json({ message: 'Search query is required' })

    const results = await searchReddit({
      query: q.trim(),
      subreddit: subreddit?.trim(),
      timeFilter: time || 'all',
      sort: sort || 'relevance',
      limit: parseInt(limit) || 200,
      minScore: parseInt(minScore) || 0,
      minComments: parseInt(minComments) || 0,
      aiOptimized: aiOptimized === 'true'
    })
    res.json(results)
  } catch (error) { next(error) }
})

router.get('/search/ai', async (req, res, next) => {
  try {
    const { q, minScore, minComments, limit, gemini, openai, google } = req.query
    if (!q || !q.trim()) return res.status(400).json({ message: 'Search query is required' })

    console.log('\n🔍 AI Cross-Reference Search Request')
    console.log('Query:', q)

    const results = await crossReferenceSearch(q.trim(), {
      includeGemini: gemini !== 'false',
      includeOpenAI: openai !== 'false',
      includeGoogle: google !== 'false',
      minScore: parseInt(minScore) || 0,
      minComments: parseInt(minComments) || 0,
      limit: parseInt(limit) || 150
    })
    res.json(results)
  } catch (error) {
    console.error('AI search error:', error)
    next(error)
  }
})

router.get('/search/quora', async (req, res, next) => {
  try {
    const { q, limit, bing, google, cache, time } = req.query
    if (!q || !q.trim()) return res.status(400).json({ message: 'Search query is required' })

    console.log('\n🔍 Quora Search API Request')
    console.log('Query:', q)

    const results = await crossReferenceQuoraSearch(q.trim(), {
      useBing: bing !== 'false',
      useGoogle: google !== 'false',
      useCache: cache !== 'false',
      limit: parseInt(limit) || 150,
      timeFilter: time || 'all'
    })
    res.json(results)
  } catch (error) {
    console.error('Quora search error:', error)
    next(error)
  }
})

router.get('/search/google-community', async (req, res, next) => {
  try {
    const { q, limit, bing, google, time, product } = req.query
    if (!q || !q.trim()) return res.status(400).json({ message: 'Search query is required' })

    console.log('\n🔍 Google Community Search API Request')
    console.log('Query:', q)

    const results = await crossReferenceGoogleCommunitySearch(q.trim(), {
      useBing: bing !== 'false',
      useGoogle: google !== 'false',
      limit: parseInt(limit) || 150,
      timeFilter: time || 'all',
      productFilter: product || 'all'
    })
    res.json(results)
  } catch (error) {
    console.error('Google Community search error:', error)
    next(error)
  }
})

router.get('/search/microsoft-tech', async (req, res, next) => {
  try {
    const { q, limit, bing, google, time, product } = req.query
    if (!q || !q.trim()) return res.status(400).json({ message: 'Search query is required' })

    console.log('\n🔍 Microsoft Tech Community Search API Request')
    console.log('Query:', q)

    const results = await crossReferenceMicrosoftTechSearch(q.trim(), {
      useBing: bing !== 'false',
      useGoogle: google !== 'false',
      limit: parseInt(limit) || 150,
      timeFilter: time || 'all',
      productFilter: product || 'all'
    })
    res.json(results)
  } catch (error) {
    console.error('Microsoft Tech Community search error:', error)
    next(error)
  }
})

router.get('/search/subreddits', async (req, res, next) => {
  try {
    const { q } = req.query
    if (!q || !q.trim()) return res.json([])
    const suggestions = await getSubredditSuggestions(q.trim())
    res.json(suggestions)
  } catch (error) { next(error) }
})

// ═══ BOOKMARK ROUTES ═══

router.get('/bookmarks/export', async (req, res) => {
  try {
    const bookmarks = await getAllBookmarks()
    const headers = ['ID', 'Title', 'Subreddit', 'Author', 'Score', 'Comments', 'Status', 'Notes', 'URL', 'Saved Date']
    const rows = bookmarks.map(b => [
      b.id,
      `"${(b.title || '').replace(/"/g, '""')}"`,
      b.subreddit,
      b.author,
      b.score,
      b.num_comments,
      b.status,
      `"${(b.notes || '').replace(/"/g, '""')}"`,
      b.url,
      b.created_at
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="bookmarks-${new Date().toISOString().split('T')[0]}.csv"`)
    res.send(csv)
  } catch (error) {
    res.status(500).json({ message: 'Failed to export bookmarks' })
  }
})

router.get('/bookmarks', async (req, res) => {
  try {
    const bookmarks = await getAllBookmarks()
    res.json(bookmarks)
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch bookmarks' })
  }
})

router.get('/bookmarks/:id', async (req, res) => {
  try {
    const bookmark = await getBookmarkById(req.params.id)
    if (!bookmark) return res.status(404).json({ message: 'Bookmark not found' })
    res.json(bookmark)
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch bookmark' })
  }
})

router.post('/bookmarks', async (req, res) => {
  try {
    const { thread, notes } = req.body
    if (!thread || !thread.id) return res.status(400).json({ message: 'Thread data is required' })

    const existing = await getBookmarkByRedditId(thread.id)
    if (existing) return res.status(409).json({ message: 'Thread already bookmarked', bookmark: existing })

    const bookmark = await createBookmark(thread, notes || '')
    res.status(201).json(bookmark)
  } catch (error) {
    res.status(500).json({ message: 'Failed to create bookmark' })
  }
})

router.patch('/bookmarks/:id', async (req, res) => {
  try {
    const existing = await getBookmarkById(req.params.id)
    if (!existing) return res.status(404).json({ message: 'Bookmark not found' })
    const bookmark = await updateBookmark(req.params.id, req.body)
    res.json(bookmark)
  } catch (error) {
    res.status(500).json({ message: 'Failed to update bookmark' })
  }
})

router.delete('/bookmarks/:id', async (req, res) => {
  try {
    const existing = await getBookmarkById(req.params.id)
    if (!existing) return res.status(404).json({ message: 'Bookmark not found' })
    await deleteBookmark(req.params.id)
    res.json({ message: 'Bookmark deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete bookmark' })
  }
})

export default router
