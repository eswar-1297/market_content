import {
  stripHtml, extractHeadings, extractParagraphs, countSentences,
  extractLists, extractLinks, extractTables, countWords,
  detectPassiveVoice, isQuestionBased, hasComparisonPattern,
  hasProcessPattern, hasDataPattern, hasPricingPattern, hasFeaturePattern,
  countPlatformMentions, calculateKeywordDensity, detectDefinitionBlock,
  extractSections, countParagraphLines, detectMarketingTone,
  analyzeFAQSection, checkTaskOrientation
} from '../utils/contentParser.js';

// ─── CSABF CONSTANTS (mirrored from client for server-side validation) ──────

const CSABF_WORD_COUNT = { warnMax: 2500 };

const CSABF_FORMATTING = {
  maxH1: 1,
  h2Range: { min: 4, max: 10 },   // 4 core minimum, up to 10 for method-based content
  idealH2: { min: 6, max: 8 },     // sweet spot
  minBulletLists: 2,
  minNumberedLists: 1,
  maxParagraphLines: 5,
  maxParagraphWords: 120,
  platformMentions: { min: 8, max: 12 },
  primaryKeywordDensity: { min: 1.0, max: 1.5 },
  minH3PerH2: 0,                   // recommended, not required
  idealH3PerH2: 1                  // at least 1 H3 within each H2 section
};

// Sections split into CORE (always expected) and CONTEXTUAL (suggested based on content)
// "What is" moved to contextual — action-oriented content doesn't always need a definition
// CloudFuze positioning can merge with Conclusion — detected via combined pattern
const CORE_H2S = [
  { pattern: /faq|frequently\s+asked/i, label: 'FAQs' },
  {
    pattern: /conclusion|summary|wrap.?up|final\s+thoughts|act\s+now/i,
    label: 'Conclusion',
    note: 'CloudFuze positioning can be embedded here instead of a separate section'
  }
];

// CloudFuze section is "soft core" — if no standalone section, check if it's merged into conclusion
const CLOUDFUZE_SECTION = {
  pattern: /how\s+cloudfuze|cloudfuze\s+helps|enterprise.+cloudfuze|cloudfuze\s+migrate/i,
  label: 'How CloudFuze Helps',
  note: 'Can be a standalone H2 or embedded naturally into the Conclusion'
};

const CONTEXTUAL_H2S = [
  {
    pattern: /what\s+is/i,
    label: 'What is [Topic]',
    triggers: [/what\s+is/i, /definition/i, /meaning/i, /explain/i, /overview/i, /understand/i],
    suggestion: 'Your content introduces a concept that could benefit from a clear "What is [Topic]" definition section. AI engines use 40–60 word definitions for citations.'
  },
  {
    pattern: /why\s+(it\s+)?matter/i,
    label: 'Why It Matters',
    triggers: [/important/i, /impact/i, /risk/i, /compliance/i, /security/i, /governance/i, /cost/i, /benefit/i],
    suggestion: 'Your content discusses impacts/importance. Consider adding a "Why It Matters" section covering security, operational, and governance impacts.'
  },
  {
    pattern: /step.?by.?step|how\s+to|process|guide|getting\s+started|method/i,
    label: 'Step-by-Step Process / Methods',
    triggers: [/how\s+to/i, /steps?\b/i, /process/i, /procedure/i, /navigate/i, /click/i, /go\s+to/i, /select/i, /configure/i, /set\s*up/i, /enable/i, /install/i, /migrate/i, /tutorial/i, /guide/i, /method/i],
    suggestion: 'Your content describes a process. Consider adding step-by-step sections — these can be one section or multiple method sections (e.g., "Method 1: ...", "Method 2: ...").'
  },
  {
    pattern: /common\s+issues|limitations|troubleshoot|errors?|problems?|why.+not\s+possible/i,
    label: 'Common Issues / Limitations',
    triggers: [/error/i, /issue/i, /problem/i, /fail/i, /troubleshoot/i, /limitation/i, /restrict/i, /permission/i, /denied/i, /not\s+working/i, /fix/i, /resolve/i, /not\s+possible/i, /can.?t\s+recover/i],
    suggestion: 'Your content mentions issues or errors. Consider adding a "Common Issues / Limitations" section covering permission issues, policy restrictions, and platform limitations.'
  },
  {
    pattern: /best\s+practices|tips|recommendations|rules?\s+to\s+prevent|dos?\s+and\s+don/i,
    label: 'Best Practices / Prevention Tips',
    triggers: [/recommend/i, /tip/i, /best\s+practice/i, /should/i, /avoid/i, /ensure/i, /prevent/i, /monitor/i, /automat/i, /governance/i, /safe/i, /protect/i],
    suggestion: 'Your content covers recommendations. Consider adding a "Best Practices" section with monitoring, governance, and automation suggestions.'
  },
  {
    pattern: /key\s+takeaway|takeaway|tldr|tl;dr|summary\s+of|at\s+a\s+glance/i,
    label: 'Key Takeaways',
    triggers: [/takeaway/i, /key\s+point/i, /summary/i, /important/i, /remember/i, /main\s+point/i],
    suggestion: 'Adding a "Key Takeaways" bullet list near the top improves AI extractability — AI engines love upfront summaries they can cite directly.'
  }
];

// Combined for pattern matching
const ALL_EXPECTED_H2S = [...CORE_H2S, { pattern: CLOUDFUZE_SECTION.pattern, label: CLOUDFUZE_SECTION.label }, ...CONTEXTUAL_H2S];

// Section warn-max only — no strict minimums (structure > word count)
const SECTION_WARN_MAX = {
  introduction: 300,
  'what is': 300,
  'why it matters': 350,
  'step-by-step': 800,
  'common issues': 400,
  'best practices': 350,
  'faqs': 500,
  'cloudfuze helps': 300,
  'conclusion': 250
};

/**
 * Detect content context — what kind of blog is this?
 * Returns signals about what sections are relevant.
 */
function detectContentContext(plainText, html) {
  const headings = extractHeadings(html);
  const h2Texts = headings.filter(h => h.level === 2).map(h => h.text.toLowerCase());
  const h3Texts = headings.filter(h => h.level === 3).map(h => h.text.toLowerCase());

  const context = {
    isProcedural: false,       // has how-to / step-by-step patterns
    isMultiMethod: false,      // has multiple methods/approaches (like the Gmail recovery blog)
    hasTroubleshooting: false,  // discusses errors, issues, fixes
    hasRecommendations: false,  // discusses tips, best practices
    hasImpactDiscussion: false, // discusses importance, risks, benefits
    isComparison: false,        // compares platforms/tools
    hasKeyTakeaways: false,     // has upfront summary / key takeaways
    hasH3Structure: false,      // uses H3 subheadings within H2 sections
    cloudFuzeMergedInConclusion: false,  // CloudFuze mention in conclusion section
    relevantSections: [],       // contextual sections that would help
    detectedType: 'general'     // general, how-to, comparison, troubleshooting, educational, multi-method
  };

  // Detect multi-method content (e.g., "Method 1:", "Method 2:", or "Option A:", etc.)
  const methodH2s = h2Texts.filter(t => /method\s+\d|option\s+\d|way\s+\d|approach\s+\d|step\s+\d\s*:/i.test(t));
  context.isMultiMethod = methodH2s.length >= 2;

  // Detect key takeaways presence (check H2 headings + plain text lines)
  const keyTakeawayPattern = /key\s+takeaway|takeaway|tldr|tl;dr|at\s+a\s+glance/i;
  context.hasKeyTakeaways = h2Texts.some(t => keyTakeawayPattern.test(t))
    || plainText.split('\n').some(line => {
      const trimmed = line.trim();
      return trimmed.split(/\s+/).length <= 8 && keyTakeawayPattern.test(trimmed);
    });

  // Detect H3 subheading usage
  context.hasH3Structure = h3Texts.length >= 3;

  // Check if CloudFuze is mentioned in the conclusion/final section
  const sections = extractSections(html);
  const conclusionSection = sections.find(s =>
    /conclusion|summary|wrap|final|act\s+now/i.test(s.heading) && s.headingLevel === 2
  );
  if (conclusionSection && /cloudfuze/i.test(conclusionSection.text)) {
    context.cloudFuzeMergedInConclusion = true;
  }

  // Check each contextual section's triggers against content
  // Also scan plain text lines as fallback for headings not parsed as HTML
  const ptLines = plainText.split('\n').map(l => l.trim()).filter(Boolean);
  for (const section of CONTEXTUAL_H2S) {
    const triggerCount = section.triggers.filter(t => t.test(plainText)).length;
    const alreadyPresent = h2Texts.some(t => section.pattern.test(t))
      || ptLines.some(line => line.split(/\s+/).length <= 12 && section.pattern.test(line));

    if (triggerCount >= 2 && !alreadyPresent) {
      context.relevantSections.push({
        label: section.label,
        suggestion: section.suggestion,
        triggerStrength: triggerCount,
        present: false
      });
    } else if (alreadyPresent) {
      context.relevantSections.push({
        label: section.label,
        present: true,
        triggerStrength: triggerCount
      });
    }
  }

  // Detect content type
  context.isProcedural = hasProcessPattern(plainText);
  context.hasTroubleshooting = /error|issue|problem|fail|troubleshoot|fix|resolve/i.test(plainText);
  context.hasRecommendations = /recommend|best practice|tip|should|avoid|prevent/i.test(plainText);
  context.hasImpactDiscussion = /important|impact|risk|compliance|security|governance|cost|benefit/i.test(plainText);
  context.isComparison = hasComparisonPattern(plainText);

  if (context.isMultiMethod) context.detectedType = 'multi-method';
  else if (context.isProcedural) context.detectedType = 'how-to';
  else if (context.isComparison) context.detectedType = 'comparison';
  else if (context.hasTroubleshooting) context.detectedType = 'troubleshooting';
  else if (context.hasImpactDiscussion) context.detectedType = 'educational';

  return context;
}

