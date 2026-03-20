/**
 * Content parser utilities for analyzing HTML and plain text content
 * Extended for CloudFuze Standard AI Blog Framework (CSABF)
 */

/**
 * Strip HTML tags and return plain text
 */
export function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract headings from HTML content
 * Returns array of { level, text }
 */
export function extractHeadings(html) {
  if (!html || typeof html !== 'string') return [];
  const headings = [];
  const regex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1]),
      text: stripHtml(match[2]).trim()
    });
  }
  return headings;
}

/**
 * Extract paragraphs from content
 * Returns array of paragraph text
 */
export function extractParagraphs(content, contentType) {
  if (!content || typeof content !== 'string') return [];
  if (contentType === 'html') {
    const paragraphs = [];
    const regex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const text = stripHtml(match[1]).trim();
      if (text.length > 0) {
        paragraphs.push(text);
      }
    }
    // If no <p> tags found, split by double newlines
    if (paragraphs.length === 0) {
      return splitByParagraphs(stripHtml(content));
    }
    return paragraphs;
  }
  return splitByParagraphs(content);
}

/**
 * Split plain text into paragraphs
 */
function splitByParagraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Count sentences in a text block
 */
export function countSentences(text) {
  if (!text || typeof text !== 'string') return 0;
  const cleaned = text.replace(/([.?!])\s*([A-Z"])/g, '$1|$2');
  return cleaned.split('|').filter(s => s.trim().length > 5).length || 1;
}

/**
 * Extract lists from HTML content
 */
export function extractLists(html) {
  if (!html || typeof html !== 'string') return [];
  const lists = [];
  const ulRegex = /<ul[^>]*>([\s\S]*?)<\/ul>/gi;
  const olRegex = /<ol[^>]*>([\s\S]*?)<\/ol>/gi;
  let match;

  while ((match = ulRegex.exec(html)) !== null) {
    const items = [];
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(match[1])) !== null) {
      items.push(stripHtml(liMatch[1]).trim());
    }
    lists.push({ type: 'bullet', items });
  }

  while ((match = olRegex.exec(html)) !== null) {
    const items = [];
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(match[1])) !== null) {
      items.push(stripHtml(liMatch[1]).trim());
    }
    lists.push({ type: 'numbered', items });
  }

  return lists;
}

/**
 * Extract links from HTML content
 */
export function extractLinks(html) {
  if (!html || typeof html !== 'string') return [];
  const links = [];
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.push({
      url: match[1],
      text: stripHtml(match[2]).trim()
    });
  }
  return links;
}

/**
 * Extract tables from HTML
 */
export function extractTables(html) {
  if (!html || typeof html !== 'string') return [];
  const tables = [];
  const regex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    tables.push(match[1]);
  }
  return tables;
}

/**
 * Count words in text
 */
export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Detect if text uses passive voice (simple heuristic)
 */
