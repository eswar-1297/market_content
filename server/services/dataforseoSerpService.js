import axios from 'axios';

// ═══════════════════════════════════════════════════════════════════════════════
// DATAFORSEO SERP SERVICE
//
// Single endpoint for all SERP-derived data:
//   • People Also Ask (PAA) questions — real Google PAA boxes
//   • Organic top-10 results — competitor pages ranking for a keyword
//   • Related searches — Google's "related searches" module
//
// Endpoint: POST /v3/serp/google/organic/live/advanced
// Cost: ~$0.002–0.004 per result row. Results are cached 4 hours in-memory
// so the same keyword only charges once per server session.
//
// Setup: add to server/.env
//   DATAFORSEO_LOGIN=your@email.com
//   DATAFORSEO_PASSWORD=your-api-password
// ═══════════════════════════════════════════════════════════════════════════════

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const REQUEST_TIMEOUT = 20000;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

const serpCache = new Map(); // `${keyword}|${locationCode}` → { ts, data }

export function isDataForSEOConfigured() {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

function getDFSAuth() {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  return Buffer.from(`${login}:${password}`).toString('base64');
}

function classifyIntent(text) {
  const lower = text.toLowerCase();
  if (/\bvs\b|compare|comparison|alternative|better|difference|between/i.test(lower)) return 'comparison';
  if (/buy|price|cost|plan|pricing|subscribe|free trial|worth it/i.test(lower)) return 'transactional';
  if (/how to|step|guide|tutorial|setup|install|configure|migrate|set up/i.test(lower)) return 'informational';
  if (/what is|what are|what does|define|meaning|explain/i.test(lower)) return 'informational';
  return 'informational';
}

/**
 * Fetch Google SERP for a keyword via DataForSEO.
 * Returns PAA questions, organic top-10, and related searches.
 * Results are cached 4 hours — repeated calls for the same keyword are free.
 *
 * @param {string} keyword - The search query (max 5 words recommended)
 * @param {object} [options]
 * @param {number} [options.locationCode=2840] - 2840 = United States
 * @param {number} [options.depth=10] - Number of organic results (1–100)
 * @returns {Promise<{paaQuestions, organicResults, relatedSearches, keyword}|null>}
 */
export async function fetchDataForSEOSerp(keyword, { locationCode = 2840, depth = 10 } = {}) {
  if (!isDataForSEOConfigured()) return null;

  const cacheKey = `${keyword.toLowerCase().trim()}|${locationCode}`;
  const cached = serpCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`  [DFS SERP] ♻ Cache hit for "${keyword}"`);
    return cached.data;
  }

  console.log(`  [DFS SERP] 📡 Fetching SERP for "${keyword}" (US, depth=${depth})...`);
  const t0 = Date.now();

  try {
    const { data: resp } = await axios.post(
      `${DATAFORSEO_BASE}/serp/google/organic/live/advanced`,
      [{
        keyword,
        location_code: locationCode,
        language_code: 'en',
        device:        'desktop',
        os:            'windows',
        depth
      }],
      {
        headers: {
          Authorization:  `Basic ${getDFSAuth()}`,
          'Content-Type': 'application/json'
        },
        timeout: REQUEST_TIMEOUT
      }
    );

    if (resp.status_code !== 20000) {
      console.error(`  [DFS SERP] ❌ API error ${resp.status_code}: ${resp.status_message}`);
      return null;
    }

    const task = resp.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      const msg = task?.status_message || 'unknown task error';
      if (msg.includes('balance') || msg.includes('credit')) {
        console.error(`  [DFS SERP] ❌ Insufficient credits — top up at dataforseo.com/billing`);
      } else {
        console.error(`  [DFS SERP] ❌ Task error: ${msg}`);
      }
      return null;
    }

    const items = task.result?.[0]?.items || [];
    const ms = Date.now() - t0;

    // ── Extract People Also Ask ──
    const paaQuestions = [];
    const paaSeen = new Set();
    for (const item of items) {
      if (item.type === 'people_also_ask') {
        for (const paaItem of (item.items || [])) {
          const q = (paaItem.title || paaItem.question || '').trim();
          if (!q || q.length < 10 || paaSeen.has(q.toLowerCase())) continue;
          paaSeen.add(q.toLowerCase());
          paaQuestions.push({
            question:             q.endsWith('?') ? q : q + '?',
            source:               'dataforseo-paa',
            intent:               classifyIntent(q),
            searchVolumePotential: 'high'
          });
        }
      }
    }

    // ── Extract organic top results ──
    const organicResults = items
      .filter(item => item.type === 'organic')
      .map(item => ({
        rank:        item.rank_absolute,
        url:         item.url,
        domain:      item.domain,
        title:       item.title,
        description: item.description || '',
        breadcrumb:  item.breadcrumb  || null
      }))
      .slice(0, 10);

    // ── Extract related searches ──
    const relatedSearches = [];
    for (const item of items) {
      if (item.type === 'related_searches') {
        for (const rel of (item.items || [])) {
          const title = rel.title || rel.query || '';
          if (title && title.length > 3) relatedSearches.push(title);
        }
      }
    }

    console.log(
      `  [DFS SERP] ✅ "${keyword}" → ${paaQuestions.length} PAA | ` +
      `${organicResults.length} organic | ${relatedSearches.length} related (${ms}ms)`
    );

    const result = { paaQuestions, organicResults, relatedSearches, keyword };
    serpCache.set(cacheKey, { ts: Date.now(), data: result });
    return result;

  } catch (e) {
    const ms = Date.now() - t0;
    if (e.response?.status === 401) {
      console.error(`  [DFS SERP] ❌ Auth failed (${ms}ms) — check DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD`);
    } else {
      console.error(`  [DFS SERP] ❌ Request failed (${ms}ms): ${e.message}`);
    }
    return null;
  }
}