/**
 * Main CSABF rule-based content analysis engine
 * Context-aware: detects content type and adjusts which sections are relevant.
 * Returns a comprehensive analysis report with scores and suggestions.
 */
export function analyzeContent(content, contentType = 'text') {
  const html = contentType === 'html' ? content : textToBasicHtml(content);
  const plainText = stripHtml(html);
  const wordCount = countWords(plainText);

  // Detect what kind of content this is
  const contentContext = detectContentContext(plainText, html);

  const checks = {
    totalWordCount: checkTotalWordCount(plainText),
    h1Structure: checkH1Structure(html),
    h2Structure: checkH2Structure(html, contentContext),
    h3Structure: checkH3Structure(html, contentContext),
    csabfSections: checkCSABFSections(html, plainText, contentContext),
    keyTakeaways: checkKeyTakeaways(html, plainText, contentContext),
    introduction: checkIntroduction(html, plainText),
    paragraphLength: checkParagraphLength(html, contentType),
    paragraphWordLimit: checkParagraphWordLimit(html, contentType),
    bulletLists: checkBulletLists(html, plainText),
    numberedLists: checkNumberedLists(html, contentContext),
    platformMentions: checkPlatformMentions(plainText),
    definitionBlock: checkDefinitionBlock(html, contentContext),
    faqSection: checkFAQSection(html, plainText),
    cloudFuzePositioning: checkCloudFuzePositioning(html, contentContext),
    internalLinks: checkInternalLinks(html),
    linkTypes: checkLinkTypes(html),
    readability: checkReadability(plainText),
    marketingTone: checkMarketingTone(plainText),
    taskOrientation: checkTaskOrientation_check(plainText),
    aiCitationReadiness: checkAICitationReadiness(html, plainText, contentContext),
    schemaFriendly: checkSchemaFriendly(html),
    sectionWordCounts: checkSectionWordCounts(html)
  };

  const visualRecommendations = generateVisualRecommendations(plainText, html, wordCount);

  // Assign relevance to each check based on content type
  assignRelevance(checks, contentContext);

  // Calculate category scores (relevance-weighted)
  const categories = calculateCategoryScores(checks);
  const overallScore = Math.round(
    Object.values(categories).reduce((sum, cat) => sum + cat.score, 0) /
    Object.values(categories).length
  );

  // Collect all suggestions with priorities and relevance
  const suggestions = collectSuggestions(checks);

  // Count relevance distribution for frontend
  const relevanceSummary = {
    critical: Object.values(checks).filter(c => c.relevance === 'critical').length,
    relevant: Object.values(checks).filter(c => c.relevance === 'relevant').length,
    optional: Object.values(checks).filter(c => c.relevance === 'optional').length,
    totalChecks: Object.keys(checks).length
  };

  return {
    score: overallScore,
    wordCount,
    contentType: contentContext.detectedType,
    contentContext: {
      isProcedural: contentContext.isProcedural,
      isMultiMethod: contentContext.isMultiMethod,
      hasTroubleshooting: contentContext.hasTroubleshooting,
      hasRecommendations: contentContext.hasRecommendations,
      hasImpactDiscussion: contentContext.hasImpactDiscussion,
      isComparison: contentContext.isComparison,
      hasKeyTakeaways: contentContext.hasKeyTakeaways,
      hasH3Structure: contentContext.hasH3Structure,
      cloudFuzeMergedInConclusion: contentContext.cloudFuzeMergedInConclusion
    },
    relevanceSummary,
    categories,
    checks,
    suggestions,
    visualRecommendations
  };
}

function textToBasicHtml(text) {
  const lines = text.split('\n');
  let html = '';
  let inList = false;
  let listType = '';
  let h1Found = false;

  // Patterns that indicate a line is a section heading when found as a standalone short line
  // Combines CORE_H2S, CONTEXTUAL_H2S, CLOUDFUZE_SECTION, and common heading patterns
  const knownH2Patterns = [
    /^faq/i,
    /^frequently\s+asked/i,
    /^conclusion/i,
    /^summary$/i,
    /^final\s+thoughts/i,
    /^wrap.?up/i,
    /^key\s+takeaway/i,
    /^takeaway/i,
    /^tl;?dr/i,
    /^at\s+a\s+glance/i,
    /^what\s+is\b/i,
    /^what\s+are\b/i,
    /^why\s+(it\s+)?matter/i,
    /^why\s+(is|are|do|does|should)\b/i,
    /^step.?by.?step/i,
    /^how\s+to\b/i,
    /^getting\s+started/i,
    /^common\s+issues/i,
    /^common\s+problems/i,
    /^limitations/i,
    /^troubleshoot/i,
    /^best\s+practices/i,
    /^tips\b/i,
    /^recommendations/i,
    /^prevention\s+tips/i,
    /^dos?\s+and\s+don/i,
    /^how\s+cloudfuze/i,
    /^cloudfuze\s+helps/i,
    /^introduction$/i,
    /^overview$/i,
    /^background$/i,
    /^prerequisites/i,
    /^requirements/i,
    /^benefits/i,
    /^advantages/i,
    /^comparison/i,
    /^alternatives/i,
    /^pricing/i,
    /^features/i,
    /^method\s+\d/i,
    /^option\s+\d/i,
    /^approach\s+\d/i,
    /^way\s+\d/i,
    /^step\s+\d/i,
    /^related\s+(articles?|resources?|posts?|links?)/i,
    /^additional\s+resources/i,
    /^further\s+reading/i,
    /^table\s+of\s+contents/i
  ];

  // H3-level patterns (sub-headings within sections)
  const knownH3Patterns = [
    /^step\s+\d+\s*[:\-–]/i,
    /^method\s+\d+\s*[:\-–]/i,
    /^option\s+\d+\s*[:\-–]/i,
    /^tip\s+\d+\s*[:\-–]/i,
    /^rule\s+\d+\s*[:\-–]/i,
    /^phase\s+\d+\s*[:\-–]/i,
    /^part\s+\d+\s*[:\-–]/i,
    /^pro\s+tip/i,
    /^note\s*:/i,
    /^important\s*:/i,
    /^warning\s*:/i,
    /^example\s*:/i
  ];

  // Check if a short line (≤12 words, no ending punctuation) looks like a heading
  function looksLikeHeading(line) {
    const words = line.split(/\s+/).length;
    if (words > 14) return false;
    if (words < 1) return false;
    // Ends with period, comma, or semicolon? Probably not a heading.
    if (/[.,;]$/.test(line)) return false;
    // Matches a known H2 pattern?
    if (knownH2Patterns.some(p => p.test(line))) return 'h2';
    // Matches a known H3 pattern?
    if (knownH3Patterns.some(p => p.test(line))) return 'h3';
    // ALL CAPS short line (e.g., "CONCLUSION", "FAQ")
    if (line === line.toUpperCase() && words <= 6 && /[A-Z]/.test(line)) return 'h2';
    // Title Case short line (≤8 words, first letter of most words capitalized)
    if (words <= 8) {
      const titleWords = line.split(/\s+/).filter(w => /^[A-Z]/.test(w));
      if (titleWords.length >= Math.ceil(words * 0.6) && words >= 2) return 'h2';
    }
    return false;
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      if (inList) {
        html += listType === 'ol' ? '</ol>' : '</ul>';
        inList = false;
      }
      continue;
    }

    // Markdown headings (original behavior)
    if (trimmed.startsWith('# ')) {
      if (inList) { html += listType === 'ol' ? '</ol>' : '</ul>'; inList = false; }
      html += `<h1>${trimmed.slice(2)}</h1>`;
      h1Found = true;
    }
    else if (trimmed.startsWith('## ')) {
      if (inList) { html += listType === 'ol' ? '</ol>' : '</ul>'; inList = false; }
      html += `<h2>${trimmed.slice(3)}</h2>`;
    }
    else if (trimmed.startsWith('### ')) {
      if (inList) { html += listType === 'ol' ? '</ol>' : '</ul>'; inList = false; }
      html += `<h3>${trimmed.slice(4)}</h3>`;
    }
    // Ordered list items
    else if (/^\d+[\.\)]\s/.test(trimmed)) {
      if (!inList || listType !== 'ol') {
        if (inList) html += listType === 'ol' ? '</ol>' : '</ul>';
        html += '<ol>';
        inList = true;
        listType = 'ol';
      }
      html += `<li>${trimmed.replace(/^\d+[\.\)]\s/, '')}</li>`;
    }
    // Unordered list items
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      if (!inList || listType !== 'ul') {
        if (inList) html += listType === 'ol' ? '</ol>' : '</ul>';
        html += '<ul>';
        inList = true;
        listType = 'ul';
      }
      html += `<li>${trimmed.replace(/^[-*•]\s+/, '')}</li>`;
    }
    else {
      if (inList) {
        html += listType === 'ol' ? '</ol>' : '</ul>';
        inList = false;
      }

      // Smart heading detection for non-markdown text
      const headingType = looksLikeHeading(trimmed);
      if (headingType === 'h2') {
        html += `<h2>${trimmed}</h2>`;
      } else if (headingType === 'h3') {
        html += `<h3>${trimmed}</h3>`;
      } else if (!h1Found && i < 3 && trimmed.split(/\s+/).length <= 14 && trimmed.split(/\s+/).length >= 3) {
        // First short line in the document is likely the H1
        html += `<h1>${trimmed}</h1>`;
        h1Found = true;
      } else {
        html += `<p>${trimmed}</p>`;
      }
    }
  }
  if (inList) html += listType === 'ol' ? '</ol>' : '</ul>';
  return html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSABF CHECKS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CHECK: Total Word Count (only warn on max — structure > length) ────────

