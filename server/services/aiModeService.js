import axios from 'axios';
import { isDataForSEOConfigured } from './dataforseoSerpService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE AI MODE SERVICE
// Fetches Google's AI Overview (the blue AI-generated box at the top of results)
// for any keyword. Shows exactly what Google AI says about a topic and whether
// CloudFuze or competitor pages are cited as sources.
//
// Endpoint: POST /v3/serp/google/ai_mode/live/advanced
// Cost: ~$0.003 per call
// ═══════════════════════════════════════════════════════════════════════════════

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const cache = new Map();

function getAuth() {
  return Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
}

/**
 * Fetch Google AI Overview for a keyword.
 * Returns what Google's AI says about the topic and which pages it cites.
 *
 * @param {string} keyword
 * @param {object} [options]
 * @param {number} [options.locationCode=2840]
 * @returns {Promise<{keyword, hasAIOverview, markdown, sources, cloudfuzeAppears}>}
 */
export async function fetchGoogleAIOverview(keyword, { locationCode = 2840 } = {}) {
  if (!isDataForSEOConfigured()) return { error: 'DataForSEO not configured.' };

  const cacheKey = `aimode:${keyword.toLowerCase()}:${locationCode}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`  [AI Mode] ♻ Cache hit for "${keyword}"`);
    return cached.data;
  }

  console.log(`  [AI Mode] 📡 Fetching Google AI Overview for "${keyword}"...`);
  const t0 = Date.now();

  try {
    const { data: resp } = await axios.post(
      `${DATAFORSEO_BASE}/serp/google/ai_mode/live/advanced`,
      [{ keyword, location_code: locationCode, language_code: 'en' }],
      {
        headers: { Authorization: `Basic ${getAuth()}`, 'Content-Type': 'application/json' },
        timeout: 25000
      }
    );

    const task = resp.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      console.error(`  [AI Mode] ❌ Task error: ${task?.status_message}`);
      return { keyword, hasAIOverview: false, error: task?.status_message };
    }

    const items = task.result?.[0]?.items || [];
    const overviewItem = items.find(i => i.type === 'ai_overview');
    const ms = Date.now() - t0;

    if (!overviewItem) {
      console.log(`  [AI Mode] ℹ No AI Overview for "${keyword}" (${ms}ms)`);
      const result = { keyword, hasAIOverview: false, markdown: null, sources: [], cloudfuzeAppears: false };
      cache.set(cacheKey, { ts: Date.now(), data: result });
      return result;
    }

    // Extract cited sources from markdown links
    const md = overviewItem.markdown || '';
    const sourcePattern = /\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g;
    const sources = [];
    let match;
    while ((match = sourcePattern.exec(md)) !== null) {
      const url = match[2];
      if (url.includes('dataforseo.com') || url.includes('google.com/search')) continue;
      const domain = new URL(url).hostname.replace('www.', '');
      if (!sources.find(s => s.domain === domain)) {
        sources.push({ title: match[1] || domain, url, domain });
      }
    }

    const cloudfuzeAppears = md.toLowerCase().includes('cloudfuze') ||
      sources.some(s => s.domain.includes('cloudfuze'));

    console.log(
      `  [AI Mode] ✅ "${keyword}" → AI Overview present | ` +
      `${sources.length} sources cited | CloudFuze: ${cloudfuzeAppears ? '✅ cited' : '❌ not cited'} (${ms}ms)`
    );

    const result = { keyword, hasAIOverview: true, markdown: md, sources, cloudfuzeAppears };
    cache.set(cacheKey, { ts: Date.now(), data: result });
    return result;

  } catch (e) {
    console.error(`  [AI Mode] ❌ ${e.message}`);
    return { keyword, hasAIOverview: false, error: e.message };
  }
}
