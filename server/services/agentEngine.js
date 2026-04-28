import { findRelatedArticles, listArticles, getWriterProfile } from './memoryService.js';
import { trackKeywords } from './keywordEngine.js';
import { analyzeContent } from './ruleEngine.js';
import { searchChunks } from '../db/copilotDb.js';
import { getTodayTopicForWriter } from './contentCalendarService.js';
import { suggestYouTubeVideos, searchG2Reviews, suggestTablesAndInfographics } from './agentTools.js';
import { discoverQuestions, prioritizeQuestions, generateSemanticKeywords, scrapePage, analyzeGaps } from './faqService.js';
import { generateFanoutQueries } from './fanoutService.js';
import { searchReddit } from './threadFinder/reddit.js';
import { crossReferenceQuoraSearch } from './threadFinder/crossReferenceQuora.js';
import { crossReferenceMicrosoftTechSearch } from './threadFinder/crossReferenceMicrosoftTech.js';
import { crossReferenceGoogleCommunitySearch } from './threadFinder/crossReferenceGoogleCommunity.js';
import { getArticles } from './articlesService.js';
import { checkAIDetection, checkPlagiarism, isCopyleaksConfigured, isPlagiarismConfigured } from './contentCheckService.js';
import { searchAndFetchContent, listPages, getPageByUrl, isSharePointConfigured } from './sharepointService.js';
import { getWriterBio, formatWriterBioForPrompt } from '../config/writerBios.js';
import { formatBlogPatternsForPrompt, formatWriterPatternsForPrompt } from '../config/blogPatterns.js';
import { htmlToMarkdown } from '../utils/contentParser.js';
import { ICP_FRAMEWORK } from '../utils/copilotPrompts.js';
import { startTrace, flushLangfuse } from './langfuseService.js';
import { getLearnedRulesPrompt, addLearnedRule } from './feedbackLearningService.js';

// ═══ INTERNAL LLM — Claude primary, OpenAI fallback ═══
// The user-selected model (OpenAI/Gemini/Ollama) is used for the agent loop (chat + tool calling).
// Claude is used for internal content generation after tool calling.
// If Claude key is missing or fails, OpenAI (gpt-4o-mini) is used as fallback.

async function callClaude(systemPrompt, userPrompt, { maxTokens = 6000, temperature = 0.4, timeout = 120000 } = {}) {
  // Try Claude first
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  if (claudeKey) {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: claudeKey, timeout });
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature
      });
      return response.content.filter(b => b.type === 'text').map(b => b.text).join('\n') || '';
    } catch (e) {
      console.warn(`[LLM] Claude failed (${e.message}), falling back to OpenAI...`);
    }
  }

  // Fallback to OpenAI
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: openaiKey, timeout });
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: userPrompt }
        ],
        temperature,
        max_tokens: maxTokens
      });
      return response.choices[0]?.message?.content || '';
    } catch (e) {
      console.error(`[LLM] OpenAI fallback also failed: ${e.message}`);
      throw new Error('Both Claude and OpenAI failed. Check your API keys.');
    }
  }

  throw new Error('No AI API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env');
}

// Helper to get provider info for service calls (faqService, fanoutService)
// Prefers Claude, falls back to OpenAI
function getInternalProvider() {
  if (process.env.ANTHROPIC_API_KEY) return { type: 'claude', apiKey: process.env.ANTHROPIC_API_KEY };
  if (process.env.OPENAI_API_KEY) return { type: 'openai', apiKey: process.env.OPENAI_API_KEY };
  return null;
}

// ═══ RESEARCH CACHE (10 min TTL) — avoids re-running FAQ+Fanout for same topic ═══
const researchCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachedResearch(topic) {
  const key = topic.toLowerCase().trim();
  const entry = researchCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data;
  if (entry) researchCache.delete(key);
  return null;
}

function setCachedResearch(topic, data) {
  const key = topic.toLowerCase().trim();
  researchCache.set(key, { data, timestamp: Date.now() });
  // Limit cache size
  if (researchCache.size > 50) {
    const oldest = researchCache.keys().next().value;
    researchCache.delete(oldest);
  }
}

// ═══ TOOL DEFINITIONS ═══

export const AGENT_TOOLS_OPENAI = [
  {
    type: 'function',
    function: {
      name: 'search_past_articles',
      description: 'Search the writer\'s past articles to find related content, avoid duplication, and suggest internal links. Use this when the writer asks about a topic and you want to check what they\'ve written before.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query — a topic, keyword, or phrase to find in past articles' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_content_structure',
      description: 'Run a comprehensive content review: CSABF scoring, ICP alignment, FAQ gap analysis, fanout coverage, and semantic keyword check. Works with BOTH editor text AND published URLs. If the writer pastes a URL, it scrapes the live page. If the writer asks to review/analyze/score content, it reads from the editor. Always runs the full pipeline: CSABF structural analysis + ICP alignment scoring + FAQ discovery + fanout decomposition + semantic keywords. Use this for ALL review, analysis, audit, score, and improvement requests — whether on editor content or a URL.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The article text content to analyze, OR a URL to a published article (e.g. https://cloudfuze.com/blog/...). The tool auto-detects URLs and scrapes them.' }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'track_keyword_usage',
      description: 'Track how well target keywords are used in the content — density, count, which are missing, which are overused. Use this when checking if the writer has incorporated their semantic keywords.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The article content to check' },
          primary_keyword: { type: 'string', description: 'The primary target keyword' },
          secondary_keywords: { type: 'array', items: { type: 'string' }, description: 'Secondary keywords to track' },
          lsi_keywords: { type: 'array', items: { type: 'string' }, description: 'LSI/semantic keywords to track' }
        },
        required: ['content', 'primary_keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_writer_profile',
      description: 'Get the writer\'s profile including their writing style, common topics, average word count, and total articles written. Use this to personalize advice.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_article_chunks',
      description: 'Search through specific sections/chunks of past articles to find how the writer previously handled a topic, wrote introductions, structured FAQs, etc. More granular than search_past_articles.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for in article sections' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_all_articles',
      description: 'Get a list of all articles the writer has saved to memory. Use this to understand the breadth of their content library.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_todays_topic_for_writer',
      description: "Look up the content calendar to get today's assigned topic for a writer. Use this when the writer identifies themselves (e.g. 'I am Rashmi', 'I am Bhavani', 'I am Pankaj'). Supported writers: Bhavani, Rashmi, Aayushi, Pankaj. Returns today's topic and whether it is already marked as written.",
      parameters: {
        type: 'object',
        properties: {
          writer_name: { type: 'string', description: 'Writer first name: Bhavani, Rashmi, Aayushi (or Ayushi), or Pankaj' }
        },
        required: ['writer_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'suggest_youtube_videos',
      description: "Search CloudFuze's YouTube channel for videos relevant to the blog topic. Use this when the writer asks for video suggestions, or proactively when suggesting a framework — include a video recommendation. Returns video titles, URLs, and matched keywords.",
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The blog topic or title to find matching videos for' }
        },
        required: ['topic']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_g2_testimonials',
      description: "Search CloudFuze's verified customer reviews from G2 and Gartner Peer Insights relevant to the blog topic. Use this when the writer asks for testimonials, social proof, or customer quotes to include in the article. Returns real customer quotes with ratings, platform source, and direct links.",
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The blog topic to find matching G2 testimonials for (e.g. email migration, SaaS management, OneDrive migration)' }
        },
        required: ['topic']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'suggest_tables_and_infographics',
      description: "Suggest specific tables and infographics to include in the blog post based on the topic and content type. Use this when building a framework, or when the writer asks what visual elements to add. Returns table structures with column suggestions and infographic ideas with placement recommendations.",
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The blog topic' },
          content_type: { type: 'string', description: 'Content type: how-to, comparison, educational, troubleshooting, listicle, or general' }
        },
        required: ['topic']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_faqs',
      description: "Generate FAQs for a blog topic by running BOTH the FAQ pipeline (Google PAA, Reddit, Quora, AI questions) AND the Fanout query decomposer in parallel. Merges results, boosts questions that appear in both sources, and returns the top 7-10 ranked questions (no answers — writers write their own). Use this whenever the writer asks for FAQs, questions to cover, fanout queries, content gaps, or 'what should I answer'.",
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The blog topic or article title to generate FAQs for' },
          domain: { type: 'string', description: 'Optional context like technical, marketing, enterprise, etc.' }
        },
        required: ['topic']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_community_threads',
      description: "Search Reddit, Quora, Microsoft Tech Community, and Google Community for real discussions and threads related to a topic. Use this when the writer asks for community threads, Reddit threads, Quora discussions, Microsoft community posts, or Google community discussions. Returns threads grouped by source — never merged.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The topic or keyword to search for in community threads' },
          sources: {
            type: 'array',
            items: { type: 'string', enum: ['reddit', 'quora', 'microsoft', 'google'] },
            description: 'Which sources to search. Defaults to all four: reddit, quora, microsoft, google.'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browse_published_articles',
      description: "Browse or search CloudFuze's published articles on the website. Use this when the writer asks to see published articles, wants to find articles by a specific author, check what has been published recently, find articles related to a topic for internal linking, or asks 'show me articles about X'. Supports keyword/topic search to find relevant articles. Returns titles, authors, URLs, and publish dates.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: "Search query to find articles related to a topic or keyword (e.g. 'SharePoint migration', 'Google Drive to OneDrive', 'compliance'). Articles are matched by title keywords. Use this when the writer asks for articles related to a topic, content, or keyword." },
          author: { type: 'string', description: "Filter by author name as the user typed it (e.g. 'Pankaj Rai', 'Rashmi', 'Bhavani'). Pass the name exactly as mentioned by the user. Leave empty to show all authors." },
          period: { type: 'string', enum: ['7d', '30d', '3m', '6m', '1y', 'all'], description: 'Time period filter: 7d=last 7 days, 30d=last 30 days, 3m=3 months, 6m=6 months, 1y=1 year, all=all time.' },
          limit: { type: 'number', description: 'Max articles to return (default 20, max 50)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_fanout_queries',
      description: "Generate AI search fanout queries for a topic — the exact sub-queries that ChatGPT, Gemini, Perplexity, and Bing Copilot decompose internally when answering a question. Runs both ChatGPT and Gemini in parallel and merges results for maximum coverage. Use this when the writer specifically asks for fanout queries, AI search decomposition, query expansion, or wants to know what AI engines search for about a topic (separate from FAQ generation).",
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The main topic or query to decompose into fanout queries' },
          domain: { type: 'string', description: 'Optional domain context (e.g. "enterprise SaaS", "cloud migration")' },
          max_queries: { type: 'number', description: 'Number of fanout queries to generate (default 12, max 20)' }
        },
        required: ['topic']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_framework',
      description: "Generate a structured article framework/outline for a topic and insert it into the editor. Use this when the writer asks to suggest, create, or generate a framework, outline, or article structure. The framework will appear in the editor (left panel) as formatted headings with brief descriptions, so the writer can see and edit the structure before writing. Always use this tool for framework requests — do NOT just type the framework in chat.",
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The article topic to create a framework for' },
          content_type: { type: 'string', enum: ['how-to', 'comparison', 'educational', 'troubleshooting', 'listicle', 'general'], description: 'Type of article — affects which sections are suggested' },
          additional_context: { type: 'string', description: 'Any extra context: target audience, specific sections to include, angle, etc.' }
        },
        required: ['topic']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_article',
      description: "Generate a complete, publication-ready blog article following the CSABF framework for maximum AI search visibility. Use this when the writer asks you to generate, write, create, or draft a full article. The tool gathers all context from the conversation (topic, keywords, FAQs, framework, requirements) and produces a fully structured article with H1, introduction, key takeaways, body sections, FAQs with answers, and conclusion. The article follows all SEO and AI extractability best practices.",
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The main topic/title of the article' },
          primary_keyword: { type: 'string', description: 'The primary target keyword for SEO' },
          secondary_keywords: { type: 'array', items: { type: 'string' }, description: 'Secondary keywords to incorporate naturally' },
          lsi_keywords: { type: 'array', items: { type: 'string' }, description: 'LSI/semantic keywords to weave in' },
          framework: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                heading: { type: 'string' },
                level: { type: 'number' },
                brief: { type: 'string' }
              }
            },
            description: 'Article framework/outline with headings, levels (1-3), and brief descriptions'
          },
          faqs: { type: 'array', items: { type: 'string' }, description: 'FAQ questions to include with AI-optimized answers' },
          content_type: { type: 'string', enum: ['how-to', 'comparison', 'educational', 'troubleshooting', 'listicle', 'general'], description: 'Type of article' },
          target_audience: { type: 'string', description: 'Who the article is written for' },
          additional_requirements: { type: 'string', description: 'Any additional requirements or instructions from the writer' },
          word_count: { type: 'number', description: 'Target word count (default 1800-2200, max 2500)' }
        },
        required: ['topic']
      }
    }
  }
  ,{
    type: 'function',
    function: {
      name: 'edit_article',
      description: "Edit, modify, or regenerate specific sections of an article that is already in the editor. Use this when the writer asks to: rewrite a section, remove a section, add a new section, change a heading, update the introduction, fix the conclusion, expand or shorten a section, move content around, or make any targeted changes to the existing article. This tool takes the current article content and the edit instructions, then returns the full updated article. Do NOT use generate_article for edits — use this instead. generate_article is only for creating a brand new article from scratch.",
      parameters: {
        type: 'object',
        properties: {
          edit_instructions: { type: 'string', description: 'Detailed description of what to change. Be specific: which section to edit, what to add/remove/rewrite, and any constraints.' },
          section_heading: { type: 'string', description: 'Optional: the specific section heading to target (e.g., "How to Migrate" or "Frequently Asked Questions"). If omitted, applies to the whole article.' },
          edit_type: { type: 'string', enum: ['rewrite_section', 'remove_section', 'add_section', 'modify_content', 'regenerate_section', 'restructure'], description: 'Type of edit to perform' }
        },
        required: ['edit_instructions', 'edit_type']
      }
    }
  }
  ,{
    type: 'function',
    function: {
      name: 'check_ai_detection',
      description: "Run Copyleaks AI content detection on the current editor content or provided text. Returns an AI probability score (0-100%), human score, per-sentence analysis, and a verdict (Likely AI-generated, Mixed content, or Likely human-written). Use this when the writer asks to check if their content looks AI-generated, run an AI check, or check AI detection score.",
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The content to check. If omitted, uses the current editor content.' }
        },
        required: []
      }
    }
  }
  ,{
    type: 'function',
    function: {
      name: 'check_plagiarism',
      description: "Run a plagiarism check on the current editor content using Google Search. Extracts unique sentences from the content and searches for exact matches across the web. Returns a plagiarism score, matched sentences, and source URLs. Works instantly — no waiting. Use this when the writer asks for a plagiarism check, originality check, or duplicate content check.",
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The content to check. If omitted, uses the current editor content.' }
        },
        required: []
      }
    }
  }
  ,{
    type: 'function',
    function: {
      name: 'search_sharepoint_docs',
      description: "Search CloudFuze's internal SharePoint documentation site (DOC360) for product information, golden image combinations, migration guides, feature specs, and technical docs. Use this when the writer needs accurate CloudFuze product details, supported migration paths, feature specifics, or any internal documentation to include in their article. Returns page titles, content snippets, and full page content for the best match. Also use this when the writer pastes a SharePoint URL — fetch that specific page's content.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query — topic, feature name, migration path, or keyword to find in SharePoint docs (e.g. "golden image combinations", "OneDrive to Google Drive", "permission mapping", "supported platforms")' },
          sharepoint_url: { type: 'string', description: 'Optional: a specific SharePoint page URL to fetch directly instead of searching' }
        },
        required: ['query']
      }
    }
  }
  ,{
    type: 'function',
    function: {
      name: 'update_article_requirements',
      description: "Save or update the accumulated article requirements for this session. Call this EVERY TIME the writer approves keywords, removes keywords, selects FAQs, removes FAQs, approves a framework, modifies a framework, sets a content type, or gives any instruction about what the final article should include. The saved requirements persist across the conversation and will be used when generating the final article. Always pass the FULL current state of each field you are updating (not just the delta). For example, if the writer had 10 keywords and removes 2, pass the remaining 8 as secondary_keywords.",
      parameters: {
        type: 'object',
        properties: {
          primary_keyword: { type: 'string', description: 'The approved primary keyword' },
          secondary_keywords: { type: 'array', items: { type: 'string' }, description: 'The current approved list of secondary keywords (after any removals)' },
          lsi_keywords: { type: 'array', items: { type: 'string' }, description: 'The current approved list of LSI keywords (after any removals)' },
          faqs: { type: 'array', items: { type: 'string' }, description: 'The current approved list of FAQ questions (after any additions/removals)' },
          framework: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                heading: { type: 'string' },
                level: { type: 'number' },
                brief: { type: 'string' }
              }
            },
            description: 'The current approved article framework/outline'
          },
          content_type: { type: 'string', enum: ['how-to', 'comparison', 'educational', 'troubleshooting', 'listicle', 'general'], description: 'Article content type' },
          target_audience: { type: 'string', description: 'Target audience for the article' },
          notes: { type: 'string', description: 'ALL writer instructions and requirements collected so far — cumulative. Include ALL previous notes plus any new ones. Examples: word count limits, tone preferences, sections to include/exclude, topics to avoid, audience details, formatting requests, etc.' }
        },
        required: []
      }
    }
  }
  ,{
    type: 'function',
    function: {
      name: 'fetch_external_references',
      description: "Fetch external reference links and statistics from authoritative sources for a blog topic. ALWAYS use this tool when the writer asks for: Gartner data, Gartner page, Gartner statistics, Forrester research, IDC report, industry statistics, market research, research data, credible sources, external links, official documentation, or any stats/data to back up the article. Returns public Gartner pages (newsroom, SmarterwithGartner, press releases), Forrester, IDC, Statista, Microsoft Learn, Google Workspace docs, compliance sites (HHS, GDPR, FedRAMP). Pass link_types=['research'] when the writer specifically asks for Gartner, statistics, or research data.",
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The blog topic to find external references for' },
          platforms: { type: 'array', items: { type: 'string' }, description: 'Specific platforms to find official docs for (e.g., ["Microsoft 365", "SharePoint", "Google Workspace"])' },
          link_types: { type: 'array', items: { type: 'string', enum: ['official_docs', 'research', 'industry_reports', 'best_practices', 'compliance'] }, description: 'Types of links to fetch. Pass ["research"] when user asks for Gartner, statistics, or research data specifically.' }
        },
        required: ['topic']
      }
    }
  }
];

export const AGENT_TOOLS_GEMINI = AGENT_TOOLS_OPENAI.map(t => ({
  name: t.function.name,
  description: t.function.description,
  parameters: t.function.parameters
}));

// ═══ TOOL EXECUTOR ═══

