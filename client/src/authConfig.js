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
 * Silently acquire an access token for the logged-in user.
 * Falls back to interactive redirect if the silent call fails.
 */
export async function getAccessToken() {
  const accounts = msalInstance.getAllAccounts()
  if (accounts.length === 0) return null

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    })
    return response.idToken
  } catch {
    await msalInstance.acquireTokenRedirect(loginRequest)
    return null
  }
}