export function detectPassiveVoice(text) {
  if (!text || typeof text !== 'string') return 0;
  const passivePatterns = [
    /\b(is|are|was|were|been|being)\s+(being\s+)?\w+ed\b/gi,
    /\b(is|are|was|were|been|being)\s+(being\s+)?\w+en\b/gi
  ];
  let count = 0;
  for (const pattern of passivePatterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Check if text has question-based phrasing
 */
export function isQuestionBased(text) {
  if (!text || typeof text !== 'string') return false;
  const questionStarters = [
    'how', 'what', 'why', 'when', 'where', 'which', 'who', 'can', 'is it', 'does', 'do'
  ];
  const lower = text.toLowerCase().trim();
  return questionStarters.some(q => lower.startsWith(q)) || lower.endsWith('?');
}

/**
 * Detect comparison patterns in text
 */
export function hasComparisonPattern(text) {
  if (!text || typeof text !== 'string') return false;
  const patterns = [
    /\bvs\.?\b/i, /\bversus\b/i, /\bcompared to\b/i, /\bcomparison\b/i,
    /\bdifference between\b/i, /\bbetter than\b/i, /\balternative to\b/i,
    /\bpros and cons\b/i
  ];
  return patterns.some(p => p.test(text));
}

/**
 * Detect how-to / process patterns
 */
export function hasProcessPattern(text) {
  if (!text || typeof text !== 'string') return false;
  const patterns = [
    /\bhow to\b/i, /\bstep[s]?\s*\d/i, /\bstep-by-step\b/i,
    /\btutorial\b/i, /\bguide\b/i, /\bprocess\b/i, /\bworkflow\b/i,
    /\bfirst[\s,].*then\b/i, /\bfollow these\b/i
  ];
  return patterns.some(p => p.test(text));
}

/**
 * Detect statistical / data patterns
 */
export function hasDataPattern(text) {
  if (!text || typeof text !== 'string') return false;
  const patterns = [
    /\d+%/i, /\bstatistic/i, /\bsurvey\b/i, /\bdata\b/i,
    /\bresearch\b/i, /\bstudy\b/i, /\baccording to\b/i,
    /\bgrowth\b/i, /\bincrease\b/i, /\bdecrease\b/i
  ];
  return patterns.some(p => p.test(text));
}

/**
 * Detect pricing patterns
 */
export function hasPricingPattern(text) {
  if (!text || typeof text !== 'string') return false;
  const patterns = [
    /\bpric(e|ing)\b/i, /\bplan\b/i, /\btier\b/i, /\bsubscription\b/i,
    /\$\d+/i, /\bfree\s+plan\b/i, /\bpro\s+plan\b/i, /\bmonth\b/i,
    /\bper\s+user\b/i, /\bcost\b/i
  ];
  return patterns.some(p => p.test(text));
}

/**
 * Detect features/benefits patterns
 */
export function hasFeaturePattern(text) {
  if (!text || typeof text !== 'string') return false;
  const patterns = [
    /\bfeature/i, /\bbenefit/i, /\badvantage/i, /\bcapabilit/i,
    /\bfunctionality\b/i, /\bwhat you get\b/i, /\binclude[sd]?\b/i
  ];
  return patterns.some(p => p.test(text));
}

// ─── CSABF-SPECIFIC PARSER FUNCTIONS ────────────────────────────────────────

/**
 * Count platform mentions in text (case-insensitive)
 * Looks for known cloud platforms + generic "platform" references
 */
export function countPlatformMentions(text, platformKeywords = null) {
  if (!text || typeof text !== 'string') return 0;
  const defaultPlatforms = [
    'cloudfuze', 'google workspace', 'google drive', 'microsoft 365',
    'onedrive', 'sharepoint', 'dropbox', 'box', 'egnyte', 'slack',
    'teams', 'gmail', 'outlook', 'aws', 'azure', 'salesforce',
    'icloud', 'citrix sharefile'
  ];
  const keywords = platformKeywords || defaultPlatforms;
  const lower = text.toLowerCase();
  let count = 0;

  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = lower.match(regex);
    if (matches) count += matches.length;
  }

  return count;
}

/**
 * Calculate primary keyword density (percentage)
 * @param {string} text - Plain text content
 * @param {string} keyword - The primary keyword to check
 * @returns {number} Density as a percentage (e.g., 1.5 for 1.5%)
 */
export function calculateKeywordDensity(text, keyword) {
  if (!keyword || !text) return 0;
  const totalWords = countWords(text);
  if (totalWords === 0) return 0;

  const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
  const matches = text.match(regex) || [];
  const keywordWords = countWords(keyword);

  // Density = (keyword occurrences * words in keyword) / total words * 100
  return (matches.length * keywordWords / totalWords) * 100;
}

/**
 * Detect a definition block in text
 * A definition block is a clear, concise definition statement within the first ~60 words
 * of a "What is" section. Returns info about whether one exists.
 */
export function detectDefinitionBlock(text) {
  if (!text) return { found: false, wordCount: 0 };

  // Look for definition patterns
  const definitionPatterns = [
    /\b(is|refers to|means|defined as|is the process of|involves|encompasses)\b/i,
    /\b(is a|is an|are the|is when|is where)\b/i
  ];

  const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 5);

  // Check first 2-3 sentences for a definition
  const firstFewSentences = sentences.slice(0, 3).join('. ');
  const firstFewWords = countWords(firstFewSentences);

  const hasDefinition = definitionPatterns.some(p => p.test(firstFewSentences));

  // Check if definition is within first 60 words
  const first60Words = text.split(/\s+/).slice(0, 60).join(' ');
  const definitionInFirst60 = definitionPatterns.some(p => p.test(first60Words));

  return {
    found: hasDefinition,
    inFirst60Words: definitionInFirst60,
    wordCount: firstFewWords
  };
}

/**
 * Extract text content under each H2 section
 * Returns array of { heading, text, wordCount, headingLevel }
 */
