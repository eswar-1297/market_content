import axios from 'axios';

// ═══════════════════════════════════════════════════════════════════════════════
// KEYWORD VOLUME SERVICE — SEMrush + DataForSEO
//
// Priority order (first configured provider wins):
//   1. DataForSEO  — pay-per-use ~$0.02/call, free $1 trial, recommended
//   2. SEMrush     — requires separate "API units" purchase on top of subscription
//
// If neither is configured, keyword generation falls back to:
//   Google Autocomplete + Google CSE + LLM (still produces good results)
//
// ── DataForSEO setup ──────────────────────────────────────────────────────────
//   1. Sign up at dataforseo.com (free $1 credit on signup)
//   2. Dashboard → API Access → copy Login and Password
//   3. Add to .env:
//        DATAFORSEO_LOGIN=your@email.com
//        DATAFORSEO_PASSWORD=your-api-password
//   Cost: ~$0.002 per result row, so 20 keywords ≈ $0.04 per call
//
// ── SEMrush setup ────────────────────────────────────────────────────────────
//   1. Business plan → Subscription → Add-ons → buy API Units separately
//      (API units are NOT included in any SEMrush plan by default)
//   2. Add to .env: SEMRUSH_API_KEY=your-key
//   Cost: 10 units × 20 rows = 200 units per call (~$0.50 at $50/1000 units)
// ═══════════════════════════════════════════════════════════════════════════════

const SEMRUSH_BASE    = 'https://api.semrush.com/';
const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const REQUEST_TIMEOUT = 15000;

// ── Startup diagnostics — log once on module load ────────────────────────────
const _semrushKey      = process.env.SEMRUSH_API_KEY;
const _dfsLogin        = process.env.DATAFORSEO_LOGIN;
const _dfsPassword     = process.env.DATAFORSEO_PASSWORD;

if (_dfsLogin && _dfsPassword) {
  console.log('🔑 [Keywords] DataForSEO configured — will use as primary keyword volume source');
} else if (_semrushKey) {
  console.log('🔑 [Keywords] SEMrush configured — will use for keyword volume (ensure API units are purchased)');
} else {
  console.log('⚠️  [Keywords] No keyword volume API configured (DataForSEO or SEMrush) — using AI + Autocomplete + CSE only');
  console.log('   → To enable real search volume data, add DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD to .env');
}

export function isSemrushConfigured()    { return !!process.env.SEMRUSH_API_KEY; }
export function isDataForSEOConfigured() { return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD); }
export function isKeywordVolumeEnabled() { return isDataForSEOConfigured() || isSemrushConfigured(); }

// ════════════════════════════════════════════════════════════════════════════
// DATAFORSEO IMPLEMENTATION
// ════════════════════════════════════════════════════════════════════════════

/**
 * DataForSEO: fetch keywords_for_keywords (related + phrase match combined).
 * Returns up to `limit` keywords sorted by search volume desc.
 * Costs ~$0.002 per result row.
 */