function checkTotalWordCount(plainText) {
  const wc = countWords(plainText);
  const { warnMax } = CSABF_WORD_COUNT;

  let score = 100;
  const issues = [];

  // Only warn if content exceeds max — no minimum enforcement
  if (wc > warnMax) {
    score = 70;
    issues.push(`Content is ${wc} words — over ~${warnMax}. Very long content can dilute focus and keyword density. Consider trimming.`);
  }

  return {
    passed: wc <= warnMax,
    score,
    category: 'structure',
    details: issues.length === 0
      ? `Word count (${wc}). Structure quality — headings, lists, and clear sections — matters more than length for AI visibility.`
      : issues.join(' '),
    metrics: { wordCount: wc, note: 'No minimum — structure quality matters more than length' },
    suggestion: issues.length > 0 ? {
      priority: 'NICE_TO_HAVE',
      text: issues.join(' '),
      guideline: 'CSABF: Only flag content that is excessively long (dilution risk)'
    } : null
  };
}

// ─── CHECK: H1 Structure (only 1 H1, 8–14 words) ──────────────────────────

function checkH1Structure(html) {
  const headings = extractHeadings(html);
  const h1s = headings.filter(h => h.level === 1);
  const issues = [];

  if (h1s.length === 0) {
    return {
      passed: false, score: 0, category: 'structure',
      details: 'No H1 found. CSABF requires exactly 1 H1 as the primary intent keyword.',
      suggestion: { priority: 'CRITICAL', text: 'Add an H1 heading with 8–14 words that contains the exact intent phrase and platform name.', guideline: 'CSABF: H1 — Primary Intent Keyword' }
    };
  }

  if (h1s.length > 1) {
    issues.push(`${h1s.length} H1 tags found. CSABF allows only 1 H1 per page.`);
  }

  const h1Words = countWords(h1s[0].text);
  if (h1Words < 8) {
    issues.push(`H1 is ${h1Words} words. CSABF requires 8–14 words for optimal intent matching.`);
  } else if (h1Words > 14) {
    issues.push(`H1 is ${h1Words} words. CSABF recommends max 14 words. Trim to focus on primary intent.`);
  }

  const score = Math.max(0, 100 - issues.length * 30);

  return {
    passed: issues.length === 0,
    score,
    category: 'structure',
    details: issues.length === 0
      ? `H1 is well-formed: "${h1s[0].text}" (${h1Words} words).`
      : issues.join(' '),
    h1Text: h1s[0]?.text,
    h1WordCount: h1Words,
    suggestion: issues.length > 0 ? {
      priority: 'CRITICAL',
      text: issues.join(' '),
      guideline: 'CSABF: H1 — 8–14 words, exact intent phrase, include platform'
    } : null
  };
}

// ─── CHECK: H2 Structure (context-aware) ───────────────────────────────────

function checkH2Structure(html, contentContext) {
  const headings = extractHeadings(html);
  const h2s = headings.filter(h => h.level === 2);
  const issues = [];

  const { min, max } = CSABF_FORMATTING.h2Range;       // 4–10
  const { min: idealMin, max: idealMax } = CSABF_FORMATTING.idealH2;  // 6–8

  if (h2s.length < min) {
    issues.push(`Only ${h2s.length} H2 sections. At minimum, include: FAQs, Conclusion, and relevant content sections.`);
  } else if (h2s.length < idealMin && !contentContext.isMultiMethod) {
    const missingSuggestions = contentContext.relevantSections
      .filter(s => !s.present)
      .map(s => s.label);
    if (missingSuggestions.length > 0) {
      issues.push(`${h2s.length} H2 sections found. Based on your content, these could strengthen it: ${missingSuggestions.join(', ')}.`);
    }
  } else if (h2s.length > max) {
    issues.push(`${h2s.length} H2 sections found. Consider consolidating — beyond ${max} can dilute focus.`);
  }

  // Check for skipped heading levels
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      issues.push(`Heading level skipped: H${headings[i - 1].level} to H${headings[i].level}. Don't skip levels.`);
      break;
    }
  }

  let score;
  if (h2s.length >= idealMin && h2s.length <= idealMax) {
    score = issues.some(i => i.includes('skipped')) ? 80 : 100;
  } else if (h2s.length >= min && h2s.length <= max) {
    // In the acceptable range but not ideal
    score = 75;
  } else if (h2s.length < min) {
    score = Math.max(0, h2s.length * 20);
  } else {
    score = 60;
  }

  return {
    passed: h2s.length >= min && h2s.length <= max && !issues.some(i => i.includes('skipped')),
    score: Math.max(0, Math.min(100, score)),
    category: 'structure',
    details: issues.length === 0
      ? `Good: ${h2s.length} H2 sections with proper hierarchy.`
      : issues.join(' '),
    h2Count: h2s.length,
    h2Headings: h2s.map(h => h.text),
    suggestion: issues.length > 0 ? {
      priority: h2s.length < min ? 'CRITICAL' : 'RECOMMENDED',
      text: issues.join(' '),
      guideline: `CSABF: H2 Sections — ${min} minimum, ${idealMin}–${idealMax} ideal, up to ${max} for multi-method content`
    } : null
  };
}

// ─── CHECK: H3 Subheadings (recommended within H2 sections) ────────────────

function checkH3Structure(html, contentContext) {
  const headings = extractHeadings(html);
  const h2s = headings.filter(h => h.level === 2);
  const h3s = headings.filter(h => h.level === 3);

  // Find which H2 sections have H3 subheadings
  const h2sWithH3 = [];
  for (let i = 0; i < h2s.length; i++) {
    const h2Text = h2s[i].text;
    const h2Index = headings.indexOf(h2s[i]);
    const nextH2Index = i < h2s.length - 1
      ? headings.indexOf(h2s[i + 1])
      : headings.length;

    const childH3s = headings.slice(h2Index + 1, nextH2Index).filter(h => h.level === 3);
    if (childH3s.length > 0) {
      h2sWithH3.push({ h2: h2Text, h3Count: childH3s.length });
    }
  }

  const h3Coverage = h2s.length > 0 ? (h2sWithH3.length / h2s.length) * 100 : 0;
  const hasGoodH3 = h3s.length >= 3;

  let score = 50; // base
  if (hasGoodH3) score = 80;
  if (h3Coverage >= 50) score = 90;
  if (h3Coverage >= 70) score = 100;

  return {
    passed: hasGoodH3,
    score,
    category: 'structure',
    details: h3s.length === 0
      ? 'No H3 subheadings found. Adding H3s within H2 sections improves scannability and AI parsing.'
      : `${h3s.length} H3 subheadings across ${h2sWithH3.length} of ${h2s.length} H2 sections (${Math.round(h3Coverage)}% coverage).`,
    h3Count: h3s.length,
    h2sWithH3: h2sWithH3.length,
    suggestion: !hasGoodH3 ? {
      priority: 'RECOMMENDED',
      text: h3s.length === 0
        ? 'Add H3 subheadings within your H2 sections (e.g., "Steps to Take", "When to Use This", "What Admins Need to Do"). This improves readability and AI content extraction.'
        : `Only ${h3s.length} H3 subheadings found. Add more H3s to break up long H2 sections — AI engines parse sub-sections better.`,
      guideline: 'CSABF: Use H3 Subheadings Within H2 Sections'
    } : null
  };
}

// ─── CHECK: Key Takeaways (recommended near the top) ────────────────────────

function checkKeyTakeaways(html, plainText, contentContext) {
  const headings = extractHeadings(html);
  const sections = extractSections(html);

  // Check for explicit key takeaways section
  const hasTakeawaySection = headings.some(h =>
    /key\s+takeaway|takeaway|tldr|at\s+a\s+glance/i.test(h.text)
  );

  // Check for inline key takeaways (bold "Key Takeaways:" followed by bullets)
  const hasTakeawayInline = /key\s+takeaway/i.test(plainText);

  // Check if there's an upfront bullet summary in the intro area
  const introSection = sections.find(s => s.headingLevel === 1);
  const hasIntroBullets = introSection && /<ul>|<li>/i.test(html.substring(0, 1500));

  const hasTakeaways = hasTakeawaySection || hasTakeawayInline || hasIntroBullets;

  return {
    passed: true, // Always pass — this is a recommendation
    score: hasTakeaways ? 100 : 50,
    category: 'ai_citation',
    details: hasTakeaways
      ? 'Key takeaways / upfront summary found. AI engines extract these prominently for citations.'
      : 'No "Key Takeaways" found near the top of the content.',
    hasTakeaways,
    suggestion: !hasTakeaways ? {
      priority: 'RECOMMENDED',
      text: 'Add a "Key Takeaways" bullet list after your introduction. AI engines prioritize upfront summaries — a 4–6 bullet list of key points dramatically improves citation probability. Use bold "Key Takeaways:" followed by a bullet list.',
      guideline: 'CSABF: Key Takeaways (Recommended for AI Visibility)'
    } : null
  };
}

// ─── CHECK: CloudFuze Positioning (standalone or merged in conclusion) ───────

