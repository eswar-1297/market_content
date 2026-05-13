import { fetchDataForSEOSerp, isDataForSEOConfigured } from './dataforseoSerpService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SERP COMPETITOR SERVICE
//
// Fetches the top-ranking pages for a keyword so the agent can surface:
//   • Who is currently winning for this topic
//   • What content structure those pages use
//   • Which domains have authority in this space
//
// Powered by DataForSEO SERP Live — shares the same cached call as PAA
// so no extra charge when both are used for the same keyword.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns top organic results for a keyword.
 * Each result: { rank, url, domain, title, description, breadcrumb }
 *
 * @param {string} keyword
 * @param {object} [options]
 * @param {number} [options.locationCode=2840]
 * @param {number} [options.depth=10]
 * @returns {Promise<Array>}
 */
export async function fetchTopRankingPages(keyword, options = {}) {
  if (!isDataForSEOConfigured()) {
    console.log('  [SERP] DataForSEO not configured — add DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD to .env');
    return [];
  }

  const serp = await fetchDataForSEOSerp(keyword, options);
  if (!serp) return [];

  return serp.organicResults;
}

/**
 * Formats top-ranking pages as a markdown table for the agent to include in responses.
 */
export function formatTopPagesMarkdown(pages, keyword) {
  if (!pages || pages.length === 0) return '';

  const rows = pages
    .slice(0, 10)
    .map(p => `| #${p.rank} | [${p.title || p.domain}](${p.url}) | ${p.domain} |`)
    .join('\n');

  return `### Top-Ranking Pages for "${keyword}"\n\n| Rank | Title | Domain |\n|------|-------|--------|\n${rows}\n`;
}
