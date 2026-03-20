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

// ═══════════════════════════════════════════════════════════════════════════════
// 3. TABLE / INFOGRAPHIC SUGGESTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function suggestTablesAndInfographics(topic, contentType) {
  if (!topic) return { suggestions: [] };

  const lower = (topic || '').toLowerCase();
  const type = (contentType || '').toLowerCase();
  const suggestions = [];

  if (lower.includes('migrat') || lower.includes('move') || lower.includes('transfer')) {
    suggestions.push({
      type: 'comparison_table',
      title: 'Source vs Destination Feature Comparison',
      description: 'A side-by-side table comparing features, limits, and pricing between source and destination platforms. Helps readers decide if migration is worth it.',
      placement: 'After the introduction or "What is" section',
      columns: ['Feature', 'Source Platform', 'Destination Platform', 'Notes']
    });
    suggestions.push({
      type: 'process_infographic',
      title: 'Migration Steps Flowchart',
      description: 'A visual flowchart showing the step-by-step migration process from assessment to cutover. AI engines often extract numbered processes.',
      placement: 'Before the step-by-step section'
    });
    suggestions.push({
      type: 'checklist_table',
      title: 'Pre-Migration Checklist',
      description: 'A table listing items to check before starting migration — permissions, data size, compliance requirements, backup status.',
      placement: 'Early in the article or as a downloadable resource',
      columns: ['Checklist Item', 'Status', 'Priority', 'Notes']
    });
  }

  if (lower.includes('comparison') || lower.includes(' vs ') || lower.includes('alternative') || type === 'comparison') {
    suggestions.push({
      type: 'comparison_table',
      title: 'Feature-by-Feature Comparison Table',
      description: 'A detailed comparison table with rows for pricing, features, integrations, security, and support. This is the most extracted element by AI engines for comparison queries.',
      placement: 'Center of the article — the main value prop',
      columns: ['Feature', 'Product A', 'Product B', 'Winner']
    });
    suggestions.push({
      type: 'pricing_table',
      title: 'Pricing Tiers Comparison',
      description: 'A table showing pricing plans side-by-side. Include free tier, per-user cost, and enterprise pricing.',
      placement: 'After the features comparison',
      columns: ['Plan', 'Product A Price', 'Product B Price', 'What\'s Included']
    });
  }

  if (lower.includes('saas') || lower.includes('license') || lower.includes('cost') || lower.includes('spend')) {
    suggestions.push({
      type: 'data_table',
      title: 'SaaS Spend Breakdown',
      description: 'A table showing categories of SaaS spend — by department, by tool type, or by usage level. Include columns for cost and utilization percentage.',
      placement: 'After the problem statement section',
      columns: ['Category', 'Monthly Cost', 'Users', 'Utilization %']
    });
    suggestions.push({
      type: 'infographic',
      title: 'Cost Savings Infographic',
      description: 'A visual showing before vs after costs, or a pie chart of where SaaS budget goes. Include specific dollar amounts or percentages.',
      placement: 'Near the ROI or benefits section'
    });
  }

  if (lower.includes('security') || lower.includes('compliance') || lower.includes('offboard')) {
    suggestions.push({
      type: 'checklist_table',
      title: 'Security/Compliance Checklist',
      description: 'A table listing security measures, compliance requirements, and their status. Great for AI extraction as a structured list.',
      placement: 'After the main explanation section',
      columns: ['Requirement', 'Description', 'Status', 'Priority']
    });
  }

  if (lower.includes('step') || lower.includes('how to') || lower.includes('guide') || lower.includes('tutorial') || type === 'how-to') {
    suggestions.push({
      type: 'process_infographic',
      title: 'Step-by-Step Process Diagram',
      description: 'A numbered visual showing each step in the process. AI engines extract step sequences very well when they are clearly structured.',
      placement: 'At the start of the step-by-step section'
    });
    suggestions.push({
      type: 'screenshot_table',
      title: 'Screenshots with Annotations',
      description: 'A series of annotated screenshots showing exactly what each step looks like in the UI. Include numbered callouts.',
      placement: 'Alongside each step in the tutorial'
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      type: 'summary_table',
      title: 'Key Takeaways Table',
      description: 'A table summarizing the main points of the article in a scannable format. AI engines frequently extract tables for quick-answer panels.',
      placement: 'Near the "Key Takeaways" or conclusion section',
      columns: ['Point', 'Details', 'Why It Matters']
    });
    suggestions.push({
      type: 'infographic',
      title: 'Topic Overview Infographic',
      description: 'A visual overview of the topic\'s key concepts, showing relationships between ideas. Helps readers and AI engines understand the article structure at a glance.',
      placement: 'After the introduction'
    });
  }

  return {
    topic,
    contentType: contentType || 'general',
    suggestions: suggestions.slice(0, 4)
  };
}