export function extractSections(html) {
  if (!html || typeof html !== 'string') return [];
  const sections = [];
  const parts = html.split(/(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)/gi);

  let currentHeading = null;
  let currentLevel = 0;
  let currentContent = '';

  for (const part of parts) {
    const headingMatch = part.match(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/i);
    if (headingMatch) {
      // Save previous section
      if (currentHeading !== null) {
        const text = stripHtml(currentContent).trim();
        sections.push({
          heading: currentHeading,
          headingLevel: currentLevel,
          text,
          wordCount: countWords(text)
        });
      }
      currentHeading = stripHtml(headingMatch[2]).trim();
      currentLevel = parseInt(headingMatch[1]);
      currentContent = '';
    } else {
      currentContent += part;
    }
  }

  // Save last section
  if (currentHeading !== null) {
    const text = stripHtml(currentContent).trim();
    sections.push({
      heading: currentHeading,
      headingLevel: currentLevel,
      text,
      wordCount: countWords(text)
    });
  }

  return sections;
}

/**
 * Count lines in a paragraph (approximate — 1 line ~= 80-100 chars)
 */
export function countParagraphLines(text) {
  if (!text || typeof text !== 'string') return 0;
  const lineBreaks = text.split(/\n/).length;
  // Also estimate by character count (~80 chars per line)
  const charBasedLines = Math.ceil(text.length / 80);
  return Math.max(lineBreaks, charBasedLines);
}

/**
 * Check if text has marketing/sales heavy tone
 * Returns { isMarketing, signals }
 */
export function detectMarketingTone(text) {
  if (!text || typeof text !== 'string') return { isMarketing: false, signals: [], count: 0 };
  const patterns = [
    /\bbest.in.class\b/i,
    /\bindustry.leading\b/i,
    /\bworld.class\b/i,
    /\bunmatched\b/i,
    /\bunparalleled\b/i,
    /\bsuperior\b/i,
    /\brevolution(ize|ary)\b/i,
    /\bgame.changer\b/i,
    /\bcutting.edge\b/i,
    /\bnext.gen(eration)?\b/i,
    /\btransform(ative)?\b/i,
    /\bunleash\b/i,
    /\bskyrocket\b/i,
    /\bsupercharge\b/i,
    /\bdon'?t miss out\b/i,
    /\bact now\b/i,
    /\blimited time\b/i,
    /\bexclusive offer\b/i,
    /\bfree trial\b/i,
    /\bsign up (now|today)\b/i,
    /\bbuy now\b/i,
    /\bget started (now|today)\b/i
  ];

  const signals = [];
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) signals.push(match[0]);
    }
  }

  return {
    isMarketing: signals.length >= 3,
    signals,
    count: signals.length
  };
}

/**
 * Count FAQ questions and validate answer word counts
 * Returns detailed FAQ analysis
 */
export function analyzeFAQSection(text, html) {
  if (!text || typeof text !== 'string') return { hasFAQSection: false, questionCount: 0, answerWordCounts: [], sectionWordCount: 0 };
  const lower = text.toLowerCase();
  const hasFAQSection = /\bfaq|frequently asked|common questions/i.test(lower);

  // Extract question-answer pairs
  const questionMatches = text.match(/[^\n.]*\?/g) || [];

  // Try to extract structured Q&A from HTML (H3 questions under FAQ H2)
  const sections = extractSections(html);
  const faqSection = sections.find(s =>
    /faq|frequently asked|common questions/i.test(s.heading)
  );

  let qaAnswerWords = [];
  if (faqSection) {
    // Look for H3 questions within the FAQ section
    const faqHtml = html.split(/<h2[^>]*>[\s\S]*?<\/h2>/gi)
      .find(part => /faq|frequently asked/i.test(stripHtml(part)));

    if (faqHtml) {
      const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
      let h3Match;
      const questions = [];
      while ((h3Match = h3Regex.exec(faqHtml)) !== null) {
        questions.push(stripHtml(h3Match[1]).trim());
      }
      // Estimate answer lengths from section content
      const faqSections = extractSections(faqHtml || '');
      qaAnswerWords = faqSections
        .filter(s => s.headingLevel === 3)
        .map(s => s.wordCount);
    }
  }

  return {
    hasFAQSection,
    questionCount: questionMatches.length,
    answerWordCounts: qaAnswerWords,
    sectionWordCount: faqSection ? faqSection.wordCount : 0
  };
}

/**
 * Check if text is task-oriented (vs. generic thought leadership)
 * Returns a score 0-100
 */
