import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Bot, User, Copy, Check, Tag, Layers, Search, FileText, UserCircle, Database, Wrench, CalendarDays, Youtube, Star, Table2, HelpCircle, ClipboardCheck, PenLine, Radar, Newspaper, GitFork, FileEdit, ListChecks, BookOpen, Building2 } from 'lucide-react'
import { useMsal } from '@azure/msal-react'

const TOOL_ICONS = {
  search_past_articles: Search,
  analyze_content_structure: ClipboardCheck,
  track_keyword_usage: Tag,
  get_writer_profile: UserCircle,
  search_article_chunks: FileText,
  list_all_articles: Database,
  get_todays_topic_for_writer: CalendarDays,
  suggest_youtube_videos: Youtube,
  search_g2_testimonials: Star,
  suggest_tables_and_infographics: Table2,
  generate_faqs: HelpCircle,
  audit_published_article: ClipboardCheck,
  search_community_threads: Radar,
  browse_published_articles: Newspaper,
  generate_fanout_queries: GitFork,
  generate_framework: Layers,
  generate_article: FileEdit,
  edit_article: PenLine,
  check_ai_detection: ClipboardCheck,
  check_plagiarism: Search,
  search_sharepoint_docs: BookOpen,
  update_article_requirements: ListChecks
}