export async function executeTool(toolName, args, writerId = 'default', articleRequirements = {}) {
  switch (toolName) {
    case 'search_past_articles': {
      const results = findRelatedArticles(writerId, args.query || '');
      if (results.length === 0) return JSON.stringify({ found: 0, message: 'No related past articles found.' });
      return JSON.stringify({
        found: results.length,
        note: 'These are previously published articles. Use ONLY for internal linking suggestions and avoiding topic overlap. Do NOT copy or reuse any content from these articles in new content generation.',
        articles: results.slice(0, 5).map(a => ({
          title: a.title,
          topic: a.topic,
          contentType: a.content_type,
          primaryKeyword: a.primary_keyword,
          wordCount: a.word_count
        }))
      });
    }

    case 'analyze_content_structure': {
      let rawContent = (args.content || '').trim();
      if (rawContent.length < 20) return JSON.stringify({ error: 'Content too short to analyze.' });

      try {
        // Use Claude (primary) or OpenAI (fallback) for internal analysis work
        const _ip = getInternalProvider();
        const claudeKey = _ip?.apiKey || null;
        const _ipType = _ip?.type || 'openai';

        const isURL = /^https?:\/\/[^\s]+$/i.test(rawContent);
        let csabfInput = rawContent;
        let csabfMode = 'text';
        let textForICP = rawContent;
        let pageData = null;
        let sourceUrl = null;

        // ═══ STEP 1: If URL, scrape the page to get content ═══
        if (isURL) {
          sourceUrl = rawContent;
          pageData = await scrapePage(rawContent);
          textForICP = [pageData.h1 || '', ...(pageData.paragraphs || [])].join('\n');

          const { default: axios } = await import('axios');
          const { data: rawHtml } = await axios.get(rawContent, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 30000
          });
          csabfInput = rawHtml;
          csabfMode = 'html';
        } else {
          // Build minimal pageData from editor text for FAQ/fanout pipelines
          const lines = rawContent.split('\n');
          const headings = [];
          const paragraphs = [];
          let h1 = '';
          for (const line of lines) {
            const hMatch = line.match(/^(#{1,6})\s+(.+)/);
            if (hMatch) {
              const level = hMatch[1].length;
              const text = hMatch[2].trim();
              headings.push({ level, text });
              if (level === 1 && !h1) h1 = text;
            } else if (line.trim().length > 20) {
              paragraphs.push(line.trim());
            }
          }
          // Extract existing FAQs from content (questions under FAQ section)
          const existingFAQs = [];
          let inFaqSection = false;
          for (const line of lines) {
            if (/^#{2}\s+.*(faq|frequently\s+asked)/i.test(line)) inFaqSection = true;
            else if (/^#{2}\s+/.test(line) && inFaqSection) inFaqSection = false;
            if (inFaqSection && /^#{3}\s+(.+\?)/.test(line)) {
              existingFAQs.push(line.replace(/^#{3}\s+/, '').trim());
            }
          }
          pageData = {
            url: null,
            title: h1 || 'Untitled',
            h1: h1 || '',
            headings,
            paragraphs: paragraphs.slice(0, 20),
            existingFAQs,
            wordCount: rawContent.split(/\s+/).length,
            existingSchema: [],
            hasFAQSchema: false,
            summary: paragraphs.slice(0, 3).join(' ')
          };
        }

        const topicStr = pageData.h1 || pageData.title || 'content';

        // ═══ STEP 2: Run CSABF + ICP + FAQ + Fanout + Keywords in parallel ═══
        const cachedAnalysis = getCachedResearch(topicStr);
        const [csabfResult, discoverResult, fanoutResult, keywordsResult] = await Promise.allSettled([
          Promise.resolve(analyzeContent(csabfInput, csabfMode)),
          cachedAnalysis?.faqData
            ? Promise.resolve(cachedAnalysis.faqData)
            : (claudeKey ? discoverQuestions(pageData, _ipType, claudeKey).then(async (discovery) => {
                const gaps = analyzeGaps(discovery.questions || [], pageData.existingFAQs || []);
                const prioritized = await prioritizeQuestions(gaps.gaps || [], pageData, _ipType, claudeKey);
                return { discovery, gaps, prioritized };
              }) : Promise.resolve(null)),
          cachedAnalysis?.fanoutData
            ? Promise.resolve(cachedAnalysis.fanoutData)
            : (claudeKey ? generateFanoutQueries(topicStr, '', 12, _ipType) : Promise.resolve(null)),
          claudeKey ? generateSemanticKeywords(pageData, _ipType, claudeKey) : Promise.resolve(null)
        ]);

        // Cache FAQ + fanout results
        if (!cachedAnalysis) {
          const fd = discoverResult.status === 'fulfilled' ? discoverResult.value : null;
          const fan = fanoutResult.status === 'fulfilled' ? fanoutResult.value : null;
          if (fd || fan) setCachedResearch(topicStr, { faqData: fd, fanoutData: fan });
        }

        const csabf = csabfResult.status === 'fulfilled' ? csabfResult.value : null;
        const discoverData = discoverResult.status === 'fulfilled' ? discoverResult.value : null;
        const fanoutData = fanoutResult.status === 'fulfilled' ? fanoutResult.value : null;
        const keywordsData = keywordsResult.status === 'fulfilled' ? keywordsResult.value : null;

        // ═══ STEP 3: CSABF structural analysis ═══
        const failingChecks = [];
        const passingChecks = [];
        if (csabf) {
          const checks = Object.entries(csabf.checks || {});
          checks.filter(([, v]) => !v.passed)
            .sort((a, b) => {
              const p = { critical: 0, relevant: 1, optional: 2 };
              return (p[a[1].relevance] || 2) - (p[b[1].relevance] || 2);
            })
            .slice(0, 12)
            .forEach(([name, check]) => {
              failingChecks.push({
                check: name,
                relevance: check.relevance,
                message: check.message || '',
                fix: (check.suggestions || [])[0] || ''
              });
            });
          checks.filter(([, v]) => v.passed).forEach(([name]) => passingChecks.push(name));
        }

        // ═══ STEP 4: ICP Alignment Scoring ═══
        const contentLower = textForICP.toLowerCase();

        const enterpriseTerms = ['enterprise', 'organization', 'large-scale', 'org-wide', 'company-wide', 'multi-tenant', 'bulk migration', '500+', '1000+', 'thousands of users', 'large organization', 'fortune 500', 'mid-size', 'small business', 'smb', 'team'];
        const enterpriseHits = enterpriseTerms.filter(t => contentLower.includes(t));
        const hasEnterprise = enterpriseHits.some(t => ['enterprise', 'organization', 'large-scale', 'org-wide', 'company-wide', 'multi-tenant', 'bulk migration', '500+', '1000+', 'thousands of users', 'large organization', 'fortune 500'].includes(t));
        const companySizeScore = hasEnterprise ? (enterpriseHits.length >= 4 ? 35 : enterpriseHits.length >= 2 ? 25 : 15) : (enterpriseHits.length > 0 ? 10 : 5);

        const geoTerms = ['soc 2', 'soc2', 'hipaa', 'fedramp', 'gdpr', 'ccpa', 'compliance', 'united states', 'north america', 'us-based', 'uk', 'canada', 'australia', 'eu', 'european union', 'data residency', 'data sovereignty'];
        const geoHits = geoTerms.filter(t => contentLower.includes(t));
        const geoScore = geoHits.length >= 3 ? 35 : geoHits.length >= 2 ? 25 : geoHits.length >= 1 ? 20 : 5;

        const industryTerms = ['it services', 'software', 'financial services', 'healthcare', 'education', 'marketing', 'consulting', 'fintech', 'saas', 'technology', 'banking', 'insurance', 'pharmaceutical', 'it consulting'];
        const industryHits = industryTerms.filter(t => contentLower.includes(t));
        const industryScore = industryHits.length >= 2 ? 10 : industryHits.length >= 1 ? 6 : 2;

        const techTerms = ['microsoft 365', 'office 365', 'google workspace', 'g suite', 'sharepoint', 'onedrive', 'google drive', 'dropbox', 'box', 'egnyte', 'teams', 'outlook', 'gmail', 'azure ad', 'entra id'];
        const techHits = techTerms.filter(t => contentLower.includes(t));
        const techScore = techHits.length >= 3 ? 10 : techHits.length >= 2 ? 8 : techHits.length >= 1 ? 5 : 0;

        const buyerTerms = ['cio', 'cto', 'it director', 'head of it', 'it manager', 'it admin', 'it administrator', 'it leader', 'it decision', 'chief information', 'chief technology', 'vp of it', 'it team', 'system administrator', 'cloud architect'];
        const buyerHits = buyerTerms.filter(t => contentLower.includes(t));
        const hasCLevel = buyerHits.some(t => ['cio', 'cto', 'it director', 'head of it', 'chief information', 'chief technology', 'vp of it'].includes(t));
        const buyerScore = hasCLevel ? 10 : buyerHits.length >= 1 ? 7 : 0;

        const icpTotalScore = companySizeScore + geoScore + industryScore + techScore + buyerScore;
        const icpTier = icpTotalScore >= 80 ? 'Core ICP' : icpTotalScore >= 65 ? 'Strong ICP' : icpTotalScore >= 50 ? 'Moderate ICP' : 'Non-ICP';

        // ═══ STEP 5: FAQ gap analysis — covered vs missing questions ═══
        const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const wordSet = s => new Set(normalize(s).split(/\s+/).filter(w => w.length > 2));
        const jaccard = (a, b) => {
          const inter = [...a].filter(w => b.has(w)).length;
          const union = new Set([...a, ...b]).size;
          return union > 0 ? inter / union : 0;
        };

        const existingHeadings = (pageData.headings || []).map(h => normalize(h.text || h));
        const existingFAQsNorm = (pageData.existingFAQs || []).map(normalize);
        const allExisting = [...existingHeadings, ...existingFAQsNorm];

        const isCoveredByContent = (text) => {
          const words = wordSet(text);
          return allExisting.some(existing => jaccard(words, wordSet(existing)) > 0.3);
        };

        const gapData = discoverData?.gaps || { gaps: [], covered: [] };
        const prioritizedGaps = discoverData?.prioritized?.prioritizedQuestions || [];

        const faqMissing = prioritizedGaps.map(q => ({
          question: q.question,
          priority: q.priority || 'medium',
          source: q.source || 'unknown',
          intent: q.intent || 'informational',
          sources: ['faq-pipeline'],
          boost: 0
        }));

        const fanoutGaps = [];
        for (const fan of (fanoutData?.fanouts || [])) {
          if (!isCoveredByContent(fan.query)) {
            fanoutGaps.push({ query: fan.query, category: fan.category, purpose: fan.purpose });
          }
        }

        // Cross-boost FAQs that also appear in fanout
        for (const faq of faqMissing) {
          const faqWords = wordSet(faq.question);
          for (const fan of fanoutGaps) {
            if (jaccard(faqWords, wordSet(fan.query)) > 0.35) {
              faq.boost += 20;
              faq.sources.push('fanout');
              faq.fanoutCategory = fan.category;
              fan._covered = true;
              break;
            }
          }
        }

        const uncoveredFanoutAsQuestions = fanoutGaps
          .filter(f => !f._covered)
          .map(f => ({ question: f.query, priority: 'medium', source: 'fanout', intent: 'informational', sources: ['fanout'], boost: 0, fanoutCategory: f.category, purpose: f.purpose }));

        const allMissing = [...faqMissing, ...uncoveredFanoutAsQuestions];
        allMissing.sort((a, b) => {
          const scoreA = (a.boost || 0) + (a.priority === 'high' ? 30 : a.priority === 'medium' ? 15 : 0) + (a.sources.length > 1 ? 25 : 0);
          const scoreB = (b.boost || 0) + (b.priority === 'high' ? 30 : b.priority === 'medium' ? 15 : 0) + (b.sources.length > 1 ? 25 : 0);
          return scoreB - scoreA;
        });

        const coveredQuestions = (gapData.covered || []).map(q => ({
          question: q.question || q,
          source: q.source || 'unknown'
        }));

        // ═══ STEP 6: Build unified response ═══
        return JSON.stringify({
          source: isURL ? 'url' : 'editor',
          ...(sourceUrl && { url: sourceUrl }),
          title: pageData.title || pageData.h1 || null,
          h1: pageData.h1 || null,
          wordCount: pageData.wordCount || csabf?.contentContext?.wordCount || null,
          ...(isURL && { hasFAQSchema: pageData.hasFAQSchema }),
          existingFAQCount: (pageData.existingFAQs || []).length,
          existingHeadingsCount: (pageData.headings || []).length,

          overallScore: csabf?.overallScore ?? csabf?.score ?? null,
          csabfScore: csabf?.overallScore ?? csabf?.score ?? null,
          categories: csabf ? Object.fromEntries(
            Object.entries(csabf.categories || {}).map(([k, v]) => [k, { label: v.label, score: v.score }])
          ) : null,
          failingChecks,
          passingChecks: passingChecks.slice(0, 10),
          topSuggestions: (csabf?.suggestions || []).slice(0, 12).map(s => ({
            priority: s.priority,
            text: s.text,
            guideline: s.guideline
          })),

          contentContext: csabf?.contentContext ? {
            detectedType: csabf.contentContext.detectedType,
            wordCount: csabf.contentContext.wordCount,
            h2Count: csabf.contentContext.h2Count,
            hasFAQSection: csabf.contentContext.hasFAQSection,
            hasConclusion: csabf.contentContext.hasConclusion,
            isProcedural: csabf.contentContext.isProcedural,
            isComparison: csabf.contentContext.isComparison,
            hasKeyTakeaways: csabf.contentContext.hasKeyTakeaways
          } : null,

          readability: csabf?.checks?.readability ? {
            score: csabf.checks.readability.score,
            passed: csabf.checks.readability.passed,
            issues: csabf.checks.readability.details,
            metrics: csabf.checks.readability.metrics || {}
          } : null,

          formatting: {
            paragraphLength: csabf?.checks?.paragraphLength ? { passed: csabf.checks.paragraphLength.passed, details: csabf.checks.paragraphLength.details || csabf.checks.paragraphLength.message } : null,
            bulletLists: csabf?.checks?.bulletLists ? { passed: csabf.checks.bulletLists.passed, details: csabf.checks.bulletLists.details || csabf.checks.bulletLists.message } : null,
            numberedLists: csabf?.checks?.numberedLists ? { passed: csabf.checks.numberedLists.passed, details: csabf.checks.numberedLists.details || csabf.checks.numberedLists.message } : null,
            headingStructure: csabf?.checks?.h1Count ? { passed: csabf.checks.h1Count.passed && csabf.checks.h2Count?.passed, h1: csabf.checks.h1Count.details || csabf.checks.h1Count.message, h2: csabf.checks.h2Count?.details || csabf.checks.h2Count?.message } : null,
            subheadingDistribution: csabf?.checks?.subheadingDistribution ? { passed: csabf.checks.subheadingDistribution.passed, details: csabf.checks.subheadingDistribution.details || csabf.checks.subheadingDistribution.message } : null
          },

          grammar: {
            passiveVoice: csabf?.checks?.readability?.metrics ? { rate: csabf.checks.readability.metrics.passiveRate + '%', passed: parseFloat(csabf.checks.readability.metrics.passiveRate) <= 20 } : null,
            marketingTone: csabf?.checks?.marketingTone ? { passed: csabf.checks.marketingTone.passed, details: csabf.checks.marketingTone.details || csabf.checks.marketingTone.message } : null,
            conversationalTone: csabf?.checks?.readability?.metrics?.hasYou ?? null
          },

          icpAlignment: {
            totalScore: icpTotalScore,
            tier: icpTier,
            breakdown: {
              companySize: { score: companySizeScore, max: 35, hits: enterpriseHits },
              geography: { score: geoScore, max: 35, hits: geoHits },
              industry: { score: industryScore, max: 10, hits: industryHits },
              technology: { score: techScore, max: 10, hits: techHits },
              buyerPersona: { score: buyerScore, max: 10, hits: buyerHits }
            }
          },

          coveredQuestions: coveredQuestions.slice(0, 10),
          missingQuestions: allMissing.slice(0, 10).map((item, i) => ({
            rank: i + 1,
            question: item.question,
            priority: item.priority,
            source: item.source,
            intent: item.intent,
            sources: item.sources,
            fanoutCategory: item.fanoutCategory || null,
            appearsInBoth: item.sources.length > 1
          })),
          totalQuestionsDiscovered: discoverData?.discovery?.questions?.length || 0,
          totalFanoutQueries: (fanoutData?.fanouts || []).length,
          fanoutGapsCount: fanoutGaps.filter(f => !f._covered).length,

          semanticKeywords: keywordsData ? {
            core: (keywordsData.coreTopicKeywords || []).slice(0, 10),
            lsi: (keywordsData.lsiKeywords || []).slice(0, 10),
            longTail: (keywordsData.longTailPhrases || []).slice(0, 8)
          } : null,

          // ═══ MISSING SECTIONS DETECTION ═══
          suggestedMissingSections: (() => {
            const headingsLower = (pageData.headings || []).map(h => (h.text || h).toLowerCase());
            const allText = (textForICP || '').toLowerCase();
            const missing = [];

            // Check for common high-value sections that should exist based on topic
            const sectionChecks = [
              { pattern: /pric|cost|budget|roi|total cost/i, heading: 'Pricing and Cost Considerations', reason: 'Enterprise buyers need cost/ROI information to justify purchases', condition: () => !headingsLower.some(h => /pric|cost|budget|roi/.test(h)) && (lower.includes('migrat') || lower.includes('tool') || lower.includes('solution')) },
              { pattern: /use case|scenario|real.?world|example/i, heading: 'Real-World Use Cases', reason: 'Use cases demonstrate practical applicability and boost E-E-A-T Experience signals', condition: () => !headingsLower.some(h => /use case|scenario|real.?world/.test(h)) && !allText.includes('use case') },
              { pattern: /secur|compliance|soc|hipaa|gdpr/i, heading: 'Security and Compliance Considerations', reason: 'Enterprise buyers prioritize security — missing compliance content loses Core ICP', condition: () => !headingsLower.some(h => /secur|compliance/.test(h)) && !allText.includes('soc 2') && !allText.includes('hipaa') },
              { pattern: /best practice|tip|recommendation/i, heading: 'Best Practices and Recommendations', reason: 'Best practices sections are highly cited by AI search engines', condition: () => !headingsLower.some(h => /best practice|tip|recommendation/.test(h)) },
              { pattern: /challenge|risk|pitfall|mistake|avoid/i, heading: 'Common Challenges and How to Avoid Them', reason: 'Problem-solution content matches high-intent search queries', condition: () => !headingsLower.some(h => /challenge|risk|pitfall|mistake|avoid/.test(h)) },
              { pattern: /benefit|advantage|why/i, heading: 'Key Benefits and Advantages', reason: 'Benefits sections help AI engines understand value proposition', condition: () => !headingsLower.some(h => /benefit|advantage/.test(h)) && (lower.includes('migrat') || lower.includes('manage') || lower.includes('tool')) },
              { pattern: /step|how to|process|guide/i, heading: 'Step-by-Step Implementation Guide', reason: 'Procedural content is extracted by Google AI Overviews as featured snippets', condition: () => !headingsLower.some(h => /step|how to|process/.test(h)) && (lower.includes('how') || lower.includes('guide') || lower.includes('migrat')) },
              { pattern: /compare|vs|versus|differ/i, heading: 'Comparison: Key Differences', reason: 'Comparison tables are directly extracted by Perplexity and Google AIO', condition: () => !headingsLower.some(h => /compare|vs|versus|differ/.test(h)) && (lower.includes('vs') || lower.includes('compar') || lower.includes('differ')) },
              { pattern: /cloudfuze|how .* helps/i, heading: 'How CloudFuze Helps', reason: 'Dedicated CloudFuze section is mandatory per blog standards', condition: () => !headingsLower.some(h => /cloudfuze|how .* helps/.test(h)) },
              { pattern: /faq|frequently asked/i, heading: 'Frequently Asked Questions', reason: 'FAQ section is required by CSABF framework and boosts FAQ schema eligibility', condition: () => !headingsLower.some(h => /faq|frequently asked/.test(h)) },
              { pattern: /key takeaway|takeaway|summary/i, heading: 'Key Takeaways', reason: 'Key Takeaways are present in 95% of CloudFuze articles and are highly cited', condition: () => !headingsLower.some(h => /key takeaway|takeaway/.test(h)) }
            ];

            for (const check of sectionChecks) {
              try {
                if (check.condition()) {
                  missing.push({ heading: check.heading, reason: check.reason });
                }
              } catch { /* skip check on error */ }
            }

            return missing.slice(0, 6);
          })(),

          instruction: 'Present a comprehensive review report with ALL of the following sections. Use clear ## headings for each section so the writer can scan them independently:\n\n(1) ## CSABF SCORE + STRUCTURAL ISSUES\nOverall score, category scores, every failing check with specific fixes.\n\n(2) ## ICP ALIGNMENT\nTotal score, tier, breakdown by 5 categories with hits and specific suggestions to increase each.\n\n(3) ## GEO CITABILITY & AI VISIBILITY\nCheck each section for AI citation readiness — self-contained answer blocks, definition patterns, statistics, question-format headings, extractable lists/tables. Quote exact weak sentences and give rewritten versions.\n\n(4) ## E-E-A-T SIGNALS\nCheck for Experience (case studies, real results), Expertise (technical depth, data-backed claims), Authoritativeness (credentials, CloudFuze track record), Trustworthiness (verifiable facts). Flag what is missing and suggest specific additions.\n\n(5) ## READABILITY\nUse the readability data provided. Report on: average sentence length (target 15-20 words), passive voice rate (target <10%), sentence length variety, complex word percentage (target <15%), transition word usage (target >20%), consecutive same-length sentences. For each metric, show the current value, whether it passes/fails, and a specific fix if failing. Give an overall readability score.\n\n(6) ## GRAMMAR & TONE\nCheck for: passive voice instances (quote specific sentences and rewrite in active voice), marketing/salesy language (quote and rewrite), missing conversational tone (no you/your), filler words, hedging language, generic AI-sounding phrases. Quote exact problem sentences and provide corrected versions.\n\n(7) ## FORMATTING\nCheck: paragraph lengths (max 5 lines each — flag any long paragraphs), heading structure (1 H1, 4-10 H2s), bullet list usage (min 2), numbered list usage (min 1), subheading distribution (max 200 words between subheadings — flag gaps), whitespace/scanability. For each issue, specify the exact location and fix.\n\n(8) ## FAQ GAP ANALYSIS\nShow COVERED questions (good), then MISSING questions ranked by priority. Highlight HIGH PRIORITY ones (appearsInBoth=true). Specify WHERE in the article each missing question should go.\n\n(9) ## SEMANTIC KEYWORDS\nShow target keywords the content should include.\n\n(10) ## SUGGESTED MISSING SECTIONS\nBased on the topic and content analysis, suggest sections that are MISSING from the article but should be added. For each suggested section, explain WHY it should be added and WHERE it should go in the article structure. Common missing sections include: Pricing/Cost Analysis, Use Cases, Security & Compliance, Best Practices, Common Challenges, Key Benefits, Step-by-Step Guide, Comparison Table, How CloudFuze Helps, FAQs, Key Takeaways.\n\nIMPORTANT: Each section must be clearly separated with ## headings. Use checkmarks (pass) and X marks (fail) for quick scanning. Be specific — quote exact content and give actionable fixes for every issue.'
        });
      } catch (e) {
        return JSON.stringify({ error: 'Content analysis failed: ' + e.message });
      }
    }

    case 'track_keyword_usage': {
      const content = args.content || '';
      const keywords = {
        primary: args.primary_keyword || '',
        secondary: args.secondary_keywords || [],
        lsi: args.lsi_keywords || []
      };
      const result = trackKeywords(content, keywords);
      if (!result) return JSON.stringify({ error: 'Could not track keywords.' });
      return JSON.stringify({
        primary: result.primary,
        secondaryCoverage: result.secondaryCoverage + '%',
        lsiCoverage: result.lsiCoverage + '%',
        missingSecondary: (result.secondary || []).filter(k => !k.used).map(k => k.keyword),
        missingLsi: (result.lsi || []).filter(k => !k.used).map(k => k.keyword).slice(0, 10),
        usedKeywords: [...(result.secondary || []), ...(result.lsi || [])].filter(k => k.used).map(k => `${k.keyword} (${k.count}x)`)
      });
    }

    case 'get_writer_profile': {
      const profile = getWriterProfile(writerId);
      if (!profile) return JSON.stringify({ message: 'No writer profile yet. The writer hasn\'t saved any articles to memory.' });
      return JSON.stringify({
        totalArticles: profile.total_articles,
        avgWordCount: profile.avg_word_count,
        commonTopics: profile.common_topics,
        writingStyle: profile.writing_style || 'Not analyzed yet',
        preferredFrameworks: profile.preferred_frameworks
      });
    }

    case 'search_article_chunks': {
      const chunks = searchChunks(writerId, args.query || '', 5);
      if (chunks.length === 0) return JSON.stringify({ found: 0, message: 'No matching content sections found.' });
      return JSON.stringify({
        found: chunks.length,
        warning: 'These chunks are from PAST PUBLISHED articles. Use them ONLY for reference (understanding what was already written, internal linking, avoiding duplication). Do NOT copy, paraphrase, or reuse this content in new articles. All new content must be 100% AI-original. Use SharePoint docs for factual product data.',
        chunks: chunks.map(c => ({
          articleTitle: c.article_title,
          sectionType: c.section_type,
          heading: c.heading,
          preview: c.chunk_text.substring(0, 300)
        }))
      });
    }

    case 'list_all_articles': {
      const articles = listArticles(writerId, 30);
      if (articles.length === 0) return JSON.stringify({ count: 0, message: 'No articles saved to memory yet.' });
      return JSON.stringify({
        count: articles.length,
        articles: articles.map(a => ({
          title: a.title,
          topic: a.topic,
          contentType: a.content_type,
          keyword: a.primary_keyword,
          words: a.word_count
        }))
      });
    }

    case 'get_todays_topic_for_writer': {
      const name = (args.writer_name || '').toString().trim();
      const result = getTodayTopicForWriter(name);
      if (!result) return JSON.stringify({ error: `Writer "${name}" not found in calendar. Use Bhavani, Rashmi, Aayushi, or Pankaj.` });
      return JSON.stringify({
        writer: name,
        topic: result.topic,
        written: result.written,
        date: result.date || null,
        nextDate: result.nextDate || null,
        upcomingTopics: (result.allTopics || []).slice(0, 10)
      });
    }

    case 'suggest_youtube_videos': {
      const topicStr = (args.topic || '').toString().trim();
      if (!topicStr) return JSON.stringify({ error: 'Topic is required.' });
      try {
        const result = await suggestYouTubeVideos(topicStr);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    }

    case 'search_g2_testimonials': {
      const topicStr = (args.topic || '').toString().trim();
      if (!topicStr) return JSON.stringify({ error: 'Topic is required.' });
      try {
        const result = await searchG2Reviews(topicStr);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    }

    case 'suggest_tables_and_infographics': {
      const topicStr = (args.topic || '').toString().trim();
      const contentType = (args.content_type || '').toString().trim();
      if (!topicStr) return JSON.stringify({ error: 'Topic is required.' });
      const result = suggestTablesAndInfographics(topicStr, contentType);
      return JSON.stringify(result);
    }

    case 'generate_faqs': {
      const topicStr = (args.topic || '').toString().trim();
      if (!topicStr) return JSON.stringify({ error: 'Topic is required.' });
      try {
        // Use Claude (primary) or OpenAI (fallback) for FAQ/keyword generation
        const _ip = getInternalProvider();
        if (!_ip) return JSON.stringify({ error: 'No AI API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env' });

        const pageData = { url: null, title: topicStr, h1: topicStr, headings: [], paragraphs: [], existingFAQs: [], wordCount: 0, existingSchema: [], hasFAQSchema: false, summary: '' };

        // Run discovery + prioritization + keywords + fanout in parallel
        const [discoverResult, fanoutResult, keywordsResult] = await Promise.allSettled([
          discoverQuestions(pageData, _ip.type, _ip.apiKey).then(async (discovery) => {
            const prioritized = await prioritizeQuestions(discovery.questions || [], pageData, _ip.type, _ip.apiKey);
            return { discovery, prioritized };
          }),
          generateFanoutQueries(topicStr, args.domain || '', 12, _ip.type),
          generateSemanticKeywords(pageData, _ip.type, _ip.apiKey)
        ]);

        const discoverData = discoverResult.status === 'fulfilled' ? discoverResult.value : null;
        const fanoutData = fanoutResult.status === 'fulfilled' ? fanoutResult.value : null;
        const keywordsData = keywordsResult.status === 'fulfilled' ? keywordsResult.value : null;

        const prioritizedQs = discoverData?.prioritized?.prioritizedQuestions || [];

        // If discovery returned no questions, generate fallback FAQs via Claude
        let effectiveQs = prioritizedQs;
        if (effectiveQs.length === 0) {
          try {
            const fanoutSeed = (fanoutData?.fanouts || []).map(f => f.query).slice(0, 6).join('\n');
            const fallbackPrompt = `You are an AEO expert for CloudFuze, a cloud migration platform.
Generate 8-10 real FAQ questions that enterprise IT buyers (CIOs, IT Directors) would ask about: "${topicStr}"

These should be questions people actually search on Google, ask ChatGPT/Perplexity, or discuss on Reddit/Quora.
Focus on: migration challenges, compliance (SOC 2, HIPAA, GDPR), bulk migration, Microsoft 365, Google Workspace, SharePoint.

Related queries to consider:
${fanoutSeed}

Return JSON: { "prioritizedQuestions": [{ "question": "...", "source": "ai-generated", "intent": "informational|transactional|comparison", "priority": "high|medium|low", "aiCitationScore": 0 }] }
Put 5-6 as high, 3-4 as medium. High = questions ChatGPT/Gemini would cite answers to.`;
            const raw = await callClaude('', fallbackPrompt, { maxTokens: 2000, temperature: 0.3, timeout: 30000 });
            if (raw) {
              const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
              try {
                const parsed = JSON.parse(cleaned);
                effectiveQs = parsed.prioritizedQuestions || [];
              } catch { /* ignore parse error */ }
            }
          } catch { /* ignore fallback errors — fanout will fill the gap */ }
        }

        const faqQuestions = effectiveQs.map(f => ({
          question: f.question,
          priority: f.priority || 'medium',
          // Derive aiCitationScore from priority — prioritizeQuestions doesn't return this field
          // so we assign it here to ensure real FAQs always rank above uncovered fanout queries.
          aiCitationScore: f.aiCitationScore || (
            f.priority === 'high' ? 80 :
            f.priority === 'medium' ? 50 :
            20
          ),
          intent: f.intent || 'informational',
          source: f.source || 'unknown',
          sources: ['faq-pipeline'],
          boost: 0
        }));

        // Fanout queries get a lower base score (35) so real FAQs always rank above them
        const fanoutQueries = (fanoutData?.fanouts || []).map(f => ({
          question: f.query,
          priority: 'medium',
          aiCitationScore: 35,
          intent: 'informational',
          category: f.category,
          purpose: f.purpose,
          sources: ['fanout'],
          boost: 0
        }));

        // Cross-match: boost FAQ questions that overlap with fanout queries
        const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const wordSet = s => new Set(normalize(s).split(/\s+/).filter(w => w.length > 2));

        for (const faq of faqQuestions) {
          const faqWords = wordSet(faq.question);
          for (const fan of fanoutQueries) {
            const fanWords = wordSet(fan.question);
            const intersection = [...faqWords].filter(w => fanWords.has(w));
            const union = new Set([...faqWords, ...fanWords]);
            const similarity = union.size > 0 ? intersection.length / union.size : 0;
            if (similarity > 0.35) {
              faq.boost += 20;
              faq.sources.push('fanout');
              faq.fanoutCategory = fan.category;
              fan.boost = -100; // mark as covered
              break;
            }
          }
        }

        // Collect uncovered fanout queries (ones not already in FAQ list)
        const uncoveredFanouts = fanoutQueries.filter(f => f.boost !== -100);

        // Merge and rank
        const allItems = [...faqQuestions, ...uncoveredFanouts];
        allItems.sort((a, b) => {
          const scoreA = (a.aiCitationScore || 0) + a.boost
            + (a.priority === 'high' ? 30 : a.priority === 'medium' ? 15 : 0)
            + (a.sources.length > 1 ? 25 : 0);
          const scoreB = (b.aiCitationScore || 0) + b.boost
            + (b.priority === 'high' ? 30 : b.priority === 'medium' ? 15 : 0)
            + (b.sources.length > 1 ? 25 : 0);
          return scoreB - scoreA;
        });

        const top = allItems.slice(0, 10);

        const discovery = discoverData?.discovery;
        return JSON.stringify({
          topic: discovery?.topic || topicStr,
          primaryKeyword: discovery?.primaryKeyword || '',
          totalQuestionsDiscovered: (discovery?.questions?.length || 0),
          totalFanoutQueries: fanoutQueries.length,
          sourceCounts: discovery?.sourceCounts || {},
          rankedQuestions: top.map((item, i) => ({
            rank: i + 1,
            question: item.question,
            priority: item.priority,
            intent: item.intent,
            sources: item.sources,
            originalSource: item.source || null,
            fanoutCategory: item.fanoutCategory || item.category || null,
            purpose: item.purpose || null,
            appearsInBoth: item.sources.length > 1
          })),
          semanticKeywords: keywordsData ? {
            core: (keywordsData.coreTopicKeywords || []).slice(0, 10),
            lsi: (keywordsData.lsiKeywords || []).slice(0, 10),
            longTail: (keywordsData.longTailPhrases || []).slice(0, 8)
          } : null,
          instruction: 'Present ONLY the questions as a numbered list — do NOT generate answers. The content writer will write their own answers. Highlight questions with appearsInBoth=true as HIGH PRIORITY (they appear in both real user questions AND AI search fanout queries). For each question, mention its source (e.g. Google PAA, Reddit, fanout) and priority. Also present the semantic keywords.'
        });
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    }

    // audit_published_article is now merged into analyze_content_structure (auto-detects URLs)
    case 'audit_published_article': {
      // Redirect to the unified tool
      const urlStr = (args.url || '').toString().trim();
      return await executeTool('analyze_content_structure', { content: urlStr }, writerId, articleRequirements);
    }

    case 'search_community_threads': {
      const query = (args.query || '').toString().trim();
      if (!query) return JSON.stringify({ error: 'Query is required.' });
      const sources = Array.isArray(args.sources) && args.sources.length > 0 ? args.sources : ['reddit', 'quora', 'microsoft', 'google'];

      const results = {};
      const sourcesSummary = [];
      const tasks = [];

      if (sources.includes('reddit')) {
        tasks.push(
          searchReddit({ query, limit: 30, sort: 'relevance', timeFilter: 'all', minScore: 0, minComments: 0 })
            .then(data => {
              const list = Array.isArray(data) ? data : (data.threads || data.results || []);
              const threads = list.slice(0, 20).map(t => ({
                title: t.title || '',
                url: t.url || (t.permalink ? `https://reddit.com${t.permalink}` : ''),
                community: t.subreddit ? `r/${t.subreddit}` : null,
                score: t.score || 0,
                comments: t.num_comments || t.numComments || 0,
                snippet: ((t.selftext || t.body || t.snippet || '')).substring(0, 200) || null
              })).filter(t => t.title && t.url);
              results.reddit = threads;
              sourcesSummary.push(`Reddit: ${threads.length} threads`);
            })
            .catch(e => { results.reddit = []; sourcesSummary.push(`Reddit: failed (${e.message})`); })
        );
      }

      if (sources.includes('quora')) {
        tasks.push(
          crossReferenceQuoraSearch(query, { limit: 25, useBing: true, useGoogle: true, useCache: true })
            .then(data => {
              const list = Array.isArray(data) ? data : (data.questions || data.threads || data.results || []);
              const threads = list.slice(0, 20).map(t => ({
                title: t.title || t.question || '',
                url: t.url || t.link || '',
                score: t.score || t.upvotes || 0,
                comments: t.answers || t.comments || 0,
                snippet: ((t.snippet || t.body || t.description || '')).substring(0, 200) || null
              })).filter(t => t.title && t.url);
              results.quora = threads;
              sourcesSummary.push(`Quora: ${threads.length} threads`);
            })
            .catch(e => { results.quora = []; sourcesSummary.push(`Quora: failed (${e.message})`); })
        );
      }

      if (sources.includes('microsoft')) {
        tasks.push(
          crossReferenceMicrosoftTechSearch(query, { limit: 20, useGoogle: true, useBing: true })
            .then(data => {
              const list = Array.isArray(data) ? data : (data.threads || data.results || []);
              const threads = (Array.isArray(list) ? list : []).slice(0, 20).map(t => ({
                title: t.title || '',
                url: t.url || '',
                forum: t.forum || t.product || null,
                type: t.type || 'question',
                snippet: ((t.snippet || t.body || '')).substring(0, 200) || null,
                sources: t.sources || []
              })).filter(t => t.title && t.url);
              results.microsoft = threads;
              sourcesSummary.push(`Microsoft Community: ${threads.length} threads`);
            })
            .catch(e => { results.microsoft = []; sourcesSummary.push(`Microsoft Community: failed (${e.message})`); })
        );
      }

      if (sources.includes('google')) {
        tasks.push(
          crossReferenceGoogleCommunitySearch(query, { limit: 20, useGoogle: true, useBing: true })
            .then(data => {
              const list = Array.isArray(data) ? data : (data.threads || data.results || []);
              const threads = (Array.isArray(list) ? list : []).slice(0, 20).map(t => ({
                title: t.title || t.question || '',
                url: t.url || '',
                product: t.product || t.forum || null,
                snippet: ((t.snippet || t.body || '')).substring(0, 200) || null,
                sources: t.sources || []
              })).filter(t => t.title && t.url);
              results.google = threads;
              sourcesSummary.push(`Google Community: ${threads.length} threads`);
            })
            .catch(e => { results.google = []; sourcesSummary.push(`Google Community: failed (${e.message})`); })
        );
      }

      await Promise.allSettled(tasks);

      const totalFound = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

      if (totalFound === 0) {
        return JSON.stringify({ found: 0, message: `No community threads found for "${query}".`, sources: sourcesSummary });
      }

      // Build markdown directly — return as raw string so the AI passes it through verbatim
      const sections = [];

      const formatSection = (title, threads, formatThread) => {
        if (!threads || threads.length === 0) return;
        const lines = [`## ${title} (${threads.length})`, ''];
        threads.forEach((t, i) => {
          lines.push(formatThread(t, i));
        });
        sections.push(lines.join('\n'));
      };

      formatSection('Reddit Threads', results.reddit, (t, i) => {
        let line = `${i + 1}. [${t.title}](${t.url})`;
        if (t.community) line += ` — *${t.community}*`;
        const meta = [];
        if (t.score) meta.push(`${t.score} upvotes`);
        if (t.comments) meta.push(`${t.comments} comments`);
        if (meta.length) line += ` | ${meta.join(' | ')}`;
        return line;
      });

      formatSection('Quora Threads', results.quora, (t, i) => {
        let line = `${i + 1}. [${t.title}](${t.url})`;
        const meta = [];
        if (t.score) meta.push(`${t.score} upvotes`);
        if (t.comments) meta.push(`${t.comments} answers`);
        if (meta.length) line += ` | ${meta.join(' | ')}`;
        return line;
      });

      formatSection('Microsoft Community Threads', results.microsoft, (t, i) => {
        let line = `${i + 1}. [${t.title}](${t.url})`;
        if (t.forum) line += ` — *${t.forum}*`;
        return line;
      });

      formatSection('Google Community Threads', results.google, (t, i) => {
        let line = `${i + 1}. [${t.title}](${t.url})`;
        if (t.product) line += ` — *${t.product}*`;
        return line;
      });

      const header = `Here are all ${totalFound} community threads for "${query}" (${sourcesSummary.join(' | ')}):\n`;
      return header + '\n' + sections.join('\n\n');
    }

    case 'browse_published_articles': {
      try {
        const authorInput = (args.author || '').toString().trim();
        const queryInput = (args.query || '').toString().trim();
        const period = (args.period || '').toString().trim() || undefined;
        const limit = Math.min(parseInt(args.limit) || 20, 50);

        // Fetch all articles for the period (no author pre-filter — we do name matching ourselves)
        const allArticles = await getArticles({ period });

        if (!allArticles || allArticles.length === 0) {
          return JSON.stringify({ found: 0, message: 'No published articles found.' });
        }

        let filtered = allArticles;

        // Author filter
        if (authorInput) {
          const needle = authorInput.toLowerCase().replace(/\s+/g, '-'); // "pankaj rai" → "pankaj-rai"
          const needleRaw = authorInput.toLowerCase();                   // "pankaj rai"

          filtered = filtered.filter(a => {
            const slug = (a.authorSlug || '').toLowerCase();
            const name = (a.author || '').toLowerCase();
            return (
              slug === needle ||
              slug.includes(needleRaw.replace(/\s+/g, '-')) ||
              name === needleRaw ||
              name.includes(needleRaw) ||
              // partial first-name match: "pankaj" matches "pankaj rai"
              needleRaw.split(/\s+/).every(part => name.includes(part) || slug.includes(part))
            );
          });

          if (filtered.length === 0) {
            const availableAuthors = [...new Set(allArticles.map(a => a.author).filter(Boolean))].sort();
            return JSON.stringify({
              found: 0,
              message: `No articles found for author "${authorInput}".`,
              availableAuthors
            });
          }
        }

        // Keyword/topic search — score articles by relevance to the query
        if (queryInput) {
          const queryWords = queryInput.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          const stopWords = new Set(['the', 'and', 'for', 'how', 'what', 'why', 'with', 'from', 'that', 'this', 'your', 'are', 'can', 'does', 'will']);
          const searchWords = queryWords.filter(w => !stopWords.has(w));

          if (searchWords.length > 0) {
            const scored = filtered.map(a => {
              const titleLower = (a.title || '').toLowerCase();
              // Exact phrase match gets highest score
              const exactMatch = titleLower.includes(queryInput.toLowerCase()) ? 10 : 0;
              // Individual word matches
              const wordMatches = searchWords.filter(w => titleLower.includes(w)).length;
              const relevance = exactMatch + wordMatches;
              return { ...a, relevance };
            }).filter(a => a.relevance > 0)
              .sort((a, b) => b.relevance - a.relevance);

            if (scored.length === 0) {
              return JSON.stringify({
                found: 0,
                query: queryInput,
                message: `No published articles found matching "${queryInput}". Try broader keywords.`
              });
            }

            filtered = scored;
          }
        }

        const isSearchMode = !!queryInput;
        return JSON.stringify({
          found: filtered.length,
          showing: Math.min(filtered.length, limit),
          ...(queryInput && { query: queryInput }),
          ...(authorInput && { author: authorInput }),
          ...(isSearchMode && { note: 'These articles are sorted by relevance to your query. Use them for internal linking — link to related articles within your content to boost SEO and keep readers on-site.' }),
          articles: filtered.slice(0, limit).map(a => ({
            title: a.title,
            author: a.author,
            url: a.url,
            date: a.date ? a.date.substring(0, 10) : null,
            ...(a.relevance !== undefined && { relevance: a.relevance })
          }))
        });
      } catch (e) {
        return JSON.stringify({ error: `Failed to fetch articles: ${e.message}` });
      }
    }

    case 'generate_fanout_queries': {
      const topicStr = (args.topic || '').toString().trim();
      if (!topicStr) return JSON.stringify({ error: 'Topic is required.' });
      const maxQ = Math.min(parseInt(args.max_queries) || 12, 20);
      try {
        const result = await generateFanoutQueries(topicStr, args.domain || '', maxQ, 'both');
        const fanouts = result.fanouts || [];
        return JSON.stringify({
          topic: topicStr,
          total: fanouts.length,
          fanouts: fanouts.map(f => ({
            id: f.id,
            category: f.category,
            purpose: f.purpose,
            query: f.query
          }))
        });
      } catch (e) {
        return JSON.stringify({ error: e.message });
      }
    }

    case 'check_ai_detection': {
      if (!isCopyleaksConfigured()) {
        return JSON.stringify({ error: 'Copyleaks not configured. Add COPYLEAKS_EMAIL and COPYLEAKS_API_KEY to server .env file.' });
      }
      const textToCheck = args.content || articleRequirements._currentContent || '';
      if (!textToCheck || textToCheck.trim().length < 256) {
        return JSON.stringify({ error: 'Content must be at least 256 characters for AI detection. The editor needs more content — write or generate an article first.' });
      }
      try {
        const result = await checkAIDetection(textToCheck);
        return JSON.stringify({
          success: true,
          aiScore: result.aiScore,
          humanScore: result.humanScore,
          verdict: result.verdict,
          totalSentences: result.totalSentences,
          aiSentences: result.aiSentences,
          humanSentences: result.humanSentences,
          topAiSentences: result.sentences.filter(s => s.ai > 70).slice(0, 10).map(s => ({ text: s.text.substring(0, 150), aiProbability: s.ai })),
          instruction: 'Present the AI detection results clearly: overall AI score, human score, verdict, and highlight the most AI-flagged sentences with their AI probability %. If the score is high (>50%), suggest specific rewrites to make the content sound more human-written — add personal experience, specific data, vary sentence length, avoid generic phrasing.'
        });
      } catch (e) {
        return JSON.stringify({ error: `AI detection failed: ${e.message}` });
      }
    }

    case 'check_plagiarism': {
      if (!isPlagiarismConfigured()) {
        return JSON.stringify({ error: 'Plagiarism check not configured. Add GOOGLE_CSE_KEY and GOOGLE_CSE_CX to server .env file.' });
      }
      const textToCheck = args.content || articleRequirements._currentContent || '';
      if (!textToCheck || textToCheck.trim().length < 300) {
        return JSON.stringify({ error: 'Content must be at least 300 characters for plagiarism checking. Write or generate an article first.' });
      }
      try {
        const result = await checkPlagiarism(textToCheck);
        return JSON.stringify({
          success: true,
          plagiarismScore: result.plagiarismScore,
          totalChecked: result.totalChecked,
          totalMatched: result.totalMatched,
          totalUniqueSources: result.totalUniqueSources,
          verdict: result.verdict,
          matchedSentences: result.matchedSentences,
          sources: result.sources.slice(0, 8),
          instruction: 'Present the plagiarism results clearly: (1) Overall plagiarism score as a percentage, (2) Verdict, (3) Number of sentences checked vs matched, (4) For each matched sentence, show the sentence and the source URL where it was found, (5) List all unique source URLs. If plagiarism score is high (>25%), suggest which sentences to rephrase and provide rewritten alternatives. If score is 0%, congratulate the writer on original content.'
        });
      } catch (e) {
        return JSON.stringify({ error: `Plagiarism check failed: ${e.message}` });
      }
    }

    case 'search_sharepoint_docs': {
      if (!isSharePointConfigured()) {
        return JSON.stringify({ error: 'SharePoint not configured. Add MS_TENANT_ID, MS_CLIENT_ID, and MS_CLIENT_SECRET to server .env file. See setup instructions in CLAUDE.md.' });
      }

      const query = (args.query || '').toString().trim();
      const spUrl = (args.sharepoint_url || '').toString().trim();

      try {
        // If a specific SharePoint URL was provided, fetch that page directly
        if (spUrl && spUrl.includes('sharepoint.com')) {
          const page = await getPageByUrl(spUrl);
          return JSON.stringify({
            success: true,
            mode: 'direct',
            page: {
              title: page.title,
              webUrl: page.webUrl,
              content: page.content.substring(0, 6000),
              lastModified: page.lastModified
            },
            instruction: 'Present the SharePoint page content clearly. The writer can use this information in their article. Summarize the key points and suggest how to incorporate them into the article naturally.'
          });
        }

        // Otherwise, search SharePoint for matching content
        if (!query) return JSON.stringify({ error: 'Query is required to search SharePoint docs.' });

        const result = await searchAndFetchContent(query);

        if (!result.found) {
          return JSON.stringify({
            success: false,
            query,
            message: `No SharePoint pages found matching "${query}". Try different keywords or check the page exists in the DOC360 site.`
          });
        }

        return JSON.stringify({
          success: true,
          mode: 'search',
          query,
          totalResults: result.totalResults,
          topResult: result.topResult,
          additionalResults: result.additionalResults || [],
          otherResults: result.otherResults,
          instruction: 'IMPORTANT: You MUST summarize the actual CONTENT from the documents — do NOT just list file names and links. Read through topResult.content and additionalResults[].content, extract the key information relevant to the query, and present it as a clear, organized summary. After the summary, cite each source with its name and SharePoint link. Format: "Source: [Document Name](webUrl)". If a document content is null or empty, mention that the file exists but could not be read and provide the link for manual access.'
        });
      } catch (e) {
        return JSON.stringify({ error: `SharePoint search failed: ${e.message}` });
      }
    }

    case 'update_article_requirements': {
      // This tool doesn't actually store anything on the server — it returns the
      // requirements back so the server route can forward them to the client.
      // The client maintains the state and sends it back with every message.
      const requirements = {};
      if (args.primary_keyword !== undefined) requirements.primaryKeyword = args.primary_keyword;
      if (args.secondary_keywords !== undefined) requirements.secondaryKeywords = args.secondary_keywords;
      if (args.lsi_keywords !== undefined) requirements.lsiKeywords = args.lsi_keywords;
      if (args.faqs !== undefined) requirements.faqs = args.faqs;
      if (args.framework !== undefined) requirements.framework = args.framework;
      if (args.content_type !== undefined) requirements.contentType = args.content_type;
      if (args.target_audience !== undefined) requirements.targetAudience = args.target_audience;
      if (args.notes !== undefined) requirements.notes = args.notes;

      const saved = Object.keys(requirements);
      return JSON.stringify({
        success: true,
        updated: saved,
        requirements,
        message: `Saved ${saved.length} requirement(s): ${saved.join(', ')}. These will be used when generating the article.`
      });
    }

    case 'generate_framework': {
      const topicStr = (args.topic || '').toString().trim();
      if (!topicStr) return JSON.stringify({ error: 'Topic is required to generate a framework.' });

      try {
        // Use Claude (primary) or OpenAI (fallback) for all internal tool work
        const _ip = getInternalProvider();
        if (!_ip) return JSON.stringify({ error: 'No AI API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env' });

        const contentType = args.content_type || 'educational';
        const additionalContext = args.additional_context || '';
        const writerBioText = formatWriterBioForPrompt(articleRequirements._writerName);
        const writerPatternsText = formatWriterPatternsForPrompt(articleRequirements._writerName);
        const blogPatternsText = formatBlogPatternsForPrompt();

        // ═══ PHASE 1: Fetch all research data in parallel BEFORE generating the framework ═══
        const cached = getCachedResearch(topicStr);
        const faqPageData = { url: null, title: topicStr, h1: topicStr, headings: [], paragraphs: [], existingFAQs: [], wordCount: 0, existingSchema: [], hasFAQSchema: false, summary: '' };

        const parallelTasks = [
          // FAQ discovery + prioritization (skip if cached)
          cached?.faqData
            ? Promise.resolve(cached.faqData)
            : discoverQuestions(faqPageData, _ip.type, _ip.apiKey).then(async (discovery) => {
                const prioritized = await prioritizeQuestions(discovery.questions || [], faqPageData, _ip.type, _ip.apiKey);
                return { discovery, prioritized };
              }).catch(() => null),
          // Fanout queries (skip if cached)
          cached?.fanoutData
            ? Promise.resolve(cached.fanoutData)
            : generateFanoutQueries(topicStr, '', 12, _ip.type).catch(() => null),
          // Published articles for internal linking
          getArticles({}).catch(() => []),
          // SharePoint product data
          isSharePointConfigured()
            ? searchAndFetchContent(topicStr).catch(() => null)
            : Promise.resolve(null),
          // External references from credible sites
          import('./externalReferencesService.js')
            .then(mod => mod.fetchExternalReferences(topicStr))
            .catch(() => null)
        ];

        const [faqResult, fanoutResult, articlesResult, spResult, extRefsResult] = await Promise.allSettled(parallelTasks);

        const faqData = faqResult.status === 'fulfilled' ? faqResult.value : null;
        const fanoutData = fanoutResult.status === 'fulfilled' ? fanoutResult.value : null;

        // Cache research results for this topic
        if (!cached && (faqData || fanoutData)) {
          setCachedResearch(topicStr, { faqData, fanoutData });
        }
        const allPublished = articlesResult.status === 'fulfilled' ? articlesResult.value : [];
        const spData = spResult.status === 'fulfilled' ? spResult.value : null;

        // Build SharePoint context
        let spContext = '';
        if (spData?.found) {
          const allSpResults = [spData.topResult, ...(spData.additionalResults || [])].filter(Boolean);
          const spParts = allSpResults
            .filter(r => r.content && r.content.length > 50)
            .map(r => 'Source "' + r.name + '": ' + r.content.substring(0, 2000));
          if (spParts.length > 0) {
            spContext = '\n\nCLOUDFUZE PRODUCT DATA (from internal SharePoint docs — use this to create accurate section headings):\n' + spParts.join('\n\n').substring(0, 4000);
          }
        }

        // ═══ PHASE 2: Process FAQ + Fanout data to feed into the AI prompt ═══
        const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const wordSet = s => new Set(normalize(s).split(/\s+/).filter(w => w.length > 2));
        const jaccard = (a, b) => {
          const inter = [...a].filter(w => b.has(w)).length;
          const union = new Set([...a, ...b]).size;
          return union > 0 ? inter / union : 0;
        };

        // Build FAQ questions list
        const prioritizedQs = faqData?.prioritized?.prioritizedQuestions || [];
        const faqQuestions = prioritizedQs.map(f => ({
          question: f.question,
          priority: f.priority || 'medium',
          intent: f.intent || 'informational',
          source: f.source || 'unknown',
          sources: ['faq-pipeline'],
          boost: 0
        }));

        const fanoutQueries = (fanoutData?.fanouts || []).map(f => ({
          question: f.query,
          priority: 'medium',
          intent: 'informational',
          category: f.category,
          purpose: f.purpose,
          sources: ['fanout'],
          boost: 0
        }));

        // Cross-match: boost FAQs that overlap with fanout
        for (const faq of faqQuestions) {
          const faqWords = wordSet(faq.question);
          for (const fan of fanoutQueries) {
            const fanWords = wordSet(fan.question);
            if (jaccard(faqWords, fanWords) > 0.35) {
              faq.boost += 20;
              faq.sources.push('fanout');
              faq.fanoutCategory = fan.category;
              fan.boost = -100;
              break;
            }
          }
        }

        const uncoveredFanouts = fanoutQueries.filter(f => f.boost !== -100);
        const allFaqItems = [...faqQuestions, ...uncoveredFanouts];
        allFaqItems.sort((a, b) => {
          const scoreA = (a.boost || 0) + (a.priority === 'high' ? 30 : a.priority === 'medium' ? 15 : 0) + (a.sources.length > 1 ? 25 : 0);
          const scoreB = (b.boost || 0) + (b.priority === 'high' ? 30 : b.priority === 'medium' ? 15 : 0) + (b.sources.length > 1 ? 25 : 0);
          return scoreB - scoreA;
        });

        // Build the FAQ + fanout context for the AI prompt — these go to the FAQ section ONLY, not H2 headings
        let faqFanoutContext = '';
        if (allFaqItems.length > 0) {
          const topQuestions = allFaqItems.slice(0, 15);
          const questionLines = topQuestions.map((q, i) => {
            const srcLabel = q.sources.length > 1 ? 'FAQ+Fanout (HIGH PRIORITY)' : q.sources[0] === 'fanout' ? 'Fanout' : (q.source || 'FAQ');
            return `${i + 1}. "${q.question}" [Source: ${srcLabel}, Priority: ${q.priority}${q.category ? ', Category: ' + q.category : ''}]`;
          }).join('\n');

          faqFanoutContext = `

RESEARCHED USER QUESTIONS — FOR FAQ SECTION ONLY (do NOT use as H2 body headings):
The following questions come from real search data (Google PAA, Reddit, Quora) and AI engine fanout decomposition.
These are reserved EXCLUSIVELY for the "Frequently Asked Questions" section at the bottom of the article.
Do NOT turn these into H2 body section headings — the body H2s must come from your own deep technical analysis of the topic.

QUESTIONS (inject the top 7-10 into the FAQ section after the framework is built):
${questionLines}`;
        }

        // Build the fanout categories summary — for awareness only, NOT to dictate H2s
        let fanoutStructureHint = '';
        if (fanoutData?.fanouts?.length > 0) {
          const categories = {};
          for (const f of fanoutData.fanouts) {
            if (f.category) {
              if (!categories[f.category]) categories[f.category] = [];
              categories[f.category].push(f.query);
            }
          }
          if (Object.keys(categories).length > 0) {
            const catLines = Object.entries(categories).map(([cat, qs]) => `- **${cat}**: ${qs.slice(0, 3).join('; ')}`).join('\n');
            fanoutStructureHint = `

AI ENGINE TOPIC DECOMPOSITION (awareness only — use as a coverage checklist, NOT as H2 source):
These are the sub-topics AI search engines decompose "${topicStr}" into. Ensure your technically-generated H2s cover these dimensions — but write your own expert headings, don't copy these verbatim:
${catLines}`;
          }
        }

        // ═══ PHASE 3: Generate framework with AI, now enriched with FAQ + fanout data ═══
        const frameworkPrompt = `Generate a detailed, TOPIC-SPECIFIC article framework/outline for the topic below. This framework will be inserted into the writer's editor as a starting structure.

THIS FRAMEWORK SERVES TWO NON-NEGOTIABLE GOALS — every structural decision must serve both:

GOAL 1 — AI SEARCH ENGINE VISIBILITY (GEO):
Get this article cited and quoted by ChatGPT, Perplexity, Gemini, Google AI Overviews, and Bing Copilot.
This means: each section must be independently quotable, definition-first, data-anchored, and entity-rich.
AI engines rank and cite articles that are the most authoritative, specific, and information-dense on a topic.

GOAL 2 — CUSTOMER ACQUISITION:
Attract CIOs, IT Directors, and IT Managers at 500+ employee enterprises who are evaluating or planning cloud migrations or SaaS governance.
Every section should address a real pain point, decision concern, or knowledge gap that moves an enterprise buyer closer to choosing CloudFuze.
The article should make the reader feel: "This is the definitive resource. CloudFuze clearly understands my problem."

Both goals reinforce each other: the more authoritative and specific the content, the more AI engines cite it AND the more buyers trust it.

TOPIC-SPECIFIC FRAMEWORK RULES — CRITICAL:
- The framework MUST be deeply specific to the exact topic — NOT a generic template.
- UNDERSTAND THE CLOUDFUZE CONTEXT: Every article exists to position CloudFuze as the expert solution. Analyze how this specific topic relates to CloudFuze's products:
  - If the topic involves migration (any source → destination): Frame around CloudFuze Migrate features (bulk transfer, permission mapping, metadata preservation, delta migration, 30+ platform support).
  - If the topic involves SaaS management, license optimization, shadow IT, or app governance: Frame around CloudFuze Manage features (user lifecycle, compliance monitoring, cost optimization, AI app discovery).
  - If the topic involves a specific platform (SharePoint, OneDrive, Google Drive, etc.): Include platform-specific details, limitations, and how CloudFuze bridges gaps.
  - If the topic involves compliance (SOC 2, HIPAA, GDPR): Focus on how CloudFuze ensures compliant data handling during operations.
  - If the topic involves M&A, tenant consolidation, or org restructuring: Focus on tenant-to-tenant migration and user mapping.
- Each H2 section heading MUST be directly relevant to the specific topic — do NOT use generic headings like "Key Benefits" or "Best Practices" without making them topic-specific.
- Include TOPIC-SPECIFIC visual suggestions (not generic). If the topic is about SharePoint migration, suggest a SharePoint permission mapping diagram, not a generic "migration flowchart."
- Include at least ONE section with ORIGINAL INFORMATION from official platform documentation (e.g., Microsoft Learn, Google Workspace docs). The writing guide for this section should specify exact official docs to reference.

${ICP_FRAMEWORK}

IMPORTANT: The topic below is just a topic name — NOT an H1 title. You MUST create an optimized H1 title that targets Core ICP (80-100 score) leads:
- Target: CIOs, IT Directors, CTOs at 500+ employee companies, US-based, IT/Software industry, using Microsoft 365 or Google Workspace
- Include the primary keyword front-loaded
- Include enterprise scale language (e.g., "Enterprise", "at Scale", "for Large Organizations")
- Include a buyer persona signal (e.g., "for IT Leaders", "for IT Teams", "A CIO's Guide")
- Include specific platform names where relevant (Microsoft 365, Google Workspace, SharePoint, OneDrive)
- Use a power pattern: "Enterprise Guide to...", "Complete [Topic] Guide for IT Teams", "[Platform] [Topic]: Best Practices for 2026"
- Does NOT include "CloudFuze" in the H1 unless the topic is specifically about CloudFuze
- Bad: "Cloud Migration Guide" — Good: "Enterprise Google Drive to SharePoint Migration: A Step-by-Step Guide for IT Directors"

TOPIC: "${topicStr}"
CONTENT TYPE: ${contentType}
${additionalContext ? `ADDITIONAL CONTEXT: ${additionalContext}` : ''}${spContext}${faqFanoutContext}${fanoutStructureHint}
${blogPatternsText}
${writerBioText ? `\n${writerBioText}` : ''}
${writerPatternsText ? `\n${writerPatternsText}\n\nCRITICAL: The framework MUST follow this writer's preferred article structure, H2 heading style, tone, and target audience. Match their actual published patterns.` : ''}

OUTPUT FORMAT — Write the framework in clean Markdown with the following structure:
- H1: An enterprise-targeted, keyword-optimized article title (NOT the raw topic name — create a proper SEO H1)
- A brief 1-2 sentence description under each heading explaining what to write in that section
- Use H2 for main sections and H3 for sub-sections
- Include these CSABF-required sections IN THIS ORDER: Introduction, Key Takeaways, 4-6 body H2 sections, "How CloudFuze Helps" or "How CloudFuze Simplifies [Topic]" (include a soft CTA at the end of this section), Frequently Asked Questions (leave this section EMPTY — just the H2 heading and a note saying "FAQs will be populated from research data below"). FAQs are the LAST section — NO separate Conclusion after FAQs.
- Each body H2 heading should be a technically authoritative, expert-authored title that an IT Director would find immediately valuable — NOT a generic FAQ-style question
- Under each heading, write a brief italic guide that covers: (1) what to write, (2) which buyer pain point this addresses, (3) what statistic or data to include and its source, (4) what entities to name explicitly, (5) how this section advances the buyer toward CloudFuze. Format: *Write 120-160 words. Open with a definition or direct answer. Pain point: [specific pain]. Stat: [specific data + source]. Mention: [specific entity names]. Buyer signal: [what this moves the reader toward deciding].*
- INLINE VISUAL SUGGESTIONS (MANDATORY for 3-6 sections): Right after the italic guide for a section, if that section benefits from a visual element, add a line starting with the emoji for the element type. The suggestion MUST be specific — describe exactly what to create. Do NOT create a separate visuals summary section — visuals go INLINE under the section they belong to.

  Format — place directly under the italic writing guide of the relevant section:
  📊 **Table:** "Cloud Migration Methods Comparison" — columns: Method | Speed | Data Loss Risk | Downtime | Best For
  🖼 **Image:** Screenshot of CloudFuze migration dashboard showing real-time progress with file counts and ETA | **Alt text:** "CloudFuze migration dashboard displaying real-time file transfer progress and estimated completion time"
  🎨 **Infographic:** "5-Phase Enterprise Migration Timeline" — flowchart: Discovery → Planning → Pilot → Migration → Validation with durations | **Alt text:** "Enterprise cloud migration timeline infographic showing five phases from discovery to validation"
  🔀 **Diagram:** Architecture diagram showing Source Cloud → Encryption Layer → CloudFuze Engine → Destination Cloud | **Alt text:** "CloudFuze data flow architecture diagram with encryption layer between source and destination cloud"
  📈 **Stats Highlight:** Callout box — "99.9% data fidelity · 70% faster than manual migration · 500K+ users migrated"
  ⚖️ **Comparison Chart:** Side-by-side feature matrix of migration tools with ratings
  📸 **Screenshot:** CloudFuze user mapping interface showing source-to-destination account matching | **Alt text:** "CloudFuze user mapping interface matching source accounts to destination accounts"
  💡 **Callout Box:** "Pro Tip: Always run a pilot migration with 5-10 users before full rollout"

  ALT-TEXT RULES — MANDATORY for all 🖼 Image, 🎨 Infographic, 🔀 Diagram, and 📸 Screenshot suggestions:
  - EVERY image, infographic, diagram, and screenshot suggestion MUST include an alt-text suggestion using the format: | **Alt text:** "descriptive text here"
  - Alt text MUST include the primary keyword or a secondary keyword naturally
  - Alt text should be 8-15 words, descriptive, and specific to what the image shows
  - Use the format: "[Subject] [action/state] [context with keyword]"
  - Example: "Enterprise Google Drive to SharePoint migration workflow diagram showing five key steps"
  - Tables, Stats Highlights, and Callout Boxes do NOT need alt text (they are text-based elements)

  EXAMPLE of a complete section with inline visual:
  ## What Are the Best Enterprise Cloud Migration Methods?
  *Write 150-200 words comparing cutover, staged, and hybrid migration approaches. Include pros/cons of each. Cite Gartner or Forrester research on enterprise migration trends.*
  📊 **Table:** "Migration Methods Comparison" — columns: Method | Speed | Risk Level | Downtime | Best For | Cost Range
  🖼 **Image:** Diagram showing the 3 migration paths with arrows from source to destination cloud

  RULES for inline visuals:
  - Add visuals to 3-6 sections total across the whole framework — NOT every section
  - Sections like Introduction, short narrative sections, and FAQs typically need NO visuals
  - Comparison sections MUST have a table or comparison chart
  - Step-by-step sections benefit from a screenshot or numbered list
  - The CloudFuze section benefits from a product screenshot or diagram
  - Be SPECIFIC — describe exact table columns, image subjects, infographic data points, diagram flows
  - Do NOT create a separate "Suggested Visuals" section at the bottom — ALL visual suggestions must be inline under their section
- CRITICAL — H2 HEADING STRATEGY: Your body H2s must be original, expert-authored headings that serve BOTH goals simultaneously:
  • For AI visibility: Each H2 must be a self-contained citation target — specific enough that an AI engine can extract the section alone and it makes sense. Use entity-rich language (exact platform names, protocols, standards, product features).
  • For customer acquisition: Each H2 must address a real pain point, decision milestone, or knowledge gap in the enterprise IT buyer's journey. A CIO or IT Director reading the heading should think "yes, that's exactly what I need to know."
  • Do NOT copy FAQ/Fanout questions as H2s — those go in the FAQ section only.
  • Ask yourself: "If an IT Director at a 1000-person company is evaluating this topic, what are the 5-7 things they MUST understand before making a decision?" Those are your H2s.
  • WEAK H2: "Benefits of Cloud Migration" — STRONG H2: "Permission Inheritance, Metadata Fidelity, and Delta Sync: What Enterprise IT Teams Lose Without a Dedicated Migration Tool"
  • Each H2 should make the article feel like the most thorough, expert resource on this topic — something that would be cited in an RFP, shared by an IT Director with their team, AND extracted verbatim by Perplexity or ChatGPT.

GEO + CONVERSION RULES FOR FRAMEWORK DESIGN:

AI VISIBILITY (GEO) — How to structure for maximum AI citation:
- SELF-CONTAINED SECTIONS: Every body H2 section must be independently quotable. In the writing guide, instruct the writer to open each section with a definition or direct answer ("[Topic] is..." or "The key difference between X and Y is...") — AI engines extract the first 1-3 sentences of a section most often.
- STATISTICS ARE MANDATORY: Every body section guide MUST suggest at least one specific, sourced statistic (Gartner, Forrester, IDC, Microsoft, Google). Data boosts AI citation likelihood by 40%.
- ENTITY DENSITY: In every section guide, name specific platforms, protocols, standards, and product features explicitly. Never write "the tool" or "the platform" — always name "SharePoint", "Microsoft 365", "CloudFuze Migrate", "OAuth 2.0", etc.
- TABLES + LISTS: Every comparison or multi-item section MUST have a table or bullet list — Google AIO and Perplexity extract these directly into AI responses.
- CITATION SWEET SPOT: Plan each body section for 120-160 words — this is the range AI engines most frequently extract as a citation block.
- Key Takeaways section (right after intro): Perplexity and ChatGPT extract bullet summaries. Each takeaway MAX 15 words, crisp, specific. No explanations.
- ORIGINAL ANGLE: At least one section should include information not available in generic articles — a specific limitation, edge case, or technical constraint that only an expert would document.

CUSTOMER ACQUISITION — How to structure for buyer conversion:
- BUYER JOURNEY MAPPING: Order your H2s to mirror the enterprise IT buyer's decision journey:
  1. Problem/risk section (Awareness) — quantify what's at stake: data loss risk, compliance exposure, productivity cost, downtime
  2. Technical depth sections (Consideration) — cover the mechanisms, options, tradeoffs that an IT evaluator needs to assess solutions
  3. Solution criteria section (Decision) — what to look for in a tool/approach; CloudFuze naturally fits these criteria
  4. CloudFuze section (Conversion) — specific features, proof points, CTA
- PAIN POINT LANGUAGE: In the writing guide for each section, name the specific pain a CIO/IT Director feels — "risk of permission loss during migration", "shadow IT sprawl across 40+ SaaS apps", "audit failures from incomplete user offboarding"
- PROOF POINTS: Suggest where to include CloudFuze-specific credibility signals — customer scale ("migrated 500K+ users"), accuracy ("99.9% data fidelity"), speed ("70% faster than manual"), compliance ("SOC 2 Type II, HIPAA, GDPR ready")
- E-E-A-T SIGNALS: Suggest where to include Experience (case example), Expertise (technical depth), Authority (CloudFuze credentials + customer scale), Trust (verifiable data, official source citations)
- CLOUDFUZE SECTION — CONVERSION FOCUS: The "How CloudFuze Helps" section writing guide must: (a) name specific product features relevant to this topic, (b) include at least one measurable outcome ("reduces migration time by X%"), (c) end with a soft but direct CTA ("Ready to migrate? Talk to a CloudFuze specialist.")
- Include a "Frequently Asked Questions" H2 section but leave it EMPTY (write: *FAQs will be auto-populated from researched questions below.*). The system injects real researched FAQ questions after generation — do NOT write your own.
- Do NOT include a separate "Conclusion" H2 — CloudFuze blogs end with the CloudFuze section + FAQs + a soft CTA paragraph

MANDATORY CREDIBLE STATISTIC — EVERY FRAMEWORK MUST INCLUDE:
- You MUST include at least ONE credible, topic-relevant statistic in the introduction section guide. This stat must come from a recognized source (Gartner, Forrester, IDC, McKinsey, Statista, Microsoft, Google, or industry reports).
- Example: *"Include stat: 'According to Gartner, 85% of enterprises will adopt a cloud-first strategy by 2026.' This boosts AI citations by 40%."*
- The stat MUST be directly relevant to the article topic — not a generic cloud/IT stat.
- Suggest 2-3 additional stat opportunities in body sections where data would strengthen the argument.
- In the framework brief for each body section, suggest SPECIFIC stats or data points to include and their sources.

ADDITIONAL RULES:
- Framework should have 10-14 sections total (including H1, intro, CloudFuze section, FAQs, and closing CTA — NO separate "Conclusion" H2)
- Suggest where to embed CloudFuze mentions naturally (aim for 8-12 across the article). Each mention should be a specific capability claim, not a vague reference.
- The article must feel like the definitive resource on this topic — something a buyer would bookmark, share with their team, and return to during their evaluation. Every section should add information that a generic AI summary would miss.
- Do NOT write actual article content — only headings and brief guides
- Do NOT include meta title/description — this is just the structure
- CONVERSION FLOW CHECK: Before finalizing the framework, verify: (a) At least one early section creates urgency or quantifies the problem, (b) At least two mid sections demonstrate deep expertise that builds trust, (c) The CloudFuze section connects specific product features to the exact pain points raised in earlier sections, (d) The FAQ section will address the decision-stage questions buyers ask right before choosing a vendor

SEMANTIC KEYWORDS — INCLUDE AT THE BOTTOM OF THE FRAMEWORK:
After the last section (FAQs / soft CTA), add a "---" divider and then a "## 📌 Semantic Keywords" section with the following sub-sections:
- **Primary Keyword:** The single most important keyword for this article (front-loaded in H1)
- **Secondary Keywords (6-8):** Supporting keywords to target across sections
- **LSI / Related Terms (10-12):** Semantically related terms for topical depth
- **Question Keywords (4-6):** Question-format keywords that match AI search queries
- **Entity Keywords (4-6):** Specific platforms, tools, standards, and protocols relevant to the topic
All keywords must target CloudFuze's ICP — enterprise IT decision-makers at 500+ employee companies.

REMINDER: Visual suggestions (📊 Table, 🖼 Image, 🎨 Infographic, 🔀 Diagram, 📈 Stats, 📸 Screenshot) MUST appear INLINE under the sections they belong to — NOT as a separate section at the bottom. 3-6 sections should have visuals. Be specific about what each visual shows.

Output ONLY the Markdown framework + keywords section. No preamble, no commentary.`;

        // Always use Claude for framework content generation (regardless of user-selected chat model)
        const frameworkSystemPrompt = `You are a senior technical content strategist who specializes in enterprise IT content that achieves two goals simultaneously: (1) maximum AI search engine citation — getting quoted by ChatGPT, Perplexity, Gemini, and Google AI Overviews; and (2) enterprise customer acquisition — attracting CIOs and IT Directors who are evaluating cloud migration or SaaS governance solutions and moving them toward CloudFuze.

Every framework decision — H2 choice, section order, writing guide instructions — must serve both goals. Your H2s are expert-authored, technically authoritative chapter titles that an IT Director would find immediately valuable AND that AI engines would extract as citation-worthy blocks. Each section writing guide tells the writer exactly: what pain point to address, what statistic to include and from where, what entities to name, and how this section moves the buyer toward CloudFuze.

The FAQ/Fanout questions provided are ONLY for the FAQ section at the bottom — never use them as H2 body headings. For 3-6 sections, you MUST add INLINE visual suggestions (📊 Table, 🖼 Image, 🎨 Infographic, 🔀 Diagram, 📈 Stats, 📸 Screenshot) directly under each section writing guide. EVERY Image, Infographic, Diagram, and Screenshot MUST include an alt-text suggestion with the primary keyword. Do NOT put visuals in a separate section.`;
        let frameworkContent = await callClaude(frameworkSystemPrompt, frameworkPrompt, { maxTokens: 6000, temperature: 0.4, timeout: 60000 });

        // ═══ PHASE 4: Post-process — clean up, find leftover FAQs, append links ═══
        frameworkContent = frameworkContent.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/i, '').trim();

        if (!frameworkContent || frameworkContent.length < 50) {
          return JSON.stringify({ error: 'Framework generation produced insufficient content.' });
        }

        // Extract all H2 and H3 headings from the generated framework for FAQ deduplication
        const frameworkHeadings = [];
        const headingRegex = /^#{2,3}\s+(.+)$/gm;
        let hMatch;
        while ((hMatch = headingRegex.exec(frameworkContent)) !== null) {
          frameworkHeadings.push(hMatch[1].replace(/[*_`#]/g, '').trim().toLowerCase());
        }

        // Check if a question is already covered by any framework heading
        const isCoveredByHeading = (question) => {
          const qWords = wordSet(question);
          for (const heading of frameworkHeadings) {
            const hWords = wordSet(heading);
            if (jaccard(qWords, hWords) > 0.35) return true;
          }
          return false;
        };

        // Find questions NOT already used as H2/H3 headings — inject into the FAQ section
        const missingFaqs = allFaqItems.filter(q => !isCoveredByHeading(q.question)).slice(0, 10);

        if (missingFaqs.length > 0) {
          const faqLines = missingFaqs.map((q, i) => {
            const badges = [];
            if (q.sources.length > 1) badges.push('🔥');
            if (q.priority === 'high') badges.push('⬆️');
            const badgeStr = badges.length > 0 ? ' ' + badges.join(' ') : '';
            return '### ' + q.question + badgeStr;
          }).join('\n\n');

          // Try to find the FAQ H2 heading and inject questions after it
          const faqHeadingRegex = /^(##\s+.*(?:faq|frequently\s+asked\s+question).*?)$/im;
          const faqMatch = frameworkContent.match(faqHeadingRegex);

          if (faqMatch) {
            // Find everything between the FAQ heading and the next H2 (or end)
            const faqIdx = frameworkContent.indexOf(faqMatch[0]);
            const afterFaq = frameworkContent.substring(faqIdx + faqMatch[0].length);
            const nextH2Match = afterFaq.match(/\n##\s+/);
            const insertPoint = nextH2Match
              ? faqIdx + faqMatch[0].length + nextH2Match.index
              : frameworkContent.length;

            // Replace the FAQ section content with researched questions
            frameworkContent = frameworkContent.substring(0, faqIdx) +
              faqMatch[0] + '\n\n*Sourced from Google PAA, Reddit, Quora & AI engine fanout. 🔥 = appears in both FAQ + Fanout (highest priority).*\n\n' + faqLines +
              '\n' + frameworkContent.substring(insertPoint);
          } else {
            // No FAQ heading found — append one before keywords/end
            const keywordsDivider = frameworkContent.indexOf('\n---\n');
            const insertAt = keywordsDivider > -1 ? keywordsDivider : frameworkContent.length;
            frameworkContent = frameworkContent.substring(0, insertAt) +
              '\n\n## Frequently Asked Questions\n\n*Sourced from Google PAA, Reddit, Quora & AI engine fanout. 🔥 = appears in both FAQ + Fanout (highest priority).*\n\n' + faqLines +
              '\n' + frameworkContent.substring(insertAt);
          }
        }

        // Append internal linking opportunities
        try {
          if (allPublished && allPublished.length > 0) {
            const topicWords = topicStr.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            const scored = allPublished.map(a => {
              const titleLower = (a.title || '').toLowerCase();
              const matches = topicWords.filter(w => titleLower.includes(w)).length;
              return { ...a, relevance: matches };
            }).filter(a => a.relevance > 0 || allPublished.length <= 10)
              .sort((a, b) => b.relevance - a.relevance)
              .slice(0, 8);

            if (scored.length > 0) {
              const linkLines = scored.map(a => {
                const title = a.title || 'Untitled';
                const url = a.url || '#';
                const author = a.author || '';
                return '- [' + title + '](' + url + ')' + (author ? ' — *by ' + author + '*' : '');
              }).join('\n');

              frameworkContent += '\n\n---\n\n## 🔗 Internal Linking Opportunities\n\n*Link to these related CloudFuze articles where relevant in your content. Internal links boost SEO and keep readers on-site.*\n\n' + linkLines;
            }
          }
        } catch (e) {
          console.log('  Framework: Could not process published articles for internal linking:', e.message);
        }

        // Append external reference links (verified via live Google search)
        try {
          const extRefs = extRefsResult?.status === 'fulfilled' ? extRefsResult.value : null;
          if (extRefs?.found > 0 && extRefs.allLinks?.length > 0) {
            // Only include verified links or Google-indexed links (verified=null means Google found it but HEAD wasn't tested)
            const goodLinks = extRefs.allLinks.filter(l => l.verified !== false);
            if (goodLinks.length > 0) {
              const refLines = goodLinks.slice(0, 10).map(l => {
                const typeLabel = l.type === 'official_docs' ? '📖 Official Docs' : l.type === 'research' ? '📊 Research' : l.type === 'compliance' ? '🔒 Compliance' : l.type === 'best_practices' ? '✅ Best Practices' : '🔗 Reference';
                const verifiedBadge = l.verified === true ? ' ✅' : '';
                return `- ${typeLabel}: [${l.title}](${l.url}) — *${l.domain}*${verifiedBadge}`;
              }).join('\n');

              frameworkContent += '\n\n---\n\n## 🌐 External Reference Links\n\n*Real links found via live Google search. Embed these as inline citations in the article sections where their information is used — do NOT collect them in a separate "References" section. ✅ = link verified accessible.*\n\n' + refLines;
            }
          }
        } catch (e) {
          console.log('  Framework: Could not process external references:', e.message);
        }

        // Count sections
        const h2Count = (frameworkContent.match(/^##\s/gm) || []).length;
        const h3Count = (frameworkContent.match(/^###\s/gm) || []).length;

        return JSON.stringify({
          success: true,
          topic: topicStr,
          contentType,
          sectionCount: h2Count + h3Count,
          faqsGenerated: missingFaqs.length,
          totalQuestionsResearched: allFaqItems.length,
          questionsUsedAsHeadings: allFaqItems.length - missingFaqs.length,
          article: frameworkContent,
          instruction: 'The framework has been inserted into the editor. The H2/H3 headings were derived from real FAQ and AI fanout research. Briefly summarize: (1) structure overview — number of sections and that headings are based on real search demand + AI engine decomposition, (2) how many FAQ/fanout questions were researched and how many were used as headings vs listed as suggested FAQs, (3) semantic keywords included, (4) internal linking articles found, (5) external reference links from credible sources included. Ask the writer if they want to modify the framework, swap any headings, select specific FAQs, or proceed with article generation.'
        });
      } catch (e) {
        return JSON.stringify({ error: `Framework generation failed: ${e.message}` });
      }
    }

    case 'edit_article': {
      const editInstructions = (args.edit_instructions || '').trim();
      const editType = args.edit_type || 'modify_content';
      const sectionHeading = args.section_heading || '';

      if (!editInstructions) return JSON.stringify({ error: 'Edit instructions are required.' });

      // Convert the HTML from the editor to markdown so the AI sees proper heading structure.
      // Falls back to plain text if HTML is not available.
      const rawHTML = articleRequirements._currentHTML || '';
      const currentArticle = rawHTML ? htmlToMarkdown(rawHTML) : (articleRequirements._currentContent || '');
      if (!currentArticle || currentArticle.trim().length < 50) {
        return JSON.stringify({ error: 'No article content found in the editor. Write or generate an article first, then ask me to edit it.' });
      }

      try {
        // Use Claude (primary) or OpenAI (fallback) for article editing
        if (!getInternalProvider()) return JSON.stringify({ error: 'No AI API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env' });

        // Detect if the content is a framework/outline (headings + brief guides) vs a full article
        const lines = currentArticle.split('\n').filter(l => l.trim());
        const headingLines = lines.filter(l => /^#{1,3}\s/.test(l)).length;
        const italicGuideLines = lines.filter(l => /^\*.*\*$/.test(l.trim()) || /^_.*_$/.test(l.trim())).length;
        const longParagraphs = lines.filter(l => !l.startsWith('#') && !l.startsWith('*') && !l.startsWith('-') && !l.startsWith('>') && l.trim().length > 200).length;
        const isFramework = headingLines >= 4 && italicGuideLines >= 2 && longParagraphs <= 2;

        const frameworkRule = isFramework
          ? `\n\nCRITICAL — THIS IS A FRAMEWORK/OUTLINE, NOT A FULL ARTICLE:
- The content below is a framework with headings and brief italic writing guides under each heading.
- When adding a new section, add ONLY the heading (H2 or H3) and a brief italic guide (*Write 100-150 words about X, Y, Z...*). Do NOT generate actual article content or paragraphs.
- When removing a section, remove the heading and its guide. That is all.
- When modifying a section, only change the heading text or the brief guide — do NOT expand it into full content.
- Keep ALL existing sections exactly as they are unless the user specifically asked to change them.
- Preserve all visual element suggestions (📊 Table, 🖼 Image, 🎨 Infographic, etc.) exactly as they are.
- Preserve the FAQ section and its H3 questions exactly as they are unless specifically asked to modify them.
- Preserve the Semantic Keywords section exactly as it is.`
          : '';

        const editPrompt = `You are editing existing content. Apply the requested changes precisely and return the FULL updated content in Markdown.

EDIT TYPE: ${editType}
${sectionHeading ? `TARGET SECTION: "${sectionHeading}"` : 'TARGET: Entire content'}
EDIT INSTRUCTIONS: ${editInstructions}
${frameworkRule}

CURRENT CONTENT:
---
${currentArticle}
---

RULES:
- Apply ONLY the requested changes. Do NOT rewrite sections that weren't asked about.
- Keep the same overall structure, formatting, and style unless told otherwise.
- If removing a section, cleanly remove it and adjust transitions.
- If adding a section, place it in the most logical position and match the existing format (if it is a framework with italic guides, the new section must also be just a heading + italic guide — NOT full content).
- If rewriting a section, keep similar length unless told to expand/shorten.
- If the edit targets a specific section heading, find that section and edit only that part.
- Maintain all existing SEO optimization, keyword usage, and AI extractability.
- Return the COMPLETE updated content — not just the changed section.
- Do NOT include any preamble, commentary, or notes. Output ONLY the content in Markdown.
- Do NOT wrap in code blocks.
- Preserve the meta title and description block if present.
- Preserve the inline "📋 Sources for this section" blocks under each section. If the edit adds new claims or data, add corresponding inline sources under that section. If rewriting a section, update its source block to match the new content. Never remove existing sources unless explicitly asked.`;

        // Always use Claude for article editing (regardless of user-selected chat model)
        let editedContent = await callClaude(
          'You are an expert content editor. Apply precise edits to articles while maintaining quality, structure, and SEO optimization.',
          editPrompt,
          { maxTokens: 10000, temperature: 0.3, timeout: 180000 }
        );

        if (!editedContent || editedContent.length < 100) {
          return JSON.stringify({ error: 'Edit produced insufficient content. Please try again.' });
        }

        // Clean up any code block wrappers
        editedContent = editedContent.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/i, '').trim();

        // Extract meta if present
        let metaTitle = '';
        let metaDescription = '';
        let articleBody = editedContent;

        const metaTitleMatch = editedContent.match(/\*\*Meta Title:\*\*\s*(.+)/i);
        const metaDescMatch = editedContent.match(/\*\*Meta Description:\*\*\s*(.+)/i);
        if (metaTitleMatch) metaTitle = metaTitleMatch[1].trim();
        if (metaDescMatch) metaDescription = metaDescMatch[1].trim();

        if (metaTitleMatch || metaDescMatch) {
          const dividerIdx = editedContent.indexOf('\n---');
          if (dividerIdx !== -1) {
            articleBody = editedContent.substring(dividerIdx + 4).trim();
          } else {
            const headingIdx = editedContent.indexOf('\n#');
            if (headingIdx !== -1) articleBody = editedContent.substring(headingIdx).trim();
          }
        }

        return JSON.stringify({
          success: true,
          editType,
          sectionHeading: sectionHeading || 'entire article',
          wordCountEstimate: articleBody.split(/\s+/).length,
          metaTitle,
          metaDescription,
          article: articleBody,
          instruction: 'The article has been updated. Present a brief summary of what was changed. Do NOT show the full article in chat — it has been automatically updated in the editor.'
        });
      } catch (e) {
        return JSON.stringify({ error: `Article edit failed: ${e.message}` });
      }
    }

    case 'generate_article': {
      const topicStr = (args.topic || '').toString().trim();
      if (!topicStr) return JSON.stringify({ error: 'Topic is required to generate an article.' });

      try {
        // Use Claude (primary) or OpenAI (fallback) for article generation
        if (!getInternalProvider()) return JSON.stringify({ error: 'No AI API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env' });

        // Gather writer context
        const writerProfile = getWriterProfile(writerId);
        const pastArticles = findRelatedArticles(writerId, topicStr);

        // ═══ AUTO-FETCH SHAREPOINT PRODUCT DATA ═══
        // Every CloudFuze article benefits from real product data.
        // Search SharePoint using topic + keywords + framework headings for maximum coverage.
        let sharepointContext = '';
        if (isSharePointConfigured()) {
          try {
            // Build multiple search queries from topic, primary keyword, and framework headings
            const reqs0 = articleRequirements || {};
            const searchQueries = [topicStr];
            if (args.primary_keyword || reqs0.primaryKeyword) {
              searchQueries.push(args.primary_keyword || reqs0.primaryKeyword);
            }
            // Extract key headings from framework for targeted SharePoint searches
            const fw = args.framework?.length ? args.framework : (reqs0.framework || []);
            for (const section of fw) {
              if (section.heading && section.level <= 2) {
                const heading = section.heading.replace(/^#+\s*/, '').trim();
                if (heading.toLowerCase().includes('cloudfuze') || heading.toLowerCase().includes('migrat') || heading.toLowerCase().includes('compliance')) {
                  searchQueries.push(heading);
                }
              }
            }

            // Search SharePoint with all queries in parallel, deduplicate results
            const spParts = [];
            const seenUrls = new Set();
            const spResults = await Promise.allSettled(
              searchQueries.slice(0, 4).map(q => searchAndFetchContent(q))
            );
            for (const result of spResults) {
              if (result.status === 'fulfilled' && result.value.found) {
                const allResults = [result.value.topResult, ...(result.value.additionalResults || [])].filter(Boolean);
                for (const r of allResults) {
                  if (r.content && r.content.length > 50 && !seenUrls.has(r.webUrl)) {
                    seenUrls.add(r.webUrl);
                    spParts.push(`--- Source: "${r.name}" (${r.webUrl}) ---\n${r.content}`);
                  }
                }
              }
            }
            if (spParts.length > 0) {
              sharepointContext = spParts.join('\n\n').substring(0, 10000);
              console.log(`📄 [SharePoint] Found ${spParts.length} relevant docs from ${searchQueries.length} queries`);
            }
          } catch (e) {
            console.warn('SharePoint auto-fetch for article generation failed:', e.message);
          }
        }

        // Merge: stored articleRequirements (from session) ← overridden by explicit args
        const reqs = articleRequirements || {};

        // Check if the editor contains a framework (headings with brief guides, not a full article)
        const editorContent = (reqs._currentContent || '').trim();
        let editorFramework = '';
        if (editorContent && editorContent.length > 30) {
          const lines = editorContent.split('\n');
          const headingLines = lines.filter(l => /^#{1,3}\s/.test(l));
          const totalWords = editorContent.split(/\s+/).length;
          // If there are multiple headings but few words per heading, it's likely a framework
          if (headingLines.length >= 4 && totalWords < 800) {
            editorFramework = editorContent;
          }
        }

        // Get writer bio for personalized content
        const writerBioPrompt = formatWriterBioForPrompt(reqs._writerName);

        const articlePrompt = buildArticleGenPrompt({
          topic: topicStr,
          primaryKeyword: args.primary_keyword || reqs.primaryKeyword || '',
          secondaryKeywords: args.secondary_keywords?.length ? args.secondary_keywords : (reqs.secondaryKeywords || []),
          lsiKeywords: args.lsi_keywords?.length ? args.lsi_keywords : (reqs.lsiKeywords || []),
          framework: args.framework?.length ? args.framework : (reqs.framework || []),
          faqs: args.faqs?.length ? args.faqs : (reqs.faqs || []),
          contentType: args.content_type || reqs.contentType || 'educational',
          targetAudience: args.target_audience || reqs.targetAudience || '',
          additionalRequirements: [args.additional_requirements, reqs.notes].filter(Boolean).join('\n'),
          wordCount: Math.min(parseInt(args.word_count) || 2000, 2500),
          writerProfile,
          pastArticles: pastArticles.slice(0, 5),
          editorFramework,
          sharepointContext,
          writerBio: writerBioPrompt,
          writerName: reqs._writerName || ''
        });

        // Always use Claude for article generation (regardless of user-selected chat model)
        let articleContent = await callClaude(
          ARTICLE_GEN_SYSTEM_PROMPT,
          articlePrompt,
          { maxTokens: 10000, temperature: 0.5, timeout: 180000 }
        );

        if (!articleContent || articleContent.length < 200) {
          return JSON.stringify({ error: 'Article generation produced insufficient content. Please try again.' });
        }

        // Extract meta title and description from the generated content
        let metaTitle = '';
        let metaDescription = '';
        let articleBody = articleContent;

        const metaTitleMatch = articleContent.match(/\*\*Meta Title:\*\*\s*(.+)/i);
        const metaDescMatch = articleContent.match(/\*\*Meta Description:\*\*\s*(.+)/i);

        if (metaTitleMatch) metaTitle = metaTitleMatch[1].trim();
        if (metaDescMatch) metaDescription = metaDescMatch[1].trim();

        // Remove the meta block from the article body (everything before the first --- or first #)
        if (metaTitleMatch || metaDescMatch) {
          const dividerIdx = articleContent.indexOf('\n---');
          if (dividerIdx !== -1) {
            articleBody = articleContent.substring(dividerIdx + 4).trim();
          } else {
            // Fallback: find first heading
            const headingIdx = articleContent.indexOf('\n#');
            if (headingIdx !== -1) {
              articleBody = articleContent.substring(headingIdx).trim();
            }
          }
        }

        // Extract inline source blocks from the article for reference
        const sourceBlocks = [];
        const sourceBlockRegex = />\s*\*\*📋 Sources for this section:\*\*\n((?:>\s*-\s*.+\n?)+)/g;
        let srcMatch;
        while ((srcMatch = sourceBlockRegex.exec(articleBody)) !== null) {
          const links = srcMatch[1].match(/>\s*-\s*\[([^\]]+)\]\(([^)]+)\)/g) || [];
          links.forEach(link => {
            const parsed = link.match(/\[([^\]]+)\]\(([^)]+)\)/);
            if (parsed) sourceBlocks.push({ title: parsed[1], url: parsed[2] });
          });
        }

        // Build SharePoint sources list from context for easy access
        const sharepointSources = [];
        if (sharepointContext) {
          const spSourceMatches = sharepointContext.matchAll(/---\s*Source:\s*"([^"]+)"\s*\(([^)]+)\)\s*---/g);
          for (const m of spSourceMatches) {
            sharepointSources.push({ title: m[1], url: m[2] });
          }
        }

        return JSON.stringify({
          success: true,
          topic: topicStr,
          contentType: args.content_type || 'educational',
          wordCountEstimate: articleBody.split(/\s+/).length,
          metaTitle,
          metaDescription,
          article: articleBody,
          fullContent: articleContent,
          inlineSources: sourceBlocks,
          sharepointSources,
          instruction: 'Present the meta title and meta description FIRST at the top, clearly labeled. Then present the FULL article content exactly as generated — do NOT summarize or truncate. The article has inline "📋 Sources for this section" blocks under each section — these MUST be included in full so the writer can verify claims. After presenting the article, remind the writer: "📋 **Before publishing, verify all inline sources under each section.** Links marked with 🔗 *Internal SharePoint* let you confirm CloudFuze product details. Links marked ⚠️ need the writer to find the exact URL. Remove the source blocks before final publishing." Then offer to make specific changes, adjust meta tags, add more FAQs, or run a CSABF analysis on it.'
        });
      } catch (e) {
        return JSON.stringify({ error: `Article generation failed: ${e.message}` });
      }
    }

    case 'fetch_external_references': {
      const topicStr = (args.topic || '').toString().trim();
      if (!topicStr) return JSON.stringify({ error: 'Topic is required.' });

      const platforms = Array.isArray(args.platforms) ? args.platforms : [];
      const linkTypes = Array.isArray(args.link_types) ? args.link_types : ['official_docs', 'research', 'industry_reports', 'best_practices', 'compliance'];

      try {
        const { fetchExternalReferences } = await import('./externalReferencesService.js');
        const result = await fetchExternalReferences(topicStr, platforms, linkTypes);
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ error: `External references fetch failed: ${e.message}` });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ═══ ARTICLE GENERATION PROMPT ═══

const ARTICLE_GEN_SYSTEM_PROMPT = `You are an expert content writer who achieves two goals in every article:

GOAL 1 — AI SEARCH ENGINE VISIBILITY (GEO):
Write articles that ChatGPT, Gemini, Perplexity, Google AI Overviews, and Bing Copilot cite, quote, and recommend.
GEO-optimized content achieves 30-115% higher visibility in AI responses. Only 11% of domains are cited by both ChatGPT and Google AIO for the same query — your job is to be in that 11% across ALL platforms.
How: definition-first sections, sourced statistics, entity-rich language, self-contained answer blocks (120-160 words), tables and bullet lists that AI engines extract directly.

GOAL 2 — ENTERPRISE CUSTOMER ACQUISITION:
Every article must move CIOs, IT Directors, and IT Managers at 500+ employee companies closer to choosing CloudFuze.
How: open each section with the buyer's pain point before the solution, build trust through technical depth and specificity, weave CloudFuze features into the second half naturally, close with a clear but soft CTA.
The reader should finish thinking: "CloudFuze clearly understands this problem, and they're the expert I should talk to."

Both goals reinforce each other: the more specific and authoritative the content, the more AI engines cite it AND the more enterprise buyers trust it. Never sacrifice one goal for the other.

You write for CloudFuze — an enterprise cloud migration and SaaS management platform.

${ICP_FRAMEWORK}

WRITING RULES — FOLLOW EVERY ONE:

STRUCTURE:
- Start with a single H1 (the article title). IMPORTANT: The topic provided is just a topic name — NOT the H1. You MUST create an H1 that targets Core ICP leads (80-100 score):
  - Target CIOs, IT Directors, CTOs at 500+ employee US companies in IT/Software/Financial Services using Microsoft 365 or Google Workspace
  - Include primary keyword front-loaded + enterprise scale language ("Enterprise", "at Scale", "for Large Organizations")
  - Include buyer persona signal ("for IT Leaders", "for IT Teams", "A CIO's Guide")
  - Include specific platform names (Microsoft 365, Google Workspace, SharePoint, OneDrive) where relevant
  - Use patterns like "Enterprise [Topic]: [Benefit] for IT Leaders" or "[Platform] [Topic]: Complete Guide for 2026"
  - Do NOT use the raw topic as the H1. Do NOT include "CloudFuze" in the H1 unless the topic is specifically about CloudFuze.
- Include a "Key Takeaways" section immediately after the introduction as a bullet list (5-7 takeaways). EACH takeaway MUST be a SHORT sentence — max 15 words per bullet point. Use crisp, actionable language. NO long explanations. Examples of good takeaways:
  - "Enterprise cloud migration requires careful permission mapping to avoid data loss."
  - "CloudFuze supports bulk migration for 10,000+ users with full metadata preservation."
  - "SOC 2 and HIPAA compliance are non-negotiable for enterprise migration projects."
  Bad: "When organizations are planning to migrate their data from one cloud platform to another, they should consider the importance of preserving permissions and metadata throughout the entire migration process." (Too long — rewrite as a short sentence.)
- Use 4-6 H2 sections for the article body covering the topic's main aspects. These body H2s should be ORIGINAL headings you create — NOT the FAQ questions. Body H2s cover the topic broadly; FAQs go in their own dedicated section (see FAQ SECTION rules below).
- Use H3 sub-sections where appropriate for detailed breakdowns
- Include a "How CloudFuze Helps" or "How CloudFuze Simplifies [Topic]" H2 section — this is a standalone section in the second half of the article (after body H2s, before FAQs). This section highlights CloudFuze features specifically relevant to the article's topic. End this section with a soft CTA paragraph.
- ARTICLE STRUCTURE ORDER (bottom half): ... → Body H2s → "How CloudFuze Helps" (with CTA at end) → "Frequently Asked Questions" (LAST section in the article).
- Include a "Frequently Asked Questions" H2 section as the FINAL section of the article. Inside this section, each FAQ is formatted as an H3 question with its answer below it. ONLY use the FAQs provided in the prompt. If the prompt says 4 FAQs, write exactly 4. Do NOT add extra FAQs. FAQs are the LAST thing in the article — nothing comes after them.
- Include a soft CTA paragraph BEFORE the FAQ section (NOT after FAQs). The CTA should come at the end of the "How CloudFuze Helps" section or as a standalone short paragraph right before "## Frequently Asked Questions". The CTA should mention CloudFuze with a specific next step (e.g., "Start a free migration assessment with CloudFuze" or "Schedule a demo to see how CloudFuze simplifies [topic]"). Do NOT add a separate "Conclusion" H2 — CloudFuze articles do NOT use a separate Conclusion heading per blog standards.
- FAQ PLACEMENT: By default, ALL FAQ questions go inside the "Frequently Asked Questions" section as H3s. However, if a FAQ question adds significant value as a standalone body section (e.g., "How do I migrate from X to Y?" is central to the article topic), you may promote UP TO 2 FAQs as H2 body sections — but ONLY if they genuinely deserve deeper coverage. The remaining FAQs MUST stay in the FAQ section. NEVER use ALL FAQs as H2 body headings. If the writer explicitly asks to use a specific FAQ as an H2, always follow that instruction.

INTRODUCTION (first 100-150 words) — THIS IS THE MOST CITED SECTION:
- Start with the answer, not the question. First sentence must directly answer the topic using a definition pattern ("[Topic] is..." or "[Topic] refers to...")
- Use the "inverted pyramid" — most important information first
- Include the primary keyword in the first sentence
- Include a specific statistic or data point in the first 2-3 sentences (this boosts AI citations by 40%)
- Mention CloudFuze within the first 2-3 paragraphs as a trusted solution or the authority behind this guide
- NO fluff, no "In today's digital landscape...", no "As businesses increasingly...", no "It's important to note that..."
- The introduction must be SELF-CONTAINED — AI engines often extract just the intro as a citation. Every entity must be named explicitly.

AI EXTRACTABILITY & GEO CITABILITY — CRITICAL:
These rules are based on how AI search engines actually select and cite content:

ANSWER BLOCK QUALITY (most important for citations):
- Every section must START with a direct answer in the first 1-2 sentences before explaining
- Each answer block should be 50-200 words and SELF-CONTAINED — AI engines quote blocks out of context
- ALWAYS name the subject explicitly in each paragraph. Never rely on pronouns like "it", "this", "they" — AI engines extract passages independently
- Use definition patterns: "[Term] is..." or "What is [Term]? [Term] is..." — these increase AI citations by 2.1x
- Use "inverted pyramid" format: answer first, then context, then details

STATISTICAL DENSITY (boosts citations by 40%) — MANDATORY:
- EVERY article MUST include at least ONE credible, topic-relevant statistic from a recognized source (Gartner, Forrester, IDC, McKinsey, Statista, Microsoft, Google) in the INTRODUCTION. This is non-negotiable.
- Include at least 3-5 total statistics throughout the article, spread across different sections.
- Include specific percentages, dollar amounts, timeframes, and named sources
- Replace vague claims with data: NOT "significantly reduces time" → YES "reduces migration time by 60%"
- NOT "many businesses use" → YES "over 85% of Fortune 500 companies"
- Cite sources inline: "According to Gartner...", "Based on CloudFuze's migration of 20M+ users...", "A Forrester study found..."
- Stats MUST be relevant to the specific article topic — not generic IT/cloud stats.

STRUCTURAL READABILITY:
- Use bullet lists and numbered lists extensively — AI engines extract these far more easily than paragraphs
- Keep paragraphs SHORT: max 3-4 sentences, one idea per paragraph
- Use question-format H2/H3 headings that match how people ask AI engines (e.g., "How Do You Migrate from Google Drive to OneDrive?" not "Migration Process")
- Include comparison tables where relevant — Google AI Overviews and Perplexity extract tables directly

PLATFORM-SPECIFIC WRITING PATTERNS:
- For Google AI Overviews: Include scannable lists, direct answers under question headings, HTML tables, FAQ schema-ready Q&A format
- For ChatGPT: Write entity-rich content (name specific platforms, tools, standards), aim for comprehensive coverage (2000+ words), Wikipedia-style factual authority
- For Perplexity: Include original data/research, community-validated claims, specific case studies with results, recent dates and timestamps
- For Gemini: Reference well-known entities clearly, align with Knowledge Graph terminology, include YouTube video references where relevant
- For Bing Copilot: Ensure fast-loading pages, use IndexNow-friendly structure, reference professional sources

E-E-A-T SIGNALS (Experience, Expertise, Authoritativeness, Trustworthiness):
- EXPERIENCE: Include first-hand examples, specific migration case studies, real-world results (e.g., "In a recent enterprise migration, CloudFuze transferred 2.5M files in under 48 hours")
- EXPERTISE: Show technical depth — mention specific protocols, APIs, compliance standards (SOC 2, GDPR, HIPAA)
- AUTHORITATIVENESS: Reference CloudFuze's track record, G2/Gartner ratings, enterprise customer base
- TRUSTWORTHINESS: Be transparent about limitations, provide accurate technical details, cite verifiable facts

BUYER JOURNEY STRUCTURE — MANDATORY:
- First body H2(s): Establish the problem and its real cost. Quantify the risk — data loss, downtime, compliance failure, productivity drain. Make the reader feel the urgency before presenting solutions.
- Middle body H2(s): Go deep on the technical mechanisms, tradeoffs, and evaluation criteria. This is where you demonstrate expertise. A reader should finish these sections thinking "now I know exactly what to look for in a solution."
- Second-to-last body H2: Frame solution criteria around what CloudFuze specifically does well — without naming it yet. Build the criteria so CloudFuze is the obvious fit.
- "How CloudFuze Helps" section: Name specific product features and measurable outcomes that match the criteria you built above. This is the conversion section — be specific, not vague. End with a soft but clear CTA.
- FAQ section: Address the final decision-stage questions buyers ask right before choosing a vendor.

CONTENT ORIGINALITY — CRITICAL:
- Every article MUST be 100% AI-original writing. Do NOT copy, paraphrase, rephrase, or reuse text from any past CloudFuze blog articles.
- Past articles listed in the prompt are ONLY for: (1) knowing what topics are already covered so you AVOID repeating them, and (2) suggesting internal links to those articles where relevant.
- Do NOT use past article content as source material. Do NOT reproduce sentences, paragraphs, or section structures from past blogs.
- The ONLY factual source for CloudFuze product data is the SharePoint documentation provided in the prompt. If no SharePoint data is provided, write based on general knowledge about cloud migration — do NOT invent specific CloudFuze features.
- For statistics, data points, and industry facts — use publicly available research (Gartner, Forrester, IDC, Microsoft docs, Google docs) and cite them inline.
- Each article must bring a FRESH perspective, new angles, and original analysis — even if the topic overlaps with past articles.

ACTIVE VOICE — MANDATORY THROUGHOUT:
- EVERY sentence in the article MUST use active voice. Passive voice is NEVER acceptable.
- Before outputting any sentence, verify it uses active voice (subject + verb + object).
- Passive: "Files are migrated by CloudFuze." → Active: "CloudFuze migrates files."
- Passive: "Permissions can be preserved during migration." → Active: "CloudFuze preserves permissions during migration."
- Passive: "The migration process is completed in 48 hours." → Active: "The migration process completes in 48 hours."
- Passive: "Data security is ensured through encryption." → Active: "End-to-end encryption ensures data security."
- If you write a passive sentence, immediately rewrite it in active voice before including it.

AVOID:
- NEVER use marketing fluff, salesy language, or vague filler
- Write with authority — no hedging ("might", "could potentially", "it seems")
- No generic AI-sounding phrases ("In today's rapidly evolving landscape", "It's important to note that")
- No filler sentences that add no information
- NEVER use passive voice — active voice in every sentence

COMPETITOR POLICY — CRITICAL:
- NEVER mention competitor products or tools by name. Do NOT list alternatives like MultCloud, Mover.io, Zapier, Insync, Movebot, CloudHQ, odrive, or any other migration/cloud tool.
- If the topic involves comparisons or "tools for X", position CloudFuze as the solution. Describe CloudFuze's features and benefits instead of listing competitors.
- If a comparison is unavoidable (e.g. "Google Drive vs Dropbox"), compare the PLATFORMS only — never list third-party migration tools other than CloudFuze.
- When discussing "how to migrate" or "tools for migration", present CloudFuze as the recommended approach with its specific features (bulk transfer, metadata preservation, permission mapping, etc.).
- It is acceptable to mention the source/destination platforms themselves (Google Drive, Dropbox, OneDrive, SharePoint, Box, etc.) — just never competitor migration tools.

CLOUDFUZE BRAND INTEGRATION — MANDATORY:
The whole purpose of every article is to promote CloudFuze as the go-to solution. Integrate CloudFuze naturally throughout the article — not as a hard sell, but as the expert authority and recommended tool. Follow these rules:

WHERE to mention CloudFuze (aim for 8-12 mentions across the article):
1. INTRODUCTION: Mention CloudFuze within the first 2-3 paragraphs as a trusted solution or the platform behind this guide. Example: "CloudFuze, an enterprise cloud migration platform, simplifies this process by..."
2. BODY SECTIONS: In every section where migration, data transfer, integration, cloud management, or any operational challenge is discussed, naturally reference how CloudFuze addresses it. Example: "CloudFuze handles this with automated permission mapping and metadata preservation."
3. HOW-TO / STEP-BY-STEP SECTIONS: When listing steps for migration or setup, include CloudFuze as the recommended tool in the relevant step. Example: "Step 3: Use CloudFuze to initiate the bulk transfer with a single click."
4. "HOW CLOUDFUZE HELPS" SECTION: Include a dedicated H2 or H3 section (can be standalone or embedded in the Conclusion) that specifically highlights CloudFuze's relevant features for the article's topic. This should feel like a natural recommendation, not an ad.
5. CLOSING CTA: Include a soft CTA paragraph at the END of the "How CloudFuze Helps" section, BEFORE the FAQ section. NOT after FAQs. The CTA should naturally close the CloudFuze section with a specific next step like "CloudFuze simplifies [topic] with [specific feature]. Get started with a free migration assessment." or "Schedule a demo to see how CloudFuze handles [topic] at enterprise scale."
6. FAQ ANSWERS: Where relevant, reference CloudFuze in 1-2 FAQ answers. Example: "How do I migrate from X to Y? CloudFuze automates the entire process, preserving permissions, metadata, and folder structures."

HOW to mention CloudFuze (tone and style):
- NATURAL, not salesy. Weave CloudFuze into informational sentences, not marketing slogans.
- SPECIFIC features, not vague claims. Always mention concrete capabilities:
  - Bulk file and user migration (millions of files)
  - Permission and metadata preservation
  - Cross-cloud and hybrid migration (30+ cloud platforms)
  - Single sign-on (SSO) and admin console
  - Automated user mapping
  - Incremental/delta migration
  - Enterprise-grade security (SOC 2, GDPR compliant)
  - Dedicated migration support and project management
  - Tenant-to-tenant migration (M&A, consolidation)
  - OneDrive, SharePoint, Google Drive, Box, Dropbox, Egnyte support
- AUTHORITY positioning: Present CloudFuze as the expert behind the content, not just a product mention. Example: "Based on CloudFuze's experience migrating over 20 million users..."
- CONTEXTUAL: Only mention features relevant to the article's topic. Don't force unrelated features.

WHAT TO AVOID:
- Do NOT turn every sentence into a CloudFuze ad. Keep it informational with strategic brand placements.
- Do NOT use phrases like "Buy CloudFuze", "Sign up now", "Limited time offer" — this is content marketing, not direct advertising.
- Do NOT cluster all mentions in one section. Spread them across the article.
- Do NOT make CloudFuze the H1 title unless the article is specifically about CloudFuze itself.

KEYWORD INTEGRATION — GEO-OPTIMIZED:
- Use the primary keyword 8-12 times naturally (1.0-1.5% density for ~2000 words)
- Include primary keyword in: H1, first sentence, at least 2 H2 headings, meta title, meta description, closing CTA
- Spread secondary keywords across different sections — each secondary keyword in at least 2 sections
- Weave LSI keywords naturally — don't force them, but ensure topical coverage
- Use ENTITY keywords (specific platforms, standards, protocols) to help AI engines understand the topic's Knowledge Graph connections
- Include question-format keywords as H2/H3 headings — these directly match AI search queries
- Use long-tail keyword phrases in FAQ questions — these are high-citation-probability queries

TONE & STYLE:
- Professional, authoritative, direct
- Active voice ALWAYS — NEVER use passive voice. Every sentence must use active voice construction.
- Specific over general (say "reduces migration time by 60%" not "significantly reduces time")
- No exclamation marks, no rhetorical questions in body text
- Short sentences preferred

BUYER PERSONA TONE SHIFTING — CRITICAL:
Adjust writing tone, vocabulary, and focus based on the target audience persona:

**CIO / VP of IT (Strategic Buyer):**
- Focus on: ROI, business outcomes, risk mitigation, strategic alignment, board-level justification
- Vocabulary: "digital transformation", "strategic initiative", "operational efficiency", "total cost of ownership", "risk posture"
- Tone: Executive summary style, high-level insights, business impact over technical details
- Content emphasis: Cost savings, compliance risk reduction, competitive advantage, vendor consolidation
- Example framing: "For CIOs evaluating cloud migration strategies, the key consideration is minimizing operational disruption while maintaining compliance across all data sovereignty requirements."

**CTO (Technical Decision-Maker):**
- Focus on: Architecture, scalability, API integrations, security protocols, technical feasibility
- Vocabulary: "API-driven", "zero-trust architecture", "horizontal scaling", "data pipeline", "encryption at rest and in transit"
- Tone: Technical depth, architecture-level thinking, engineering best practices
- Content emphasis: Technical specifications, integration points, performance benchmarks, security architecture
- Example framing: "CTOs architecting a multi-cloud migration should evaluate API throughput, OAuth 2.0 token handling, and data pipeline resilience across hybrid environments."

**IT Director / IT Manager (Operational Buyer):**
- Focus on: Implementation details, team workflows, timeline, resource planning, change management
- Vocabulary: "rollout plan", "user adoption", "change management", "pilot phase", "cutover window"
- Tone: Practical, step-by-step, project management oriented
- Content emphasis: Migration planning, team coordination, training needs, timeline estimates
- Example framing: "IT Directors planning a tenant-to-tenant migration should allocate 2-4 weeks for pilot testing with a subset of 50-100 users before full rollout."

**IT Admin / System Administrator (Hands-On User):**
- Focus on: Step-by-step procedures, configuration settings, troubleshooting, admin console tasks
- Vocabulary: "admin console", "PowerShell script", "permission mapping", "sync settings", "audit log"
- Tone: Tutorial-style, precise instructions, command-level detail
- Content emphasis: How-to guides, configuration steps, common errors and fixes, tool walkthroughs
- Example framing: "IT admins can initiate the migration from the CloudFuze admin console by selecting the source and destination tenants, mapping user accounts, and configuring permission inheritance settings."

When generating content, detect the target audience from the topic, framework, or writer's instructions and apply the matching persona tone throughout the article. If no specific persona is indicated, default to IT Director/IT Manager tone (practical, actionable) with CIO-level insights in the introduction and conclusion.

FAQ SECTION — PLACEMENT AND FORMAT:
- The FAQ section is a single H2 heading: "## Frequently Asked Questions"
- It appears as the LAST section of the article — AFTER the "How CloudFuze Helps" section and its CTA. Nothing comes after FAQs.
- Inside this section, each FAQ is an H3: "### Question here?\\n\\nAnswer here."
- Each answer: 2-4 sentences. Start with the direct answer, then explain
- FAQ answers must be self-contained — quotable by AI without surrounding context
- IMPORTANT: Include ONLY the exact FAQs specified in the prompt. If the writer selected 4 FAQs, write exactly 4 — not 5, not 8. Respect the writer's choices exactly.
- Do NOT dump all FAQ questions as H2 body headings — that defeats the purpose of a dedicated FAQ section. At most 1-2 high-value FAQs may be promoted to H2 body sections if they deserve deep coverage. The rest MUST remain as H3s inside the FAQ section. If the writer explicitly requests a specific FAQ as an H2, always honor that.

FOLLOWING INSTRUCTIONS — CRITICAL:
- The prompt contains the writer's EXACT requirements: specific FAQs, specific keywords, specific framework, specific word count, and additional requirements.
- Follow these EXACTLY. If they say "use only 4 FAQs", use only those 4. If they say "remove keyword X", don't include it. If they say "2000 words", aim for 2000.
- Do NOT add content the writer did not ask for. Do NOT ignore constraints the writer specified.

META TITLE & META DESCRIPTION — INCLUDE AT THE VERY TOP:
Before the article content, output a meta title and meta description block in this exact format:

**Meta Title:** [title here]
**Meta Description:** [description here]

---

Then start the article (H1, introduction, etc.) below the divider.

Meta Title rules (for SEO + AI visibility):
- 50-60 characters max (Google truncates after ~60)
- Primary keyword must appear within the first 3-4 words
- Use a power word or number to increase CTR (e.g. "Guide", "Steps", "Best", "How to", a year like "2026")
- Format: "[Primary Keyword]: [Benefit or Hook]" or "How to [Primary Keyword] in [X] Steps"
- Do NOT use the company name unless the topic is specifically about CloudFuze
- Must be unique and descriptive — not generic or clickbaity

Meta Description rules (for SEO + AI visibility):
- STRICT MAX 140 characters — NEVER exceed 140 characters. Count carefully before outputting.
- Primary keyword MUST appear in the first 10 words
- Must contain a clear value proposition — what will the reader learn/get?
- Include a secondary keyword naturally if possible
- Use active voice, direct language
- End with a subtle CTA or promise (e.g. "Learn the step-by-step process.", "See the complete guide.")
- AI engines (Perplexity, ChatGPT, Gemini) often use meta descriptions as source summaries — make it self-contained and factual
- Do NOT use fluff like "In this article we will..." or "Read on to discover..."
- ALWAYS show the character count in parentheses after the meta description, e.g. "(132 chars)"

INLINE SOURCES — MANDATORY (placed UNDER each section, NOT at the end):
Writers need to verify every claim before publishing. Sources MUST appear directly below the section that uses them — NOT collected at the end of the article.

HOW TO FORMAT SOURCES — follow this pattern for EVERY section:

## How Do You Migrate Google Drive to SharePoint at Scale?

Google Drive to SharePoint migration at enterprise scale requires careful planning...
CloudFuze automates bulk migration for organizations with 10,000+ users, preserving permissions and metadata...
According to Gartner, 85% of enterprises will adopt a cloud-first strategy by 2026...

> **📋 Sources for this section:**
> - [Gartner: Cloud-First Strategy Report 2025](https://www.gartner.com/...) — statistic on enterprise cloud adoption
> - [Microsoft: SharePoint Migration Overview](https://learn.microsoft.com/en-us/sharepointonline/migrate-to-sharepoint-online) — official migration documentation
> - [CloudFuze SharePoint: Supported Migration Paths](sharepoint-url-here) — 🔗 *Internal SharePoint — verify product details*

RULES FOR INLINE SOURCES:
1. Place a "> **📋 Sources for this section:**" block at the BOTTOM of every H2 section that contains facts, statistics, product claims, or technical details
2. Each source is a blockquote line: "> - [Title](URL) — what was referenced"
3. NOT every section needs sources — skip for intro fluff, Key Takeaways (which summarize other sections), and the Conclusion (already sourced elsewhere)
4. Sections that MUST have sources:
   - Any section with a statistic or data point (e.g., "85% of enterprises...")
   - Any section referencing compliance standards (link to SOC 2, HIPAA, GDPR, FedRAMP official pages)
   - Any section with CloudFuze product claims (link to the SharePoint source URL if provided in the prompt)
   - Any section referencing Microsoft/Google/platform documentation
   - Any section citing research (Gartner, Forrester, IDC, McKinsey, Statista)
5. SharePoint sources: If CloudFuze internal SharePoint data was provided in the prompt, cite it with its exact URL and mark it: 🔗 *Internal SharePoint — verify product details*
6. ONLY include real, verifiable URLs. Do NOT hallucinate URLs.
7. If you cite a stat but are unsure of the exact URL, write: "[Source Name] — *⚠️ verify link before publishing*"
8. Aim for 2-4 sources per section that has factual claims
9. This is for the WRITER'S reference before publishing — it will be removed from the final published version

OUTPUT FORMAT:
- Write in clean Markdown
- Start with the Meta Title + Meta Description block, then the full article with inline sources under each section
- Do NOT collect sources at the end — they go under each section
- Do NOT include any other preamble, notes, or commentary
- Do NOT wrap in code blocks`;

function buildArticleGenPrompt(params) {
  const parts = [];

  parts.push(`THIS ARTICLE MUST ACHIEVE TWO GOALS SIMULTANEOUSLY:

GOAL 1 — AI SEARCH ENGINE VISIBILITY:
Get cited and quoted by ChatGPT, Perplexity, Gemini, Google AI Overviews, and Bing Copilot.
Rules: Each section must open with a definition or direct answer. Include at least one specific, sourced statistic per section. Name entities explicitly — never use "it", "the tool", "this platform". Each H2 section should be independently quotable (120-160 words is the AI citation sweet spot). Tables and bullet lists are extracted directly by AI engines — include at least 2 bullet lists and 1 numbered list.

GOAL 2 — ENTERPRISE CUSTOMER ACQUISITION:
Attract and convert CIOs, IT Directors, and IT Managers at 500+ employee enterprises.
Rules: Address real buyer pain points (data loss risk, compliance exposure, downtime, shadow IT). Build credibility through technical depth and specificity. Naturally position CloudFuze as the solution in the second half. End with a soft but clear CTA. Every section should leave the reader thinking "CloudFuze clearly understands this problem."

Both goals reinforce each other: authoritative, specific content is both more citable by AI engines AND more trusted by enterprise buyers.`);

  parts.push(`TOPIC: "${params.topic}" — This is just the topic name, NOT the H1. You must create a Core ICP-targeted H1 (targeting CIOs/IT Directors at 500+ employee companies, US-based, using M365/GWS). Include enterprise scale language, buyer persona signal, and platform names. Do NOT use this raw topic as the H1.`);
  parts.push(`CONTENT TYPE: ${params.contentType}`);
  parts.push(`TARGET WORD COUNT: ${params.wordCount} words`);

  if (params.primaryKeyword) {
    parts.push(`PRIMARY KEYWORD: "${params.primaryKeyword}" — use this 8-12 times naturally`);
  }

  if (params.secondaryKeywords?.length > 0) {
    parts.push(`SECONDARY KEYWORDS: ${params.secondaryKeywords.join(', ')}`);
  }

  if (params.lsiKeywords?.length > 0) {
    parts.push(`LSI / SEMANTIC KEYWORDS: ${params.lsiKeywords.join(', ')}`);
  }

  // Editor framework takes priority (it's what the writer sees and may have edited)
  if (params.editorFramework) {
    parts.push(`ARTICLE FRAMEWORK FROM EDITOR — FOLLOW THIS STRUCTURE EXACTLY:\nThe writer has a framework in their editor. Use these exact headings and structure. Write full content for each section based on the brief descriptions provided. Do NOT change, reorder, or skip any headings unless the writer's requirements say otherwise.\n\n${params.editorFramework}`);
  } else if (params.framework?.length > 0) {
    const frameworkText = params.framework.map(s =>
      `- ${'#'.repeat(s.level || 2)} ${s.heading}${s.brief ? ` — ${s.brief}` : ''}`
    ).join('\n');
    parts.push(`ARTICLE FRAMEWORK (follow this structure):\n${frameworkText}`);
  }

  if (params.faqs?.length > 0) {
    parts.push(`FAQS TO INCLUDE — EXACTLY ${params.faqs.length} FAQs, no more, no less:\n${params.faqs.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nPLACEMENT: Put these FAQs inside a "## Frequently Asked Questions" section near the end (before Conclusion), formatted as "### Question?\\nAnswer." You may promote up to 1-2 FAQs as H2 body sections ONLY if they are central to the article and deserve deep coverage — but the rest MUST stay in the FAQ section as H3s. NEVER use all ${params.faqs.length} FAQs as H2 body headings.`);
  }

  if (params.targetAudience) {
    parts.push(`TARGET AUDIENCE: ${params.targetAudience}`);
  }

  if (params.additionalRequirements) {
    parts.push(`WRITER'S SPECIFIC REQUIREMENTS — MUST FOLLOW ALL OF THESE:\n${params.additionalRequirements}\n\nThese are explicit instructions from the writer. Every single requirement above MUST be reflected in the generated article.`);
  }

  // Blog patterns (universal + writer-specific)
  parts.push(formatBlogPatternsForPrompt());

  if (params.writerBio) {
    parts.push(params.writerBio);
    // Add writer-specific article patterns from analysis
    const writerPatterns = formatWriterPatternsForPrompt(params.writerName);
    if (writerPatterns) parts.push(writerPatterns);
    parts.push(`WRITER TONE ENFORCEMENT — CRITICAL:
You are writing AS ${params.writerName}. The article MUST sound like ${params.writerName} wrote it — not a generic AI article.
- Match their intro style exactly (question hook vs. strategic context vs. problem statement)
- Use their H2 heading style (question-format, action-oriented, challenge-solution, etc.)
- Follow their CloudFuze mention timing (early vs. mid vs. late in article)
- Match their word count target (~${params.writerBio.match(/avg.*?(\d+)/i)?.[1] || '1000'} words)
- Use their POV (second person "you" for Rashmi, strategic/insight-driven for Pankaj, practical/clear for Aayushi, action-oriented for Bhavani)
- Follow their unique patterns listed above — these differentiate their voice`);
  } else if (params.writerProfile?.writing_style) {
    parts.push(`WRITER'S STYLE (match this): ${params.writerProfile.writing_style}`);
  } else {
    parts.push(`NO WRITER SELECTED — Use default CloudFuze tone:
- Professional, authoritative, enterprise-focused
- Direct and concise — no fluff, no generic intros
- Start with a question hook or a strong statement about why the topic matters
- Active voice, specific data over vague claims
- Write for enterprise IT decision-makers (CIOs, IT Directors, CTOs)
- Follow CloudFuze blog patterns: Key Takeaways after intro, dedicated CloudFuze section, FAQ section, soft CTA at end`);
  }

  if (params.pastArticles?.length > 0) {
    const pastText = params.pastArticles.map(a => `- "${a.title}" (${a.content_type})`).join('\n');
    parts.push(`PAST ARTICLES — FOR INTERNAL LINKING ONLY (do NOT copy or reuse any content from these):\nThe following are previously published CloudFuze articles. Use them ONLY to:\n1. Suggest internal links where relevant (e.g., "For more on [topic], see our guide on [title]")\n2. Avoid repeating the same angles or content already covered\n\nDo NOT use these articles as content sources. Generate 100% original content.\n\n${pastText}`);
  }

  if (params.sharepointContext) {
    parts.push(`CLOUDFUZE INTERNAL PRODUCT DATA (from SharePoint — USE THIS for accurate product information):\nThe following is real data from CloudFuze's internal documentation. Use these facts, features, supported combinations, and specifications in the article. Do NOT make up product details — use ONLY what is provided here. If the data includes supported migration paths, feature lists, or platform combinations, weave them naturally into the article.\n\n${params.sharepointContext}\n\nIMPORTANT: Cite specific features, supported platforms, and capabilities from the data above. This makes the article factually accurate and authoritative.\n\nSHAREPOINT SOURCE LINKING: Each SharePoint source above has a "Source:" line with a name and URL. You MUST include these SharePoint sources in the inline "📋 Sources for this section" block under EVERY section that uses SharePoint data. Format: "> - [SharePoint Doc Title](URL) — 🔗 *Internal SharePoint — verify product details*". Writers need these links directly under the relevant paragraph to verify product claims before publishing.`);
  }

  parts.push(`\nNow write the complete article. Output ONLY the article in Markdown format. No preamble, no notes, no commentary.`);

  return parts.join('\n\n');
}

function safeParseToolResult(result) {
  try { return JSON.parse(result); }
  catch { return { rawText: result }; }
}

// ═══ AGENT LOOP — OPENAI ═══

async function runAgentOpenAI(systemPrompt, userPrompt, provider, articleRequirements = {}, onToolCall = null) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: provider.apiKey, timeout: 120000 });
  const lfTrace = articleRequirements._langfuseTrace || null;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  const toolsUsed = [];
  const MAX_STEPS = 6;

  // Notify: AI is thinking
  if (onToolCall) onToolCall({ phase: 'thinking', step: 0 });

  for (let step = 0; step < MAX_STEPS; step++) {
    const lfGen = lfTrace?.generation({ name: `openai-step-${step}`, model: 'gpt-4o-mini', input: messages });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: AGENT_TOOLS_OPENAI,
      tool_choice: 'auto',
      temperature: 0.4,
      max_tokens: 10000
    });

    const choice = response.choices[0];
    lfGen?.end({
      output: choice.message,
      usage: { input: response.usage?.prompt_tokens, output: response.usage?.completion_tokens }
    });

    if (choice.finish_reason === 'tool_calls' || choice.message.tool_calls?.length > 0) {
      messages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments || '{}');
        const writerIdForTool = 'default';

        // Notify: tool starting
        if (onToolCall) onToolCall({ phase: 'tool_start', tool: fnName, step });

        const lfSpan = lfTrace?.span({ name: `tool:${fnName}`, input: fnArgs });
        const result = await executeTool(fnName, fnArgs, writerIdForTool, articleRequirements);
        const parsed = safeParseToolResult(result);
        lfSpan?.end({ output: parsed });
        toolsUsed.push({ tool: fnName, args: fnArgs, result: parsed });

        // Notify: tool complete
        if (onToolCall) onToolCall({ phase: 'tool_done', tool: fnName, step, result: parsed });

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        });
      }

      // Notify: AI is thinking again (processing tool results)
      if (onToolCall) onToolCall({ phase: 'thinking', step: step + 1 });
    } else {
      return {
        content: choice.message.content || '',
        toolsUsed
      };
    }
  }

  const lastMsg = messages[messages.length - 1];
  return {
    content: typeof lastMsg.content === 'string' ? lastMsg.content : 'I analyzed your content using multiple tools. Here are my findings based on the analysis above.',
    toolsUsed
  };
}

// ═══ AGENT LOOP — GEMINI ═══

async function runAgentGemini(systemPrompt, userPrompt, provider, articleRequirements = {}, onToolCall = null) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(provider.apiKey);
  const lfTrace = articleRequirements._langfuseTrace || null;

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ functionDeclarations: AGENT_TOOLS_GEMINI }],
    systemInstruction: systemPrompt
  });

  const chat = model.startChat({ history: [] });
  const toolsUsed = [];
  const MAX_STEPS = 6;

  if (onToolCall) onToolCall({ phase: 'thinking', step: 0 });

  const lfGen0 = lfTrace?.generation({ name: 'gemini-step-0', model: 'gemini-2.0-flash', input: [{ role: 'user', content: userPrompt }] });
  let response = await chat.sendMessage(userPrompt);
  lfGen0?.end({ output: response.response.candidates?.[0]?.content });

  for (let step = 0; step < MAX_STEPS; step++) {
    const candidate = response.response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    const functionCalls = parts.filter(p => p.functionCall);

    if (functionCalls.length === 0) {
      const textParts = parts.filter(p => p.text).map(p => p.text).join('\n');
      return { content: textParts, toolsUsed };
    }

    const functionResponses = [];
    for (const part of functionCalls) {
      const fnName = part.functionCall.name;
      const fnArgs = part.functionCall.args || {};
      const writerIdForTool = 'default';

      if (onToolCall) onToolCall({ phase: 'tool_start', tool: fnName, step });

      const lfSpan = lfTrace?.span({ name: `tool:${fnName}`, input: fnArgs });
      const result = await executeTool(fnName, fnArgs, writerIdForTool, articleRequirements);
      const parsed = safeParseToolResult(result);
      lfSpan?.end({ output: parsed });
      toolsUsed.push({ tool: fnName, args: fnArgs, result: parsed });

      if (onToolCall) onToolCall({ phase: 'tool_done', tool: fnName, step, result: parsed });

      functionResponses.push({
        functionResponse: {
          name: fnName,
          response: parsed
        }
      });
    }

    if (onToolCall) onToolCall({ phase: 'thinking', step: step + 1 });

    const lfGenN = lfTrace?.generation({ name: `gemini-step-${step + 1}`, model: 'gemini-2.0-flash', input: functionResponses });
    response = await chat.sendMessage(functionResponses);
    lfGenN?.end({ output: response.response.candidates?.[0]?.content });
  }

  const finalText = response.response.candidates?.[0]?.content?.parts
    ?.filter(p => p.text).map(p => p.text).join('\n') || '';
  return { content: finalText, toolsUsed };
}

