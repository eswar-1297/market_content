# CloudFuze Standard AI Blog Framework (CSABF) Tool

A React + Node.js tool for writing and analyzing content using the CloudFuze Standard AI Blog Framework — optimized for AI citation visibility, SEO performance, and structural consistency.

## Features

### CSABF Content Builder
Section-by-section guided builder enforcing the full CSABF framework:
- SEO Metadata builder (Title Tag, Meta Description, URL Slug)
- H1 validation (8–14 words, primary intent keyword)
- Introduction (120–150 words, 3-paragraph structure)
- What is [Topic] with definition block (120–180 words)
- Why It Matters with impact bullets (150–200 words)
- Step-by-Step Process with numbered steps (400–600 words)
- Common Issues / Limitations (150–250 words)
- Best Practices (150–200 words)
- FAQs with answer word count validation (250–350 words, 5–7 Q&A)
- How CloudFuze Helps (120–180 words)
- Conclusion (80–120 words)
- Internal Links manager with type validation
- Final CSABF compliance checklist with export (Markdown)

### CSABF Content Analyzer
Paste content and receive instant CSABF compliance analysis:
- **CSABF Compliance Score** (0-100) with 5 category breakdowns
- **AI Citation Readiness Score** — definition block, task orientation, marketing tone
- **20+ rule-based checks**: total word count, H1/H2 structure, section word counts, paragraph limits, bullet/numbered lists, platform mentions, keyword density, FAQ validation, internal links, schema readiness, and more
- **Visual content recommendations**: images, infographics, tables — with placement suggestions
- **AI-powered analysis** (optional): OpenAI GPT-4 or Google Gemini for CSABF-aware rewrite suggestions

## CSABF Rules Enforced

### Page-Level
- Total word count: 1,500–2,000 words

### Structure
- Only 1 H1 (8–14 words)
- 6–8 H2 sections (all required sections present)
- Max 5 lines per paragraph
- No paragraph over 120 words
- At least 2 bullet lists
- At least 1 numbered list

### SEO
- Platform mentioned 8–12 times
- Primary keyword density 1–1.5%
- 3–5 internal links with descriptive anchors
- Required link types (migration, comparison, SaaS management)

### AI Citation Optimization
- 40–60 word definition block in "What is" section
- Structured numbered steps
- Bullet summaries
- Task-oriented tone
- No marketing-heavy language
- No generic thought leadership

### Schema
- Article schema: mandatory
- FAQ schema: mandatory
- HowTo schema: optional (if procedural)

## Tech Stack

- **Frontend**: React 18, Vite, TailwindCSS, React Router, React Quill, Lucide Icons
- **Backend**: Node.js, Express, OpenAI SDK, Google Generative AI SDK

## Getting Started

### Prerequisites
- Node.js 18+

### Installation

```bash
# Install root dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..
```

### Running locally

```bash
# Start both server and client
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### AI Analysis (Optional)
1. Go to Settings page
2. Add your OpenAI or Gemini API key
3. Use "Enhance with AI" button in the Content Analyzer