export default function ChatPanel({ messages, onSendMessage, loading, onSetWriter, onSetTopic, sessionId }) {
  const [input, setInput] = useState('')
  const [sharepointMode, setSharepointMode] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const { accounts } = useMsal()
  const userName = accounts[0]?.name?.split(' ')[0] || accounts[0]?.username?.split('@')[0] || 'there'

  // Set writer name from login on mount
  useEffect(() => {
    if (accounts[0]?.name) {
      onSetWriter(accounts[0].name)
    }
  }, [accounts[0]?.name])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const autoResize = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    // Reset height after clearing
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
    if (sharepointMode) {
      const spPrompt = `[SHAREPOINT LOOKUP] Search the internal SharePoint DOC360 site for: ${text}. Use the search_sharepoint_docs tool to find this information. Do NOT guess — only return data found in SharePoint.`
      onSendMessage(spPrompt, `SharePoint: ${text}`)
      setSharepointMode(false)
    } else {
      onSendMessage(text)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const showGreeting = messages.length === 0

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
          <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Content Agent</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">AI Agent with tools</p>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin ml-auto" />}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* Greeting for new/empty sessions */}
        {showGreeting && (
          <BotBubble>
            <p className="font-semibold mb-1">Hi {userName}!</p>
            <p>I'm your Content Agent. Tell me what you'd like to work on — a topic, a framework, keywords, a full article, or anything else.</p>
          </BotBubble>
        )}

        {/* Chat messages */}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {loading && (
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl rounded-tl-sm bg-gray-100 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                <span>Agent is thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-800">
        <div className="space-y-1.5">
          {sharepointMode && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
              <Building2 className="w-3 h-3" />
              <span className="font-medium">SharePoint mode</span>
              <span className="text-blue-500 dark:text-blue-400">— your question will search internal docs</span>
              <button onClick={() => setSharepointMode(false)} className="ml-auto text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 font-bold">&times;</button>
            </div>
          )}
          <div className={`flex items-end gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 border ${sharepointMode ? 'border-blue-300 dark:border-blue-700 ring-1 ring-blue-200 dark:ring-blue-800' : 'border-gray-200 dark:border-gray-700'} focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent`}>
            <button
              onClick={() => setSharepointMode(!sharepointMode)}
              title={sharepointMode ? 'Disable SharePoint mode' : 'Ask from SharePoint docs'}
              className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                sharepointMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400'
              }`}
            >
              <Building2 className="w-4 h-4" />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => { setInput(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown}
              placeholder={sharepointMode ? "Ask about CloudFuze features, golden combos, migration paths..." : "Type your topic or ask anything..."}
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none focus:outline-none overflow-hidden"
              style={{ minHeight: '24px', maxHeight: '200px', overflowY: 'auto' }}
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function BotBubble({ children }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
        <Bot className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
      </div>
      <div className="max-w-[85%]">
        <div className="inline-block px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-gray-100 dark:bg-gray-800 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
          {children}
        </div>
      </div>
    </div>
  )
}

function ChatMessage({ message }) {
  const [copied, setCopied] = useState(false)
  const isBot = message.role === 'assistant'

  const copyText = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`flex items-start gap-2.5 ${isBot ? '' : 'flex-row-reverse'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
        isBot
          ? 'bg-indigo-100 dark:bg-indigo-900/40'
          : 'bg-gray-200 dark:bg-gray-700'
      }`}>
        {isBot
          ? <Bot className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          : <User className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
        }
      </div>

      <div className={`max-w-[85%] group ${isBot ? '' : 'text-right'}`}>
        {isBot && message.toolSteps?.length > 0 && (
          <div className="mb-2 space-y-1">
            {message.toolSteps.map((step, i) => {
              const ToolIcon = TOOL_ICONS[step.tool] || Wrench
              return (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 text-xs animate-fade-in">
                  <ToolIcon className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                  <span className="text-indigo-700 dark:text-indigo-300 font-medium">{step.label}</span>
                  {step.summary && (
                    <span className="text-indigo-500/70 dark:text-indigo-400/60 ml-auto truncate">{step.summary}</span>
                  )}
                  <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                </div>
              )
            })}
          </div>
        )}

        <div className={`inline-block px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isBot
            ? 'rounded-tl-sm bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
            : 'rounded-tr-sm bg-indigo-600 text-white'
        }`}>
          <MessageText text={message.content} isBot={isBot} />
        </div>

        {isBot && message.content && (
          <button
            onClick={() => copyText(typeof message.content === 'string' ? message.content : JSON.stringify(message.content))}
            className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  )
}

function renderInlineMarkdown(text) {
  const pattern = /(\[.*?\]\s*\(.*?\)|\*\*[^*]+\*\*|https?:\/\/[^\s)\]]+)/g
  const tokens = text.split(pattern)
  return tokens.map((token, i) => {
    if (!token) return null
    const linkMatch = token.match(/^\[(.*?)\]\s*\((.*?)\)$/)
    if (linkMatch) {
      return (
        <a key={i} href={linkMatch[2].trim()} target="_blank" rel="noopener noreferrer"
          className="text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-300">
          {linkMatch[1]}
        </a>
      )
    }
    if (/^https?:\/\//.test(token)) {
      const cleanUrl = token.replace(/[.,;:!?)]+$/, '')
      return (
        <a key={i} href={cleanUrl} target="_blank" rel="noopener noreferrer"
          className="text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-300 break-all">
          {cleanUrl}
        </a>
      )
    }
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={i} className="font-semibold">{token.slice(2, -2)}</strong>
    }
    return <span key={i}>{token}</span>
  })
}

function MessageText({ text, isBot }) {
  if (!text) return null
  const content = typeof text === 'string' ? text : JSON.stringify(text, null, 2)

  const lines = content.split('\n')
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />

        if (line.startsWith('### ')) {
          return <p key={i} className="font-semibold text-sm mt-2">{renderInlineMarkdown(line.replace('### ', ''))}</p>
        }
        if (line.startsWith('## ')) {
          return <p key={i} className="font-bold text-sm mt-2">{renderInlineMarkdown(line.replace('## ', ''))}</p>
        }
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={i} className="flex items-start gap-1.5 ml-1">
              <span className={`mt-2 w-1 h-1 rounded-full flex-shrink-0 ${isBot ? 'bg-gray-400' : 'bg-white/60'}`} />
              <span>{renderInlineMarkdown(line.replace(/^[-•]\s/, ''))}</span>
            </div>
          )
        }
        if (/^\d+\.\s/.test(line)) {
          return (
            <div key={i} className="flex items-start gap-1.5 ml-1">
              <span className={`font-semibold flex-shrink-0 ${isBot ? 'text-indigo-500' : 'text-white/80'}`}>
                {line.match(/^\d+/)[0]}.
              </span>
              <span>{renderInlineMarkdown(line.replace(/^\d+\.\s/, ''))}</span>
            </div>
          )
        }

        return <p key={i}>{renderInlineMarkdown(line)}</p>
      })}
    </div>
  )
}
