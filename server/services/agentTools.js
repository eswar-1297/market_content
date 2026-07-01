import { extractKeywords, searchVideosByKeywords, getCloudFuzeVideos, hasYouTubeKey } from './youtubeService.js';
import { getG2Reviews } from './g2ScraperService.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════
// 1. YOUTUBE VIDEO SUGGESTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function suggestYouTubeVideos(topic) {
  if (!hasYouTubeKey()) {
    return { error: 'YouTube API key not configured.' };
  }

  const ytApiKey = process.env.YOUTUBE_API_KEY;
  await getCloudFuzeVideos(ytApiKey);

  const keywordData = extractKeywords(topic);
  const { results } = searchVideosByKeywords(keywordData);

  if (results.length === 0) {
    return { found: 0, message: `No CloudFuze videos found for "${topic}".` };
  }

  return {
    found: results.length,
    videos: results.slice(0, 5).map(v => ({
      title: v.title,
      url: v.url,
      markdownLink: `[${v.title}](${v.url})`,
      matchedKeywords: v.matchedKeywords?.slice(0, 4) || [],
      relevanceScore: v.relevanceScore
    })),
    instruction: 'Present each video using EXACTLY the markdownLink value provided. Do NOT rewrite the links. Just copy the markdownLink as-is into your response.'
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. G2 TESTIMONIALS / REVIEWS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Searches G2 reviews using live-scraped + cached data.
 * Reviews are fetched via Puppeteer scraper with 24h cache TTL.
 * Falls back to seeded cache if scraping is blocked.
 */
export async function searchG2Reviews(topic) {
  if (!topic || typeof topic !== 'string') {
    return { found: 0, message: 'No topic provided.' };
  }

  const reviews = await getG2Reviews();

  if (!reviews || reviews.length === 0) {
    return { found: 0, message: 'No G2 reviews available. Try refreshing the G2 cache.' };
  }

  const lower = topic.toLowerCase();
  const words = lower.split(/\s+/).filter(w => w.length > 2);

  const scored = reviews.map(review => {
    let score = 0;
    const matchedTags = [];
    const tags = review.tags || [];

    for (const tag of tags) {
      if (lower.includes(tag)) {
        score += 10;
        matchedTags.push(tag);
      } else {
        const tagWords = tag.split(/\s+/);
        const hits = tagWords.filter(tw => words.some(w => w.includes(tw) || tw.includes(w)));
        if (hits.length > 0) {
          score += hits.length * 3;
          matchedTags.push(tag);
        }
      }
    }

    const textLower = ((review.title || '') + ' ' + (review.text || '')).toLowerCase();
    for (const w of words) {
      if (textLower.includes(w)) score += 1;
    }

    return { ...review, score, matchedTags };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { found: 0, message: `No G2 testimonials found matching "${topic}".` };
  }

  const g2Url = 'https://www.g2.com/products/cloudfuze/reviews';
  const gartnerUrl = 'https://www.gartner.com/reviews/market/cloud-office-migration-tools/vendor/cloudfuze/product/cloudfuze/reviews';
  return {
    found: scored.length,
    totalReviewsInCache: reviews.length,
    testimonials: scored.slice(0, 3).map(r => {
      const platform = r.platform || 'G2';
      const fallbackUrl = platform === 'Gartner' ? gartnerUrl : g2Url;
      const url = r.reviewUrl || r.platformUrl || fallbackUrl;
      const linkLabel = platform === 'Gartner' ? 'Read on Gartner Peer Insights' : 'Read on G2';
      return {
        author: r.author,
        role: r.role,
        rating: r.rating,
        title: r.title,
        text: r.text,
        platform,
        source: r.source || `${platform} Verified Review`,
        reviewLink: `[${linkLabel}](${url})`,
        matchedTags: r.matchedTags
      };
    }),
    allReviewsLink: `[See all CloudFuze reviews on G2](${g2Url})`,
    allGartnerLink: `[See all CloudFuze reviews on Gartner](${gartnerUrl})`,
    instruction: 'These are REAL verified customer reviews. For EACH testimonial, show the platform (G2 or Gartner) and include its reviewLink as a clickable link. At the end, include allReviewsLink and allGartnerLink. Copy these markdown links EXACTLY as-is — do not rewrite or break them.'
  };
}


