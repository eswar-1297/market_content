/**
 * Writer Bios — Loaded into the agent context when a writer selects their name.
 * Each bio defines the writer's style, tone, structure, audience, and philosophy
 * so the agent generates content that matches their voice.
 */

const WRITER_BIOS = {
  pankaj: {
    name: 'Pankaj',
    role: 'Senior Content Writer',
    productFocus: ['CloudFuze Migrate', 'CloudFuze Manage'],
    audience: 'C-suite executives (CIOs, CTOs, CDOs), IT leaders, infrastructure architects, digital transformation leaders, enterprise technology decision-makers',
    style: `Informative, concise, and insight-driven. Delivers strategic value and actionable insights rather than surface-level explanations. Professional and authoritative tone reflecting expectations of C-suite leaders.`,
    tone: 'Strategic, Professional, Insightful, Executive-focused, Practical',
    avoids: 'Casual language, overly academic writing, generic explanations, long introductions, beginner-level content',
    philosophy: `Value-first approach. Delivers meaningful insights immediately without long introductions or generic definitions. For example, instead of explaining what cloud modernization is, starts with why it's critical, strategic approaches, key frameworks, and how CloudFuze helps. This works for busy enterprise decision-makers who prefer direct insights.`,
    structure: `H1 (main title) → Introduction (2-3 concise paragraphs, addresses topic immediately, strategic context, no generic explanations) → Key Takeaways (3-5 bullet points: major strategies, key insights, important considerations) → H2 Sections (each focuses on a specific strategy, best practice, framework, or enterprise consideration) → H3 FAQs (concise but informative answers) → Conclusion`,
    coreTopics: [
      'Enterprise-scale cloud migrations',
      'Cross-cloud migration strategies',
      'Migration risk mitigation',
      'Migration planning frameworks',
      'Data integrity and compliance during migrations',
      'Cost optimization during migration',
      'SaaS and AI app visibility and control',
      'User lifecycle management',
      'License management',
      'AI application governance',
      'Shadow IT and Shadow AI mitigation',
      'SaaS and AI app cost optimization',
      'Enterprise SaaS governance frameworks',
      'Cloud modernization strategies',
      'Digital transformation initiatives',
      'Enterprise IT governance',
      'IT operational efficiency'
    ],
    h2Style: 'Action-oriented strategic headings. Examples: "Align Cloud Migration with Business Objectives", "Assess Application Dependencies Before Migration", "Implement Governance and Compliance Controls", "Improve SaaS and AI Visibility Across the Organization"',
    seoApproach: 'Natural keyword integration, clear topic structuring, strong heading hierarchy, insight-driven content, context-rich explanations. Optimized for both search engines and AI systems/LLMs.'
  },

  aayushi: {
    name: 'Aayushi',
    role: 'Senior Content Writer',
    productFocus: ['CloudFuze Migrate', 'Cloud Migration', 'Email Migration', 'Tenant Migration'],
    audience: 'CIOs, CTOs, IT administrators, enterprise architects, digital transformation leaders, enterprise technology decision-makers',
    style: `Clear, practical, and informative. Explains complex cloud migration topics in a simplified and structured way. SEO-focused with logical heading structures, keyword integration, short readable paragraphs, and search-friendly formatting. Professional, informative, and educational tone.`,
    tone: 'Professional, Informative, Clear and structured, Practical, Enterprise-focused',
    avoids: 'Casual language, unnecessary jargon, overly academic explanations, generic content without practical insights',
    philosophy: `Problem-solution approach focused on enterprise challenges. Instead of long theoretical definitions, focuses on real business challenges, why they matter today, practical solutions and migration strategies, and how CloudFuze helps. For example, for M365 to Google Workspace migration: discusses why enterprises move between platforms, migration risks (metadata loss, permissions errors, downtime), strategies for enterprise-scale, and how CloudFuze enables secure migrations.`,
    structure: `H1 (clear enterprise topic title) → Introduction (2-3 short paragraphs with strong hook line highlighting real enterprise challenge, relevant statistics from Microsoft/Google/Statista/Forrester/Gartner, why topic matters today) → Key Takeaways (3-5 shorter bullet point summary) → H2 Core Sections (each focuses on specific topic/challenge/strategy with technical insights, enterprise considerations, practical recommendations) → Tables/Data Insights/Comparisons → Conclusion → Short CTA → H3 FAQs (short, clear, informative answers)`,
    coreTopics: [
      'Outlook to Gmail email migrations',
      'Gmail to Outlook email migrations',
      'Microsoft 365 tenant migration',
      'Google Workspace to Google Workspace migration',
      'Gmail to Gmail tenant-to-tenant migrations',
      'Cross-cloud data transfer strategies',
      'Enterprise-scale data migrations (TB/PB)',
      'Email metadata and timestamp preservation',
      'Data integrity and compliance during migrations',
      'Migration risk mitigation strategies',
      'Enterprise collaboration platform transitions',
      'Enterprise cloud modernization strategies',
      'SaaS and AI governance strategies',
      'Enterprise IT cost optimization',
      'Digital transformation initiatives'
    ],
    h2Style: 'Topic/challenge focused headings. Examples: "Why Enterprises Migrate from Microsoft 365 to Google Workspace", "Common Challenges in Enterprise Cloud Migration", "Migration Framework for Large-Scale Enterprise Projects", "Best Practices for Secure Data Migration"',
    seoApproach: 'Natural keyword integration, structured headings, context-rich explanations, clear topic segmentation, readable formatting. Includes tables and comparisons where appropriate for clarity and engagement.'
  },

  rashmi: {
    name: 'Rashmi',
    role: 'Technical Content Writer',
    productFocus: ['CloudFuze Manage', 'SaaS Management', 'AI Application Management'],
    audience: 'CIOs, CTOs, CDOs, IT Directors, Enterprise Architects, SaaS/Security/Governance Leaders, Digital Transformation and IT Modernization Teams',
    style: `Second person POV (speaking directly to the reader as "you"). Conversational yet professional and authoritative. Insight-driven with strategies, frameworks, and real-world use cases. Concise with no filler. Structured and scannable with clean sections, bullets, and strong subheads. Balances clarity with depth.`,
    tone: 'Conversational (second person), Professional, Authoritative, Insight-driven, Concise, Scannable',
    avoids: 'Casual language, unnecessary jargon, overly academic explanations, generic content, first-person perspective, surface-level explanations',
    philosophy: `Value-first writing. Does not begin with basic definitions or generic intros. Immediately addresses: why the topic matters today, what risks or gaps enterprises face, what frameworks or strategies work, how CloudFuze fits into a larger solution. Gives enterprise readers meaningful value from the first paragraph — ideal for leaders who need insight quickly.`,
    structure: `H1 (clear, outcome-oriented title under 60 characters) → Introduction (2-3 concise paragraphs establishing business importance immediately) → Key Takeaways (short list of most important strategic insights) → H2/H3 Sections (each covers a strategy, framework, or enterprise consideration for SaaS governance, AI oversight, compliance, access management, cost optimization, IT operational efficiency) → FAQs (concise, high-value answers to executive questions) → Meta description within 140 characters with primary keyword`,
    coreTopics: [
      'Organization-wide SaaS discovery and visibility',
      'Shadow IT and Shadow AI detection',
      'License usage analysis and cost optimization',
      'User lifecycle management (onboarding/offboarding automation)',
      'SaaS app compliance and governance frameworks',
      'AI application oversight, policy control, and risk management',
      'IT governance frameworks',
      'AI governance and usage policies',
      'SaaS optimization for scaling enterprises',
      'Operational efficiency and automation',
      'Digital transformation initiatives',
      'IT compliance and audit readiness'
    ],
    h2Style: 'Outcome-oriented, strategic headings addressing the reader directly or focusing on governance/strategy. Uses second person where appropriate.',
    seoApproach: 'Natural semantic keyword placement, clean hierarchical structure, clear descriptive headings, insight-rich content for AI parsing, contextual examples and enterprise scenarios. Optimized for both search engines and AI-driven referencing.'
  },

  bhavani: {
    name: 'Bhavani',
    role: 'Technical Content Writer',
    productFocus: ['CloudFuze Migrate'],
    audience: 'Enterprise decision-makers, CIOs, CTOs, IT leaders, enterprise architects, digital transformation executives, enterprises looking for migration to Google Workspace or Microsoft 365',
    style: `Structured, practical, and designed to empower enterprise IT teams with clarity and confidence. Simplifies complex cloud migration topics and delivers actionable guidance. Informative and expertise-driven — breaks down topics to bring clarity to technical decision-making. Concise and structured — clean logical flow, helps readers quickly grasp problem, understand solution, and follow steps. Action-oriented — emphasizes real-world applications with clear recommendations IT teams can directly apply.`,
    tone: 'Enterprise-focused, Professional, Insightful, Practical',
    avoids: 'Unnecessary bluff, overly technical jargon, generic explanations, long introductions, beginner-level content',
    philosophy: `Value-first approach. Delivers meaningful insights immediately without generic definitions or background explanations. Promotes CloudFuze solutions meaningfully without looking forced. For example, for External Shares Migration: starts with why to migrate external shares, challenges in migrating them, how CloudFuze Migrate helps — not a long explanation of what cloud modernization is. Delivers useful information from the very beginning for busy enterprise decision-makers who prefer direct insights.`,
    structure: `H1 (main topic as title) → Introduction (2-3 concise paragraphs: addresses topic immediately, explains why important today, provides strategic context, no long intros or generic explanations) → Key Takeaways (3-5 bullet points: major strategies, key insights, important considerations) → H2 Sections (each focuses on: importance, challenge, expertise of CloudFuze Migrate to solve challenges — strategic explanation, insights, enterprise-level implications) → H3 FAQs (concise but informative answers) → Conclusion`,
    coreTopics: [
      'Enterprise-scale cloud migrations',
      'Migration features supported by CloudFuze Migrate',
      'Updates in Microsoft 365 and Google Workspace platforms',
      'Comparison among cloud platforms',
      'Migration planning frameworks',
      'Cloud migration strategies and insights',
      'Cloud modernization strategies',
      'Enterprise IT governance',
      'External shares migration',
      'API throttling during migrations',
      'Managing external sharing across platforms',
      'Delta migration for large enterprises',
      'High-volume data transfer challenges'
    ],
    h2Style: 'Challenge-solution focused headings emphasizing CloudFuze Migrate expertise. Each H2 covers importance, challenge, and how CloudFuze solves it.',
    seoApproach: 'Natural keyword integration, clear topic structuring, strong heading hierarchy, insight-driven content, context-rich explanations. Optimized for both search engines and AI systems/LLMs.'
  }
};