export function checkTaskOrientation(text) {
  if (!text || typeof text !== 'string') return 0;
  const taskIndicators = [
    /\bstep\s*\d/i, /\bhow to\b/i, /\bfollow these\b/i,
    /\bnavigate to\b/i, /\bclick\b/i, /\bselect\b/i, /\bconfigure\b/i,
    /\benable\b/i, /\bdisable\b/i, /\bset up\b/i, /\bcreate\b/i,
    /\bdelete\b/i, /\bremove\b/i, /\bopen\b/i, /\baccess\b/i,
    /\bgo to\b/i, /\benter\b/i, /\btap\b/i, /\bcheck\b/i,
    /\bverify\b/i, /\bensure\b/i, /\bsave\b/i, /\bapply\b/i,
    /\bmigrate\b/i, /\btransfer\b/i, /\bsync\b/i, /\bbackup\b/i,
    /\bexport\b/i, /\bimport\b/i, /\bdownload\b/i, /\bupload\b/i
  ];

  const thoughtLeadershipIndicators = [
    /\bin today'?s world\b/i, /\bthought leader/i, /\bparadigm shift\b/i,
    /\bdigital transformation\b/i, /\binnovation\b/i, /\bsynergy\b/i,
    /\bholistic approach\b/i, /\blandscape\b/i, /\becosystem\b/i,
    /\blever(age)?\b/i, /\boptimize\b/i, /\bempower\b/i,
    /\bstrategic\b/i, /\bseamless\b/i, /\brobust\b/i
  ];

  let taskScore = 0;
  let genericScore = 0;

  for (const pattern of taskIndicators) {
    if (pattern.test(text)) taskScore++;
  }
  for (const pattern of thoughtLeadershipIndicators) {
    if (pattern.test(text)) genericScore++;
  }

  // Normalize: more task indicators + fewer generic = better
  const total = taskScore + genericScore || 1;
  return Math.min(100, Math.round((taskScore / total) * 100));
}

/**
 * Convert TipTap-style HTML back to Markdown.
 * Preserves heading levels, lists, bold, italic, links, blockquotes, and tables.
 */
export function htmlToMarkdown(html) {
  if (!html || typeof html !== 'string') return '';

  let md = html;

  // Normalize self-closing tags
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<hr\s*\/?>/gi, '\n---\n');

  // Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, inner) => `# ${inlineClean(inner)}\n\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, inner) => `## ${inlineClean(inner)}\n\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, inner) => `### ${inlineClean(inner)}\n\n`);

  // Blockquotes — convert before paragraphs so nested <p> inside blockquote are handled
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const lines = inlineClean(inner.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n')).split('\n').filter(l => l.trim());
    return lines.map(l => `> ${l.trim()}`).join('\n') + '\n\n';
  });

  // Ordered lists
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let idx = 0;
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__, li) => {
      idx++;
      return `${idx}. ${inlineClean(li).trim()}\n`;
    }) + '\n';
  });

  // Unordered lists
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__, li) => {
      return `- ${inlineClean(li).trim()}\n`;
    }) + '\n';
  });

  // Tables
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableInner) => {
    const rows = [];
    const rowMatches = tableInner.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const row of rowMatches) {
      const cells = [];
      const cellMatches = row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
      for (const cell of cellMatches) {
        const text = inlineClean(cell.replace(/<\/?t[hd][^>]*>/gi, '')).trim();
        cells.push(text);
      }
      rows.push(cells);
    }
    if (rows.length === 0) return '';
    let table = '| ' + rows[0].join(' | ') + ' |\n';
    table += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
    for (let r = 1; r < rows.length; r++) {
      table += '| ' + rows[r].join(' | ') + ' |\n';
    }
    return table + '\n';
  });

  // Paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, inner) => `${inlineClean(inner).trim()}\n\n`);

  // Clean remaining inline tags
  md = inlineClean(md);

  // Strip any remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode common entities
  md = md.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  // Collapse excessive newlines
  md = md.replace(/\n{3,}/g, '\n\n').trim();

  return md;
}

function inlineClean(html) {
  let s = html;
  // Links: <a href="url">text</a> → [text](url)
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url, text) => `[${text.replace(/<[^>]+>/g, '').trim()}](${url})`);
  // Bold
  s = s.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  s = s.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  // Italic
  s = s.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  s = s.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  // Underline (no markdown equiv, keep text)
  s = s.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, '$1');
  // Strikethrough
  s = s.replace(/<s[^>]*>([\s\S]*?)<\/s>/gi, '~~$1~~');
  s = s.replace(/<del[^>]*>([\s\S]*?)<\/del>/gi, '~~$1~~');
  // Code
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  // Mark/highlight
  s = s.replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, '$1');
  return s;
}
