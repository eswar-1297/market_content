import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'cache');
const CACHE_FILE = join(CACHE_DIR, 'g2-reviews.json');

const G2_URLS = [
  { url: 'https://www.g2.com/products/cloudfuze/reviews', product: 'CloudFuze' },
  { url: 'https://www.g2.com/products/slack-to-microsoft-teams-migration/reviews', product: 'Slack to Teams Migration' }
];

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function readCache() {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const raw = readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(data) {
  ensureCacheDir();
  const payload = {
    scrapedAt: new Date().toISOString(),
    ttlMs: CACHE_TTL_MS,
    reviewCount: data.length,
    reviews: data
  };
  writeFileSync(CACHE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
}

function isCacheFresh() {
  const cache = readCache();
  if (!cache?.scrapedAt || !cache?.reviews?.length) return false;
  const age = Date.now() - new Date(cache.scrapedAt).getTime();
  return age < CACHE_TTL_MS;
}

function findSystemBrowser() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of paths) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

async function scrapeG2Reviews() {
  let browser;
  const allReviews = [];

  try {
    const execPath = findSystemBrowser();
    const launchOpts = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    };
    if (execPath) {
      launchOpts.executablePath = execPath;
      console.log(`[G2 Scraper] Using system browser: ${execPath}`);
    }
    browser = await puppeteer.launch(launchOpts);

    for (const { url, product } of G2_URLS) {
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        console.log(`[G2 Scraper] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait for page to fully render and try scrolling to load reviews
        await new Promise(r => setTimeout(r, 3000));
        await page.evaluate(() => window.scrollBy(0, 800));
        await new Promise(r => setTimeout(r, 2000));
        await page.evaluate(() => window.scrollBy(0, 1200));
        await new Promise(r => setTimeout(r, 2000));

        const reviews = await page.evaluate((productName) => {
          const results = [];

          // Strategy 1: JSON-LD structured data (most reliable — G2 includes this for SEO)
          const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const script of jsonLdScripts) {
            try {
              const data = JSON.parse(script.textContent);
              const reviewList = data.review || data['@graph']?.flatMap(g => g.review || []) || [];
              for (const r of reviewList) {
                if (r.reviewBody || r.name) {
                  results.push({
                    author: r.author?.name || r.author || 'Verified User',
                    role: r.author?.jobTitle || '',
                    rating: r.reviewRating?.ratingValue || 5,
                    title: r.name || '',
                    text: (r.reviewBody || '').substring(0, 500),
                    reviewUrl: r.url || r['@id'] || '',
                    product: productName,
                    source: 'G2 Review (Live Scraped)'
                  });
                }
              }
            } catch (e) { /* not valid JSON-LD */ }
          }

          if (results.length > 0) return results;

          // Strategy 2: itemprop-based selectors (standard schema.org markup)
          const reviewEls = document.querySelectorAll('[itemprop="review"]');
          if (reviewEls.length > 0) {
            reviewEls.forEach(el => {
              try {
                const title = el.querySelector('[itemprop="name"]')?.textContent?.trim() || '';
                const body = el.querySelector('[itemprop="reviewBody"]')?.textContent?.trim() || '';
                const author = el.querySelector('[itemprop="author"]')?.textContent?.trim() || 'Verified User';
                const ratingVal = el.querySelector('[itemprop="ratingValue"]')?.getAttribute('content') || '5';
                const linkEl = el.querySelector('a[href*="review"]') || el.querySelector('h3 a, h4 a');
                const reviewUrl = linkEl?.href || '';
                if (title || body) {
                  results.push({
                    author, role: '', rating: parseFloat(ratingVal),
                    title, text: (body || title).substring(0, 500),
                    reviewUrl, product: productName, source: 'G2 Review (Live Scraped)'
                  });
                }
              } catch (e) {}
            });
            if (results.length > 0) return results;
          }

          // Strategy 3: G2-specific class patterns
          const containers = document.querySelectorAll(
            'div[id^="review-"], [data-test-id*="review"], .paper--white.paper--box'
          );
          containers.forEach(el => {
            try {
              const heading = el.querySelector('h3, h4, [class*="title"]');
              const body = el.querySelector('.formatted-text, [class*="review-body"], p');
              const text = body?.textContent?.trim() || '';
              const title = heading?.textContent?.trim() || '';
              if (text.length > 30 || title.length > 10) {
                const starFills = el.querySelectorAll('[class*="fill"], [class*="star--full"]');
                const linkEl = el.querySelector('a[href*="review"]') || el.querySelector('h3 a, h4 a');
                results.push({
                  author: el.querySelector('[class*="author"], [class*="user"]')?.textContent?.trim() || 'Verified User',
                  role: '',
                  rating: starFills.length > 0 ? Math.min(starFills.length, 5) : 5,
                  title: title.substring(0, 200),
                  text: text.substring(0, 500),
                  reviewUrl: linkEl?.href || '',
                  product: productName,
                  source: 'G2 Review (Live Scraped)'
                });
              }
            } catch (e) {}
          });

          return results;
        }, product);

        console.log(`[G2 Scraper] Found ${reviews.length} reviews for ${product}`);
        allReviews.push(...reviews);
        await page.close();
      } catch (pageErr) {
        console.error(`[G2 Scraper] Error scraping ${product}:`, pageErr.message);
      }
    }

    // Deduplicate by title
    const seen = new Set();
    const unique = allReviews.filter(r => {
      const key = (r.title + r.text).substring(0, 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique;
  } finally {
    if (browser) await browser.close();
  }
}

function generateTags(review) {
  const text = `${review.title} ${review.text} ${review.product}`.toLowerCase();
  const tagMap = {
    'email migration': ['email', 'mailbox', 'exchange', 'gmail'],
    'onedrive migration': ['onedrive', 'one drive'],
    'google drive': ['google drive', 'gdrive', 'google workspace'],
    'sharepoint migration': ['sharepoint', 'share point'],
    'dropbox': ['dropbox'],
    'box migration': ['box to', 'from box'],
    'slack to teams': ['slack', 'teams', 'slack to teams'],
    'tenant migration': ['tenant', 'cross-tenant', 'tenant-to-tenant'],
    'data migration': ['data migrat', 'file migrat', 'cloud migrat'],
    'permissions': ['permission'],
    'delta migration': ['delta', 'incremental'],
    'security': ['security', 'encrypt', 'compliance', 'gdpr', 'soc'],
    'support': ['support', 'customer service', 'responsive'],
    'ease of use': ['easy', 'user friendly', 'intuitive', 'simple']
  };

  const tags = [];
  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (keywords.some(kw => text.includes(kw))) tags.push(tag);
  }
  if (tags.length === 0) tags.push('cloud migration');
  return tags;
}

/**
 * Main entry point: returns reviews with smart caching.
 * - If cache is fresh (<24h), returns cached reviews
 * - If cache is stale, tries to scrape fresh reviews
 * - If scrape fails, returns stale cache as fallback
 * - If no cache exists, scrapes or returns empty
 */
export async function getG2Reviews({ forceRefresh = false } = {}) {
  const cache = readCache();

  if (!forceRefresh && cache?.reviews?.length && isCacheFresh()) {
    console.log(`[G2 Scraper] Serving ${cache.reviews.length} cached reviews (scraped ${cache.scrapedAt})`);
    return cache.reviews;
  }

  console.log(`[G2 Scraper] Cache ${cache ? 'stale' : 'empty'}, starting live scrape...`);

  try {
    const freshReviews = await scrapeG2Reviews();

    if (freshReviews.length > 0) {
      const tagged = freshReviews.map(r => ({ ...r, tags: generateTags(r) }));
      writeCache(tagged);
      console.log(`[G2 Scraper] Cached ${tagged.length} fresh reviews`);
      return tagged;
    }

    // Scrape returned 0 reviews (G2 blocked us) — re-stamp the cache so it stays fresh
    if (cache?.reviews?.length) {
      console.log(`[G2 Scraper] Scrape returned 0 results, re-stamping cache (${cache.reviews.length} reviews)`);
      writeCache(cache.reviews);
      return cache.reviews;
    }

    return [];
  } catch (err) {
    console.error(`[G2 Scraper] Scrape failed: ${err.message}`);
    if (cache?.reviews?.length) {
      console.log(`[G2 Scraper] Serving stale cache as fallback (${cache.reviews.length} reviews)`);
      writeCache(cache.reviews);
      return cache.reviews;
    }
    return [];
  }
}

/**
 * Force a fresh scrape, update cache, return results.
 */
export async function refreshG2Reviews() {
  console.log('[G2 Scraper] Manual refresh triggered');
  return getG2Reviews({ forceRefresh: true });
}

/**
 * Manually update a review's URL in the cache.
 * Call this after visiting G2 and copying individual review permalinks.
 */
export function updateReviewUrl(reviewIndex, reviewUrl) {
  const cache = readCache();
  if (!cache?.reviews?.length) return { error: 'No reviews in cache' };
  if (reviewIndex < 0 || reviewIndex >= cache.reviews.length) return { error: 'Invalid review index' };
  cache.reviews[reviewIndex].reviewUrl = reviewUrl;
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  return { success: true, review: cache.reviews[reviewIndex] };
}

/**
 * Bulk update review URLs by matching on author or title.
 * Pass an array of { match: "author or title text", reviewUrl: "https://..." }
 */
export function bulkUpdateReviewUrls(updates) {
  const cache = readCache();
  if (!cache?.reviews?.length) return { error: 'No reviews in cache' };

  let updated = 0;
  for (const { match, reviewUrl } of updates) {
    const lower = (match || '').toLowerCase();
    const review = cache.reviews.find(r =>
      r.author?.toLowerCase().includes(lower) ||
      r.title?.toLowerCase().includes(lower)
    );
    if (review) {
      review.reviewUrl = reviewUrl;
      updated++;
    }
  }

  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  return { success: true, updated, total: cache.reviews.length };
}

/**
 * Get cache status (for admin/status endpoints).
 */
export function getG2CacheStatus() {
  const cache = readCache();
  if (!cache) return { cached: false, reviewCount: 0 };
  return {
    cached: true,
    reviewCount: cache.reviewCount || 0,
    scrapedAt: cache.scrapedAt,
    fresh: isCacheFresh(),
    ageHours: Math.round((Date.now() - new Date(cache.scrapedAt).getTime()) / 3600000 * 10) / 10
  };
}