/**
 * Get a writer's bio by name (case-insensitive).
 * Returns null if not found.
 */
export function getWriterBio(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  // Direct match (e.g. "pankaj")
  if (WRITER_BIOS[key]) return WRITER_BIOS[key];
  // First name match (e.g. "Pankaj Mishra" → "pankaj")
  const firstName = key.split(/\s+/)[0];
  if (WRITER_BIOS[firstName]) return WRITER_BIOS[firstName];
  // Partial match — check if any writer name is contained in the full name
  for (const [writerKey, bio] of Object.entries(WRITER_BIOS)) {
    if (key.includes(writerKey) || writerKey.includes(firstName)) return bio;
  }
  return null;
}

/**
 * Format a writer bio into a prompt-ready string for the AI agent.
 */
export function formatWriterBioForPrompt(name) {
  const bio = getWriterBio(name);
  if (!bio) return '';

  return `WRITER BIO — ${bio.name} (${bio.role}):
Product Focus: ${bio.productFocus.join(', ')}
Target Audience: ${bio.audience}
Writing Style: ${bio.style}
Tone: ${bio.tone}
Avoids: ${bio.avoids}
Writing Philosophy: ${bio.philosophy}
Article Structure: ${bio.structure}
H2 Heading Style: ${bio.h2Style}
Core Topics: ${bio.coreTopics.join(', ')}
SEO Approach: ${bio.seoApproach}

IMPORTANT: All frameworks, articles, and content generated for ${bio.name} MUST match this writing style, tone, structure, and philosophy. Use their preferred H2 style, follow their article structure exactly, and write for their target audience. Do NOT use a generic writing style.`;
}

/**
 * Get all writer names.
 */
export function getWriterNames() {
  return Object.values(WRITER_BIOS).map(b => b.name);
}

export default WRITER_BIOS;
