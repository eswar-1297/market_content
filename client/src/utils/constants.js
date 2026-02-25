// ─────────────────────────────────────────────────────────────────────────────
// CloudFuze Standard AI Blog Framework (CSABF) — Constants & Configuration
// ─────────────────────────────────────────────────────────────────────────────

// ──── 1. PAGE-LEVEL REQUIREMENTS ─────────────────────────────────────────────

export const CSABF_WORD_COUNT = {
  warnMax: 2500,
  reason: 'No minimum word count — structure quality matters, not length. AI engines extract snippets, not full articles. Only warn if content exceeds ~2,500 words (risk of dilution).'
};

// ──── 2. SEO METADATA ────────────────────────────────────────────────────────

export const SEO_METADATA = {
  titleTag: {
    minLength: 55,
    maxLength: 60,
    rules: [
      'Primary keyword at beginning',
      'Include platform name',
      'Include action / intent phrase',
      'Avoid fluff words'
    ],
    formula: 'Primary Keyword + Platform | Short Modifier'
  },
  metaDescription: {
    minLength: 140,
    maxLength: 160,
    structure: ['Problem statement', 'Actionable promise', 'Platform mention'],
    rules: [
      'Be direct',
      'Not sales-heavy',
      'Contain primary keyword once'
    ]
  },
  urlSlug: {
    maxLength: 60,
    rules: [
      'Short',
      'Hyphen separated',
      'No stop words',
      'Under 60 characters',
      'Matches primary query'
    ]
  }
};

// ──── 3. CSABF SECTION DEFINITIONS ──────────────────────────────────────────

export const CSABF_SECTIONS = [
  {
    id: 'h1',
    heading: 'H1',
    label: 'H1 — Primary Intent Keyword',
    headingLevel: 1,
    wordCount: { min: 8, max: 14 },  // H1 word count is structural, not content depth
    rules: [
      'Exact intent phrase',
      'Include platform name',
      'No branding',
      'No fluff'
    ],
    required: true
  },
  {
    id: 'introduction',
    heading: null,
    label: 'Introduction',
    headingLevel: null,
    structure: [
      'Paragraph 1: Problem context',
      'Paragraph 2: Why it matters',
      'Paragraph 3: What this guide covers'
    ],
    rules: [
      'Max 3 paragraphs',
      'Each paragraph max 4 lines',
      'No storytelling',
      'No sales'
    ],
    required: true
  },
  {
    id: 'what_is',
    heading: 'What is [Topic]',
    label: 'H2 — What is [Topic]',
    headingLevel: 2,
    rules: [
      'Definition within first 2 sentences',
      'Clear explanation',
      'Include platform context'
    ],
    purpose: 'Improve AI snippet extraction',
    required: false,
    contextual: true,
    hint: 'Recommended when topic needs definition. Not needed for action-oriented how-to content.'
  },
  {
    id: 'key_takeaways',
    heading: 'Key Takeaways',
    label: 'Key Takeaways',
    headingLevel: null,
    rules: [
      '3–6 bullet points',
      'Place after introduction',
      'Summarize main actionable points'
    ],
    purpose: 'AI engines extract upfront summaries prominently',
    required: false,
    contextual: true,
    hint: 'Highly recommended — AI engines love extractable upfront summaries.'
  },
  {
    id: 'why_it_matters',
    heading: 'Why It Matters',
    label: 'H2 — Why It Matters',
    headingLevel: 2,
    mustInclude: [
      'Security impact',
      'Operational impact',
      'Governance or business impact'
    ],
    formatting: '1 short intro paragraph + bullet points',
    required: false,
    contextual: true,
    hint: 'Add when content discusses impacts, risks, or compliance.'
  },
  {
    id: 'step_by_step',
    heading: 'Step-by-Step Process / Methods',
    label: 'H2 — Step-by-Step / Methods',
    headingLevel: 2,
    structure: [
      'Numbered steps (or multiple method sections)',
      'Clear UI navigation language',
      'Use H3 subheadings within each method'
    ],
    rules: [
      'Numbered list format',
      'Can be split into Method 1, Method 2, etc.',
      'Must be procedural'
    ],
    required: false,
    contextual: true,
    hint: 'Add when content describes a procedure. Can be one section or multiple methods.'
  },
  {
    id: 'common_issues',
    heading: 'Common Issues / Limitations',
    label: 'H2 — Common Issues / Limitations',
    headingLevel: 2,
    include: [
      'Permission issues',
      'Policy restrictions',
      'Platform limitations',
      'Sync delays or errors'
    ],
    formatting: 'Bullet list preferred',
    required: false,
    contextual: true,
    hint: 'Add when content discusses errors or troubleshooting.'
  },
  {
    id: 'best_practices',
    heading: 'Best Practices / Prevention Tips',
    label: 'H2 — Best Practices',
    headingLevel: 2,
    shift: 'From "How to fix" to "How to prevent"',
    mustInclude: [
      'Monitoring suggestion',
      'Governance tip',
      'Automation suggestion'
    ],
    required: false,
    contextual: true,
    hint: 'Add when content covers recommendations or governance.'
  },
  {
    id: 'faqs',
    heading: 'FAQs',
    label: 'H2 — FAQs',
    headingLevel: 2,
    rules: [
      '4–7 questions',
      'Direct, concise answers',
      'Conversational style',
      'Not duplicate of earlier content'
    ],
    schema: 'FAQ schema required',
    required: true
  },
  {
    id: 'how_cloudfuze_helps',
    heading: 'How CloudFuze Helps',
    label: 'CloudFuze Positioning',
    headingLevel: 2,
    rules: [
      'Soft positioning',
      'No aggressive CTA',
      'Mention automation, scale, reporting',
      'Can be standalone section OR embedded in conclusion'
    ],
    required: false,
    note: 'Standalone H2 or naturally embedded in the Conclusion — both are valid.'
  },
  {
    id: 'conclusion',
    heading: 'Conclusion',
    label: 'Conclusion',
    headingLevel: 2,
    structure: [
      'Quick summary',
      'Reinforce best practice',
      'Light forward-looking statement',
      'CloudFuze positioning can be embedded here'
    ],
    rules: ['No marketing pitch'],
    required: true
  }
];

