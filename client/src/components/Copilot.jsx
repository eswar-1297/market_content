import { useState, useRef, useCallback, useEffect } from 'react'
import { marked } from 'marked'
import { Download, Bot, Code, FileEdit, X } from 'lucide-react'
import { useMsal } from '@azure/msal-react'
import Editor from './copilot/Editor'
import ChatPanel from './copilot/ChatPanel'
import HistorySidebar from './copilot/HistorySidebar'
import { openCodePreview } from './copilot/CodePreview'
import { authFetch } from '../services/authFetch'

export default function Copilot() {
  const { accounts } = useMsal()
  const userId = accounts[0]?.username || accounts[0]?.localAccountId || 'default'
  const [editorOpen, setEditorOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [messages, setMessages] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [currentText, setCurrentText] = useState('')
  const [topic, setTopic] = useState('')
  const [writerName, setWriterName] = useState('')
  const [keywords, setKeywords] = useState(null)
  const [articleRequirements, setArticleRequirements] = useState({})
  const [metaInfo, setMetaInfo] = useState(null)
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem('ai-provider') || 'openai')
  const [sessionId, setSessionId] = useState(null)

  const handleProviderChange = (e) => {
    const value = e.target.value
    setAiProvider(value)
    localStorage.setItem('ai-provider', value)
  }

  const contentRef = useRef('')
  const htmlRef = useRef('')
  const editorRef = useRef(null)
  const pendingContentRef = useRef(null)

  // When editor opens and there's pending content, inject it
  useEffect(() => {
    if (editorOpen && pendingContentRef.current && editorRef.current) {
      const html = pendingContentRef.current
      pendingContentRef.current = null
      // Small delay to let TipTap fully initialize
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.commands.setContent(html)
        }
      }, 100)
    }
  }, [editorOpen])

  const handleContentChange = useCallback(({ text, html }) => {
    contentRef.current = text
    htmlRef.current = html || ''
    setCurrentText(text)
  }, [])

  // Auto-save editor HTML to session (debounced 2s)
  const autoSaveTimerRef = useRef(null)
  useEffect(() => {
    if (!sessionId || !currentText.trim()) return
    clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      authFetch(`/api/copilot/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_content: htmlRef.current || currentText })
      }).catch(() => {})
    }, 2000)
    return () => clearTimeout(autoSaveTimerRef.current)
  }, [currentText, sessionId])

  // Create a session when topic is set (if no session exists)
  const ensureSession = async (topicText) => {
    if (sessionId) return sessionId
    try {
      const res = await authFetch('/api/copilot/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicText || 'Untitled Session', writerId: userId, writerName: accounts[0]?.name || '' })
      })
      if (res.ok) {
        const data = await res.json()
        setSessionId(data.id)
        return data.id
      }
    } catch (err) {
      console.error('Failed to create session:', err)
    }
    return null
  }

  const handleLoadSession = async (session) => {
    try {
      await flushSessionContent(sessionId)

      const [sessionRes, messagesRes] = await Promise.all([
        authFetch(`/api/copilot/sessions/${session.id}`),
        authFetch(`/api/copilot/sessions/${session.id}/messages`)
      ])

      const sessionData = await sessionRes.json()
      const messagesData = await messagesRes.json()

      setSessionId(session.id)
      setTopic(sessionData.topic || '')
      setMessages(messagesData.map(m => ({
        role: m.role,
        content: m.content,
        toolSteps: m.tool_steps || [],
        isAgent: m.is_agent
      })))

      if (sessionData.current_content) {
        // Content is stored as HTML — check if it looks like HTML or plain text/markdown
        const content = sessionData.current_content
        const isHTML = /<[a-z][\s\S]*>/i.test(content)
        const html = isHTML ? content : marked.parse(content)
        if (editorRef.current) {
          editorRef.current.commands.setContent(html)
        } else {
          pendingContentRef.current = html
        }
        setEditorOpen(true)
      } else {
        setEditorOpen(false)
      }

      if (sessionData.semantic_keywords && Object.keys(sessionData.semantic_keywords).length > 0) {
        setKeywords(sessionData.semantic_keywords)
      }

      setMetaInfo(null)
      setArticleRequirements({})
    } catch (err) {
      console.error('Failed to load session:', err)
    }
  }

  const flushSessionContent = async (sid) => {
    if (!sid) return
    const text = contentRef.current
    if (!text.trim()) return
    clearTimeout(autoSaveTimerRef.current)
    try {
      await authFetch(`/api/copilot/sessions/${sid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_content: htmlRef.current || text })
      })
    } catch {}
  }

  const handleNewSession = async () => {
    await flushSessionContent(sessionId)
    setSessionId(null)
    setTopic('')
    setWriterName('')
    setMessages([])
    setKeywords(null)
    setArticleRequirements({})
    setMetaInfo(null)
    setCurrentText('')
    setEditorOpen(false)
    contentRef.current = ''
    htmlRef.current = ''
    pendingContentRef.current = null
    if (editorRef.current) {
      editorRef.current.commands.setContent('')
    }
  }

  const sendMessage = async (text, displayText) => {
    const trimmed = text.trim()
    const isBarURL = /^https?:\/\/[^\s]+$/i.test(trimmed) && !displayText
    const actualPrompt = isBarURL
      ? `Audit this published article: ${trimmed} — Give me CSABF score, structural issues, then analyze the existing FAQs on the page against the highest-priority questions from FAQ + Fanout generation and tell me which important questions are MISSING. Also show fanout coverage gaps and keyword suggestions.`
      : text
    const actualDisplay = isBarURL ? `Audit this article: ${trimmed}` : (displayText || text)

    const userMessage = { role: 'user', content: actualDisplay }
    setMessages(prev => [...prev, userMessage])
    setChatLoading(true)

    const activeSessionId = await ensureSession(topic || actualDisplay.substring(0, 100))

    try {
      const res = await authFetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ai-provider': aiProvider },
        body: JSON.stringify({
          message: actualPrompt,
          currentContent: contentRef.current,
          currentHTML: htmlRef.current,
          conversationHistory: messages.slice(-16).map(m => ({
            role: m.role,
            content: m.content,
            toolSteps: m.toolSteps || []
          })),
          writerContext: { topic, keywords, writerName },
          articleRequirements,
          sessionId: activeSessionId
        })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to get response')
      }

      const data = await res.json()
      setMessages(prev => [...prev, {
        role: data.role,
        content: data.content,
        toolSteps: data.toolSteps || [],
        isAgent: data.isAgent || false
      }])

      if (data.requirementsUpdate) {
        setArticleRequirements(prev => ({ ...prev, ...data.requirementsUpdate }))
      }

      // Check for generated content — either from tool result or detect framework/article in chat response
      let contentForEditor = data.generatedArticle || null

      if (!contentForEditor && data.content) {
        const text = data.content
        const h2Count = (text.match(/^##\s/gm) || []).length
        const hasH1 = /^#\s/m.test(text)
        const isFrameworkOrArticle = (hasH1 && h2Count >= 3) || h2Count >= 5
        if (isFrameworkOrArticle) {
          contentForEditor = text
        }
      }

      if (contentForEditor) {
        const html = marked.parse(contentForEditor)
        if (editorRef.current) {
          editorRef.current.commands.setContent(html)
        } else {
          pendingContentRef.current = html
        }
        setEditorOpen(true)
      }
      if (data.metaTitle || data.metaDescription) {
        setMetaInfo({ title: data.metaTitle, description: data.metaDescription })
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I ran into an error: ${err.message}. Make sure your AI API key is configured in the server .env file.`
      }])
    } finally {
      setChatLoading(false)
    }
  }

  const handleQuickAction = (action) => {
    const hasContent = contentRef.current.trim().length > 50
    const t = topic

    const actions = {
      suggest_framework: {
        display: t ? `Suggest a framework for "${t}".` : (hasContent ? "Suggest a framework based on my content." : "Suggest a framework for my article."),
        prompt: t
          ? `Suggest a framework/outline for my article on "${t}".`
          : (hasContent
            ? "Look at what I've written so far and suggest the best framework/outline for this article."
            : "Suggest a framework for my article.")
      },
      suggest_keywords: {
        display: t ? `Give me keywords for "${t}".` : (hasContent ? "Suggest semantic keywords for my content." : "Give me semantic keywords for my article."),
        prompt: t
          ? `Give me semantic keywords for my article on "${t}". Include primary keyword, secondary keywords, LSI terms, and question keywords.`
          : (hasContent
            ? "Based on my content so far, suggest semantic keywords I should incorporate for better AI visibility."
            : "Give me semantic keywords for my article.")
      },
      generate_faqs: {
        display: t ? `Generate FAQs for "${t}".` : "Generate FAQs for my article.",
        prompt: t
          ? `Generate FAQs and fanout queries for "${t}". Show me the top questions I should cover.`
          : "Generate FAQs and fanout queries for my article topic. Show me the top questions I should cover."
      },
      find_threads: {
        display: t ? `Find Reddit & Quora threads about "${t}".` : "Find Reddit & Quora community threads for my topic.",
        prompt: t
          ? `Search Reddit and Quora for community threads and discussions about "${t}". Show the most relevant threads with titles, source, and links.`
          : "Search Reddit and Quora for community threads about my article topic. Show the most relevant discussions."
      },
      browse_articles: {
        display: "Browse published CloudFuze articles.",
        prompt: "Show me recently published CloudFuze articles. List titles, authors, publish dates, and URLs so I can find internal linking opportunities."
      },
      review_content: {
        display: hasContent ? "Review my content and suggest improvements." : "I haven't written anything yet.",
        prompt: hasContent
          ? "Review my content with a full pre-publish audit. Run the content analysis tool and present ALL of the following as separate sections with ## headings:\n\n1) ## CSABF SCORE + STRUCTURAL ISSUES — Overall score, category scores, every failing check with specific fixes.\n\n2) ## GEO CITABILITY & AI VISIBILITY — Check each section for AI citation readiness. Self-contained answer blocks (50-200 words)? Definition patterns? Statistics? Question-format headings? Extractable lists/tables? Quote exact weak sentences and rewrite them.\n\n3) ## E-E-A-T SIGNALS — Experience (case studies, real results), Expertise (technical depth), Authoritativeness (credentials), Trustworthiness (verifiable facts). What's missing? Suggest specific additions.\n\n4) ## READABILITY — Report each metric: avg sentence length (target 15-20 words), passive voice % (target <10%), sentence variety, complex words % (target <15%), transition words % (target >20%). Show pass/fail for each with fixes.\n\n5) ## GRAMMAR & TONE — Quote specific passive voice sentences and rewrite them active. Flag marketing/salesy language, filler words, hedging, generic AI phrases. Show original → corrected for each.\n\n6) ## FORMATTING — Paragraph lengths (max 5 lines), heading structure (1 H1, 4-10 H2s), bullet lists (min 2), numbered lists (min 1), subheading gaps (max 200 words between). Flag exact locations of issues.\n\n7) ## FAQ GAP ANALYSIS — Show covered FAQs, then missing questions ranked by priority. Show where each should go.\n\nUse checkmarks and X marks for quick scanning. Do NOT suggest a framework. Focus only on improving what I've already written."
          : "I haven't written anything yet. Let me start writing first, then I'll ask you to review it!"
      },
      generate_article: {
        display: t ? `Generate a full article on "${t}".` : "Generate a full article for my topic.",
        prompt: t
          ? `Generate a complete, publication-ready blog article on "${t}". Use all the context from our conversation — any keywords, FAQs, framework, or requirements I've mentioned. The article must follow the CSABF framework and be optimized for AI search engine visibility. Write the full article.`
          : "Generate a complete, publication-ready blog article for my topic. Use all the context from our conversation — any keywords, FAQs, framework, or requirements I've mentioned. The article must follow the CSABF framework and be optimized for AI search engine visibility. Write the full article."
      },
      audit_article: null
    }

    if (action === 'audit_article') {
      const url = window.prompt('Paste the article URL to audit:')
      if (!url?.trim()) return
      sendMessage(
        `Audit this published article: ${url.trim()} — Give me CSABF score, structural issues, then analyze the existing FAQs on the page against the highest-priority questions from FAQ + Fanout generation and tell me which important questions are MISSING. Also show fanout coverage gaps and keyword suggestions.`,
        `Audit this article: ${url.trim()}`
      )
      return
    }

    const { display, prompt } = actions[action] || { display: action, prompt: action }
    sendMessage(prompt, display)
  }

  const handleSetWriter = (name) => { setWriterName(name) }

  const handleSetTopic = async (t) => {
    setTopic(t)
    if (t && !sessionId) await ensureSession(t)
  }

  const exportContent = () => {
    const text = contentRef.current
    if (!text.trim()) return
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(topic || 'article').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full flex">
      {/* Left: History Sidebar */}
      <HistorySidebar
        onLoadSession={handleLoadSession}
        onNewSession={handleNewSession}
        currentSessionId={sessionId}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        userId={userId}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-gray-900 dark:text-white">Content Agent</h1>
            {writerName && (
              <span className="px-2 py-0.5 text-[11px] rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">{writerName}</span>
            )}
            {topic && (
              <span className="px-2 py-0.5 text-[11px] rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium truncate max-w-[200px]">{topic}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Editor toggle */}
            <button
              onClick={() => setEditorOpen(!editorOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              title={editorOpen ? 'Close editor' : 'Open editor'}
            >
              <FileEdit className="w-3.5 h-3.5" />
              {editorOpen ? 'Close Editor' : 'Editor'}
            </button>
            {editorOpen && (
              <>
                <button
                  onClick={() => openCodePreview(htmlRef.current, topic)}
                  disabled={!currentText.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Code className="w-3.5 h-3.5" /> Preview
                </button>
                <button
                  onClick={exportContent}
                  disabled={!currentText.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              </>
            )}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
              <Bot className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
              <select
                value={aiProvider}
                onChange={handleProviderChange}
                className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none cursor-pointer pr-1"
              >
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
                <option value="claude">Claude</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 flex min-h-0">
          {editorOpen ? (
            <>
              {/* Editor in center */}
              <div className="flex-1 flex flex-col min-w-0">
                {metaInfo && (
                  <div className="mx-4 mt-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">SEO Meta Tags</span>
                      <button
                        onClick={() => {
                          const text = `Meta Title: ${metaInfo.title || ''}\nMeta Description: ${metaInfo.description || ''}`
                          navigator.clipboard.writeText(text)
                        }}
                        className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                    {metaInfo.title && (
                      <div className="mb-1.5">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Title: </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{metaInfo.title}</span>
                        <span className="ml-2 text-xs text-gray-400">({metaInfo.title.length} chars)</span>
                      </div>
                    )}
                    {metaInfo.description && (
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Description: </span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">{metaInfo.description}</span>
                        <span className="ml-2 text-xs text-gray-400">({metaInfo.description.length} chars)</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex-1 p-2 min-h-0">
                  <Editor onContentChange={handleContentChange} editorRef={editorRef} />
                </div>
              </div>

              {/* Chat on right when editor is open */}
              <div className="w-[380px] xl:w-[420px] flex-shrink-0 border-l border-gray-200 dark:border-gray-800">
                <ChatPanel
                  messages={messages}
                  onSendMessage={sendMessage}
                  loading={chatLoading}
                  onSetWriter={handleSetWriter}
                  onSetTopic={handleSetTopic}
                  sessionId={sessionId}
                />
              </div>
            </>
          ) : (
            /* Chat in center (full width) when editor is closed */
            <div className="flex-1 max-w-3xl mx-auto w-full">
              <ChatPanel
                messages={messages}
                onSendMessage={sendMessage}
                loading={chatLoading}
                onSetWriter={handleSetWriter}
                onSetTopic={handleSetTopic}
                sessionId={sessionId}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
