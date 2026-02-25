import { Search, Bookmark, HelpCircle, Users, Monitor } from 'lucide-react'

function Navbar({ darkMode, activeTab, onTabChange }) {
  const tabs = [
    { id: 'reddit', icon: Search, label: 'Reddit', activeColor: 'bg-reddit-orange text-white' },
    { id: 'quora', icon: HelpCircle, label: 'Quora', activeColor: 'bg-red-500 text-white' },
    { id: 'google-community', icon: Users, label: 'Google', activeColor: 'bg-blue-500 text-white' },
    { id: 'microsoft-tech', icon: Monitor, label: 'MS Tech', activeColor: 'bg-blue-600 text-white' },
    { id: 'bookmarks', icon: Bookmark, label: 'Bookmarks', activeColor: 'bg-reddit-orange text-white' },
  ]

  return (
    <nav className={`sticky top-0 z-30 backdrop-blur-md border-b transition-colors duration-300 rounded-t-xl ${
      darkMode 
        ? 'bg-gray-900/90 border-gray-700' 
        : 'bg-white/90 border-gray-200'
    }`}>
      <div className="px-4">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="font-bold text-sm tracking-tight">
                <span className="text-orange-500">Thread</span>
                <span className={darkMode ? 'text-white' : 'text-gray-900'}> Finder</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {tabs.map(({ id, icon: Icon, label, activeColor }) => (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === id
                    ? activeColor
                    : darkMode
                      ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
