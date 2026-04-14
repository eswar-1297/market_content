import { PublicClientApplication } from '@azure/msal-browser'

const msalConfig = {
  auth: {
    // REPLACE with the new App Registration Client ID from DevOps
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID || 'YOUR_NEW_CLIENT_ID_HERE',
    // REPLACE with your Azure AD Tenant ID
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_MSAL_TENANT_ID || 'YOUR_TENANT_ID_HERE'}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
}

export const msalInstance = new PublicClientApplication(msalConfig)

export const loginRequest = {
  scopes: ['User.Read', 'openid', 'profile', 'email'],
}

/**
 * Silently acquire a token for the logged-in user.
 * Returns the idToken (validated by server auth middleware against clientId audience).
 * Falls back to interactive redirect if the silent call fails.
 * Returns null if no user is logged in (auth not configured or MSAL not ready).
 */
export async function getAccessToken() {
  try {
    // Wait for MSAL to finish any in-progress redirects before checking accounts
    await msalInstance.initialize().catch(() => {})
    await msalInstance.handleRedirectPromise().catch(() => {})
  } catch {
    // Ignore — MSAL may already be initialized
  }

  const accounts = msalInstance.getAllAccounts()
  if (accounts.length === 0) return null

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    })
    return response.idToken
  } catch {
    try {
      await msalInstance.acquireTokenRedirect(loginRequest)
    } catch {
      // Redirect failed — return null and let the caller handle
    }
    return null
  }
}
