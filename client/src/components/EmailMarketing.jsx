import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  Mail, Users, FileText, BarChart3, Plus, Trash2, Send, Eye,
  Upload, CheckCircle2, XCircle, AlertTriangle, Copy, Search,
  ChevronDown, ChevronRight, RefreshCw, UserMinus, UserPlus, X
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const tabs = [
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'campaigns', label: 'Campaigns', icon: Mail },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
]

export default function EmailMarketing() {
  const [activeTab, setActiveTab] = useState('contacts')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Marketing</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage contacts, create templates, send campaigns, and track opens.
        </p>
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === t.id
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'contacts' && <ContactsTab />}
      {activeTab === 'templates' && <TemplatesTab />}
      {activeTab === 'campaigns' && <CampaignsTab />}
      {activeTab === 'analytics' && <AnalyticsTab />}
    </div>
  )
}

// ─── Contacts Tab ──────────────────────────────────────────────────────────

function ContactsTab() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [tags, setTags] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState(null)

  const fetchContacts = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/email/contacts`)
      setContacts(data.contacts)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  const addOne = async () => {
    if (!email.trim()) return
    try {
      await axios.post(`${API}/api/email/contacts`, { email, name, tags })
      setEmail(''); setName(''); setTags(''); setShowAdd(false)
      setMsg({ type: 'success', text: 'Contact added' })
      fetchContacts()
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Failed' })
    }
  }

  const addBulk = async () => {
    const lines = bulkText.trim().split('\n').filter(Boolean)
    const parsed = lines.map(l => {
      const parts = l.split(',').map(s => s.trim())
      return { email: parts[0], name: parts[1] || '', tags: parts[2] || '' }
    }).filter(c => c.email && c.email.includes('@'))
    if (!parsed.length) { setMsg({ type: 'error', text: 'No valid emails found' }); return }
    try {
      const { data } = await axios.post(`${API}/api/email/contacts/bulk`, { contacts: parsed })
      setBulkText(''); setShowBulk(false)
      setMsg({ type: 'success', text: `${data.added} contacts imported` })
      fetchContacts()
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Import failed' })
    }
  }

  const toggleSub = async (id, subscribed) => {
    try {
      await axios.patch(`${API}/api/email/contacts/${id}/subscription`, { subscribed })
      fetchContacts()
    } catch { /* ignore */ }
  }

  const removeContact = async (id) => {
    if (!confirm('Delete this contact?')) return
    await axios.delete(`${API}/api/email/contacts/${id}`)
    fetchContacts()
  }

  const filtered = contacts.filter(c =>
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    (c.name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
          msg.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
        }`}>
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
          />
        </div>
        <button onClick={() => { setShowAdd(!showAdd); setShowBulk(false) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Add Contact
        </button>
        <button onClick={() => { setShowBulk(!showBulk); setShowAdd(false) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
          <Upload className="w-4 h-4" /> Bulk Import
        </button>
      </div>

      {showAdd && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Add Contact</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (optional)"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags (optional)"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
          </div>
          <div className="flex gap-2">
            <button onClick={addOne} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">Save</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          </div>
        </div>
      )}

      {showBulk && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bulk Import</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">One contact per line: <code>email, name, tags</code></p>
          <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
            rows={6} placeholder="john@example.com, John Doe, partner&#10;jane@example.com, Jane Smith, client"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white font-mono" />
          <div className="flex gap-2">
            <button onClick={addBulk} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">Import</button>
            <button onClick={() => setShowBulk(false)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 dark:text-gray-400">
        {filtered.length} contact{filtered.length !== 1 ? 's' : ''} &middot; {contacts.filter(c => c.subscribed).length} subscribed
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading contacts...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No contacts yet. Add one above.</div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tags</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{c.email}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.tags || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.subscribed ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}>
                      {c.subscribed ? 'Subscribed' : 'Unsubscribed'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => toggleSub(c.id, !c.subscribed)} title={c.subscribed ? 'Unsubscribe' : 'Resubscribe'}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                        {c.subscribed ? <UserMinus className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                      </button>
                      <button onClick={() => removeContact(c.id)} title="Delete"
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Templates Tab ─────────────────────────────────────────────────────────

function TemplatesTab() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', subject: '', html_body: '' })
  const [showForm, setShowForm] = useState(false)
  const [preview, setPreview] = useState(null)

  const fetchTemplates = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/email/templates`)
      setTemplates(data.templates)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  const save = async () => {
    if (!form.name || !form.subject || !form.html_body) return
    try {
      if (editing) {
        await axios.put(`${API}/api/email/templates/${editing}`, form)
      } else {
        await axios.post(`${API}/api/email/templates`, form)
      }
      setForm({ name: '', subject: '', html_body: '' }); setEditing(null); setShowForm(false)
      fetchTemplates()
    } catch { /* ignore */ }
  }

  const edit = (t) => {
    setForm({ name: t.name, subject: t.subject, html_body: t.html_body })
    setEditing(t.id); setShowForm(true)
  }

  const remove = async (id) => {
    if (!confirm('Delete this template?')) return
    await axios.delete(`${API}/api/email/templates/${id}`)
    fetchTemplates()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', subject: '', html_body: '' }) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{editing ? 'Edit' : 'New'} Template</h3>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Template name"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
          <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Email subject (use {{name}} for personalization)"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">HTML body — use <code>{'{{name}}'}</code> and <code>{'{{email}}'}</code> for personalization</p>
            <textarea value={form.html_body} onChange={e => setForm(p => ({ ...p, html_body: e.target.value }))}
              rows={12} placeholder='<h1>Hello {{name}}!</h1><p>Your content here...</p>'
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white font-mono" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
              {editing ? 'Update' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{preview.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Subject: {preview.subject}</p>
              </div>
              <button onClick={() => setPreview(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50"
                dangerouslySetInnerHTML={{ __html: preview.html_body.replace(/\{\{name\}\}/gi, 'John').replace(/\{\{email\}\}/gi, 'john@example.com') }} />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No templates yet. Create one above.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map(t => (
            <div key={t.id} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm">{t.name}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Subject: {t.subject}</p>
                </div>
              </div>
              <div className="h-24 overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2 text-xs text-gray-500 border border-gray-100 dark:border-gray-700 mb-3"
                dangerouslySetInnerHTML={{ __html: t.html_body.substring(0, 300) }} />
              <div className="flex gap-2">
                <button onClick={() => setPreview(t)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <Eye className="w-3.5 h-3.5" /> Preview
                </button>
                <button onClick={() => edit(t)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                  Edit
                </button>
                <button onClick={() => remove(t.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Campaigns Tab ─────────────────────────────────────────────────────────

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', subject: '', html_body: '', template_id: '' })
  const [sending, setSending] = useState(null)
  const [detail, setDetail] = useState(null)
  const [msg, setMsg] = useState(null)

  const fetchAll = useCallback(async () => {
    try {
      const [cRes, tRes] = await Promise.all([
        axios.get(`${API}/api/email/campaigns`),
        axios.get(`${API}/api/email/templates`)
      ])
      setCampaigns(cRes.data.campaigns)
      setTemplates(tRes.data.templates)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const loadTemplate = (templateId) => {
    const t = templates.find(x => x.id === Number(templateId))
    if (t) {
      setForm(p => ({ ...p, subject: t.subject, html_body: t.html_body, template_id: templateId }))
    }
  }

  const create = async () => {
    if (!form.name || !form.subject || !form.html_body) return
    try {
      await axios.post(`${API}/api/email/campaigns`, form)
      setForm({ name: '', subject: '', html_body: '', template_id: '' }); setShowForm(false)
      fetchAll()
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Failed' })
    }
  }

  const send = async (id) => {
    if (!confirm('Send this campaign to all subscribed contacts?')) return
    setSending(id)
    try {
      const { data } = await axios.post(`${API}/api/email/campaigns/${id}/send`)
      setMsg({ type: 'success', text: `Sent to ${data.sentCount}/${data.totalRecipients} recipients` })
      fetchAll()
    } catch (e) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Send failed' })
    }
    setSending(null)
  }

  const viewDetail = async (id) => {
    try {
      const { data } = await axios.get(`${API}/api/email/campaigns/${id}`)
      setDetail(data)
    } catch { /* ignore */ }
  }

  const remove = async (id) => {
    if (!confirm('Delete this campaign?')) return
    await axios.delete(`${API}/api/email/campaigns/${id}`)
    fetchAll()
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
          msg.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
        }`}>
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">New Campaign</h3>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Campaign name"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
          {templates.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Load from template (optional)</label>
              <select value={form.template_id} onChange={e => loadTemplate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
                <option value="">Choose template...</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Subject line"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
          <textarea value={form.html_body} onChange={e => setForm(p => ({ ...p, html_body: e.target.value }))}
            rows={10} placeholder="HTML body..."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white font-mono" />
          <div className="flex gap-2">
            <button onClick={create} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">Create Campaign</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-3xl w-full max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{detail.campaign.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Sent {detail.campaign.sent_count} &middot; Opened {detail.campaign.open_count}
                  {detail.campaign.sent_count > 0 && ` (${Math.round(detail.campaign.open_count / detail.campaign.sent_count * 100)}%)`}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              {detail.recipients.length === 0 ? (
                <p className="text-gray-400 text-sm">No recipients yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="text-center py-2 text-xs font-medium text-gray-500 uppercase">Sent</th>
                      <th className="text-center py-2 text-xs font-medium text-gray-500 uppercase">Opened</th>
                      <th className="text-center py-2 text-xs font-medium text-gray-500 uppercase">Clicked</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {detail.recipients.map(r => (
                      <tr key={r.id}>
                        <td className="py-2 text-gray-900 dark:text-white">{r.email}</td>
                        <td className="py-2 text-gray-600 dark:text-gray-400">{r.name || '—'}</td>
                        <td className="py-2 text-center">
                          {r.status === 'sent' ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="py-2 text-center">
                          {r.opened ? (
                            <span className="text-xs text-green-600 dark:text-green-400">{new Date(r.opened_at).toLocaleDateString()}</span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="py-2 text-center">
                          {r.clicked ? (
                            <span className="text-xs text-blue-600 dark:text-blue-400">{new Date(r.clicked_at).toLocaleDateString()}</span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No campaigns yet.</div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <div key={c.id} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm">{c.name}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.status === 'sent' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    }`}>
                      {c.status === 'sent' ? 'Sent' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Subject: {c.subject}
                    {c.sent_at && ` · Sent ${new Date(c.sent_at).toLocaleDateString()}`}
                  </p>
                  {c.status === 'sent' && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {c.sent_count} sent &middot; {c.open_count} opened
                      {c.sent_count > 0 && ` (${Math.round(c.open_count / c.sent_count * 100)}%)`}
                      {c.click_count > 0 && ` · ${c.click_count} clicked`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {c.status === 'draft' && (
                    <button onClick={() => send(c.id)} disabled={sending === c.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">
                      {sending === c.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      {sending === c.id ? 'Sending...' : 'Send'}
                    </button>
                  )}
                  <button onClick={() => viewDetail(c.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <Eye className="w-3.5 h-3.5" /> Details
                  </button>
                  <button onClick={() => remove(c.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Analytics Tab ─────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API}/api/email/analytics`).then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-12 text-gray-400">Loading analytics...</div>
  if (!data) return <div className="text-center py-12 text-gray-400">Could not load analytics.</div>

  const openRate = data.totalSent > 0 ? Math.round(data.totalOpens / data.totalSent * 100) : 0

  const stats = [
    { label: 'Total Contacts', value: data.totalContacts, sub: `${data.subscribedContacts} subscribed`, color: 'indigo' },
    { label: 'Campaigns Sent', value: data.totalCampaigns, sub: `${data.totalSent} emails total`, color: 'emerald' },
    { label: 'Total Opens', value: data.totalOpens, sub: `${openRate}% open rate`, color: 'amber' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-5">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{s.label}</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{s.value}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {data.recentCampaigns.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Campaigns</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Sent</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Opened</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Rate</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.recentCampaigns.map(c => (
                <tr key={c.id}>
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.sent_count}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.open_count}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${
                      c.sent_count > 0 && (c.open_count / c.sent_count) >= 0.3
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {c.sent_count > 0 ? `${Math.round(c.open_count / c.sent_count * 100)}%` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {c.sent_at ? new Date(c.sent_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
