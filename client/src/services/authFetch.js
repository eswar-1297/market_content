import { getAccessToken } from '../authConfig'

/**
 * Drop-in replacement for window.fetch that injects the Microsoft auth token.
 * Usage: import { authFetch } from './services/authFetch'
 *        const res = await authFetch('/api/copilot/chat', { method: 'POST', ... })
 */
export async function authFetch(url, options = {}) {
  const token = await getAccessToken()

  const headers = {
    ...(options.headers || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return fetch(url, { ...options, headers })
}
