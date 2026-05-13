import axios from 'axios';
import { isDataForSEOConfigured } from './dataforseoSerpService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// AI VISIBILITY SERVICE
//
// Tracks a domain's presence across AI search engines for a set of keywords:
//
//  ┌─────────────────────────────────────────────────────────────────┐
//  │  Engine              │  What we check            │  Why         │
//  │──────────────────────│───────────────────────────│──────────────│
//  │  Google AI Overview  │  AI Mode SERP             │  Direct API  │
//  │  ChatGPT / Copilot   │  Bing organic SERP        │  Proxy*      │
//  │  Perplexity          │  Google organic SERP pos  │  Proxy*      │
//  └─────────────────────────────────────────────────────────────────┘
//
//  *Proxy explanation:
//  - ChatGPT uses Bing's index → if you rank on Bing, ChatGPT can cite you
//  - Perplexity crawls live web and trusts pages Google also trusts →
//    Google rank is a strong signal for Perplexity citability
//
// Endpoints used:
//   /v3/serp/google/ai_mode/live/advanced  — Google AI Overview
//   /v3/serp/bing/organic/live/regular     — Bing SERP (ChatGPT/Copilot proxy)
//   /v3/serp/google/organic/live/advanced  — Google SERP (Perplexity proxy)
//
// Cost: ~$0.003 per keyword × 3 engines = ~$0.009 per keyword checked.
//       10 keywords = ~$0.09 total.
// ═══════════════════════════════════════════════════════════════════════════════

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const cache = new Map();
const BATCH_CONCURRENCY = 3; // max parallel API calls per engine

function getAuth() {
  return Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
}

async function apiPost(endpoint, body) {
  const { data } = await axios.post(
    `${DATAFORSEO_BASE}${endpoint}`,
    body,
    {
      headers: { Authorization: `Basic ${getAuth()}`, 'Content-Type': 'application/json' },
      timeout: 20000
    }
  );
  return data;
}

// ── Check one keyword in Google AI Overview ──────────────────────────────────
async function checkGoogleAI(keyword, domain) {
  try {
    const resp = await apiPost('/serp/google/ai_mode/live/advanced', [
      { keyword, location_code: 2840, language_code: 'en' }
    ]);
    const items  = resp.tasks?.[0]?.result?.[0]?.items || [];
    const overview = items.find(i => i.type === 'ai_overview');
    if (!overview) return { hasOverview: false, cited: false, sources: [] };

    const md = overview.markdown || '';
    // Extract cited domains (skip internal dataforseo URLs)
    const sourcePattern = /\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g;
    const sources = [];
    let m;
    while ((m = sourcePattern.exec(md)) !== null) {
      const url = m[2];
      if (url.includes('dataforseo.com') || url.includes('google.com/search')) continue;
      const d = new URL(url).hostname.replace('www.', '');
      if (!sources.includes(d)) sources.push(d);
    }
    const cited = md.toLowerCase().includes(domain.toLowerCase()) ||
      sources.some(s => s.includes(domain.replace('www.', '')));
    return { hasOverview: true, cited, sources };
  } catch { return { hasOverview: false, cited: false, sources: [] }; }
}

// ── Check one keyword on Bing (ChatGPT / Copilot proxy) ─────────────────────
async function checkBing(keyword, domain) {
  try {
    const resp = await apiPost('/serp/bing/organic/live/regular', [
      { keyword, location_code: 2840, language_code: 'en', depth: 10 }
    ]);
    const items = resp.tasks?.[0]?.result?.[0]?.items || [];
    const organic = items.filter(i => i.type === 'organic');
    const domainClean = domain.replace('www.', '');
    const match = organic.find(i => (i.domain || '').includes(domainClean));
    return {
      found:    !!match,
      position: match?.rank_absolute || null,
      url:      match?.url || null
    };
  } catch { return { found: false, position: null }; }
}

// ── Check one keyword on Google organic (Perplexity proxy) ──────────────────
async function checkGoogleOrganic(keyword, domain) {
  try {
    const resp = await apiPost('/serp/google/organic/live/advanced', [
      { keyword, location_code: 2840, language_code: 'en', depth: 10 }
    ]);
    const items = resp.tasks?.[0]?.result?.[0]?.items || [];
    const organic = items.filter(i => i.type === 'organic');
    const domainClean = domain.replace('www.', '');
    const match = organic.find(i => (i.domain || '').includes(domainClean));
    return {
      found:    !!match,
      position: match?.rank_absolute || null,
      url:      match?.url || null,
      title:    match?.title || null
    };
  } catch { return { found: false, position: null }; }
}

// ── Batch runner — runs fn for each keyword with concurrency limit ────────────
async function runBatch(keywords, fn) {
  const results = new Array(keywords.length);
  for (let i = 0; i < keywords.length; i += BATCH_CONCURRENCY) {
    const slice = keywords.slice(i, i + BATCH_CONCURRENCY);
    const batch = await Promise.all(slice.map((kw, j) => fn(kw).then(r => [i + j, r])));
    for (const [idx, res] of batch) results[idx] = res;
  }
  return results;
}

