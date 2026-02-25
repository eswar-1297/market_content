import { useState } from 'react'
import { Save, CheckCircle2, Bot, Sparkles } from 'lucide-react'

export default function SettingsPanel() {
  const [provider, setProvider] = useState(() => {
    return localStorage.getItem('ai-provider') || 'openai'
  })
  const [saved, setSaved] = useState(false)

  const save = () => {
    localStorage.setItem('ai-provider', provider)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Settings</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Select your preferred AI provider for enhanced content analysis.
        </p>
      </div>

      {/* Provider selection */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">AI Provider</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ProviderCard
            name="OpenAI"
            description="Uses GPT-4o-mini for fast, accurate content analysis"
            icon={Bot}
            selected={provider === 'openai'}
            onClick={() => setProvider('openai')}
          />
          <ProviderCard
            name="Google Gemini"
            description="Uses Gemini 1.5 Flash for quick content evaluation"
            icon={Sparkles}
            selected={provider === 'gemini'}
            onClick={() => setProvider('gemini')}
          />
        </div>

        <div className="mt-6">
          <button
            onClick={save}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium
              hover:bg-indigo-700 transition-colors"
          >
            {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Preference'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProviderCard({ name, description, icon: Icon, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all ${
        selected
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
        selected
          ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
      }`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-semibold ${selected ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>
          {name}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
      {selected && (
        <CheckCircle2 className="w-5 h-5 text-indigo-500 ml-auto flex-shrink-0" />
      )}
    </button>
  )
}