// ═══ AGENT LOOP — CLAUDE ═══

// Convert OpenAI tool format to Anthropic tool format
const AGENT_TOOLS_CLAUDE = AGENT_TOOLS_OPENAI.map(t => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters
}));

async function runAgentClaude(systemPrompt, userPrompt, provider, articleRequirements = {}, onToolCall = null) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: provider.apiKey, timeout: 180000 });
  const lfTrace = articleRequirements._langfuseTrace || null;

  const messages = [
    { role: 'user', content: userPrompt }
  ];

  const toolsUsed = [];
  const MAX_STEPS = 6;

  if (onToolCall) onToolCall({ phase: 'thinking', step: 0 });

  for (let step = 0; step < MAX_STEPS; step++) {
    const lfGen = lfTrace?.generation({ name: `claude-step-${step}`, model: 'claude-sonnet-4-20250514', input: messages });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 10000,
      system: systemPrompt,
      messages,
      tools: AGENT_TOOLS_CLAUDE,
      temperature: 0.4
    });
    lfGen?.end({
      output: response.content,
      usage: { input: response.usage?.input_tokens, output: response.usage?.output_tokens }
    });

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const textBlocks = response.content.filter(b => b.type === 'text');

    if (toolUseBlocks.length === 0) {
      const content = textBlocks.map(b => b.text).join('\n');
      return { content, toolsUsed };
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const toolBlock of toolUseBlocks) {
      const fnName = toolBlock.name;
      const fnArgs = toolBlock.input || {};
      const writerIdForTool = 'default';

      if (onToolCall) onToolCall({ phase: 'tool_start', tool: fnName, step });

      const lfSpan = lfTrace?.span({ name: `tool:${fnName}`, input: fnArgs });
      const result = await executeTool(fnName, fnArgs, writerIdForTool, articleRequirements);
      const parsed = safeParseToolResult(result);
      lfSpan?.end({ output: parsed });
      toolsUsed.push({ tool: fnName, args: fnArgs, result: parsed });

      if (onToolCall) onToolCall({ phase: 'tool_done', tool: fnName, step, result: parsed });

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: result
      });
    }

    if (onToolCall) onToolCall({ phase: 'thinking', step: step + 1 });

    messages.push({ role: 'user', content: toolResults });

    // If stop_reason is 'end_turn' after tool use, we need another round
    if (response.stop_reason === 'end_turn' && textBlocks.length > 0) {
      const content = textBlocks.map(b => b.text).join('\n');
      return { content, toolsUsed };
    }
  }

  // Max steps reached — do one final call without tools to get a summary
  const lfFinal = lfTrace?.generation({ name: 'claude-final', model: 'claude-sonnet-4-20250514', input: messages });
  const finalResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 10000,
    system: systemPrompt,
    messages,
    temperature: 0.4
  });
  lfFinal?.end({
    output: finalResponse.content,
    usage: { input: finalResponse.usage?.input_tokens, output: finalResponse.usage?.output_tokens }
  });

  const finalText = finalResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n') || 'I analyzed your content using multiple tools. Here are my findings based on the analysis above.';

  return { content: finalText, toolsUsed };
}

