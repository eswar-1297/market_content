// Shared Reddit OAuth client — import this in any service that calls Reddit
// Requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env
// Create app at: https://www.reddit.com/prefs/apps/ (select "script" type)

const USER_AGENT = `CloudFuzeContentAgent/1.0 (by /u/${process.env.REDDIT_USERNAME || 'contentmarketing'})`

let oauthToken = null
let tokenExpiry = 0

async function getToken() {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  if (oauthToken && Date.now() < tokenExpiry) return oauthToken

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body: 'grant_type=client_credentials'
    })
    if (!res.ok) return null
    const data = await res.json()
    oauthToken = data.access_token
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
    return oauthToken
  } catch {
    return null
  }
}

/**
 * Fetch a Reddit .json URL with OAuth if configured, falling back to public API.
 * @param {string} url - Full Reddit URL (e.g. https://www.reddit.com/search.json?q=...)
 * @returns {Promise<object>} Parsed JSON response
 */
export async function redditFetch(url) {
  const token = await getToken()

  if (token) {
    const oauthUrl = url.replace('https://www.reddit.com/', 'https://oauth.reddit.com/')
    const response = await fetch(oauthUrl, {
      headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
    })
    if (response.ok) return response.json()
    oauthToken = null // Token expired, clear it
  }

  // Fallback to public (may 403)
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
  })
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Reddit blocked (403). Add REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET to .env')
    }
    throw new Error(`Reddit ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export function isRedditConfigured() {
  return !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET)
}

export { USER_AGENT as REDDIT_USER_AGENT }
