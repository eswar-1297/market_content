import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { msalInstance } from './authConfig'
import './index.css'
import App from './App.jsx'

msalInstance.initialize().then(() => {
  msalInstance.handleRedirectPromise().then(() => {
    // Strip any leftover #code=... / #state=... fragment from the URL
    // (MSAL usually does this itself, but in React StrictMode dev it sometimes lingers)
    if (window.location.hash.startsWith('#code=') || window.location.hash.startsWith('#state=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      </StrictMode>,
    )
  })
})