// ═══ AGENT LOOP — OLLAMA (OpenAI-compatible API) ═══

async function runAgentOllama(systemPrompt, userPrompt, provider, articleRequirements = {}, onToolCall = null) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    baseURL: `${provider.baseUrl}/v1`,
    apiKey: 'ollama',
    timeout: 180000
  });
  const lfTrace = articleRequirements._langfuseTrace || null;
  const ollamaModel = provider.model || 'llama3.2';

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  const toolsUsed = [];
  const MAX_STEPS = 6;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const lfGen = lfTrace?.generation({ name: `ollama-step-${step}`, model: ollamaModel, input: messages });
      const response = await client.chat.completions.create({
        model: ollamaModel,
        messages,
        tools: AGENT_TOOLS_OPENAI,
        tool_choice: 'auto',
        temperature: 0.4
      });

      const choice = response.choices[0];
      lfGen?.end({ output: choice.message });

      if (choice.finish_reason === 'tool_calls' || choice.message.tool_calls?.length > 0) {
        messages.push(choice.message);

        for (const toolCall of choice.message.tool_calls) {
          const fnName = toolCall.function.name;
          const fnArgs = JSON.parse(toolCall.function.arguments || '{}');
          const writerIdForTool = 'default';
          const lfSpan = lfTrace?.span({ name: `tool:${fnName}`, input: fnArgs });
          const result = await executeTool(fnName, fnArgs, writerIdForTool, articleRequirements);
          const parsed = safeParseToolResult(result);
          lfSpan?.end({ output: parsed });
          toolsUsed.push({ tool: fnName, args: fnArgs, result: parsed });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          });
        }
      } else {
        return {
          content: choice.message.content || '',
          toolsUsed
        };
      }
    }
  } catch (toolErr) {
    // Model may not support tool calling — fall back to plain chat
    if (toolErr.message?.includes('tool') || toolErr.status === 400) {
      console.warn(`Ollama: model ${provider.model} may not support tool calling, falling back to plain chat`);
      const plainResponse = await client.chat.completions.create({
        model: provider.model || 'llama3.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4
      });
      return {
        content: plainResponse.choices[0]?.message?.content || '',
        toolsUsed: []
      };
    }
    throw toolErr;
  }

  const lastMsg = messages[messages.length - 1];
  return {
    content: typeof lastMsg.content === 'string' ? lastMsg.content : 'Analysis complete based on the tools above.',
    toolsUsed
  };
}