function checkCloudFuzePositioning(html, contentContext) {
  const headings = extractHeadings(html);
  const plainText = stripHtml(html);

  const hasStandaloneSection = headings.some(h =>
    h.level === 2 && CLOUDFUZE_SECTION.pattern.test(h.text)
  );
  const mergedInConclusion = contentContext.cloudFuzeMergedInConclusion;
  const mentionedAnywhere = /cloudfuze/i.test(plainText);

  if (hasStandaloneSection) {
    return {
      passed: true, score: 100, category: 'seo',
      details: 'CloudFuze has a dedicated H2 section — strong brand positioning.',
      suggestion: null
    };
  }
  if (mergedInConclusion) {
    return {
      passed: true, score: 90, category: 'seo',
      details: 'CloudFuze positioning is naturally embedded in the conclusion — this is a valid and effective approach.',
      suggestion: null
    };
  }
  if (mentionedAnywhere) {
    return {
      passed: true, score: 70, category: 'seo',
      details: 'CloudFuze is mentioned in the content but not in a dedicated section or conclusion. Consider adding it to the conclusion for stronger positioning.',
      suggestion: {
        priority: 'NICE_TO_HAVE',
        text: 'CloudFuze is mentioned but not in a structured section. Add a paragraph about how CloudFuze helps to the conclusion for natural brand positioning.',
        guideline: 'CSABF: CloudFuze Positioning (Standalone or in Conclusion)'
      }
    };
  }

  return {
    passed: false, score: 20, category: 'seo',
    details: 'No CloudFuze mention found in the content.',
    suggestion: {
      priority: 'RECOMMENDED',
      text: 'Add CloudFuze positioning — either as a standalone "How CloudFuze Helps" section (120–180 words, soft positioning, no aggressive CTA) or naturally embedded in the conclusion.',
      guideline: 'CSABF: CloudFuze Positioning'
    }
  };
}

// ─── CHECK: CSABF Sections (context-aware: core required, contextual suggested)

function checkCSABFSections(html, plainText, contentContext) {
  const headings = extractHeadings(html);
  const h2Texts = headings.filter(h => h.level === 2).map(h => h.text);

  // Plain-text fallback: scan for section names directly in the text
  // This catches cases where headings weren't properly formatted (no ## markers)
  const plainTextLines = plainText.split('\n').map(l => l.trim()).filter(Boolean);

  function foundInH2sOrPlainText(pattern) {
    // First check parsed H2 headings
    if (h2Texts.some(t => pattern.test(t))) return true;
    // Fallback: check if a short standalone line in the plain text matches
    return plainTextLines.some(line => {
      const words = line.split(/\s+/).length;
      return words <= 12 && pattern.test(line);
    });
  }

  // Check CORE sections (FAQs + Conclusion — always required)
  const coreFound = [];
  const coreMissing = [];
  for (const expected of CORE_H2S) {
    if (foundInH2sOrPlainText(expected.pattern)) {
      coreFound.push(expected.label);
    } else {
      coreMissing.push(expected.label);
    }
  }

  // Check CloudFuze positioning — standalone section OR merged into conclusion
  const hasCloudFuzeH2 = foundInH2sOrPlainText(CLOUDFUZE_SECTION.pattern);
  const cloudFuzeMerged = contentContext.cloudFuzeMergedInConclusion;
  if (hasCloudFuzeH2) {
    coreFound.push('How CloudFuze Helps (standalone)');
  } else if (cloudFuzeMerged) {
    coreFound.push('CloudFuze positioning (in conclusion)');
  }
  // Only flag missing if neither standalone nor merged
  const hasCloudFuze = hasCloudFuzeH2 || cloudFuzeMerged || /cloudfuze/i.test(plainText);

  // Check CONTEXTUAL sections (suggested based on content signals)
  const contextualFound = [];
  const contextualSuggested = [];
  for (const section of CONTEXTUAL_H2S) {
    if (foundInH2sOrPlainText(section.pattern)) {
      contextualFound.push(section.label);
    } else {
      const triggerCount = section.triggers.filter(t => t.test(plainText)).length;
      if (triggerCount >= 2) {
        contextualSuggested.push({
          label: section.label,
          reason: section.suggestion,
          strength: triggerCount >= 4 ? 'strong' : 'moderate'
        });
      }
    }
  }

  // Detect multi-method sections (Method 1, Method 2, etc.)
  const methodSections = h2Texts.filter(t =>
    /method\s+\d|option\s+\d|way\s+\d|approach\s+\d/i.test(t)
  );
  if (methodSections.length >= 2) {
    contextualFound.push(`${methodSections.length} Method sections`);
  }

  const allFound = [...coreFound, ...contextualFound];

  // Score: core missing = penalty, CloudFuze missing = smaller penalty
  let score = 100;
  score -= coreMissing.length * 25;
  if (!hasCloudFuze) score -= 10;
  const strongSuggestions = contextualSuggested.filter(s => s.strength === 'strong');
  score -= strongSuggestions.length * 5;

  const details = [];
  if (coreMissing.length > 0) {
    details.push(`Missing core sections: ${coreMissing.join(', ')}.`);
  }
  if (!hasCloudFuze) {
    details.push('No CloudFuze mention found — add brand positioning in conclusion or standalone section.');
  }
  if (allFound.length > 0) {
    details.push(`Found: ${allFound.join(', ')}.`);
  }
  if (contextualSuggested.length > 0) {
    details.push(`Suggested additions: ${contextualSuggested.map(s => s.label).join(', ')}.`);
  }

  let suggestionText = '';
  let suggestionPriority = null;

  if (coreMissing.length > 0) {
    suggestionText += `Add missing core sections: ${coreMissing.join(', ')}. `;
    suggestionPriority = 'CRITICAL';
  }
  if (!hasCloudFuze) {
    suggestionText += 'Add CloudFuze positioning — either as a standalone section or naturally within the conclusion. ';
    if (!suggestionPriority) suggestionPriority = 'RECOMMENDED';
  }
  if (contextualSuggested.length > 0) {
    const suggestions = contextualSuggested.map(s => `"${s.label}" — ${s.reason}`);
    suggestionText += `Consider adding: ${suggestions.join(' | ')}`;
    if (!suggestionPriority) suggestionPriority = strongSuggestions.length > 0 ? 'RECOMMENDED' : 'NICE_TO_HAVE';
  }

  return {
    passed: coreMissing.length === 0 && hasCloudFuze,
    score: Math.max(0, Math.min(100, score)),
    category: 'structure',
    details: details.join(' '),
    found: allFound,
    missing: coreMissing,
    suggested: contextualSuggested.map(s => ({ label: s.label, reason: s.reason })),
    contentType: contentContext.detectedType,
    suggestion: suggestionText ? {
      priority: suggestionPriority,
      text: suggestionText.trim(),
      guideline: 'CSABF: Core Sections + Contextual Sections'
    } : null
  };
}

// ─── CHECK: Introduction (120–150 words, max 3 paragraphs) ─────────────────

function checkIntroduction(html, plainText) {
  const headings = extractHeadings(html);
  const sections = extractSections(html);

  // Introduction is content before the first H2 (after H1)
  let introText = '';
  const h1Index = headings.findIndex(h => h.level === 1);

  if (sections.length > 0 && h1Index >= 0) {
    // Get text from H1 section (before first H2)
    const h1Section = sections.find(s => s.headingLevel === 1);
    if (h1Section) {
      introText = h1Section.text;
    }
  } else {
    // Fallback: get first few paragraphs
    const paragraphs = extractParagraphs(html, 'html');
    introText = paragraphs.slice(0, 3).join(' ');
  }

  const introWords = countWords(introText);
  const introParagraphs = introText.split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z])/).filter(p => p.trim().length > 10);
  const { min, max } = { min: 120, max: 150 };
  const issues = [];

  if (introWords < min) {
    issues.push(`Introduction is ${introWords} words. CSABF requires ${min}–${max} words.`);
  } else if (introWords > max + 30) {
    issues.push(`Introduction is ${introWords} words. CSABF recommends ${min}–${max} words. Trim to stay focused.`);
  }

  if (introParagraphs.length > 3) {
    issues.push(`Introduction has ${introParagraphs.length} paragraphs. CSABF allows max 3.`);
  }

  const score = introWords >= min && introWords <= max + 30
    ? (issues.length === 0 ? 100 : 70)
    : Math.max(20, 100 - Math.abs(introWords - min) * 0.5);

  return {
    passed: issues.length === 0 && introWords >= min && introWords <= max + 30,
    score: Math.round(Math.max(0, Math.min(100, score))),
    category: 'structure',
    details: issues.length === 0
      ? `Introduction is ${introWords} words across ${introParagraphs.length} paragraph(s). Meets CSABF requirements.`
      : issues.join(' '),
    metrics: { wordCount: introWords, paragraphCount: introParagraphs.length },
    suggestion: issues.length > 0 ? {
      priority: 'RECOMMENDED',
      text: issues.join(' ') + ' Structure: Para 1 = Problem context, Para 2 = Why it matters, Para 3 = What this guide covers.',
      guideline: 'CSABF: Introduction 120–150 words, max 3 paragraphs'
    } : null
  };
}

// ─── CHECK: Paragraph Length (max 5 lines) ──────────────────────────────────