async function fetchDataForSEOKeywords(phrase, { locationCode = 2840, limit = 25 } = {}) {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return [];

  const auth = Buffer.from(`${login}:${password}`).toString('base64');
  console.log(`  [DataForSEO] 📡 Calling keywords_for_keywords for "${phrase}" (location=US, limit=${limit})...`);
  const t0 = Date.now();

  try {
    const { data: resp } = await axios.post(
      `${DATAFORSEO_BASE}/keywords_data/google_ads/keywords_for_keywords/live`,
      [{
        keywords:      [phrase],
        location_code: locationCode,
        language_code: 'en',
        limit,
        order_by:      ['search_volume,desc']
      }],
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type':  'application/json'
        },
        timeout: REQUEST_TIMEOUT
      }
    );

    const ms = Date.now() - t0;

    // Check API-level status
    if (resp.status_code !== 20000) {
      console.error(`  [DataForSEO] ❌ API error ${resp.status_code}: ${resp.status_message}`);
      return [];
    }

    const task = resp.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      const msg = task?.status_message || 'unknown task error';
      if (msg.includes('balance') || msg.includes('credit')) {
        console.error(`  [DataForSEO] ❌ Insufficient credits — top up at dataforseo.com/billing`);
      } else {
        console.error(`  [DataForSEO] ❌ Task error: ${msg}`);
      }
      return [];
    }

    const items = task.result?.[0]?.items || [];
    const results = items
      .filter(item => item.keyword && item.search_volume >= 0)
      .map(item => ({
        keyword:     item.keyword,
        volume:      item.search_volume || 0,
        cpc:         item.cpc           || 0,
        competition: item.competition   || 0
      }));

    if (results.length > 0) {
      const topVol = results[0].volume.toLocaleString();
      console.log(`  [DataForSEO] ✅ ${results.length} keywords in ${ms}ms | top: "${results[0].keyword}" (${topVol}/mo)`);
    } else {
      console.warn(`  [DataForSEO] ⚠️  0 results returned in ${ms}ms`);
    }

    return results;
  } catch (e) {
    const ms = Date.now() - t0;
    if (e.response?.status === 401) {
      console.error(`  [DataForSEO] ❌ Authentication failed after ${ms}ms — check DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in .env`);
    } else {
      console.error(`  [DataForSEO] ❌ Request failed after ${ms}ms: ${e.message}`);
    }
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SEMRUSH IMPLEMENTATION
// ════════════════════════════════════════════════════════════════════════════

function parseSemrushTSV(rawData, callType) {
  if (!rawData || typeof rawData !== 'string') {
    console.warn(`  [SEMrush] ⚠️  ${callType}: empty response`);
    return [];
  }

  const trimmed = rawData.trim();
  if (trimmed.startsWith('ERROR')) {
    const errorLine = trimmed.split('\n')[0];
    if (errorLine.includes('132') || errorLine.includes('UNITS BALANCE IS ZERO')) {
      console.error(`  [SEMrush] ❌ ${callType}: API units balance is ZERO`);
      console.error(`  [SEMrush]    → Fix: Subscription → Add-ons → buy API Units, OR switch to DataForSEO (free trial available)`);
    } else if (errorLine.includes('131') || errorLine.includes('133') || /WRONG|INVALID/i.test(errorLine)) {
      console.error(`  [SEMrush] ❌ ${callType}: Invalid API key — check SEMRUSH_API_KEY. Error: ${errorLine}`);
    } else if (errorLine.includes('SERP')) {
      // Benign — no SERP features for this keyword
    } else {
      console.error(`  [SEMrush] ❌ ${callType}: ${errorLine}`);
    }
    return [];
  }

  const lines = trimmed.split('\n');
  if (lines.length < 2) return [];

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length < 2) continue;
    const keyword     = (parts[0] || '').trim();
    const volume      = parseInt(parts[1], 10)  || 0;
    const cpc         = parseFloat(parts[2])    || 0;
    const competition = parseFloat(parts[3])    || 0;
    if (keyword && keyword.length > 2) results.push({ keyword, volume, cpc, competition });
  }
  return results;
}

async function fetchSemrushRelatedKeywords(phrase, { database = 'us', limit = 20 } = {}) {
  const apiKey = process.env.SEMRUSH_API_KEY;
  if (!apiKey) return [];

  console.log(`  [SEMrush] 📡 Calling phrase_related for "${phrase}" (db=${database}, limit=${limit})...`);
  const t0 = Date.now();
  try {
    const params = new URLSearchParams({
      type: 'phrase_related', key: apiKey, phrase, database,
      export_columns: 'Ph,Nq,Cp,Co',
      display_limit: String(limit), display_sort: 'nq_desc'
    });
    const { data } = await axios.get(`${SEMRUSH_BASE}?${params}`, { timeout: REQUEST_TIMEOUT });
    const results = parseSemrushTSV(data, 'phrase_related');
    if (results.length > 0) {
      console.log(`  [SEMrush] ✅ phrase_related: ${results.length} keywords in ${Date.now()-t0}ms | top: "${results[0].keyword}" (${results[0].volume.toLocaleString()}/mo)`);
    }
    return results;
  } catch (e) {
    console.error(`  [SEMrush] ❌ phrase_related failed (${Date.now()-t0}ms): ${e.message}`);
    return [];
  }
}