// ──── 4. FORMATTING RULES (Non-Negotiable) ──────────────────────────────────

export const CSABF_FORMATTING_RULES = {
  maxH1: 1,
  h2Range: { min: 4, max: 10 },    // 4 minimum, up to 10 for multi-method
  idealH2: { min: 6, max: 8 },      // sweet spot
  minBulletLists: 2,
  minNumberedLists: 1,
  maxParagraphLines: 5,
  maxParagraphWords: 120,
  platformMentions: { min: 8, max: 12 },
  primaryKeywordDensity: { min: 1.0, max: 1.5 },  // percentage
};

// ──── 5. INTERNAL LINKING RULES ─────────────────────────────────────────────

export const CSABF_LINKING_RULES = {
  totalLinks: { min: 3, max: 5 },
  requiredLinkTypes: [
    { type: 'migration', label: '1 link to related migration page' },
    { type: 'comparison', label: '1 link to platform comparison page' },
    { type: 'saas', label: '1 link to SaaS management page (if relevant)' }
  ],
  anchorTextRules: [
    'Descriptive anchor text',
    'Not "click here"',
    'Not "read more"',
    'Not generic'
  ]
};

// ──── 6. SCHEMA REQUIREMENTS ────────────────────────────────────────────────

export const CSABF_SCHEMA = {
  mandatory: ['Article schema', 'FAQ schema'],
  optional: ['HowTo schema (if procedural)']
};

// ──── 7. AI-CITATION OPTIMIZATION RULES ─────────────────────────────────────

export const AI_CITATION_RULES = [
  { id: 'definition_block', rule: 'Provide clear 40–60 word definition block', priority: 'CRITICAL' },
  { id: 'structured_steps', rule: 'Use structured steps (numbered)', priority: 'CRITICAL' },
  { id: 'bullet_summaries', rule: 'Use bullet summaries for key points', priority: 'CRITICAL' },
  { id: 'no_marketing_tone', rule: 'Avoid marketing-heavy tone', priority: 'CRITICAL' },
  { id: 'no_thought_leadership', rule: 'Avoid generic thought leadership', priority: 'RECOMMENDED' },
  { id: 'task_oriented', rule: 'Be task-oriented throughout', priority: 'CRITICAL' }
];

// ──── GUIDELINES (for framework builder tips) ───────────────────────────────