function checkParagraphLength(html, contentType) {
  const paragraphs = extractParagraphs(html, contentType);
  const longParagraphs = [];
  let totalSentences = 0;

  paragraphs.forEach((para, index) => {
    const sentences = countSentences(para);
    totalSentences += sentences;
    if (sentences > 5) {
      longParagraphs.push({ index: index + 1, sentences, text: para.substring(0, 100) + '...' });
    }
  });

  const avgSentences = paragraphs.length > 0
    ? (totalSentences / paragraphs.length).toFixed(1)
    : 0;

  const passRate = paragraphs.length > 0
    ? ((paragraphs.length - longParagraphs.length) / paragraphs.length) * 100
    : 0;

  return {
    passed: longParagraphs.length === 0,
    score: Math.round(passRate),
    category: 'readability',
    details: longParagraphs.length === 0
      ? `All ${paragraphs.length} paragraphs are within the 5-line CSABF limit (avg ${avgSentences} sentences).`
      : `${longParagraphs.length} of ${paragraphs.length} paragraphs exceed CSABF's 5-line/sentence limit. Avg: ${avgSentences} sentences.`,
    longParagraphs,
    suggestion: longParagraphs.length > 0 ? {
      priority: 'CRITICAL',
      text: `CSABF Rule: Max 5 lines per paragraph. ${longParagraphs.length} paragraph(s) exceed this (${longParagraphs.map(p => '#' + p.index).join(', ')}). Break them up.`,
      guideline: 'CSABF: Paragraph Max 5 Lines'
    } : null
  };
}

// ─── CHECK: Paragraph Word Limit (no paragraph over 120 words) ─────────────

function checkParagraphWordLimit(html, contentType) {
  const paragraphs = extractParagraphs(html, contentType);
  const overLimit = [];

  paragraphs.forEach((para, index) => {
    const wc = countWords(para);
    if (wc > 120) {
      overLimit.push({ index: index + 1, wordCount: wc });
    }
  });

  const passRate = paragraphs.length > 0
    ? ((paragraphs.length - overLimit.length) / paragraphs.length) * 100
    : 100;

  return {
    passed: overLimit.length === 0,
    score: Math.round(passRate),
    category: 'readability',
    details: overLimit.length === 0
      ? `All paragraphs are under the 120-word CSABF limit.`
      : `${overLimit.length} paragraph(s) exceed 120 words: ${overLimit.map(p => `#${p.index} (${p.wordCount}w)`).join(', ')}.`,
    overLimit,
    suggestion: overLimit.length > 0 ? {
      priority: 'CRITICAL',
      text: `CSABF Rule: No paragraph over 120 words. ${overLimit.length} paragraph(s) exceed this limit. Split into smaller, focused blocks.`,
      guideline: 'CSABF: No Paragraph Over 120 Words'
    } : null
  };
}

// ─── CHECK: Bullet Lists (at least 2) ─────────────────────────────────────

function checkBulletLists(html, plainText) {
  const lists = extractLists(html);
  const bulletLists = lists.filter(l => l.type === 'bullet');

  // Also detect markdown-style bullets in plain text
  const markdownBullets = (plainText.match(/^[\s]*[-*]\s+/gm) || []).length;
  const totalBulletLists = Math.max(bulletLists.length, markdownBullets >= 6 ? 2 : markdownBullets >= 3 ? 1 : 0);
  const effectiveBulletLists = bulletLists.length || totalBulletLists;

  const { minBulletLists } = CSABF_FORMATTING;
  const issues = [];

  if (effectiveBulletLists < minBulletLists) {
    issues.push(`Only ${effectiveBulletLists} bullet list(s) found. CSABF requires at least ${minBulletLists}.`);
  }

  // Check for comma-separated prose that should be lists
  const proseListPatterns = plainText.match(/(\w+,\s+){2,}\w+/g) || [];
  if (proseListPatterns.length > 0) {
    issues.push(`${proseListPatterns.length} potential list(s) written as comma-separated prose. Convert to bullet points.`);
  }

  const score = effectiveBulletLists >= minBulletLists
    ? (proseListPatterns.length === 0 ? 100 : 80)
    : Math.max(0, Math.round((effectiveBulletLists / minBulletLists) * 60));

  return {
    passed: effectiveBulletLists >= minBulletLists && proseListPatterns.length === 0,
    score,
    category: 'readability',
    details: issues.length === 0
      ? `Good: ${effectiveBulletLists} bullet list(s) found (CSABF minimum: ${minBulletLists}).`
      : issues.join(' '),
    bulletListCount: effectiveBulletLists,
    suggestion: issues.length > 0 ? {
      priority: 'CRITICAL',
      text: issues.join(' ') + ' Bullet lists improve AI extractability and scannability.',
      guideline: 'CSABF: At Least 2 Bullet Lists'
    } : null
  };
}

// ─── CHECK: Numbered Lists (context-aware) ────────────────────────────────

function checkNumberedLists(html, contentContext) {
  const lists = extractLists(html);
  const numberedLists = lists.filter(l => l.type === 'numbered');
  const { minNumberedLists } = CSABF_FORMATTING;
  const hasList = numberedLists.length >= minNumberedLists;

  // If content is procedural, numbered lists are critical
  // If not procedural, numbered lists are recommended but not critical
  const isProcedural = contentContext.isProcedural;

  if (hasList) {
    return {
      passed: true,
      score: 100,
      category: 'readability',
      details: `Good: ${numberedLists.length} numbered list(s) found.`,
      numberedListCount: numberedLists.length,
      suggestion: null
    };
  }

  return {
    passed: !isProcedural,  // Only fail if content is procedural and no numbered list
    score: isProcedural ? 20 : 60,
    category: 'readability',
    details: isProcedural
      ? `No numbered lists found. Your content describes a process — numbered steps are essential for AI extraction and readability.`
      : `No numbered lists found. Consider using numbered lists for any sequential information to improve structure.`,
    numberedListCount: 0,
    suggestion: {
      priority: isProcedural ? 'CRITICAL' : 'RECOMMENDED',
      text: isProcedural
        ? 'Your content describes a procedure. Add a numbered list with 3–6 steps (60–100 words each). Numbered steps trigger HowTo schema and are favored by AI engines.'
        : 'Consider adding a numbered list where you have sequential or prioritized information. This improves readability and AI extractability.',
      guideline: 'CSABF: Numbered Lists for Procedural Content'
    }
  };
}

// ─── CHECK: Platform Mentions (8–12) ───────────────────────────────────────

function checkPlatformMentions(plainText) {
  const count = countPlatformMentions(plainText);
  const { min, max } = CSABF_FORMATTING.platformMentions;
  const issues = [];

  // Platform mentions are contextual — not all blogs are about specific platforms
  if (count < min && count > 0) {
    issues.push(`${count} platform mentions found. For platform-specific content, aim for ${min}–${max}. If your blog isn't platform-specific, this is fine.`);
  } else if (count === 0) {
    issues.push(`No platform mentions found. If your blog discusses specific platforms, mention them ${min}–${max} times.`);
  } else if (count > max) {
    issues.push(`${count} platform mentions found. Consider reducing to ${min}–${max} to avoid keyword stuffing.`);
  }

  const score = count >= min && count <= max
    ? 100
    : count === 0
      ? 50  // softer penalty — might not be platform content
      : count < min
        ? Math.max(40, Math.round((count / min) * 80))
        : Math.max(60, 100 - (count - max) * 5);

  return {
    passed: count >= min && count <= max,
    score,
    category: 'seo',
    details: count >= min && count <= max
      ? `Platform mentions (${count}) within target range of ${min}–${max}.`
      : count === 0
        ? 'No platform mentions found. This is fine for non-platform-specific content.'
        : issues.join(' '),
    mentionCount: count,
    target: `${min}–${max}`,
    suggestion: (count === 0 || count < min) ? {
      priority: 'NICE_TO_HAVE',
      text: issues.join(' '),
      guideline: 'CSABF: Platform Mentions (contextual — depends on topic)'
    } : count > max ? {
      priority: 'RECOMMENDED',
      text: issues.join(' '),
      guideline: 'CSABF: Platform Mentions — avoid keyword stuffing'
    } : null
  };
}

// ─── CHECK: Definition Block (40–60 words in "What is" section) ────────────

function checkDefinitionBlock(html, contentContext) {
  const sections = extractSections(html);
  const whatIsSection = sections.find(s =>
    /what\s+is/i.test(s.heading) && s.headingLevel === 2
  );

  // "What is" section is now CONTEXTUAL — not every blog needs one
  // For action-oriented/how-to content, it's recommended but not critical
  if (!whatIsSection) {
    const isActionOriented = contentContext &&
      (contentContext.isProcedural || contentContext.isMultiMethod || contentContext.detectedType === 'how-to' || contentContext.detectedType === 'multi-method');

    return {
      passed: isActionOriented,  // Pass for action-oriented content
      score: isActionOriented ? 60 : 30,
      category: 'ai_citation',
      details: isActionOriented
        ? 'No "What is" section — acceptable for action-oriented content. Consider adding one for better AI snippet extraction.'
        : 'No "What is [Topic]" section found. Adding a definition block helps AI engines cite your content.',
      suggestion: {
        priority: isActionOriented ? 'NICE_TO_HAVE' : 'RECOMMENDED',
        text: isActionOriented
          ? 'Your content is action-oriented and works without a definition section. However, a brief "What is [Topic]" with a 40–60 word definition can boost AI citations.'
          : 'Consider adding a "What is [Topic]" H2 with a 40–60 word definition. AI engines extract these for citations.',
        guideline: 'CSABF: Definition Block (Contextual)'
      }
    };
  }

  const definition = detectDefinitionBlock(whatIsSection.text);
  const issues = [];

  if (!definition.found) {
    issues.push('No clear definition pattern found in the "What is" section. Start with "[Topic] is/refers to..." pattern.');
  }
  if (!definition.inFirst60Words) {
    issues.push('Definition should appear within the first 60 words of the section.');
  }

  const score = definition.found && definition.inFirst60Words ? 100
    : definition.found ? 70
    : 30;

  return {
    passed: definition.found && definition.inFirst60Words,
    score,
    category: 'ai_citation',
    details: definition.found && definition.inFirst60Words
      ? 'Clear definition block found within first 60 words of "What is" section.'
      : issues.join(' '),
    suggestion: issues.length > 0 ? {
      priority: 'RECOMMENDED',
      text: issues.join(' ') + ' A clear 40–60 word definition block helps AI engines extract and cite your content.',
      guideline: 'CSABF: Definition Block for AI Citation'
    } : null
  };
}

