import axios from 'axios';
import { isDataForSEOConfigured } from './dataforseoSerpService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ON-PAGE CONTENT PARSING SERVICE
// Crawls any URL and returns full content as Markdown + structured data.
// Use this when writers want to study a competitor's top-ranking article:
//   • See the full content, headings, word count
//   • Understand what structure wins for a keyword
//   • Feed the competitor's content into the agent for gap analysis
//
// Endpoint: POST /v3/on_page/content_parsing/live
// Cost: ~$0.002 per URL
// ═══════════════════════════════════════════════════════════════════════════════

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const cache = new Map();

function getAuth() {
  return Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
}

/**
 * Parse a competitor page — returns full content, headings, and word count.
 *
 * @param {string} url - Full URL to crawl (e.g. "https://example.com/article")
 * @returns {Promise<{url, statusCode, wordCount, headings, markdown, summary}>}
 */
export async function parseCompetitorPage(url) {
  if (!isDataForSEOConfigured()) return { error: 'DataForSEO not configured.' };

  if (!url.startsWith('http')) url = 'https://' + url;

  const cacheKey = `onpage:${url}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`  [OnPage] ♻ Cache hit for ${url}`);
    return cached.data;
  }

  console.log(`  [OnPage] 📡 Parsing page: ${url}...`);
  const t0 = Date.now();

  try {
    const { data: resp } = await axios.post(
      `${DATAFORSEO_BASE}/on_page/content_parsing/live`,
      [{ url, enable_javascript: false }],
      {
        headers: { Authorization: `Basic ${getAuth()}`, 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    const task = resp.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      return { url, error: task?.status_message };
    }

    const result = task.result?.[0];
    const item = result?.items?.[0];
    const ms = Date.now() - t0;

    if (!item || result?.crawl_status === 'Page content is empty') {
      return { url, error: 'Page returned empty content — may be JS-rendered or gated.' };
    }

    // page_as_markdown is only populated for some page types.
    // Fall back to extracting text from page_content.main_topic array.
    let markdown = item.page_as_markdown || '';

    const headings = [];
    let bodyText = '';

    if (!markdown && item.page_content) {
      const sections = item.page_content.main_topic || [];
      const lines = [];
      for (const section of sections) {
        if (section.h_title) {
          const level = section.level || 2;
          headings.push({ level, text: section.h_title });
          lines.push(`${'#'.repeat(level)} ${section.h_title}`);
        }
        for (const block of (section.primary_content || [])) {
          if (block.text && block.text.length > 10) {
            lines.push(block.text);
            bodyText += ' ' + block.text;
          }
        }
      }
      markdown = lines.join('\n\n');
    } else {
      // Extract headings from markdown syntax
      for (const line of markdown.split('\n')) {
        const h = line.match(/^(#{1,4})\s+(.+)/);
        if (h) headings.push({ level: h[1].length, text: h[2].trim() });
      }
      bodyText = markdown;
    }

    // Word count from body text
    const wordCount = bodyText
      .replace(/[#\[\]()>*_`\-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1).length;

    // First 500 chars as summary
    const summary = bodyText.replace(/\s+/g, ' ').slice(0, 500).trim();

    const domain = new URL(url).hostname.replace('www.', '');

    console.log(
      `  [OnPage] ✅ ${domain} → ${wordCount} words | ${headings.length} headings | ` +
      `HTTP ${item.status_code} (${ms}ms)`
    );

    const data = {
      url,
      domain,
      statusCode: item.status_code,
      wordCount,
      headings,
      h2s: headings.filter(h => h.level === 2).map(h => h.text),
      summary,
      markdown: markdown.slice(0, 8000) // cap at 8k chars to keep agent context manageable
    };
    cache.set(cacheKey, { ts: Date.now(), data });
    return data;

  } catch (e) {
    console.error(`  [OnPage] ❌ ${e.message}`);
    return { url, error: e.message };
  }
}
