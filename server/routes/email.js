import express from 'express';
import {
  addContact, addContactsBulk, getContacts, deleteContact, toggleSubscription,
  createTemplate, getTemplates, getTemplateById, updateTemplate, deleteTemplate,
  createCampaign, getCampaigns, getCampaignById, deleteCampaign,
  getCampaignRecipients, getAnalytics,
  recordOpen, recordClick, unsubscribeByTrackingId,
} from '../db/emailDb.js';
import { sendCampaign } from '../services/emailService.js';

const router = express.Router();

// ─── Contacts ──────────────────────────────────────────────────────────────

router.get('/email/contacts', (req, res) => {
  try {
    const contacts = getContacts();
    res.json({ contacts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/email/contacts', (req, res) => {
  try {
    const { email, name, tags } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    addContact({ email, name, tags });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/email/contacts/bulk', (req, res) => {
  try {
    const { contacts } = req.body;
    if (!Array.isArray(contacts)) return res.status(400).json({ error: 'contacts array required' });
    const added = addContactsBulk(contacts);
    res.json({ success: true, added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/email/contacts/:id', (req, res) => {
  try {
    deleteContact(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/email/contacts/:id/subscription', (req, res) => {
  try {
    const { subscribed } = req.body;
    toggleSubscription(Number(req.params.id), subscribed);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Templates ─────────────────────────────────────────────────────────────

router.get('/email/templates', (req, res) => {
  try {
    res.json({ templates: getTemplates() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/email/templates', (req, res) => {
  try {
    const { name, subject, html_body } = req.body;
    if (!name || !subject || !html_body) return res.status(400).json({ error: 'name, subject, html_body required' });
    const result = createTemplate({ name, subject, html_body });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/email/templates/:id', (req, res) => {
  try {
    const t = getTemplateById(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'Template not found' });
    res.json({ template: t });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/email/templates/:id', (req, res) => {
  try {
    const { name, subject, html_body } = req.body;
    updateTemplate(Number(req.params.id), { name, subject, html_body });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/email/templates/:id', (req, res) => {
  try {
    deleteTemplate(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Campaigns ─────────────────────────────────────────────────────────────

router.get('/email/campaigns', (req, res) => {
  try {
    res.json({ campaigns: getCampaigns() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/email/campaigns', (req, res) => {
  try {
    const { name, subject, html_body, template_id } = req.body;
    if (!name || !subject || !html_body) return res.status(400).json({ error: 'name, subject, html_body required' });
    const result = createCampaign({ name, subject, html_body, template_id });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/email/campaigns/:id', (req, res) => {
  try {
    const c = getCampaignById(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'Campaign not found' });
    const recipients = getCampaignRecipients(c.id);
    res.json({ campaign: c, recipients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/email/campaigns/:id/send', async (req, res) => {
  try {
    const result = await sendCampaign(Number(req.params.id));
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/email/campaigns/:id', (req, res) => {
  try {
    deleteCampaign(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Analytics ─────────────────────────────────────────────────────────────

router.get('/email/analytics', (req, res) => {
  try {
    res.json(getAnalytics());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Tracking (public endpoints — no auth) ─────────────────────────────────

const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

router.get('/email/track/open/:trackingId', (req, res) => {
  recordOpen(req.params.trackingId);
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate' });
  res.send(TRANSPARENT_GIF);
});

router.get('/email/track/click/:trackingId', (req, res) => {
  recordClick(req.params.trackingId);
  const url = req.query.url;
  if (url) return res.redirect(url);
  res.redirect('/');
});

router.get('/email/unsubscribe/:trackingId', (req, res) => {
  const success = unsubscribeByTrackingId(req.params.trackingId);
  res.send(`
    <!DOCTYPE html>
    <html><head><title>Unsubscribed</title>
    <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}
    .card{background:white;border-radius:12px;padding:40px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.1);max-width:400px}
    h1{color:#333;font-size:24px}p{color:#666;font-size:16px}</style></head>
    <body><div class="card">
    <h1>${success ? 'Unsubscribed' : 'Link Expired'}</h1>
    <p>${success ? 'You have been successfully unsubscribed from our mailing list.' : 'This unsubscribe link is no longer valid.'}</p>
    </div></body></html>
  `);
});

export default router;