// ─── CHECK: FAQ Section (4–7 questions, concise answers) ────────────────────

function checkFAQSection(html, plainText) {
  const faqAnalysis = analyzeFAQSection(plainText, html);
  const headings = extractHeadings(html);
  const faqHeading = headings.find(h =>
    h.level === 2 && /faq|frequently\s+asked/i.test(h.text)
  );

  const issues = [];

  if (!faqHeading) {
    issues.push('No FAQ H2 section found. CSABF requires a dedicated FAQ section.');
  }

  if (faqAnalysis.questionCount < 4) {
    issues.push(`Only ${faqAnalysis.questionCount} FAQ questions found. CSABF requires 4–7.`);
  } else if (faqAnalysis.questionCount > 7) {
    issues.push(`${faqAnalysis.questionCount} FAQ questions found. CSABF recommends 4–7. Consider trimming.`);
  }

  // Only warn on excessively long answers — no strict word count enforcement
  const longAnswers = faqAnalysis.answerWordCounts.filter(wc => wc > 80).length;

  if (longAnswers > 0) {
    issues.push(`${longAnswers} FAQ answer(s) exceed 80 words. Keep answers concise for better AI extraction.`);
  }

  let score = 100;
  if (!faqHeading) score -= 40;
  if (faqAnalysis.questionCount < 4) score -= 30;
  if (faqAnalysis.questionCount > 7) score -= 10;
  if (longAnswers > 0) score -= longAnswers * 5;

  return {
    passed: issues.length === 0 && faqHeading,
    score: Math.max(0, score),
    category: 'seo',
    details: issues.length === 0
      ? `FAQ section present with ${faqAnalysis.questionCount} questions. Answers are concise.`
      : issues.join(' '),
    questionCount: faqAnalysis.questionCount,
    suggestion: issues.length > 0 ? {
      priority: 'CRITICAL',
      text: issues.join(' ') + ' FAQ schema is mandatory for AI search visibility.',
      guideline: 'CSABF: FAQs — 4–7 Questions, concise answers'
    } : null
  };
}

// ─── CHECK: Internal Links (3–5, descriptive anchors) ─────────────────────

function checkInternalLinks(html) {
  const links = extractLinks(html);
  const genericAnchors = ['click here', 'read more', 'here', 'this', 'link', 'learn more'];
  const genericLinks = links.filter(l => genericAnchors.includes(l.text.toLowerCase().trim()));
  const issues = [];

  const { min, max } = { min: 3, max: 5 };

  if (links.length === 0) {
    issues.push(`No links found. CSABF requires ${min}–${max} internal links.`);
  } else if (links.length < min) {
    issues.push(`Only ${links.length} link(s) found. CSABF requires ${min}–${max} internal links.`);
  } else if (links.length > max + 2) {
    issues.push(`${links.length} links found. CSABF recommends ${min}–${max}. Too many may dilute link equity.`);
  }

  if (genericLinks.length > 0) {
    issues.push(`${genericLinks.length} link(s) use generic anchor text. CSABF requires descriptive anchors.`);
  }

  const score = links.length === 0 ? 0
    : Math.max(0, 100 - (links.length < min ? 30 : 0) - (links.length > max + 2 ? 15 : 0) - genericLinks.length * 20);

  return {
    passed: links.length >= min && links.length <= max + 2 && genericLinks.length === 0,
    score,
    category: 'seo',
    details: issues.length === 0
      ? `Good: ${links.length} links with descriptive anchor text (CSABF range: ${min}–${max}).`
      : issues.join(' '),
    linkCount: links.length,
    suggestion: issues.length > 0 ? {
      priority: 'RECOMMENDED',
      text: issues.join(' ') + ' Use anchor text like "See our cloud migration guide" instead of "click here".',
      guideline: 'CSABF: 3–5 Internal Links, Descriptive Anchors'
    } : null
  };
}

// ─── CHECK: Link Types (migration, comparison, SaaS management) ────────────

function checkLinkTypes(html) {
  const links = extractLinks(html);
  const linkTexts = links.map(l => (l.text + ' ' + l.url).toLowerCase());

  // These are suggestions, not requirements — depends on content topic
  const suggestedTypes = [
    { type: 'migration', patterns: [/migrat/i, /transfer/i, /move/i], label: 'Related migration page' },
    { type: 'comparison', patterns: [/compar/i, /vs\b/i, /versus/i, /alternative/i], label: 'Platform comparison page' },
    { type: 'saas', patterns: [/saas/i, /management/i, /admin/i, /governance/i], label: 'SaaS management page' }
  ];

  const found = [];
  const notFound = [];

  for (const req of suggestedTypes) {
    const hasLink = linkTexts.some(lt => req.patterns.some(p => p.test(lt)));
    if (hasLink) {
      found.push(req.label);
    } else {
      notFound.push(req.label);
    }
  }

  // Score is generous — this is optional based on content topic
  const score = found.length >= 1 ? 100 : links.length >= 3 ? 70 : links.length > 0 ? 50 : 30;

  return {
    passed: found.length >= 1 || links.length >= 3,
    score,
    category: 'seo',
    details: found.length > 0
      ? `Link types found: ${found.join(', ')}.${notFound.length > 0 ? ` Consider adding: ${notFound.join(', ')} (if relevant to your topic).` : ''}`
      : links.length > 0
        ? `${links.length} link(s) found but no specific topic-cluster links detected. Consider linking to related CloudFuze pages if relevant.`
        : 'No links found. Add internal links to related content.',
    found,
    notFound,
    suggestion: found.length === 0 && links.length > 0 ? {
      priority: 'NICE_TO_HAVE',
      text: `Consider adding topic-relevant internal links (e.g., ${notFound.slice(0, 2).join(', ')}) to strengthen your topic cluster — only if relevant to your content.`,
      guideline: 'CSABF: Topic-Cluster Links (Contextual)'
    } : null
  };
}

// ─── CHECK: Readability ─────────────────────────────────────────────────────

function checkReadability(plainText) {
  const sentences = plainText.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const words = countWords(plainText);
  const avgWordsPerSentence = sentences.length > 0 ? words / sentences.length : 0;

  const passiveCount = detectPassiveVoice(plainText);
  const passiveRate = sentences.length > 0 ? (passiveCount / sentences.length) * 100 : 0;

  // Sentence length variance
  const sentenceLengths = sentences.map(s => countWords(s));
  const avgLen = sentenceLengths.reduce((a, b) => a + b, 0) / (sentenceLengths.length || 1);
  const variance = sentenceLengths.reduce((sum, len) => sum + Math.pow(len - avgLen, 2), 0) / (sentenceLengths.length || 1);
  const hasVariance = Math.sqrt(variance) > 3;

  // Conversational tone indicators
  const hasYou = /\byou\b|\byour\b/i.test(plainText);

  let score = 100;
  const issues = [];

  if (avgWordsPerSentence > 25) {
    score -= 25;
    issues.push(`Average sentence length is ${avgWordsPerSentence.toFixed(0)} words — aim for under 20.`);
  }
  if (passiveRate > 20) {
    score -= 20;
    issues.push(`${passiveRate.toFixed(0)}% passive voice detected — use active voice more.`);
  }
  if (!hasVariance) {
    score -= 15;
    issues.push('Sentence lengths are too uniform. Mix short, punchy sentences with longer ones.');
  }
  if (!hasYou) {
    score -= 15;
    issues.push('No "you/your" found. Address the reader directly for a conversational tone.');
  }

  return {
    passed: score >= 70,
    score: Math.max(0, score),
    category: 'readability',
    details: issues.length === 0
      ? 'Good readability: conversational tone, active voice, varied sentence lengths.'
      : issues.join(' '),
    metrics: { avgWordsPerSentence: avgWordsPerSentence.toFixed(1), passiveRate: passiveRate.toFixed(0), hasVariance, hasYou },
    suggestion: issues.length > 0 ? {
      priority: 'RECOMMENDED',
      text: issues.join(' '),
      guideline: 'CSABF: Conversational Tone & Readability'
    } : null
  };
}

// ─── CHECK: Marketing Tone ──────────────────────────────────────────────────

function checkMarketingTone(plainText) {
  const result = detectMarketingTone(plainText);

  return {
    passed: !result.isMarketing,
    score: result.isMarketing ? 30 : (result.count > 0 ? 70 : 100),
    category: 'ai_citation',
    details: result.isMarketing
      ? `Marketing-heavy tone detected (${result.count} signals: ${result.signals.slice(0, 3).join(', ')}${result.count > 3 ? '...' : ''}). CSABF prohibits aggressive marketing language.`
      : result.count > 0
        ? `Minor marketing language found (${result.count} signal(s)). Keep content task-oriented.`
        : 'Good: No marketing-heavy language detected. Content is task-oriented.',
    signals: result.signals,
    suggestion: result.count > 0 ? {
      priority: result.isMarketing ? 'CRITICAL' : 'NICE_TO_HAVE',
      text: `${result.count} marketing signal(s) found: ${result.signals.join(', ')}. CSABF requires task-oriented content without aggressive CTAs or sales language. This affects AI citation visibility.`,
      guideline: 'CSABF: No Marketing-Heavy Tone (AI Citation Rule)'
    } : null
  };
}

