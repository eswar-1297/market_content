import XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CALENDAR_PATH = join(__dirname, '..', 'Article Content Calendar 2026 (3).xlsx');

const WRITER_SHEETS = {
  bhavani: 'Bhavani',
  rashmi: 'Rashmi',
  aayushi: 'Aayushi',
  ayushi: 'Aayushi',
  pankaj: 'Pankaj'
};

function loadWorkbook() {
  try {
    const buf = readFileSync(CALENDAR_PATH);
    return XLSX.read(buf, { type: 'buffer', raw: false });
  } catch (e) {
    console.warn('Content calendar not found or unreadable:', e.message);
    return null;
  }
}

function parseDateExcel(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  // Excel dates are DD/MM/YY format (Indian locale)
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return null;
  return d;
}

function isToday(d) {
  if (!d) return false;
  const today = new Date();
  return d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
}

function isWritten(row) {
  const status = (row[2] ?? '').toString().trim().toLowerCase();
  const published = (row[3] ?? '').toString().trim();
  const link = (row[4] ?? '').toString().trim();
  return status === 'written' || status === 'published' || status === 'done' || published !== '' || link !== '';
}

/**
 * Get today's topic for a writer from the content calendar.
 * Writers: Bhavani, Rashmi, Aayushi (or Ayushi), Pankaj.
 * @param {string} writerName - e.g. "Rashmi", "Bhavani", "Ayushi", "Pankaj"
 * @returns {{ topic: string|null, written: boolean, allTopics?: Array<{date?: string, title: string, written: boolean}> } | null}
 */
export function getTodayTopicForWriter(writerName) {
  const wb = loadWorkbook();
  if (!wb) return null;

  const normalized = (writerName || '').toString().trim().toLowerCase();
  const sheetName = WRITER_SHEETS[normalized];
  if (!sheetName || !wb.Sheets[sheetName]) {
    return null;
  }

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (rows.length < 2) return { topic: null, written: false, allTopics: [] };

  const header = rows[0].map(c => (c ?? '').toString().toLowerCase());
  const hasDateCol = header.some(h => h.includes('date'));
  const titleCol = header.findIndex(h => h.includes('title') || h.includes('blog title'));
  if (titleCol < 0) return { topic: null, written: false, allTopics: [] };

  const dataRows = rows.slice(1).filter(r => (r[titleCol] ?? '').toString().trim() !== '');

  if (sheetName === 'Aayushi') {
    const topics = dataRows.map((r, i) => ({
      title: (r[titleCol] ?? r[1] ?? '').toString().trim(),
      written: isWritten(r),
      index: i + 1
    })).filter(t => t.title);
    const next = topics.find(t => !t.written);
    return {
      topic: next ? next.title : (topics[0]?.title ?? null),
      written: next ? false : (topics.length > 0),
      allTopics: topics.slice(0, 15).map(t => ({ title: t.title, written: t.written }))
    };
  }

  const dateCol = header.findIndex(h => h === 'date' || h.includes('date'));
  const topics = dataRows.map(r => {
    const dateVal = dateCol >= 0 ? r[dateCol] : null;
    const d = parseDateExcel(dateVal);
    return {
      date: dateVal ? String(dateVal).trim() : null,
      dateObj: d,
      title: (r[titleCol] ?? '').toString().trim(),
      written: isWritten(r)
    };
  }).filter(t => t.title);

  const todayRow = topics.find(t => isToday(t.dateObj));
  if (todayRow) {
    return {
      topic: todayRow.title,
      written: todayRow.written,
      date: todayRow.date,
      allTopics: topics.slice(0, 20).map(t => ({ date: t.date, title: t.title, written: t.written }))
    };
  }

  const nextRow = topics.find(t => t.dateObj && t.dateObj >= new Date() && !t.written);
  return {
    topic: nextRow ? nextRow.title : (topics[0]?.title ?? null),
    written: false,
    nextDate: nextRow?.date ?? null,
    allTopics: topics.slice(0, 20).map(t => ({ date: t.date, title: t.title, written: t.written }))
  };
}

/**
 * Resolve writer name from message (e.g. "I am Rashmi" -> "Rashmi").
 * @param {string} message
 * @returns {string|null}
 */
export function detectWriterFromMessage(message) {
  if (!message || typeof message !== 'string') return null;
  const lower = message.toLowerCase();
  if (/\b(rashmi|bhavani|aayushi|ayushi|pankaj)\b/.test(lower)) {
    const m = lower.match(/\b(rashmi|bhavani|aayushi|ayushi|pankaj)\b/);
    const name = (m[1] || '').trim();
    if (name === 'ayushi') return 'Aayushi';
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return null;
}
