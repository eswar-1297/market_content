import { useState, useEffect } from 'react'
import { Sun, Moon, Sparkles, LogOut } from 'lucide-react'
import { useMsal } from '@azure/msal-react'

export default function Layout({ children }) {
  const { instance, accounts } = useMsal()
  const account = accounts[0]

  const [dark, setDark] = useState(() => {
    return localStorage.getItem('theme') === 'dark'
  })

  useEffect(() => {
    document.body.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  const handleLogout = () => {
    instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin })
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
              AI Content Guidelines
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {account && (
            <div className="flex items-center gap-2 mr-1">
              <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400">
                {(account.name || account.username || '?').charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400 hidden sm:inline">
                {account.name || account.username}
              </span>
            </div>
          )}
          <button
            onClick={() => setDark(!dark)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <Sun className="w-4.5 h-4.5 text-gray-400" /> : <Moon className="w-4.5 h-4.5 text-gray-600" />}
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-950">
        <div className="h-full px-4 sm:px-6 lg:px-8 py-4">
          {children}
        </div>
      </main>
    </div>
  )
}
