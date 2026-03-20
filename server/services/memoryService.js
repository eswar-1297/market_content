import { v4 as uuidv4 } from 'uuid';
import {
  saveArticle, getArticle, listArticles, deleteArticle, searchArticles,
  saveChunks, getChunks, searchChunks,
  getWriterProfile, saveWriterProfile, createWriter, getWriter, listWriters
} from '../db/copilotDb.js';

/**
 * Split article content into chunks by sections (headings).
 * Each chunk represents a logical section of the article.
 */
function chunkContent(content) {
  const lines = content.split('\n');
  const chunks = [];
  let currentChunk = { text: [], heading: '', sectionType: 'introduction' };
  let chunkIndex = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    const htmlHeadingMatch = line.match(/<h([1-6])[^>]*>(.*?)<\/h\1>/i);

    if (headingMatch || htmlHeadingMatch) {
      if (currentChunk.text.length > 0) {
        chunks.push({
          id: uuidv4(),
          chunk_text: currentChunk.text.join('\n').trim(),
          section_type: currentChunk.sectionType,
          heading: currentChunk.heading,
          chunk_index: chunkIndex++
        });
      }

      const headingText = headingMatch ? headingMatch[2] : htmlHeadingMatch[2].replace(/<[^>]+>/g, '');
      const level = headingMatch ? headingMatch[1].length : parseInt(htmlHeadingMatch[1]);

      currentChunk = {
        text: [line],
        heading: headingText.trim(),
        sectionType: detectSectionType(headingText, level)
      };
    } else {
      currentChunk.text.push(line);
    }
  }

  if (currentChunk.text.length > 0) {
    chunks.push({
      id: uuidv4(),
      chunk_text: currentChunk.text.join('\n').trim(),
      section_type: currentChunk.sectionType,
      heading: currentChunk.heading,
      chunk_index: chunkIndex
    });
  }

  return chunks;
}

function detectSectionType(heading, level) {
  const h = heading.toLowerCase();
  if (level === 1) return 'h1';
  if (/faq|frequently/i.test(h)) return 'faq';
  if (/conclusion|summary|wrap|final/i.test(h)) return 'conclusion';
  if (/what is/i.test(h)) return 'definition';
  if (/why .* matter|importance/i.test(h)) return 'why-it-matters';
  if (/step|how to|method|process|guide/i.test(h)) return 'step-by-step';
  if (/common issue|limitation|troubleshoot|error/i.test(h)) return 'common-issues';
  if (/best practice|tip|recommend|prevent/i.test(h)) return 'best-practices';
  if (/key takeaway|takeaway|tldr/i.test(h)) return 'key-takeaways';
  if (/introduction|overview|about/i.test(h)) return 'introduction';
  return 'content';
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function detectContentType(title, content) {
  const combined = `${title} ${content.substring(0, 500)}`.toLowerCase();
  if (/how to|step.by.step|guide|tutorial|method/i.test(combined)) return 'how-to';
  if (/vs\.?|versus|comparison|compare|difference/i.test(combined)) return 'comparison';
  if (/what is|definition|explain|overview/i.test(combined)) return 'educational';
  if (/error|fix|troubleshoot|issue|problem|resolve/i.test(combined)) return 'troubleshooting';
  if (/top \d+|best \d+|\d+ (best|top|ways)/i.test(combined)) return 'listicle';
  return 'general';
}

/**
 * Ingest a new article into the memory system.
 */
export function ingestArticle({ writerId, title, content, url, topic, primaryKeyword, secondaryKeywords }) {
  const id = uuidv4();
  const wordCount = countWords(content);
  const contentType = detectContentType(title, content);

  const chunks = chunkContent(content);
  const frameworkUsed = chunks.map(c => c.section_type).filter(t => t !== 'content');

  const article = saveArticle({
    id,
    writer_id: writerId || 'default',
    title,
    content,
    url: url || '',
    topic: topic || title,
    content_type: contentType,
    primary_keyword: primaryKeyword || '',
    secondary_keywords: secondaryKeywords || [],
    framework_used: frameworkUsed,
    word_count: wordCount,
    published_at: new Date().toISOString()
  });

  saveChunks(id, chunks);
  rebuildWriterProfile(writerId || 'default');

  return { article, chunksCreated: chunks.length };
}

/**
 * Find articles related to a topic by searching title, topic, keywords, and content.
 */
export function findRelatedArticles(writerId, topic) {
  const words = topic.split(/\s+/).filter(w => w.length > 3);
  const allResults = new Map();

  for (const word of words.slice(0, 5)) {
    const results = searchArticles(writerId, word);
    for (const r of results) {
      if (!allResults.has(r.id)) {
        allResults.set(r.id, { ...r, matchScore: 1 });
      } else {
        allResults.get(r.id).matchScore++;
      }
    }
  }

  const fullSearch = searchArticles(writerId, topic);
  for (const r of fullSearch) {
    if (!allResults.has(r.id)) {
      allResults.set(r.id, { ...r, matchScore: 3 });
    } else {
      allResults.get(r.id).matchScore += 3;
    }
  }

  return Array.from(allResults.values())
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);
}

/**
 * Search through article chunks for relevant content snippets.
 */
export function findRelevantChunks(writerId, query, limit = 10) {
  return searchChunks(writerId, query, limit);
}

/**
 * Rebuild the writer's profile based on all their articles.
 */
export function rebuildWriterProfile(writerId) {
  const articles = listArticles(writerId, 200);
  if (articles.length === 0) return null;

  const totalWords = articles.reduce((sum, a) => sum + (a.word_count || 0), 0);
  const avgWordCount = Math.round(totalWords / articles.length);

  const topicCounts = {};
  const typeCounts = {};
  for (const a of articles) {
    if (a.topic) {
      topicCounts[a.topic] = (topicCounts[a.topic] || 0) + 1;
    }
    if (a.content_type) {
      typeCounts[a.content_type] = (typeCounts[a.content_type] || 0) + 1;
    }
  }

  const commonTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic]) => topic);

  return saveWriterProfile({
    writer_id: writerId,
    avg_word_count: avgWordCount,
    preferred_frameworks: typeCounts,
    common_topics: commonTopics,
    writing_style: '',
    tone_analysis: '',
    total_articles: articles.length
  });
}

export {
  getArticle, listArticles, deleteArticle,
  getWriterProfile, getWriter, createWriter, listWriters
};
