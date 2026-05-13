import axios from 'axios';
import { isDataForSEOConfigured } from './dataforseoSerpService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PEOPLE ALSO ASK SERVICE — DataForSEO-powered
//
// Two complementary sources:
//
// 1. Google Autocomplete (primary) — runs 10 question-word prefixes against
//    Google's autocomplete API. Returns real queries people are typing RIGHT NOW.
//    These are the most reliable signal of actual search intent.
//    e.g. "how to sharepoint migration" → 15 real suggestions
//
// 2. PAA Tree from SERP (secondary) — runs SERP for the topic + common variants
//    ("how to X", "best X", "what is X") and extracts the People Also Ask boxes.
//    Google shows PAA for some keywords but not all.
//
// Combined output: 20-60 deduplicated, ranked, real questions people ask.
// Cost: ~10 autocomplete calls × $0.0005 = $0.005 per topic
// ═══════════════════════════════════════════════════════════════════════════════

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const cache = new Map();

const QUESTION_WORDS = ['how', 'what', 'why', 'when', 'where', 'which', 'who', 'can', 'does',
  'is', 'are', 'will', 'should', 'do', 'best', 'how long', 'how much', 'how many'];

function getAuth() {
  return Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
}

function isQuestion(text) {
  if (!text || text.length < 10) return false;
  const lower = text.toLowerCase().trim();
  return text.endsWith('?') || QUESTION_WORDS.some(w => lower.startsWith(w + ' '));
}

function toQuestion(text) {
  const t = text.trim();
  return t.endsWith('?') ? t : t + '?';
}

function classifyIntent(text) {
  const l = text.toLowerCase();
  if (/\bvs\b|compar|alternative|better|difference|between/i.test(l)) return 'comparison';
  if (/price|cost|how much|free|pricing|plan|subscribe/i.test(l)) return 'commercial';
  if (/how to|step|guide|tutorial|migrate|set up|install|configure/i.test(l)) return 'how-to';
  if (/what is|what are|define|meaning|explain/i.test(l)) return 'definitional';
  if (/why|should|benefit|advantage/i.test(l)) return 'informational';
  return 'informational';
}

// ── Source 1: Google Autocomplete — 10 question-prefix variations ─────────────

async function fetchAutocompleteQuestions(topic, locationCode) {
  const shortTopic = topic.split(' ').slice(0, 5).join(' ');

  // Question-word prefixes that surface different intent types
  const prefixes = [
    `how to ${shortTopic}`,
    `how do i ${shortTopic}`,
    `what is ${shortTopic}`,
    `what are ${shortTopic}`,
    `why ${shortTopic}`,
    `is ${shortTopic}`,
    `can i ${shortTopic}`,
    `how long does ${shortTopic}`,
    `how much does ${shortTopic}`,
    `best ${shortTopic}`,
    `${shortTopic} vs`,
    `${shortTopic} cost`,
    `${shortTopic} tool`,
    `${shortTopic} free`,
  ];

  const results = await Promise.allSettled(
    prefixes.map(prefix =>
      axios.post(
        `${DATAFORSEO_BASE}/serp/google/autocomplete/live/advanced`,
        [{ keyword: prefix, location_code: locationCode, language_code: 'en', cursor_pointer: prefix.length }],
        { headers: { Authorization: `Basic ${getAuth()}`, 'Content-Type': 'application/json' }, timeout: 12000 }
      )
    )
  );

  const questions = [];
  const seen = new Set();

  for (let i = 0; i < results.length; i++) {
    if (results[i].status !== 'fulfilled') continue;
    const items = results[i].value.data.tasks?.[0]?.result?.[0]?.items || [];
    for (const item of items) {
      const text = (item.suggestion || item.value || '').trim();
      if (!text || text.length < 10 || text.length > 200) continue;
      const norm = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      if (seen.has(norm)) continue;
      seen.add(norm);
      questions.push({
        question:  toQuestion(text),
        source:    'google-autocomplete',
        intent:    classifyIntent(text),
        prefix:    prefixes[i],
        priority:  isQuestion(text) ? 'high' : 'medium'
      });
    }
  }

  return questions;
}

// ── Source 2: PAA boxes from SERP on multiple seed variants ───────────────────

