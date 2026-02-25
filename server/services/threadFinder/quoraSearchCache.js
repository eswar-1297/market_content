// Quora Search Cache - In-memory cache with optional SQLite persistence
// Avoids repeated API calls for the same keyword

// In-memory cache
const memoryCache = new Map()

// Cache configuration
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const MAX_CACHE_SIZE = 1000 // Maximum number of cached queries

/**
 * Generate a cache key from query
 * @param {string} query - Original query
 * @returns {string} Cache key
 */
function getCacheKey(query) {
  return query.toLowerCase().trim()
}

/**
 * Check if cache entry is still valid
 * @param {Object} entry - Cache entry
 * @returns {boolean} True if valid
 */
function isEntryValid(entry) {
  if (!entry || !entry.timestamp) return false
  const age = Date.now() - entry.timestamp
  return age < CACHE_TTL_MS
}

/**
 * Clean up expired entries from cache
 */
function cleanupCache() {
  const now = Date.now()
  for (const [key, entry] of memoryCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      memoryCache.delete(key)
    }
  }
  
  // If still over max size, remove oldest entries
  if (memoryCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(memoryCache.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE)
    toRemove.forEach(([key]) => memoryCache.delete(key))
  }
}

/**
 * Get cached results for a query
 * @param {string} query - Search query
 * @returns {Object|null} Cached results or null if not found/expired
 */
export function getCachedResults(query) {
  const key = getCacheKey(query)
  const entry = memoryCache.get(key)
  
  if (!entry) {
    console.log(`💾 Cache MISS: "${query.substring(0, 40)}..."`)
    return null
  }
  
  if (!isEntryValid(entry)) {
    console.log(`💾 Cache EXPIRED: "${query.substring(0, 40)}..."`)
    memoryCache.delete(key)
    return null
  }
  
  console.log(`💾 Cache HIT: "${query.substring(0, 40)}..." (${entry.data.questions?.length || 0} questions)`)
  return entry.data
}

/**
 * Store results in cache
 * @param {string} query - Search query
 * @param {Object} data - Results to cache (should have questions array and stats)
 */
export function setCachedResults(query, data) {
  const key = getCacheKey(query)
  
  memoryCache.set(key, {
    query,
    data,
    timestamp: Date.now()
  })
  
  console.log(`💾 Cache SET: "${query.substring(0, 40)}..." (${data.questions?.length || 0} questions)`)
  
  // Cleanup periodically
  if (memoryCache.size > MAX_CACHE_SIZE * 1.1) {
    cleanupCache()
  }
}

/**
 * Clear cache for a specific query
 * @param {string} query - Search query
 */
export function clearCachedResults(query) {
  const key = getCacheKey(query)
  memoryCache.delete(key)
  console.log(`💾 Cache CLEAR: "${query.substring(0, 40)}..."`)
}

/**
 * Clear all cached results
 */
export function clearAllCache() {
  memoryCache.clear()
  console.log('💾 Cache CLEARED: All entries removed')
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
export function getCacheStats() {
  let validCount = 0
  let expiredCount = 0
  let totalQuestions = 0
  
  for (const entry of memoryCache.values()) {
    if (isEntryValid(entry)) {
      validCount++
      totalQuestions += entry.data.questions?.length || 0
    } else {
      expiredCount++
    }
  }
  
  return {
    totalEntries: memoryCache.size,
    validEntries: validCount,
    expiredEntries: expiredCount,
    totalCachedQuestions: totalQuestions,
    maxSize: MAX_CACHE_SIZE,
    ttlHours: CACHE_TTL_MS / (60 * 60 * 1000)
  }
}

/**
 * Wrapper function for cached search execution
 * Checks cache first, executes search if not cached, stores result
 * 
 * @param {string} query - Search query
 * @param {Function} searchFn - Async function that performs the actual search
 * @returns {Promise<Object>} Search results (from cache or fresh)
 */
export async function withCache(query, searchFn) {
  // Check cache first
  const cached = getCachedResults(query)
  if (cached) {
    return {
      ...cached,
      fromCache: true
    }
  }
  
  // Execute search
  const results = await searchFn()
  
  // Cache results
  setCachedResults(query, results)
  
  return {
    ...results,
    fromCache: false
  }
}


