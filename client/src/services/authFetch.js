import { getAccessToken, forceReacquireToken, redirectToLogin } from '../authConfig'

/**
 * Drop-in replacement for window.fetch that injects the Microsoft auth token
 * and recovers automatically from expired-token 401s.
 *
 * On a 401 response we:
 *   1. Force a fresh idToken via MSAL (silent refresh, bypasses cache) and
 *      retry the request ONCE. The server short-circuits on auth before any
 *      route handler runs, so retrying is safe — no double-side-effects.
 *   2. If the refresh fails (refresh token also dead), redirect the user
 *      through interactive Microsoft sign-in. Multiple in-flight 401s only
 *      trigger one redirect (guarded inside authConfig).
 *
 * Usage: import { authFetch } from './services/authFetch'
 *        const res = await authFetch('/api/copilot/chat', { method: 'POST', ... })
 */
export async function authFetch(url, options = {}) {
  const doFetch = (token) => {
    const headers = { ...(options.headers || {}) }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return fetch(url, { ...options, headers })
  }

  const token = await getAccessToken()
  let res = await doFetch(token)
  if (res.status !== 401) return res

  // 401 — try one silent force-refresh + retry before bouncing to login.
  console.warn('[authFetch] 401 from', url, '— attempting token refresh')
  let fresh = null
  try { fresh = await forceReacquireToken() } catch { /* fall through */ }
  if (fresh) {
    const retry = await doFetch(fresh)
    if (retry.status !== 401) return retry
    res = retry   // still 401 — refresh token is also dead
  }

  // Cannot recover silently — send the user through interactive sign-in.
  console.warn('[authFetch] Token refresh failed — redirecting to Microsoft sign-in')
  redirectToLogin()
  return res
}
