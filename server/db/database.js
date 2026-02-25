// In-memory bookmark database (replaces PostgreSQL)
// Data persists across requests but resets on server restart

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dirname, 'bookmarks.json')

let bookmarks = []
let nextId = 1

function loadFromDisk() {
  try {
    if (existsSync(DATA_FILE)) {
      const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
      bookmarks = data.bookmarks || []
      nextId = data.nextId || (bookmarks.length > 0 ? Math.max(...bookmarks.map(b => b.id)) + 1 : 1)
    }
  } catch {
    bookmarks = []
    nextId = 1
  }
}

function saveToDisk() {
  try {
    writeFileSync(DATA_FILE, JSON.stringify({ bookmarks, nextId }, null, 2))
  } catch (err) {
    console.warn('Failed to persist bookmarks:', err.message)
  }
}

export async function initializeDatabase() {
  loadFromDisk()
  console.log(`📦 Bookmark database initialized (${bookmarks.length} bookmarks loaded)`)
}

export async function getAllBookmarks() {
  return [...bookmarks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function getBookmarkById(id) {
  return bookmarks.find(b => b.id === parseInt(id)) || null
}

export async function getBookmarkByRedditId(redditId) {
  return bookmarks.find(b => b.reddit_id === redditId) || null
}

export async function createBookmark(thread, notes = '') {
  const bookmark = {
    id: nextId++,
    reddit_id: thread.id,
    title: thread.title,
    selftext: thread.selftext || '',
    author: thread.author,
    subreddit: thread.subreddit,
    score: thread.score || 0,
    num_comments: thread.num_comments || 0,
    url: thread.url,
    permalink: thread.permalink,
    created_utc: thread.created_utc,
    status: 'pending',
    notes,
    tags: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  bookmarks.push(bookmark)
  saveToDisk()
  return bookmark
}

export async function updateBookmark(id, updates) {
  const idx = bookmarks.findIndex(b => b.id === parseInt(id))
  if (idx === -1) return null

  const allowedFields = ['status', 'notes', 'tags']
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      bookmarks[idx][field] = updates[field]
    }
  }
  bookmarks[idx].updated_at = new Date().toISOString()
  saveToDisk()
  return bookmarks[idx]
}

export async function deleteBookmark(id) {
  const idx = bookmarks.findIndex(b => b.id === parseInt(id))
  if (idx === -1) return { changes: 0 }
  bookmarks.splice(idx, 1)
  saveToDisk()
  return { changes: 1 }
}

export async function getBookmarksByStatus(status) {
  return bookmarks
    .filter(b => b.status === status)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}