// ═══ PUBLIC API ═══

function getFallbackProvider(currentType) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const ollamaUrl = process.env.OLLAMA_BASE_URL;
  if (currentType === 'openai' && geminiKey) return { type: 'gemini', apiKey: geminiKey };
  if (currentType === 'openai' && anthropicKey) return { type: 'claude', apiKey: anthropicKey };
  if (currentType === 'openai' && ollamaUrl) return { type: 'ollama', baseUrl: ollamaUrl, model: process.env.OLLAMA_MODEL || 'llama3.2' };
  if (currentType === 'gemini' && openaiKey) return { type: 'openai', apiKey: openaiKey };
  if (currentType === 'gemini' && anthropicKey) return { type: 'claude', apiKey: anthropicKey };
  if (currentType === 'gemini' && ollamaUrl) return { type: 'ollama', baseUrl: ollamaUrl, model: process.env.OLLAMA_MODEL || 'llama3.2' };
  if (currentType === 'claude' && openaiKey) return { type: 'openai', apiKey: openaiKey };
  if (currentType === 'claude' && geminiKey) return { type: 'gemini', apiKey: geminiKey };
  if (currentType === 'claude' && ollamaUrl) return { type: 'ollama', baseUrl: ollamaUrl, model: process.env.OLLAMA_MODEL || 'llama3.2' };
  if (currentType === 'ollama' && openaiKey) return { type: 'openai', apiKey: openaiKey };
  if (currentType === 'ollama' && geminiKey) return { type: 'gemini', apiKey: geminiKey };
  if (currentType === 'ollama' && anthropicKey) return { type: 'claude', apiKey: anthropicKey };
  return null;
}