// ─── CHECK: Task Orientation ────────────────────────────────────────────────

function checkTaskOrientation_check(plainText) {
  const score = checkTaskOrientation(plainText);

  // Task orientation is important for how-to content but not for all types
  // Educational, comparison, and general content can have lower task orientation
  return {
    passed: score >= 40,  // more lenient baseline
    score: Math.min(100, score + 10),  // slight boost — not every blog is procedural
    category: 'ai_citation',
    details: score >= 80
      ? 'Excellent task orientation. Content is procedural and actionable.'
      : score >= 60
        ? 'Good task orientation with actionable elements.'
        : score >= 40
          ? 'Content is informational rather than procedural. This is fine for educational/comparison content.'
          : 'Content is very high-level. If this is a how-to blog, add specific steps and instructions.',
    suggestion: score < 40 ? {
      priority: 'RECOMMENDED',
      text: 'If this content is meant to guide users through a process, add specific steps, UI instructions, and actionable guidance. For educational content, this is less critical.',
      guideline: 'CSABF: Task Orientation (contextual — depends on content type)'
    } : null
  };
}

// ─── CHECK: AI Citation Readiness (context-aware composite) ─────────────────

function checkAICitationReadiness(html, plainText, contentContext) {
  const sections = extractSections(html);
  const lists = extractLists(html);
  const headings = extractHeadings(html);
  const issues = [];
  const strengths = [];

  // 1. Clear definition block (contextual — not always needed)
  const whatIsSection = sections.find(s => /what\s+is/i.test(s.heading));
  if (whatIsSection) {
    strengths.push('Definition block present for AI extraction.');
  } else if (contentContext.isProcedural || contentContext.isMultiMethod) {
    // Action-oriented content doesn't always need a definition — mild suggestion
    // (don't count as issue)
    strengths.push('Action-oriented content — definition section optional.');
  } else {
    issues.push('Consider adding a "What is" section with a definition block. AI engines use 40–60 word definitions for citations.');
  }

  // 1b. Key Takeaways (strong AI signal)
  const hasTakeaways = /key\s+takeaway/i.test(plainText) || headings.some(h => /takeaway/i.test(h.text));
  if (hasTakeaways) {
    strengths.push('Key takeaways present — AI engines extract these prominently.');
  }

  // 2. Structured steps (only critical if content is procedural)
  const numberedLists = lists.filter(l => l.type === 'numbered');
  if (numberedLists.length > 0) {
    strengths.push('Structured numbered steps found.');
  } else if (contentContext.isProcedural) {
    issues.push('Your content describes a process but has no numbered steps. Add a step-by-step list for AI to extract.');
  }

  // 3. Bullet summaries (always helpful)
  const bulletLists = lists.filter(l => l.type === 'bullet');
  if (bulletLists.length >= 2) {
    strengths.push('Good use of bullet summaries.');
  } else {
    issues.push('Add more bullet lists to summarize key points. AI engines extract bullet content for citations.');
  }

  // 4. Marketing tone check (always important)
  const marketing = detectMarketingTone(plainText);
  if (marketing.isMarketing) {
    issues.push('Marketing-heavy tone detected. AI engines deprioritize promotional content for citations.');
  } else {
    strengths.push('Clean, non-promotional tone.');
  }

  // 5. FAQ presence (always important)
  const hasFAQ = headings.some(h => /faq|frequently/i.test(h.text));
  if (hasFAQ) {
    strengths.push('FAQ section present for snippet extraction.');
  } else {
    issues.push('No FAQ section found. FAQ content is directly pulled into AI search results.');
  }

  // 6. Task orientation (weighted by content type)
  const taskScore = checkTaskOrientation(plainText);
  if (taskScore >= 60) {
    strengths.push('Content is task-oriented and actionable.');
  } else if (contentContext.isProcedural && taskScore < 50) {
    issues.push('Content describes a process but lacks specific actionable instructions. Add concrete steps, UI references, and click-by-click guidance.');
  } else if (taskScore < 40) {
    issues.push('Content is too generic. Add specific, actionable information to increase AI citation probability.');
  }

  const citationScore = Math.max(0, Math.min(100, 100 - issues.length * 15 + strengths.length * 3));

  return {
    passed: issues.length <= 1,
    score: citationScore,
    category: 'ai_citation',
    details: issues.length === 0
      ? `Excellent AI citation readiness. Strengths: ${strengths.join(' ')}`
      : issues.length <= 2
        ? `Good foundation. ${strengths.length > 0 ? 'Strengths: ' + strengths.join(' ') + ' ' : ''}Improve: ${issues.join(' ')}`
        : `AI citation issues: ${issues.join(' ')}`,
    issues,
    strengths,
    suggestion: issues.length > 1 ? {
      priority: 'CRITICAL',
      text: `${issues.length} AI citation issues: ${issues.join(' ')}`,
      guideline: 'CSABF: AI-Citation Optimization Rules'
    } : issues.length === 1 ? {
      priority: 'RECOMMENDED',
      text: issues[0],
      guideline: 'CSABF: AI-Citation Optimization Rules'
    } : null
  };
}

// ─── CHECK: Schema-Friendly Format ──────────────────────────────────────────

function checkSchemaFriendly(html) {
  const lists = extractLists(html);
  const tables = extractTables(html);
  const headings = extractHeadings(html);

  let score = 0;
  const features = [];
  const missing = [];

  // Article schema signals
  if (headings.length >= 3) { score += 20; features.push('good heading hierarchy'); }
  else missing.push('Need more headings for Article schema');

  // FAQ schema signals
  const faqPattern = headings.some(h => /faq|question/i.test(h.text));
  if (faqPattern) { score += 30; features.push('FAQ section detected (FAQ schema eligible)'); }
  else missing.push('FAQ schema: Add a dedicated FAQ section');

  // HowTo schema signals
  const hasSteps = lists.some(l => l.type === 'numbered' && l.items.length >= 3);
  if (hasSteps) { score += 25; features.push('Numbered steps detected (HowTo schema eligible)'); }
  else missing.push('HowTo schema: Add numbered steps (3+)');

  // Lists
  if (lists.length > 0) { score += 15; features.push(`${lists.length} list(s)`); }

  // Tables
  if (tables.length > 0) { score += 10; features.push(`${tables.length} table(s)`); }

  return {
    passed: score >= 60,
    score: Math.min(100, score),
    category: 'structure',
    details: features.length > 0
      ? `Schema-friendly elements found: ${features.join(', ')}.${missing.length > 0 ? ' Missing: ' + missing.join('; ') : ''}`
      : 'No schema-friendly elements found.',
    schemas: {
      article: headings.length >= 3,
      faq: faqPattern,
      howTo: hasSteps
    },
    suggestion: missing.length > 0 ? {
      priority: missing.length >= 2 ? 'CRITICAL' : 'RECOMMENDED',
      text: `CSABF mandates Article + FAQ schema. ${missing.join('. ')}. HowTo schema is optional but recommended for procedural content.`,
      guideline: 'CSABF: Schema Requirements (Article + FAQ Mandatory)'
    } : null
  };
}

// ─── CHECK: Section Length (only warns on max — no minimums) ────────────────

function checkSectionWordCounts(html) {
  const sections = extractSections(html);
  const issues = [];
  const sectionResults = [];

  // Only warn on max — no strict minimums
  const sectionChecks = [
    { pattern: /what\s+is/i, label: 'What is [Topic]', warnMax: 300 },
    { pattern: /why\s+(it\s+)?matter/i, label: 'Why It Matters', warnMax: 350 },
    { pattern: /step.?by.?step|how\s+to|process|guide|getting\s+started/i, label: 'Step-by-Step Process', warnMax: 800 },
    { pattern: /common\s+issues|limitations|troubleshoot/i, label: 'Common Issues', warnMax: 400 },
    { pattern: /best\s+practices|tips|recommendations/i, label: 'Best Practices', warnMax: 350 },
    { pattern: /faq|frequently/i, label: 'FAQs', warnMax: 500 },
    { pattern: /how\s+cloudfuze|cloudfuze\s+helps/i, label: 'How CloudFuze Helps', warnMax: 300 },
    { pattern: /conclusion|summary|final|wrap/i, label: 'Conclusion', warnMax: 250 }
  ];

  for (const check of sectionChecks) {
    const section = sections.find(s => check.pattern.test(s.heading) && s.headingLevel === 2);
    if (section) {
      const overMax = section.wordCount > check.warnMax;
      const result = {
        label: check.label,
        wordCount: section.wordCount,
        warnMax: check.warnMax,
        status: overMax ? 'warn' : 'ok'
      };
      sectionResults.push(result);
      if (overMax) {
        issues.push(`"${check.label}" is ${section.wordCount}w (max ~${check.warnMax}w). Consider trimming for focus.`);
      }
    }
  }

  // If no recognized sections found, still show a decent score
  if (sectionResults.length === 0) {
    return {
      passed: true,
      score: 80,
      category: 'structure',
      details: 'No standard CSABF section names detected. Your content may use custom headings — that\'s fine. Standard names like "FAQs", "Conclusion" help with AI extraction.',
      sectionResults: [],
      suggestion: {
        priority: 'NICE_TO_HAVE',
        text: 'Consider using recognizable H2 names like "FAQs", "Conclusion" — AI engines look for these patterns.',
        guideline: 'CSABF: Section naming helps AI extraction'
      }
    };
  }

  const warnCount = sectionResults.filter(r => r.status === 'warn').length;
  const score = warnCount === 0 ? 100 : Math.max(60, 100 - (warnCount * 15));

  return {
    passed: warnCount === 0,
    score,
    category: 'structure',
    details: issues.length === 0
      ? `All ${sectionResults.length} detected sections are within recommended length.`
      : `${issues.length} section(s) may be too long: ${issues.join(' ')}`,
    sectionResults,
    suggestion: issues.length > 0 ? {
      priority: 'NICE_TO_HAVE',
      text: issues.join(' '),
      guideline: 'CSABF: Keep sections focused — only flagged if over max'
    } : null
  };
}

