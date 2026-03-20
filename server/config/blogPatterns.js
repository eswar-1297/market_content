/**
 * CloudFuze Blog Patterns — Derived from analysis of 40 published articles
 * (10 per writer: Bhavani, Pankaj, Aayushi, Rashmi)
 *
 * These patterns are injected into article generation and framework prompts
 * so the AI produces content consistent with how CloudFuze blogs actually work.
 */

export const CLOUDFUZE_BLOG_PATTERNS = {
  // Overall blog statistics
  overview: {
    avgWordCount: 970,
    wordCountRange: '500-1600',
    medianWordCount: 1002,
    faqPresence: '97.5% (39/40 articles)',
    keyTakeawaysPresence: '95% (38/40 articles)',
    cloudfuzeMentionRate: '97.5% (39/40 articles)',
    avgH2Count: 7.2,
    avgH3Count: 6.3,
    tablesUsed: '0% (none in recent articles — but should be added for GEO)',
  },

  // Universal structure across ALL CloudFuze blogs
  universalStructure: `Every CloudFuze blog follows this proven structure:
1. H1 Title — Action-oriented or question-based, includes primary keyword
2. Introduction — 2-3 short paragraphs. Most start with a question hook (78% of articles). Jump straight into why the topic matters. NO generic definitions.
3. Key Takeaways — 3-5 bullet points summarizing the article's main insights. Present in 95% of articles.
4. Body H2 Sections — 6-8 H2s per article. Mix of question-format (43%) and statement headings. Each section is self-contained.
5. CloudFuze Section — Dedicated H2 about how CloudFuze helps/solves the problem. Present in 100% of articles. Placed in the second half of the article.
6. FAQ Section — H3 questions with concise answers. Present in 97.5% of articles. Usually 3-5 FAQs.
7. CTA — Soft call-to-action at the end. "Try CloudFuze", "Get a demo", "Contact us". Present in 97.5% of articles.
NOTE: Articles do NOT have a separate "Conclusion" heading — the CloudFuze section + CTA serves as the closing.`,

  // CloudFuze mention patterns
  cloudfuzeMentions: {
    pattern: 'CloudFuze is mentioned in a dedicated H2 section, not scattered randomly. The dedicated section appears in the second half of the article.',
    h2Patterns: [
      'How CloudFuze Helps/Handles [specific challenge]',
      'CloudFuze: A Trusted Tool for [task]',
      '[Action] with CloudFuze Migrate/Manage',
      'Optimize/Control [thing] with CloudFuze Manage',
      'Why Enterprises Choose CloudFuze',
      'Move/Migrate [X] to [Y] with CloudFuze',
    ],
    rules: [
      'Always have ONE dedicated CloudFuze H2 section — do not skip it',
      'CloudFuze Migrate for migration articles, CloudFuze Manage for SaaS/AI management articles',
      'Position the CloudFuze section after the main educational content, before FAQs',
      'Be specific about which CloudFuze features solve which problems — reference SharePoint docs for accuracy',
      'Avoid marketing fluff — focus on capabilities, not hype',
    ]
  },

  // CTA patterns
  ctaPatterns: {
    style: 'Soft CTA after the CloudFuze section or as the last paragraph. Not pushy.',
    examples: [
      'Contact us today to learn how CloudFuze can help your organization.',
      'Get a free, no-obligation demo of CloudFuze Manage.',
      'Try CloudFuze Migrate for a seamless migration experience.',
      'Schedule a demo to see how CloudFuze simplifies [topic].',
      'Start your free trial of CloudFuze Manage today.',
    ]
  },

  // H1 title patterns
  titlePatterns: {
    questionTitles: '78% of articles use question-based or how-to H1 titles',
    examples: [
      'How can IT Teams Track SaaS Usage, Licenses, and Renewals?',
      'Is Your Enterprise Effectively Tracking Every SaaS App?',
      'How to Migrate Large Google Drive Files Without Data Loss?',
      'Where Does Cost Get Wasted on SaaS? Insights for Businesses',
    ],
    actionTitles: [
      'Copy Timestamps from ShareFile to SharePoint Online',
      'Enterprise Email Migration for Mergers & Acquisitions',
      '5 Ways to Optimize Your SaaS Tool Usage to Reduce Costs',
      'License Optimization 101: Stop Paying for Unused SaaS Seats',
    ]
  }
};