const PROVIDER_MODELS = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  claude: 'claude-sonnet-4-20250514',
  ollama: null
};

function logProvider(action, provider) {
  const model = provider.type === 'ollama' ? (provider.model || 'llama3.2') : PROVIDER_MODELS[provider.type];
  const source = provider.type === 'ollama' ? `${provider.baseUrl}` : 'cloud API';
  console.log(`\n🤖 [AI ${action}] Provider: ${provider.type.toUpperCase()} | Model: ${model} | Source: ${source}`);
}

export async function runAgent(systemPrompt, userPrompt, provider, articleRequirements = {}, onToolCall = null) {
  logProvider('Agent Chat (tool-calling)', provider);
  const startTime = Date.now();

  // ═══ SELF-IMPROVING FEEDBACK LOOP ═══
  // Learned rules are loaded once at startup from server/data/learned-rules.json
  // and appended to the system prompt. No per-call DB queries.
  const enhancedSystemPrompt = systemPrompt + getLearnedRulesPrompt();

  // Create a Langfuse trace for this agent turn
  const model = provider.type === 'ollama' ? (provider.model || 'llama3.2') : PROVIDER_MODELS[provider.type];
  const lfTrace = startTrace({
    userId: articleRequirements._writerId,
    sessionId: articleRequirements._sessionId,
    topic: articleRequirements.topic,
    writerName: articleRequirements._writerName,
    message: articleRequirements._rawUserMessage || userPrompt,
    provider: provider.type,
    model
  });

  // Inject trace into requirements so inner loops can attach generations/spans
  const reqsWithTrace = lfTrace ? { ...articleRequirements, _langfuseTrace: lfTrace } : articleRequirements;

  try {
    let result;
    if (provider.type === 'openai') {
      result = await runAgentOpenAI(enhancedSystemPrompt, userPrompt, provider, reqsWithTrace, onToolCall);
    } else if (provider.type === 'gemini') {
      result = await runAgentGemini(enhancedSystemPrompt, userPrompt, provider, reqsWithTrace, onToolCall);
    } else if (provider.type === 'claude') {
      result = await runAgentClaude(enhancedSystemPrompt, userPrompt, provider, reqsWithTrace, onToolCall);
    } else if (provider.type === 'ollama') {
      result = await runAgentOllama(enhancedSystemPrompt, userPrompt, provider, reqsWithTrace, onToolCall);
    } else {
      throw new Error('No AI provider configured');
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const toolNames = (result.toolsUsed || []).map(t => t.tool).join(', ') || 'none';
    console.log(`✅ [AI Agent Done] ${provider.type.toUpperCase()} | ${elapsed}s | Tools used: ${toolNames}`);

    lfTrace?.update({ output: result.content, metadata: { toolsUsed: toolNames, latencySeconds: parseFloat(elapsed) } });
    await flushLangfuse();

    // Attach traceId so the API route can return it to the client for feedback
    if (lfTrace) {
      result.traceId = lfTrace.id;
    }

    return result;
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ [AI Agent Error] ${provider.type.toUpperCase()} | ${elapsed}s | ${err.message}`);
    lfTrace?.update({ output: `ERROR: ${err.message}`, level: 'ERROR' });
    await flushLangfuse();
    // No fallback — let the error propagate so the UI shows it
    throw err;
  }
}