/**
 * Run a full AI visibility audit for a domain across multiple keywords.
 *
 * Checks each keyword in:
 *   - Google AI Overview  (direct — is domain cited?)
 *   - Bing SERP           (proxy for ChatGPT / Bing Copilot)
 *   - Google organic      (proxy for Perplexity)
 *
 * @param {string} domain  e.g. "cloudfuze.com"
 * @param {string[]} keywords  list of search queries to check
 * @returns {Promise<{domain, keywords, rows, summary, scores}>}
 */
export async function fetchAIVisibilityReport(domain, keywords) {
  if (!isDataForSEOConfigured()) return { error: 'DataForSEO not configured.' };
  if (!keywords?.length) return { error: 'At least one keyword required.' };

  const domainClean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const kws = keywords.slice(0, 10); // cap at 10 to keep costs reasonable

  const cacheKey = `aivisibility:${domainClean}:${kws.join('|')}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`  [AI Visibility] ♻ Cache hit for ${domainClean}`);
    return cached.data;
  }

  console.log(`  [AI Visibility] 📡 Checking ${domainClean} across ${kws.length} keywords × 3 engines...`);
  const t0 = Date.now();

  // Run all 3 engines in parallel per-keyword
  const [googleAIResults, bingResults, googleResults] = await Promise.all([
    runBatch(kws, kw => checkGoogleAI(kw, domainClean)),
    runBatch(kws, kw => checkBing(kw, domainClean)),
    runBatch(kws, kw => checkGoogleOrganic(kw, domainClean))
  ]);

  const ms = Date.now() - t0;

  // Build per-keyword rows
  const rows = kws.map((kw, i) => ({
    keyword:          kw,
    googleAI: {
      hasOverview:  googleAIResults[i].hasOverview,
      cited:        googleAIResults[i].cited,
      otherSources: googleAIResults[i].sources?.filter(s => !s.includes(domainClean)).slice(0, 4) || []
    },
    bing: {
      found:    bingResults[i].found,
      position: bingResults[i].position,
      url:      bingResults[i].url
    },
    google: {
      found:    googleResults[i].found,
      position: googleResults[i].position,
      url:      googleResults[i].url
    }
  }));

  // Scores
  const citedInAI    = rows.filter(r => r.googleAI.cited).length;
  const ranksOnBing  = rows.filter(r => r.bing.found).length;
  const ranksOnGoogle = rows.filter(r => r.google.found).length;
  const noOverview   = rows.filter(r => !r.googleAI.hasOverview).length;

  // Opportunity keywords: AI Overview exists but domain not cited
  const opportunities = rows.filter(r => r.googleAI.hasOverview && !r.googleAI.cited);

  // Strong presence: cited in AI + ranking on Bing + ranking on Google
  const strongPresence = rows.filter(r => r.googleAI.cited && r.bing.found && r.google.found);

  const scores = {
    googleAIScore:   Math.round((citedInAI / kws.length) * 100),
    bingScore:       Math.round((ranksOnBing / kws.length) * 100),
    perplexityScore: Math.round((ranksOnGoogle / kws.length) * 100),
    overallAIScore:  Math.round(((citedInAI + ranksOnBing + ranksOnGoogle) / (kws.length * 3)) * 100)
  };

  console.log(
    `  [AI Visibility] ✅ ${domainClean} | ` +
    `Google AI: ${citedInAI}/${kws.length} | ` +
    `Bing: ${ranksOnBing}/${kws.length} | ` +
    `Google: ${ranksOnGoogle}/${kws.length} | ` +
    `${opportunities.length} opportunities (${ms}ms)`
  );

  const result = {
    domain:          domainClean,
    keywords:        kws,
    rows,
    scores,
    opportunities:   opportunities.map(r => ({
      keyword:      r.keyword,
      competitors:  r.googleAI.otherSources
    })),
    strongPresence:  strongPresence.map(r => r.keyword),
    noOverviewYet:   rows.filter(r => !r.googleAI.hasOverview).map(r => r.keyword),
    summary: [
      `Google AI Overviews: ${domainClean} cited in ${citedInAI}/${kws.length} keywords (${scores.googleAIScore}%)`,
      `ChatGPT/Bing Copilot: ${domainClean} ranks on Bing for ${ranksOnBing}/${kws.length} keywords (${scores.bingScore}%)`,
      `Perplexity (Google proxy): ${domainClean} ranks on Google for ${ranksOnGoogle}/${kws.length} keywords (${scores.perplexityScore}%)`,
      `Overall AI visibility score: ${scores.overallAIScore}/100`,
      opportunities.length > 0
        ? `⚠ ${opportunities.length} opportunity keywords where AI Overview exists but ${domainClean} is NOT cited: ${opportunities.map(o => '"' + o.keyword + '"').join(', ')}`
        : `✅ Cited in all active AI Overviews`,
      strongPresence.length > 0
        ? `✅ Strong presence (cited in AI + Bing + Google) for: ${strongPresence.map(k => '"' + k + '"').join(', ')}`
        : `⚠ No keywords with strong presence across all 3 engines yet`
    ]
  };

  cache.set(cacheKey, { ts: Date.now(), data: result });
  return result;
}