async function fetchSemrushPhraseMatch(phrase, { database = 'us', limit = 20 } = {}) {
  const apiKey = process.env.SEMRUSH_API_KEY;
  if (!apiKey) return [];

  console.log(`  [SEMrush] 📡 Calling phrase_fullsearch for "${phrase}" (db=${database}, limit=${limit})...`);
  const t0 = Date.now();
  try {
    const params = new URLSearchParams({
      type: 'phrase_fullsearch', key: apiKey, phrase, database,
      export_columns: 'Ph,Nq,Cp,Co',
      display_limit: String(limit), display_sort: 'nq_desc'
    });
    const { data } = await axios.get(`${SEMRUSH_BASE}?${params}`, { timeout: REQUEST_TIMEOUT });
    const results = parseSemrushTSV(data, 'phrase_fullsearch');
    if (results.length > 0) {
      console.log(`  [SEMrush] ✅ phrase_fullsearch: ${results.length} keywords in ${Date.now()-t0}ms | top: "${results[0].keyword}" (${results[0].volume.toLocaleString()}/mo)`);
    }
    return results;
  } catch (e) {
    console.error(`  [SEMrush] ❌ phrase_fullsearch failed (${Date.now()-t0}ms): ${e.message}`);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════════════
// UNIFIED ENTRY POINT — tries DataForSEO first, falls back to SEMrush
// ════════════════════════════════════════════════════════════════════════════

/**
 * Fetch keyword volume data using the best available provider.
 * DataForSEO is tried first (cheaper, simpler). SEMrush is fallback.
 *
 * Volume classification:
 *   >= 1000/mo   → core  (high demand, primary targets)
 *   100–999/mo   → LSI   (supporting terms)
 *   < 100/mo     → long-tail (specific intent, low competition)
 *   4+ word phrases → always long-tail regardless of volume
 *
 * @param {string} primaryKeyword
 * @returns {Promise<{core, lsi, longTail, withVolume, totalFetched, provider}>}
 */
export async function fetchSemrushKeywords(primaryKeyword) {
  const empty = { core: [], lsi: [], longTail: [], withVolume: [], totalFetched: 0, provider: 'none' };

  if (!isKeywordVolumeEnabled()) return empty;

  // Trim to 5 words max — both APIs reject very long phrases
  const phrase = primaryKeyword.split(/\s+/).slice(0, 5).join(' ');
  console.log(`  [Keywords] 🚀 Fetching volume data for: "${phrase}"`);

  let allKeywords = [];
  let provider    = 'none';

  // ── Try DataForSEO first ──
  if (isDataForSEOConfigured()) {
    console.log('  [Keywords] Using DataForSEO as keyword volume provider');
    const dfsResults = await fetchDataForSEOKeywords(phrase, { limit: 25 });
    if (dfsResults.length > 0) {
      allKeywords = dfsResults;
      provider    = 'dataforseo';
    } else {
      console.warn('  [Keywords] DataForSEO returned 0 results — trying SEMrush fallback...');
    }
  }

  // ── Fall back to SEMrush if DataForSEO wasn't configured or failed ──
  if (allKeywords.length === 0 && isSemrushConfigured()) {
    console.log('  [Keywords] Using SEMrush as keyword volume provider');
    const [related, phraseMatch] = await Promise.allSettled([
      fetchSemrushRelatedKeywords(phrase),
      fetchSemrushPhraseMatch(phrase)
    ]);

    const relatedData = related.status     === 'fulfilled' ? related.value     : [];
    const phraseData  = phraseMatch.status === 'fulfilled' ? phraseMatch.value : [];

    // Deduplicate
    const seen = new Set();
    allKeywords = [...relatedData, ...phraseData].filter(item => {
      const key = item.keyword.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (allKeywords.length > 0) provider = 'semrush';
  }

  if (allKeywords.length === 0) {
    console.warn('  [Keywords] ⚠️  Both providers returned 0 keywords — falling back to AI + Autocomplete only');
    return empty;
  }

  // Sort by volume descending
  allKeywords.sort((a, b) => b.volume - a.volume);

  // Classify by volume tier and word count
  const core = [], lsi = [], longTail = [];
  for (const item of allKeywords) {
    const wordCount = item.keyword.split(/\s+/).length;
    if (wordCount >= 4 || item.volume < 100) {
      longTail.push(item.keyword);
    } else if (item.volume >= 1000 || wordCount <= 2) {
      core.push(item.keyword);
    } else {
      lsi.push(item.keyword);
    }
  }

  // Summary
  console.log(
    `  [Keywords] ✅ ${provider.toUpperCase()} — ` +
    `${core.length} core (≥1k) | ${lsi.length} LSI (100-999) | ${longTail.length} long-tail (<100 / 4+w) | ` +
    `${allKeywords.length} total`
  );
  const top3 = allKeywords.slice(0, 3)
    .map(k => `"${k.keyword}" (${k.volume.toLocaleString()}/mo)`).join(' | ');
  if (top3) console.log(`  [Keywords] 📊 Top 3: ${top3}`);

  return {
    core:         core.slice(0, 8),
    lsi:          lsi.slice(0, 15),
    longTail:     longTail.slice(0, 15),
    withVolume:   allKeywords.slice(0, 40),
    totalFetched: allKeywords.length,
    provider
  };
}
