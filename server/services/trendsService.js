import axios from 'axios';
import { isDataForSEOConfigured } from './dataforseoSerpService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE TRENDS SERVICE
// Fetches trend data for 1–5 keywords over the past 12 months.
// Use to:
//   • Discover rising topics before they peak
//   • Compare two competing topics (e.g. "sharepoint migration" vs "onedrive migration")
//   • Time content publishing to match seasonal demand
//   • Identify which angle is trending right now
//
// Endpoint: POST /v3/keywords_data/google_trends/explore/live
// Cost: ~$0.003 per call
// ═══════════════════════════════════════════════════════════════════════════════

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const cache = new Map();

function getAuth() {
  return Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
}

/**
 * Fetch Google Trends data for up to 5 keywords over the last 12 months.
 *
 * @param {string[]} keywords - 1–5 keywords to compare
 * @param {object} [options]
 * @param {number} [options.locationCode=2840]
 * @returns {Promise<{keywords, trend, risingKeyword, summary, checkUrl}>}
 */
export async function fetchGoogleTrends(keywords, { locationCode = 2840 } = {}) {
  if (!isDataForSEOConfigured()) return { error: 'DataForSEO not configured.' };
  if (!keywords?.length) return { error: 'At least one keyword required.' };

  const kws = keywords.slice(0, 5).map(k => k.trim().toLowerCase());
  const cacheKey = `trends:${kws.join('|')}:${locationCode}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`  [Trends] ♻ Cache hit for [${kws.join(', ')}]`);
    return cached.data;
  }

  console.log(`  [Trends] 📡 Fetching Google Trends for [${kws.join(', ')}]...`);
  const t0 = Date.now();

  try {
    const { data: resp } = await axios.post(
      `${DATAFORSEO_BASE}/keywords_data/google_trends/explore/live`,
      [{ keywords: kws, location_code: locationCode, language_code: 'en' }],
      {
        headers: { Authorization: `Basic ${getAuth()}`, 'Content-Type': 'application/json' },
        timeout: 20000
      }
    );

    const task = resp.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      return { keywords: kws, error: task?.status_message };
    }

    const result = task.result?.[0];
    const graphItem = result?.items?.find(i => i.type === 'google_trends_graph');
    const ms = Date.now() - t0;

    if (!graphItem?.data?.length) {
      return { keywords: kws, error: 'No trend data returned.' };
    }

    const dataPoints = graphItem.data;

    // Build per-keyword trend series
    const trend = kws.map((kw, idx) => ({
      keyword: kw,
      data: dataPoints.map(pt => ({
        week:  pt.date_from,
        score: pt.values?.[idx] ?? 0
      }))
    }));

    // Average score per keyword to find which is trending most
    const averages = trend.map(t => ({
      keyword: t.keyword,
      avg: t.data.reduce((s, p) => s + p.score, 0) / (t.data.length || 1)
    }));
    averages.sort((a, b) => b.avg - a.avg);
    const risingKeyword = averages[0]?.keyword;

    // Recent trend (last 4 weeks) vs earlier average — is it rising?
    const summary = trend.map(t => {
      const recent4 = t.data.slice(-4).reduce((s, p) => s + p.score, 0) / 4;
      const earlier = t.data.slice(0, -4).reduce((s, p) => s + p.score, 0) / Math.max(1, t.data.length - 4);
      const direction = recent4 > earlier * 1.2 ? '↑ Rising' : recent4 < earlier * 0.8 ? '↓ Falling' : '→ Stable';
      return `${t.keyword}: ${direction} (recent avg ${Math.round(recent4)}/100)`;
    });

    console.log(`  [Trends] ✅ ${kws.length} keywords | top: "${risingKeyword}" | ${dataPoints.length} data points (${ms}ms)`);

    const data = {
      keywords:      kws,
      trend,
      risingKeyword,
      summary,
      checkUrl:      result.check_url || null
    };
    cache.set(cacheKey, { ts: Date.now(), data });
    return data;

  } catch (e) {
    console.error(`  [Trends] ❌ ${e.message}`);
    return { keywords: kws, error: e.message };
  }
}