// Per-writer patterns derived from article analysis
export const WRITER_ARTICLE_PATTERNS = {
  bhavani: {
    avgWords: 785,
    avgH2s: 7.2,
    avgH3s: 4.6,
    introStyle: '80% start with question hook. Does NOT use statistics in intro. Jumps straight into the migration challenge.',
    h2Style: 'Question-format H2s (25%). Heavy use of "How CloudFuze..." H2s (22%). Challenge → Solution flow.',
    cfMentionPosition: 'First CloudFuze mention at ~word 133 (early-mid article)',
    cfSectionStyle: 'Uses specific feature descriptions. E.g., "How CloudFuze Handles Long Folder Paths During Egnyte to Google Drive Migration"',
    uniquePatterns: [
      'Heavy use of lists (avg 20 bullet items per article)',
      'No tables in recent articles',
      'FAQ section always present (10/10)',
      'Key Takeaways always present (10/10)',
      'Migration-feature focused: timestamps, folder paths, usernames, file sizes',
      'No Conclusion section — ends with CloudFuze section + CTA',
      'Titles are action-oriented: "Fix", "Copy", "Transfer", "Migrate"',
    ]
  },

  pankaj: {
    avgWords: 800,
    avgH2s: 6.6,
    avgH3s: 3.6,
    introStyle: '80% start with question hook. Uses statistics in 40% of intros (Gartner, industry data). Immediately establishes strategic context.',
    h2Style: 'Mix of numbered steps (15%) and strategic statements. Uses "Background" and "Insights" sections for case-study articles.',
    cfMentionPosition: 'First CloudFuze mention at ~word 166 (mid article)',
    cfSectionStyle: 'Action-oriented: "Align SaaS Spend with CloudFuze Manage", "Move Slack Chat to Teams with CloudFuze", "Get a Free Demo of CloudFuze Manage"',
    uniquePatterns: [
      'Uses numbered H2s for step/strategy articles (e.g., "1. Steps to Track SaaS Usage")',
      'Includes case study articles with "Background" + "Insights" structure',
      'Moderate list usage (avg 12 items per article)',
      'Strong CTA presence (10/10) — often includes "Contact us today"',
      'Covers both Migrate and Manage products',
      'Writes for C-suite: strategic, insight-driven, concise',
      'Titles often question-based: "How can...", "Where Does...", "How Are..."',
    ]
  },

  aayushi: {
    avgWords: 1206,
    avgH2s: 7.8,
    avgH3s: 8.8,
    introStyle: '60% start with question hook. Rarely uses statistics (10%). Focuses on the business problem and why enterprises need the migration.',
    h2Style: 'Mix of "Why" (6%), "How to" (9%), "What" (10%), and step-by-step numbered H2s (14%). Descriptive and detailed.',
    cfMentionPosition: 'First CloudFuze mention at ~word 453 (later in article — focuses on education first)',
    cfSectionStyle: '"CloudFuze: A Trusted Tool for [task]" or "Why Enterprises Choose CloudFuze"',
    uniquePatterns: [
      'Longest articles (avg 1206 words) — most detailed writer',
      'Highest list usage (avg 43 items per article) — very structured',
      'Highest H3 count (avg 8.8) — deep sub-structure within H2s',
      'CloudFuze mentioned later in the article (word 453) — education-first approach',
      'Focus on email migration, tenant migration, Google Workspace, M365',
      'Uses step-by-step numbered H2s: "4-Step Strategy for...", "Step-By-Step Guide..."',
      'Titles use action words: "Easily Move", "Enterprise Guide", "Best Post-Migration Guide"',
    ]
  },

  rashmi: {
    avgWords: 1089,
    avgH2s: 7.3,
    avgH3s: 8.3,
    introStyle: '90% start with question hook. Uses statistics in 40% of intros. Second person POV ("you", "your enterprise").',
    h2Style: 'Question-format H2s dominate (30%). Heavy "What" (15%) and "How" (21%) questions. CloudFuze H2s in 26% of sections.',
    cfMentionPosition: 'First CloudFuze mention at ~word 109 (earliest of all writers)',
    cfSectionStyle: 'Strongest CloudFuze integration: 19/73 H2s mention CloudFuze. Uses "with CloudFuze Manage" pattern frequently.',
    uniquePatterns: [
      'Most frequent CloudFuze mentions — 26% of H2s include CloudFuze',
      'Earliest CloudFuze mention (word 109) — weaves product naturally',
      'Second person POV throughout ("you", "your")',
      'Question-based H2s dominate (30%) — great for AI citability',
      'Focus exclusively on CloudFuze Manage / SaaS governance',
      'Strong FAQ presence (10/10) with high H3 count (avg 8.3)',
      'Titles use numbers and direct questions: "5 Ways to...", "Is Your Enterprise..."',
    ]
  }
};

/**
 * Format blog patterns into a prompt-ready string for the AI agent.
 */
export function formatBlogPatternsForPrompt() {
  const p = CLOUDFUZE_BLOG_PATTERNS;
  return `CLOUDFUZE BLOG STANDARDS (derived from analysis of 40 published articles):

STRUCTURE — Every CloudFuze article MUST follow this:
${p.universalStructure}

WORD COUNT: Target ${p.overview.avgWordCount} words (range: ${p.overview.wordCountRange}). Median: ${p.overview.medianWordCount}.
HEADINGS: ${p.overview.avgH2Count} H2s and ${p.overview.avgH3Count} H3s on average.

CLOUDFUZE MENTIONS:
${p.cloudfuzeMentions.rules.map(r => '- ' + r).join('\n')}
Common CloudFuze H2 patterns: ${p.cloudfuzeMentions.h2Patterns.join(', ')}

CTA: ${p.ctaPatterns.style}

TITLE PATTERNS: ${p.titlePatterns.questionTitles}
Question examples: ${p.titlePatterns.examples.slice(0, 3).join('; ')}

IMPORTANT: Articles do NOT use a separate "Conclusion" heading. The CloudFuze section + CTA serves as the closing.`;
}

/**
 * Format writer-specific patterns into a prompt-ready string.
 */
export function formatWriterPatternsForPrompt(writerName) {
  if (!writerName) return '';
  const key = writerName.toLowerCase().trim();
  const firstName = key.split(/\s+/)[0];
  const patterns = WRITER_ARTICLE_PATTERNS[key] || WRITER_ARTICLE_PATTERNS[firstName] || null;
  if (!patterns) return '';

  return `${writerName.toUpperCase()}'S ACTUAL BLOG PATTERNS (from analysis of their last 10 published articles):
- Average word count: ${patterns.avgWords}
- Average H2s: ${patterns.avgH2s} | Average H3s: ${patterns.avgH3s}
- Intro style: ${patterns.introStyle}
- H2 heading style: ${patterns.h2Style}
- CloudFuze mention: First appears at word ~${patterns.cfMentionPosition.match(/\d+/)?.[0] || '?'}. ${patterns.cfSectionStyle}
- Unique patterns:
${patterns.uniquePatterns.map(p => '  - ' + p).join('\n')}

CRITICAL: Match these patterns. The generated content should be indistinguishable from ${writerName}'s published articles.`;
}
