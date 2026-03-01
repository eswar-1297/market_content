import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, 'email.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    subscribed INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,
    template_id INTEGER,
    status TEXT DEFAULT 'draft',
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    scheduled_at TEXT,
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (template_id) REFERENCES templates(id)
  );

  CREATE TABLE IF NOT EXISTS campaign_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    tracking_id TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    opened INTEGER DEFAULT 0,
    opened_at TEXT,
    clicked INTEGER DEFAULT 0,
    clicked_at TEXT,
    sent_at TEXT,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cr_campaign ON campaign_recipients(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_cr_tracking ON campaign_recipients(tracking_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
`);

// ─── Contacts ──────────────────────────────────────────────────────────────

export function addContact({ email, name = '', tags = '' }) {
  const stmt = db.prepare(`
    INSERT INTO contacts (email, name, tags) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name, tags = excluded.tags, updated_at = datetime('now')
  `);
  return stmt.run(email.toLowerCase().trim(), name.trim(), tags.trim());
}

export function addContactsBulk(contacts) {
  const stmt = db.prepare(`
    INSERT INTO contacts (email, name, tags) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name, tags = excluded.tags, updated_at = datetime('now')
  `);
  const tx = db.transaction((list) => {
    let added = 0;
    for (const c of list) {
      if (c.email?.trim()) {
        stmt.run(c.email.toLowerCase().trim(), (c.name || '').trim(), (c.tags || '').trim());
        added++;
      }
    }
    return added;
  });
  return tx(contacts);
}

export function getContacts({ subscribed } = {}) {
  if (subscribed !== undefined) {
    return db.prepare('SELECT * FROM contacts WHERE subscribed = ? ORDER BY created_at DESC').all(subscribed ? 1 : 0);
  }
  return db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all();
}

export function getContactById(id) {
  return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
}

export function deleteContact(id) {
  return db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
}

export function unsubscribeByTrackingId(trackingId) {
  const recipient = db.prepare('SELECT contact_id FROM campaign_recipients WHERE tracking_id = ?').get(trackingId);
  if (recipient) {
    db.prepare('UPDATE contacts SET subscribed = 0, updated_at = datetime(\'now\') WHERE id = ?').run(recipient.contact_id);
    return true;
  }
  return false;
}

export function toggleSubscription(contactId, subscribed) {
  return db.prepare('UPDATE contacts SET subscribed = ?, updated_at = datetime(\'now\') WHERE id = ?').run(subscribed ? 1 : 0, contactId);
}

// ─── Templates ─────────────────────────────────────────────────────────────

export function createTemplate({ name, subject, html_body }) {
  const stmt = db.prepare('INSERT INTO templates (name, subject, html_body) VALUES (?, ?, ?)');
  return stmt.run(name, subject, html_body);
}

export function getTemplates() {
  return db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all();
}

export function getTemplateById(id) {
  return db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
}

export function updateTemplate(id, { name, subject, html_body }) {
  return db.prepare('UPDATE templates SET name = ?, subject = ?, html_body = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(name, subject, html_body, id);
}

export function deleteTemplate(id) {
  return db.prepare('DELETE FROM templates WHERE id = ?').run(id);
}

// ─── Campaigns ─────────────────────────────────────────────────────────────

export function createCampaign({ name, subject, html_body, template_id }) {
  const stmt = db.prepare('INSERT INTO campaigns (name, subject, html_body, template_id) VALUES (?, ?, ?, ?)');
  return stmt.run(name, subject, html_body, template_id || null);
}

export function getCampaigns() {
  return db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
}

export function getCampaignById(id) {
  return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
}

export function deleteCampaign(id) {
  return db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
}

export function addCampaignRecipients(campaignId, contactIds, trackingIds) {
  const stmt = db.prepare('INSERT OR IGNORE INTO campaign_recipients (campaign_id, contact_id, tracking_id) VALUES (?, ?, ?)');
  const tx = db.transaction(() => {
    for (let i = 0; i < contactIds.length; i++) {
      stmt.run(campaignId, contactIds[i], trackingIds[i]);
    }
    db.prepare('UPDATE campaigns SET total_recipients = ? WHERE id = ?').run(contactIds.length, campaignId);
  });
  tx();
}

export function markCampaignSent(campaignId, sentCount) {
  db.prepare('UPDATE campaigns SET status = ?, sent_count = ?, sent_at = datetime(\'now\') WHERE id = ?')
    .run('sent', sentCount, campaignId);
}

export function markRecipientSent(trackingId) {
  db.prepare('UPDATE campaign_recipients SET status = ?, sent_at = datetime(\'now\') WHERE tracking_id = ?')
    .run('sent', trackingId);
}

export function recordOpen(trackingId) {
  const r = db.prepare('SELECT * FROM campaign_recipients WHERE tracking_id = ?').get(trackingId);
  if (!r) return false;
  if (!r.opened) {
    db.prepare('UPDATE campaign_recipients SET opened = 1, opened_at = datetime(\'now\') WHERE tracking_id = ?').run(trackingId);
    db.prepare('UPDATE campaigns SET open_count = open_count + 1 WHERE id = ?').run(r.campaign_id);
  }
  return true;
}

export function recordClick(trackingId) {
  const r = db.prepare('SELECT * FROM campaign_recipients WHERE tracking_id = ?').get(trackingId);
  if (!r) return false;
  if (!r.clicked) {
    db.prepare('UPDATE campaign_recipients SET clicked = 1, clicked_at = datetime(\'now\') WHERE tracking_id = ?').run(trackingId);
    db.prepare('UPDATE campaigns SET click_count = click_count + 1 WHERE id = ?').run(r.campaign_id);
  }
  return true;
}

export function getCampaignRecipients(campaignId) {
  return db.prepare(`
    SELECT cr.*, c.email, c.name, c.subscribed
    FROM campaign_recipients cr
    JOIN contacts c ON cr.contact_id = c.id
    WHERE cr.campaign_id = ?
    ORDER BY cr.opened DESC, cr.sent_at DESC
  `).all(campaignId);
}

export function getAnalytics() {
  const totalContacts = db.prepare('SELECT COUNT(*) as count FROM contacts').get().count;
  const subscribedContacts = db.prepare('SELECT COUNT(*) as count FROM contacts WHERE subscribed = 1').get().count;
  const totalCampaigns = db.prepare('SELECT COUNT(*) as count FROM campaigns WHERE status = ?').get('sent').count;
  const totalSent = db.prepare('SELECT COALESCE(SUM(sent_count), 0) as total FROM campaigns').get().total;
  const totalOpens = db.prepare('SELECT COALESCE(SUM(open_count), 0) as total FROM campaigns').get().total;
  const recentCampaigns = db.prepare('SELECT * FROM campaigns WHERE status = ? ORDER BY sent_at DESC LIMIT 10').all('sent');
  return { totalContacts, subscribedContacts, totalCampaigns, totalSent, totalOpens, recentCampaigns };
}

export default db;
