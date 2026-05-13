import axios from 'axios';
import { isDataForSEOConfigured } from './dataforseoSerpService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// RANK TRACKER SERVICE
// Fetches all keywords a domain currently ranks for, with positions, volume,
// intent, and difficulty. Use for:
//   • Auditing CloudFuze's entire ranking footprint
//   • Finding page-2 rankings (pos 11–20) — low-effort improvement targets
//   • Checking what competitors rank for
//
// Endpoint: POST /v3/dataforseo_labs/google/ranked_keywords/live
// Cost: ~$0.002 per result row
// ═══════════════════════════════════════════════════════════════════════════════

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const cache = new Map();

function getAuth() {
  return Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
}

/**
 * Fetch keywords a domain ranks for on Google.
 *
 * @param {string} domain - e.g. "cloudfuze.com" (no https://)
 * @param {object} [options]
 * @param {number} [options.locationCode=2840]
 * @param {number} [options.limit=50]
 * @param {number} [options.maxPosition] - Filter to positions ≤ this (e.g. 20 for top-20 only)
 * @param {number} [options.minVolume] - Filter keywords with volume ≥ this
 * @returns {Promise<{domain, items, totalKeywords, page2Keywords}>}
 */
export async function fetchDomainRankings(domain, {
  locationCode = 2840,
  limit = 50,
  maxPosition = null,
  minVolume = 10
} = {}) {
  if (!isDataForSEOConfigured()) return { error: 'DataForSEO not configured.' };

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const cacheKey = `rankings:${cleanDomain}:${locationCode}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`  [Rankings] ♻ Cache hit for ${cleanDomain}`);
    return cached.data;
  }

  console.log(`  [Rankings] 📡 Fetching rankings for ${cleanDomain} (limit=${limit})...`);
  const t0 = Date.now();

  const payload = {
    target:        cleanDomain,
    location_code: locationCode,
    language_code: 'en',
    limit
  };
  if (maxPosition) payload.filters = ['ranked_serp_element.serp_item.rank_absolute', '<=', maxPosition];

  try {
    const { data: resp } = await axios.post(
      `${DATAFORSEO_BASE}/dataforseo_labs/google/ranked_keywords/live`,
      [payload],
      {
        headers: { Authorization: `Basic ${getAuth()}`, 'Content-Type': 'application/json' },
        timeout: 25000
      }
    );

    const task = resp.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      console.error(`  [Rankings] ❌ Task error: ${task?.status_message}`);
      return { domain: cleanDomain, error: task?.status_message, items: [] };
    }

    const rawItems = task.result?.[0]?.items || [];
    const ms = Date.now() - t0;

    const items = rawItems
      .map(item => ({
        keyword:    item.keyword_data?.keyword || '',
        volume:     item.keyword_data?.keyword_info?.search_volume || 0,
        intent:     item.keyword_data?.search_intent_info?.main_intent || 'informational',
        difficulty: item.keyword_data?.keyword_properties?.keyword_difficulty ?? null,
        position:   item.ranked_serp_element?.serp_item?.rank_absolute || 999,
        url:        item.ranked_serp_element?.serp_item?.url || '',
        type:       item.ranked_serp_element?.serp_item?.type || 'organic'
      }))
      .filter(k => k.keyword && k.volume >= minVolume)
      .sort((a, b) => a.position - b.position);

    // Page-2 keywords: positions 11–20 — these are quick-win targets
    const page2 = items.filter(k => k.position >= 11 && k.position <= 20);

    console.log(
      `  [Rankings] ✅ ${cleanDomain} → ${items.length} keywords | ` +
      `${page2.length} on page 2 (pos 11-20, quick wins) (${ms}ms)`
    );

    const result = {
      domain:        cleanDomain,
      totalKeywords: items.length,
      items,
      page2Keywords: page2
    };
    cache.set(cacheKey, { ts: Date.now(), data: result });
    return result;

  } catch (e) {
    console.error(`  [Rankings] ❌ ${e.message}`);
    return { domain: cleanDomain, error: e.message, items: [] };
  }
}
