import { useState, useEffect } from 'react'
import Navbar from '../threadFinder/components/Navbar'
import Home from '../threadFinder/pages/Home'
import Quora from '../threadFinder/pages/Quora'
import GoogleCommunity from '../threadFinder/pages/GoogleCommunity'
import MicrosoftTech from '../threadFinder/pages/MicrosoftTech'
import Bookmarks from '../threadFinder/pages/Bookmarks'

export default function ThreadFinder() {
  const [activeTab, setActiveTab] = useState('reddit')
  const [darkMode, setDarkMode] = useState(() => {
    return document.body.classList.contains('dark')
  })

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDarkMode(document.body.classList.contains('dark'))
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const renderPage = () => {
    switch (activeTab) {
      case 'reddit':
        return <Home darkMode={darkMode} />
      case 'quora':
        return <Quora darkMode={darkMode} />
      case 'google-community':
        return <GoogleCommunity darkMode={darkMode} />
      case 'microsoft-tech':
        return <MicrosoftTech darkMode={darkMode} />
      case 'bookmarks':
        return <Bookmarks darkMode={darkMode} />
      default:
        return <Home darkMode={darkMode} />
    }
  }

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-8">
      <div className={`min-h-[calc(100vh-4rem)] rounded-xl overflow-hidden border transition-colors duration-300 ${
        darkMode
          ? 'bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 border-gray-800 text-gray-100'
          : 'bg-gradient-to-br from-orange-50 via-white to-gray-100 border-gray-200 text-gray-900'
      }`}>
        <Navbar
          darkMode={darkMode}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <main className="px-4 py-6">
          {renderPage()}
        </main>
      </div>
    </div>
  )
}