// ─── VISUAL RECOMMENDATIONS ─────────────────────────────────────────────────

function generateVisualRecommendations(plainText, html, wordCount) {
  const recommendations = [];

  // Hero image
  recommendations.push({
    type: 'image',
    name: 'Hero / Featured Image',
    description: 'Add an attention-grabbing header image that represents the topic.',
    placement: 'At the top, after the title',
    priority: 'RECOMMENDED'
  });

  // Process / How-to content
  if (hasProcessPattern(plainText)) {
    recommendations.push({
      type: 'infographic',
      name: 'Step-by-Step Infographic',
      description: 'Create a visual diagram showing each step in the process with numbered icons.',
      placement: 'After the Step-by-Step Process section',
      priority: 'RECOMMENDED'
    });
    recommendations.push({
      type: 'image',
      name: 'Screenshot / Tutorial Images',
      description: 'Add annotated screenshots showing the actual interface for each major step.',
      placement: 'Within each step of the tutorial',
      priority: 'RECOMMENDED'
    });
  }

  // Comparison content
  if (hasComparisonPattern(plainText)) {
    recommendations.push({
      type: 'table',
      name: 'Comparison Table',
      description: 'Add a side-by-side comparison table with key differentiators.',
      placement: 'At the comparison section',
      priority: 'CRITICAL'
    });
  }

  // Data / Statistics
  if (hasDataPattern(plainText)) {
    recommendations.push({
      type: 'image',
      name: 'Data Visualization Chart',
      description: 'Visualize the statistics mentioned as a bar chart, pie chart, or line graph.',
      placement: 'Next to the data/statistics paragraph',
      priority: 'RECOMMENDED'
    });
  }

  // Pricing content
  if (hasPricingPattern(plainText)) {
    recommendations.push({
      type: 'table',
      name: 'Pricing Comparison Table',
      description: 'Create a structured pricing table with tiers, features, and prices.',
      placement: 'At the pricing section',
      priority: 'CRITICAL'
    });
  }

  // Features / Benefits
  if (hasFeaturePattern(plainText)) {
    recommendations.push({
      type: 'infographic',
      name: 'Feature Icons Grid',
      description: 'Create a grid layout with icons representing each key feature or benefit.',
      placement: 'At the features/benefits section',
      priority: 'RECOMMENDED'
    });
  }

  // Word count based image recommendations
  if (wordCount > 800) {
    const recommendedImages = Math.ceil(wordCount / 300);
    recommendations.push({
      type: 'image',
      name: 'Additional Supporting Images',
      description: `With ${wordCount} words, include at least ${recommendedImages} images throughout the article to break up text.`,
      placement: 'Distributed evenly throughout the article',
      priority: 'RECOMMENDED'
    });
  }

  // FAQ infographic
  const questionCount = (plainText.match(/\?/g) || []).length;
  if (questionCount > 5) {
    recommendations.push({
      type: 'infographic',
      name: 'FAQ Infographic',
      description: 'Create a visual FAQ layout with question bubbles and concise answers.',
      placement: 'At the FAQ section',
      priority: 'NICE_TO_HAVE'
    });
  }

  return recommendations;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC RELEVANCE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Assign relevance to each check based on detected content type.
 * Relevance levels:
 *   - 'critical':       Always matters, heavily weighted in score
 *   - 'relevant':       Matters for this content type, normal weight
 *   - 'optional':       Nice to have, minimal weight (doesn't penalize much)
 *   - 'not_applicable': Doesn't apply to this content, excluded from scoring
 */
function assignRelevance(checks, contentContext) {
  const type = contentContext.detectedType; // general, how-to, comparison, troubleshooting, educational, multi-method

  // Universal checks — always critical regardless of content type (totalWordCount removed — only warns on max)
  const alwaysCritical = ['h1Structure', 'paragraphLength', 'paragraphWordLimit', 'readability', 'marketingTone'];

  // Universal relevant (totalWordCount + sectionWordCounts are informational, not strict)
  const alwaysRelevant = ['introduction', 'bulletLists', 'aiCitationReadiness', 'schemaFriendly', 'totalWordCount', 'sectionWordCounts'];

  // Define per-type relevance overrides
  const typeRelevance = {
    'how-to': {
      critical: ['numberedLists', 'taskOrientation', 'h2Structure'],
      relevant: ['csabfSections', 'definitionBlock', 'faqSection', 'h3Structure', 'keyTakeaways', 'internalLinks', 'cloudFuzePositioning'],
      optional: ['platformMentions', 'linkTypes'],
    },
    'multi-method': {
      critical: ['h2Structure', 'taskOrientation'],
      relevant: ['numberedLists', 'csabfSections', 'faqSection', 'h3Structure', 'keyTakeaways', 'internalLinks', 'cloudFuzePositioning'],
      optional: ['platformMentions', 'linkTypes', 'definitionBlock'],
    },
    'comparison': {
      critical: ['h2Structure'],
      relevant: ['csabfSections', 'definitionBlock', 'faqSection', 'h3Structure', 'keyTakeaways', 'internalLinks', 'platformMentions', 'cloudFuzePositioning'],
      optional: ['numberedLists', 'taskOrientation', 'linkTypes'],
    },
    'troubleshooting': {
      critical: ['h2Structure', 'numberedLists'],
      relevant: ['csabfSections', 'faqSection', 'h3Structure', 'keyTakeaways', 'taskOrientation', 'internalLinks', 'cloudFuzePositioning'],
      optional: ['definitionBlock', 'platformMentions', 'linkTypes'],
    },
    'educational': {
      critical: ['h2Structure', 'definitionBlock'],
      relevant: ['csabfSections', 'faqSection', 'h3Structure', 'keyTakeaways', 'internalLinks', 'cloudFuzePositioning'],
      optional: ['numberedLists', 'taskOrientation', 'platformMentions', 'linkTypes'],
    },
    'general': {
      critical: ['h2Structure'],
      relevant: ['csabfSections', 'faqSection', 'h3Structure', 'keyTakeaways', 'internalLinks', 'cloudFuzePositioning'],
      optional: ['numberedLists', 'taskOrientation', 'definitionBlock', 'platformMentions', 'linkTypes'],
    }
  };

  const overrides = typeRelevance[type] || typeRelevance['general'];

  for (const [key, check] of Object.entries(checks)) {
    if (alwaysCritical.includes(key)) {
      check.relevance = 'critical';
    } else if (overrides.critical && overrides.critical.includes(key)) {
      check.relevance = 'critical';
    } else if (alwaysRelevant.includes(key)) {
      check.relevance = 'relevant';
    } else if (overrides.relevant && overrides.relevant.includes(key)) {
      check.relevance = 'relevant';
    } else if (overrides.optional && overrides.optional.includes(key)) {
      check.relevance = 'optional';
    } else {
      check.relevance = 'optional';
    }

    // Downgrade suggestion priority for optional checks
    if (check.relevance === 'optional' && check.suggestion) {
      if (check.suggestion.priority === 'CRITICAL') {
        check.suggestion.priority = 'NICE_TO_HAVE';
      }
    }
  }

  return checks;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORING & AGGREGATION (Dynamic — weighted by relevance)
// ═══════════════════════════════════════════════════════════════════════════════

function calculateCategoryScores(checks) {
  const categories = {
    structure: { label: 'Content Structure (CSABF)', checks: [], score: 0 },
    readability: { label: 'Readability & Formatting', checks: [], score: 0 },
    seo: { label: 'SEO & Linking', checks: [], score: 0 },
    ai_citation: { label: 'AI Citation Visibility', checks: [], score: 0 },
    visual: { label: 'Visual Content', checks: [], score: 0 }
  };

  // Relevance weights for scoring
  const relevanceWeight = {
    critical: 1.0,
    relevant: 0.8,
    optional: 0.3,
    not_applicable: 0
  };

  for (const [key, check] of Object.entries(checks)) {
    const cat = check.category;
    if (categories[cat]) {
      categories[cat].checks.push({ name: key, ...check });
    }
  }

  for (const cat of Object.values(categories)) {
    if (cat.checks.length > 0) {
      let totalWeight = 0;
      let weightedSum = 0;

      for (const check of cat.checks) {
        const weight = relevanceWeight[check.relevance] || 0.5;
        weightedSum += check.score * weight;
        totalWeight += weight;
      }

      cat.score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    }
  }

  return categories;
}

function collectSuggestions(checks) {
  const suggestions = [];
  for (const [key, check] of Object.entries(checks)) {
    if (check.suggestion) {
      // Include the relevance and check name for the frontend
      suggestions.push({
        ...check.suggestion,
        relevance: check.relevance || 'relevant',
        checkName: key
      });
    }
  }

  // Sort by: relevance first (critical > relevant > optional), then priority
  const relevanceOrder = { critical: 0, relevant: 1, optional: 2, not_applicable: 3 };
  const priorityOrder = { CRITICAL: 0, RECOMMENDED: 1, NICE_TO_HAVE: 2 };
  suggestions.sort((a, b) => {
    const relDiff = (relevanceOrder[a.relevance] || 2) - (relevanceOrder[b.relevance] || 2);
    if (relDiff !== 0) return relDiff;
    return (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9);
  });

  return suggestions;
}