export const GUIDELINES = [
  {
    id: 'seo_metadata',
    title: 'SEO Metadata',
    description: 'Title Tag: 55–60 chars, primary keyword at start. Meta Description: 140–160 chars with problem statement + actionable promise. URL Slug: under 60 chars, hyphen-separated, no stop words.',
    tip: 'Formula: Primary Keyword + Platform | Short Modifier'
  },
  {
    id: 'h1',
    title: 'H1 — Primary Intent Keyword',
    description: '8–14 words. Exact intent phrase, include platform name, no branding, no fluff.',
    tip: 'This must match the primary search intent exactly.'
  },
  {
    id: 'introduction',
    title: 'Introduction (120–150 words)',
    description: 'Para 1: Problem context. Para 2: Why it matters. Para 3: What this guide covers. Max 3 paragraphs, each max 4 lines.',
    tip: 'No storytelling, no sales. Get straight to the point.'
  },
  {
    id: 'key_takeaways',
    title: 'Key Takeaways (Recommended)',
    description: '4–6 bullet points summarizing main actionable points. Place after introduction. AI engines extract these prominently for citations.',
    tip: 'Use bold "Key Takeaways:" followed by a bullet list — proven to boost AI visibility.'
  },
  {
    id: 'what_is',
    title: 'What is [Topic] (120–180 words) — Contextual',
    description: 'Definition within first 60 words. Clear explanation with platform context. Not needed for action-oriented how-to content.',
    tip: 'Skip this for how-to or multi-method guides. Add it when the topic needs explaining.'
  },
  {
    id: 'why_it_matters',
    title: 'Why It Matters (150–200 words)',
    description: 'Cover security impact, operational impact, and governance/business impact. Use 1 short intro + 4–6 bullet points.',
    tip: 'This section establishes authority and relevance for AI engines.'
  },
  {
    id: 'step_by_step',
    title: 'Step-by-Step Process (400–600 words)',
    description: '3–6 numbered steps, each 60–100 words. Clear UI navigation language. Must be procedural.',
    tip: 'Numbered list format is mandatory. This triggers HowTo schema eligibility.'
  },
  {
    id: 'common_issues',
    title: 'Common Issues / Limitations (150–250 words)',
    description: 'Cover permission issues, policy restrictions, platform limitations, sync delays/errors. Bullet list format preferred.',
    tip: 'AI search engines love structured problem-solution content.'
  },
  {
    id: 'best_practices',
    title: 'Best Practices (150–200 words)',
    description: 'Shift from "how to fix" to "how to prevent". Include monitoring, governance tip, and automation suggestion.',
    tip: 'Forward-looking content differentiates from generic how-to articles.'
  },
  {
    id: 'faqs',
    title: 'FAQs (250–350 words)',
    description: '4–7 questions, each answer 40–60 words. Conversational style. Must not duplicate earlier content.',
    tip: 'FAQ schema is mandatory. These get pulled into AI search results directly.'
  },
  {
    id: 'cloudfuze_helps',
    title: 'CloudFuze Positioning (Flexible)',
    description: 'Standalone "How CloudFuze Helps" section (120–180w) OR naturally embedded in the Conclusion. No aggressive CTA.',
    tip: 'Merging CloudFuze positioning into the conclusion often feels more natural. Both approaches are valid.'
  },
  {
    id: 'conclusion',
    title: 'Conclusion (80–120 words)',
    description: 'Quick summary, reinforce best practice, light forward-looking statement. No marketing pitch.',
    tip: 'End with a practical takeaway, not a sales message.'
  },
  {
    id: 'formatting',
    title: 'Formatting Rules (Non-Negotiable)',
    description: 'Only 1 H1 | 4–10 H2s (ideal 6–8) | At least 2 bullet lists | Numbered lists for processes | Paragraph max 5 lines / 120 words | Platform mentioned 8–12 times | H3 subheadings recommended.',
    tip: 'These rules are validated automatically by the analyzer.'
  },
  {
    id: 'internal_links',
    title: 'Internal Linking Rules',
    description: '3–5 internal links total. Must include: 1 migration page, 1 comparison page, 1 SaaS management page (if relevant). Descriptive anchor text only.',
    tip: 'Never use "click here" or "read more" as anchor text.'
  },
  {
    id: 'ai_citation',
    title: 'AI-Citation Optimization',
    description: 'Provide 40–60 word definition block. Use structured steps & bullet summaries. Avoid marketing-heavy tone. Be task-oriented.',
    tip: 'AI engines extract concise definition blocks, structured lists, and procedural steps above all else.'
  }
];

// ──── QUESTION STARTERS ─────────────────────────────────────────────────────

export const QUESTION_STARTERS = [
  'How to', 'What is', 'Why does', 'When should', 'Which is the best',
  'How do I', 'What are the', 'Can I', 'Is it possible to', 'How much does',
  'What happens when', 'Where can I', 'Who should', 'How long does'
];

// ──── VISUAL CONTENT TYPES ──────────────────────────────────────────────────

