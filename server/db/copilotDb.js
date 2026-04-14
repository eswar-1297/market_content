import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, 'copilot.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS writers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    writer_id TEXT NOT NULL REFERENCES writers(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    url TEXT DEFAULT '',
    topic TEXT DEFAULT '',
    content_type TEXT DEFAULT 'general',
    primary_keyword TEXT DEFAULT '',
    secondary_keywords TEXT DEFAULT '[]',
    framework_used TEXT DEFAULT '[]',
    word_count INTEGER DEFAULT 0,
    published_at TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS article_chunks (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    section_type TEXT DEFAULT '',
    heading TEXT DEFAULT '',
    chunk_index INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS writer_profiles (
    writer_id TEXT PRIMARY KEY REFERENCES writers(id),
    avg_word_count REAL DEFAULT 0,
    preferred_frameworks TEXT DEFAULT '{}',
    common_topics TEXT DEFAULT '[]',
    writing_style TEXT DEFAULT '',
    tone_analysis TEXT DEFAULT '',
    total_articles INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS copilot_sessions (
    id TEXT PRIMARY KEY,
    writer_id TEXT NOT NULL REFERENCES writers(id),
    topic TEXT NOT NULL,
    content_type TEXT DEFAULT '',
    framework TEXT DEFAULT '[]',
    semantic_keywords TEXT DEFAULT '{}',
    current_content TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES copilot_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tool_steps TEXT DEFAULT '[]',
    is_agent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

  CREATE TABLE IF NOT EXISTS content_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES copilot_sessions(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    label TEXT DEFAULT '',
    source TEXT DEFAULT 'auto',
    word_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_content_snapshots_session ON content_snapshots(session_id);

  CREATE TABLE IF NOT EXISTS agent_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id TEXT NOT NULL,
    session_id TEXT DEFAULT '',
    writer_id TEXT DEFAULT '',
    score INTEGER NOT NULL,
    comment TEXT DEFAULT '',
    user_message TEXT DEFAULT '',
    assistant_response TEXT DEFAULT '',
    topic TEXT DEFAULT '',
    tools_used TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agent_feedback_writer ON agent_feedback(writer_id);
  CREATE INDEX IF NOT EXISTS idx_agent_feedback_score ON agent_feedback(score);
`);

const ensureDefaultWriter = db.prepare(`
  INSERT OR IGNORE INTO writers (id, name, email) VALUES ('default', 'Default Writer', '')
`);
ensureDefaultWriter.run();

// --- Writers ---

export function getWriter(id) {
  return db.prepare('SELECT * FROM writers WHERE id = ?').get(id);
}

export function createWriter(id, name, email = '') {
  db.prepare('INSERT OR IGNORE INTO writers (id, name, email) VALUES (?, ?, ?)').run(id, name, email);
  return getWriter(id);
}

export function listWriters() {
  return db.prepare('SELECT * FROM writers ORDER BY created_at DESC').all();
}

// --- Articles ---

export function saveArticle(article) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO articles (id, writer_id, title, content, url, topic, content_type, primary_keyword, secondary_keywords, framework_used, word_count, published_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(
    article.id, article.writer_id, article.title, article.content,
    article.url || '', article.topic || '', article.content_type || 'general',
    article.primary_keyword || '',
    JSON.stringify(article.secondary_keywords || []),
    JSON.stringify(article.framework_used || []),
    article.word_count || 0,
    article.published_at || ''
  );
  return getArticle(article.id);
}

export function getArticle(id) {
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
  if (!row) return null;
  row.secondary_keywords = JSON.parse(row.secondary_keywords || '[]');
  row.framework_used = JSON.parse(row.framework_used || '[]');
  return row;
}

export function listArticles(writerId, limit = 50) {
  const rows = db.prepare(
    'SELECT id, writer_id, title, topic, content_type, primary_keyword, word_count, published_at, created_at FROM articles WHERE writer_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(writerId, limit);
  return rows;
}

export function deleteArticle(id) {
  db.prepare('DELETE FROM article_chunks WHERE article_id = ?').run(id);
  const info = db.prepare('DELETE FROM articles WHERE id = ?').run(id);
  return info.changes > 0;
}

export function searchArticles(writerId, query) {
  const pattern = `%${query}%`;
  const rows = db.prepare(
    'SELECT id, title, topic, content_type, primary_keyword, word_count, created_at FROM articles WHERE writer_id = ? AND (title LIKE ? OR topic LIKE ? OR primary_keyword LIKE ? OR content LIKE ?) ORDER BY created_at DESC LIMIT 20'
  ).all(writerId, pattern, pattern, pattern, pattern);
  return rows;
}

// --- Article Chunks ---

export function saveChunks(articleId, chunks) {
  db.prepare('DELETE FROM article_chunks WHERE article_id = ?').run(articleId);
  const stmt = db.prepare(
    'INSERT INTO article_chunks (id, article_id, chunk_text, section_type, heading, chunk_index) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertMany = db.transaction((items) => {
    for (const c of items) {
      stmt.run(c.id, articleId, c.chunk_text, c.section_type || '', c.heading || '', c.chunk_index || 0);
    }
  });
  insertMany(chunks);
}

export function getChunks(articleId) {
  return db.prepare('SELECT * FROM article_chunks WHERE article_id = ? ORDER BY chunk_index').all(articleId);
}

export function searchChunks(writerId, query, limit = 10) {
  const pattern = `%${query}%`;
  return db.prepare(`
    SELECT ac.*, a.title as article_title, a.topic as article_topic
    FROM article_chunks ac
    JOIN articles a ON ac.article_id = a.id
    WHERE a.writer_id = ? AND ac.chunk_text LIKE ?
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(writerId, pattern, limit);
}

// --- Writer Profiles ---

export function getWriterProfile(writerId) {
  const row = db.prepare('SELECT * FROM writer_profiles WHERE writer_id = ?').get(writerId);
  if (!row) return null;
  row.preferred_frameworks = JSON.parse(row.preferred_frameworks || '{}');
  row.common_topics = JSON.parse(row.common_topics || '[]');
  return row;
}

export function saveWriterProfile(profile) {
  db.prepare(`
    INSERT OR REPLACE INTO writer_profiles (writer_id, avg_word_count, preferred_frameworks, common_topics, writing_style, tone_analysis, total_articles, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    profile.writer_id,
    profile.avg_word_count || 0,
    JSON.stringify(profile.preferred_frameworks || {}),
    JSON.stringify(profile.common_topics || []),
    profile.writing_style || '',
    profile.tone_analysis || '',
    profile.total_articles || 0
  );
  return getWriterProfile(profile.writer_id);
}

// --- Copilot Sessions ---

export function createSession(session) {
  db.prepare(`
    INSERT INTO copilot_sessions (id, writer_id, topic, content_type, framework, semantic_keywords, current_content, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(
    session.id, session.writer_id, session.topic,
    session.content_type || '',
    JSON.stringify(session.framework || []),
    JSON.stringify(session.semantic_keywords || {}),
    session.current_content || ''
  );
  return getSession(session.id);
}

export function getSession(id) {
  const row = db.prepare('SELECT * FROM copilot_sessions WHERE id = ?').get(id);
  if (!row) return null;
  row.framework = JSON.parse(row.framework || '[]');
  row.semantic_keywords = JSON.parse(row.semantic_keywords || '{}');
  return row;
}

export function updateSession(id, updates) {
  const fields = [];
  const values = [];
  if (updates.current_content !== undefined) { fields.push('current_content = ?'); values.push(updates.current_content); }
  if (updates.framework !== undefined) { fields.push('framework = ?'); values.push(JSON.stringify(updates.framework)); }
  if (updates.semantic_keywords !== undefined) { fields.push('semantic_keywords = ?'); values.push(JSON.stringify(updates.semantic_keywords)); }
  if (updates.content_type !== undefined) { fields.push('content_type = ?'); values.push(updates.content_type); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (fields.length === 0) return getSession(id);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE copilot_sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSession(id);
}

export function listSessions(writerId, limit = 20) {
  const rows = db.prepare(
    'SELECT id, writer_id, topic, content_type, status, created_at, updated_at FROM copilot_sessions WHERE writer_id = ? ORDER BY updated_at DESC LIMIT ?'
  ).all(writerId, limit);
  return rows;
}

// --- Content Snapshots ---

export function saveContentSnapshot(sessionId, content, label = '', source = 'auto') {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  db.prepare(
    'INSERT INTO content_snapshots (session_id, content, label, source, word_count) VALUES (?, ?, ?, ?, ?)'
  ).run(sessionId, content, label, source, wordCount);
}

export function getContentSnapshots(sessionId) {
  return db.prepare(
    'SELECT id, session_id, label, source, word_count, created_at FROM content_snapshots WHERE session_id = ? ORDER BY created_at ASC'
  ).all(sessionId);
}

export function getSnapshotContent(snapshotId) {
  return db.prepare('SELECT * FROM content_snapshots WHERE id = ?').get(snapshotId);
}

export function deleteContentSnapshot(snapshotId) {
  const info = db.prepare('DELETE FROM content_snapshots WHERE id = ?').run(snapshotId);
  return info.changes > 0;
}

// --- Chat Messages ---

export function saveChatMessage(sessionId, role, content, toolSteps = [], isAgent = false) {
  const stmt = db.prepare(
    'INSERT INTO chat_messages (session_id, role, content, tool_steps, is_agent) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(sessionId, role, content, JSON.stringify(toolSteps), isAgent ? 1 : 0);
}

export function getSessionMessages(sessionId) {
  const rows = db.prepare(
    'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC, id ASC'
  ).all(sessionId);
  return rows.map(r => ({
    ...r,
    tool_steps: JSON.parse(r.tool_steps || '[]'),
    is_agent: !!r.is_agent
  }));
}

export function deleteSession(id) {
  db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(id);
  const info = db.prepare('DELETE FROM copilot_sessions WHERE id = ?').run(id);
  return info.changes > 0;
}

// ═══ AGENT FEEDBACK ═══

export function saveFeedback({ traceId, sessionId, writerId, score, comment, userMessage, assistantResponse, topic, toolsUsed }) {
  const stmt = db.prepare(
    'INSERT INTO agent_feedback (trace_id, session_id, writer_id, score, comment, user_message, assistant_response, topic, tools_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(
    traceId || '',
    sessionId || '',
    writerId || '',
    score,
    comment || '',
    (userMessage || '').substring(0, 2000),
    (assistantResponse || '').substring(0, 3000),
    topic || '',
    toolsUsed || ''
  );
}

/**
 * Get recent negative feedback for a writer (or all writers).
 * Used to inject "lessons learned" into the agent prompt so it avoids repeating mistakes.
 * @param {string} writerId - Filter by writer, or '' for all
 * @param {number} limit - Max feedback items to return
 * @returns {Array} Feedback entries with comment, user_message, assistant_response, topic
 */
export function getNegativeFeedback(writerId = '', limit = 10) {
  let query = 'SELECT comment, user_message, assistant_response, topic, tools_used, created_at FROM agent_feedback WHERE score = 0 AND comment != \'\'';
  const params = [];
  if (writerId) {
    query += ' AND writer_id = ?';
    params.push(writerId);
  }
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  return db.prepare(query).all(...params);
}

/**
 * Get all feedback (positive + negative) for analytics.
 */
export function getAllFeedback(limit = 50) {
  return db.prepare(
    'SELECT * FROM agent_feedback ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

export default db;