async function fetchPAAFromSERPs(topic, locationCode) {
  const shortTopic = topic.split(' ').slice(0, 4).join(' ');
  const variants = [
    topic,
    `how to ${shortTopic}`,
    `best ${shortTopic}`,
    `what is ${shortTopic}`,
  ];

  const results = await Promise.allSettled(
    variants.map(kw =>
      axios.post(
        `${DATAFORSEO_BASE}/serp/google/organic/live/advanced`,
        [{ keyword: kw, location_code: locationCode, language_code: 'en', depth: 10 }],
        { headers: { Authorization: `Basic ${getAuth()}`, 'Content-Type': 'application/json' }, timeout: 20000 }
      )
    )
  );

  const questions = [];
  const seen = new Set();

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const items = result.value.data.tasks?.[0]?.result?.[0]?.items || [];
    const paaBlocks = items.filter(i => i.type === 'people_also_ask');
    for (const block of paaBlocks) {
      for (const paaItem of (block.items || [])) {
        const text = (paaItem.title || paaItem.question || '').trim();
        if (!text || text.length < 10) continue;
        const norm = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        if (seen.has(norm)) continue;
        seen.add(norm);
        questions.push({
          question: toQuestion(text),
          source:   'google-paa',
          intent:   classifyIntent(text),
          priority: 'high'
        });
      }
    }
    // Also grab related searches that look like questions
    const related = items.filter(i => i.type === 'related_searches');
    for (const block of related) {
      for (const rel of (block.items || [])) {
        const text = (rel.title || '').trim();
        if (!text || !isQuestion(text)) continue;
        const norm = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        if (seen.has(norm)) continue;
        seen.add(norm);
        questions.push({
          question: toQuestion(text),
          source:   'google-related',
          intent:   classifyIntent(text),
          priority: 'medium'
        });
      }
    }
  }

  return questions;
}

// ── Dedup across sources + rank ───────────────────────────────────────────────

function deduplicateAndRank(allQuestions) {
  const seen = new Map();
  const SOURCE_PRIORITY = { 'google-paa': 0, 'google-autocomplete': 1, 'google-related': 2 };

  for (const q of allQuestions) {
    const norm = q.question.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (seen.has(norm)) {
      const existing = seen.get(norm);
      if ((SOURCE_PRIORITY[q.source] ?? 9) < (SOURCE_PRIORITY[existing.source] ?? 9)) {
        seen.set(norm, q);
      }
      continue;
    }
    // Fuzzy dedup — skip if >65% word overlap with existing question
    const words = new Set(norm.split(' ').filter(w => w.length > 3));
    let isDupe = false;
    for (const [existNorm] of seen) {
      const existWords = new Set(existNorm.split(' ').filter(w => w.length > 3));
      const inter = [...words].filter(w => existWords.has(w)).length;
      const union = new Set([...words, ...existWords]).size;
      if (union > 0 && inter / union > 0.65) { isDupe = true; break; }
    }
    if (!isDupe) seen.set(norm, q);
  }

  // Sort: PAA first, then autocomplete; high priority first; then alphabetical
  return [...seen.values()].sort((a, b) => {
    const sp = (SOURCE_PRIORITY[a.source] ?? 9) - (SOURCE_PRIORITY[b.source] ?? 9);
    if (sp !== 0) return sp;
    const pp = (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1);
    if (pp !== 0) return pp;
    return a.question.localeCompare(b.question);
  });
}

// ── Main exported function ────────────────────────────────────────────────────

/**
 * Fetch all questions people are asking about a topic via DataForSEO.
 * Combines Google Autocomplete (primary) + PAA from SERP (secondary).
 *
 * @param {string} topic - Article topic or keyword phrase
 * @param {object} [options]
 * @param {number} [options.locationCode=2840]
 * @param {number} [options.limit=40]
 * @returns {Promise<{topic, questions, byIntent, totalFound}>}
 */
export async function fetchMostAskedQuestions(topic, { locationCode = 2840, limit = 40 } = {}) {
  if (!isDataForSEOConfigured()) return { error: 'DataForSEO not configured.' };
  if (!topic) return { error: 'Topic is required.' };

  const cacheKey = `paa:${topic.toLowerCase().trim()}:${locationCode}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`  [PAA] ♻ Cache hit for "${topic}"`);
    return cached.data;
  }

  console.log(`  [PAA] 📡 Mining questions for "${topic}"...`);
  const t0 = Date.now();

  // Run both sources in parallel
  const [autocompleteQs, paaQs] = await Promise.all([
    fetchAutocompleteQuestions(topic, locationCode),
    fetchPAAFromSERPs(topic, locationCode)
  ]);

  const all = [...paaQs, ...autocompleteQs];
  const deduped = deduplicateAndRank(all).slice(0, limit);
  const ms = Date.now() - t0;

  // Group by intent
  const byIntent = {};
  for (const q of deduped) {
    if (!byIntent[q.intent]) byIntent[q.intent] = [];
    byIntent[q.intent].push(q.question);
  }

  // Source breakdown
  const fromPAA  = deduped.filter(q => q.source === 'google-paa').length;
  const fromAC   = deduped.filter(q => q.source === 'google-autocomplete').length;
  const fromRel  = deduped.filter(q => q.source === 'google-related').length;

  console.log(
    `  [PAA] ✅ "${topic}" → ${deduped.length} unique questions ` +
    `(PAA:${fromPAA} + Autocomplete:${fromAC} + Related:${fromRel}) in ${ms}ms`
  );

  const result = {
    topic,
    questions: deduped,
    byIntent,
    totalFound:  deduped.length,
    sourceCounts: { paa: fromPAA, autocomplete: fromAC, related: fromRel },
    fetchTimeMs: ms
  };

  cache.set(cacheKey, { ts: Date.now(), data: result });
  return result;
}