export const VISUAL_CONTENT_TYPES = {
  PROCESS_FLOWCHART: {
    type: 'infographic',
    name: 'Process Flowchart',
    description: 'A visual diagram showing the step-by-step process flow',
    icon: 'GitBranch'
  },
  STEP_INFOGRAPHIC: {
    type: 'infographic',
    name: 'Step-by-Step Infographic',
    description: 'A numbered visual guide showing each step with icons',
    icon: 'ListOrdered'
  },
  COMPARISON_TABLE: {
    type: 'table',
    name: 'Comparison Table',
    description: 'A side-by-side comparison table highlighting key differences',
    icon: 'Table'
  },
  VERSUS_INFOGRAPHIC: {
    type: 'infographic',
    name: 'Versus Infographic',
    description: 'A visual comparison highlighting pros/cons of each option',
    icon: 'ArrowLeftRight'
  },
  DATA_CHART: {
    type: 'image',
    name: 'Data Visualization Chart',
    description: 'A bar/pie/line chart visualizing the statistics mentioned',
    icon: 'BarChart3'
  },
  FEATURE_GRID: {
    type: 'infographic',
    name: 'Feature Icons Grid',
    description: 'A grid layout with icons representing each feature/benefit',
    icon: 'LayoutGrid'
  },
  FAQ_INFOGRAPHIC: {
    type: 'infographic',
    name: 'FAQ Infographic',
    description: 'A visual FAQ layout with question bubbles and concise answers',
    icon: 'HelpCircle'
  },
  SCREENSHOT: {
    type: 'image',
    name: 'Screenshot / Tutorial Image',
    description: 'Annotated screenshots showing the actual interface or steps',
    icon: 'Monitor'
  },
  HERO_IMAGE: {
    type: 'image',
    name: 'Hero / Featured Image',
    description: 'An attention-grabbing header image for the article',
    icon: 'Image'
  },
  PRICING_TABLE: {
    type: 'table',
    name: 'Pricing Comparison Table',
    description: 'A structured table comparing pricing tiers and features',
    icon: 'DollarSign'
  }
};

// ──── PRIORITY LEVELS ───────────────────────────────────────────────────────

export const PRIORITY_LEVELS = {
  CRITICAL: { label: 'Critical', color: 'red', order: 0 },
  RECOMMENDED: { label: 'Recommended', color: 'amber', order: 1 },
  NICE_TO_HAVE: { label: 'Nice to Have', color: 'blue', order: 2 }
};

// ──── CSABF H2 SECTIONS (Core = always required, Contextual = suggested when relevant)

export const CSABF_CORE_H2S = [
  { pattern: /faq|frequently\s+asked/i, label: 'FAQs' },
  { pattern: /conclusion|summary|wrap.?up|final\s+thoughts|act\s+now/i, label: 'Conclusion' }
];

// CloudFuze positioning is flexible — standalone section OR embedded in conclusion
export const CSABF_CLOUDFUZE_SECTION = {
  pattern: /how\s+cloudfuze|cloudfuze\s+helps|enterprise.+cloudfuze/i,
  label: 'CloudFuze Positioning',
  note: 'Can be standalone H2 or embedded naturally in the Conclusion'
};

export const CSABF_CONTEXTUAL_H2S = [
  { pattern: /what\s+is/i, label: 'What is [Topic]', hint: 'Helps AI citation — not needed for action-oriented how-to content' },
  { pattern: /key\s+takeaway|takeaway|tldr/i, label: 'Key Takeaways', hint: 'Upfront bullet summary — AI engines love extractable summaries' },
  { pattern: /why\s+(it\s+)?matter/i, label: 'Why It Matters', hint: 'Relevant when content discusses impacts, risks, compliance' },
  { pattern: /step.?by.?step|how\s+to|process|guide|method/i, label: 'Step-by-Step / Methods', hint: 'Can be one section or multiple method sections' },
  { pattern: /common\s+issues|limitations|troubleshoot/i, label: 'Common Issues / Limitations', hint: 'Relevant when content discusses errors or troubleshooting' },
  { pattern: /best\s+practices|tips|recommendations|rules?\s+to\s+prevent/i, label: 'Best Practices / Prevention', hint: 'Relevant when content covers recommendations or governance' }
];

// Combined for backward compatibility
export const CSABF_EXPECTED_H2S = [...CSABF_CORE_H2S, { pattern: CSABF_CLOUDFUZE_SECTION.pattern, label: CSABF_CLOUDFUZE_SECTION.label }, ...CSABF_CONTEXTUAL_H2S];
