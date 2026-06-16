/**
 * CloudFuze Migration Docs Service — doc.cftools.live integration
 *
 * Provides read access to CloudFuze's public "Migration Docs" knowledge base
 * (https://doc.cftools.live). This replaces the old SharePoint/DOC360 Microsoft
 * Graph integration as the agent's source of truth for product data: supported
 * migration combinations, golden image / feature matrices, RCA docs, cloud info,
 * and technical documentation.
 *
 * The docs site is a React SPA backed by a public JSON API on the same origin.
 * No authentication is required for the read endpoints used here:
 *   GET /api/documents       -> { items: [{ _id, name, slug, content (HTML) }] }
 *   GET /api/cloud-info       -> { items: [{ _id, name, slug, content (HTML) }] }
 *   GET /api/compatibility    -> { matrices: [{ _id, name, slug, order }] }
 *   GET /api/compatibility/:slug -> { matrix: { name, columns, rows[] } }
 *   GET /api/product-config   -> { productTypes, combinationsByProduct, ... }
 *
 * Env vars:
 *   CFTOOLS_DOCS_URL (default: https://doc.cftools.live)
 */

const BASE_URL = (process.env.CFTOOLS_DOCS_URL || 'https://doc.cftools.live').replace(/\/+$/, '');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory cache for the (large) list endpoints so we don't refetch per query.
const cache = new Map(); // key -> { expiry, data }

async function fetchJson(path) {
  const cached = cache.get(path);
  if (cached && Date.now() < cached.expiry) return cached.data;

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) {
    throw new Error(`Migration Docs API error (${res.status}) for ${path}`);
  }
  const data = await res.json();
  cache.set(path, { expiry: Date.now() + CACHE_TTL_MS, data });
  return data;
}

// ═══ TEXT EXTRACTION ═══

/**
 * Strip HTML to readable plain text. Removes embedded base64 images and <img>
 * tags first — Migration Docs content frequently inlines large data: URIs.
 */
function htmlToText(html) {
  return (html || '')
    .replace(/<img[^>]*>/gi, '')                       // drop images (often base64)
    .replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(h[1-6])>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Build a deep link to the exact page in the Migration Docs SPA. The app is a
// single-page React app that selects content from query params:
//   compatibility matrix -> ?view=compatibility&matrix=<slug>
//   cloud-info doc        -> ?view=cloudinfo&info=<slug>
//   document              -> ?view=documents&doc=<slug>
//   product combinations  -> ?product=<Product name>
function docUrl(source, slug) {
  const base = `${BASE_URL}/`;
  if (!slug) return base;
  const s = encodeURIComponent(slug);
  switch (source) {
    case 'compatibility': return `${base}?view=compatibility&matrix=${s}`;
    case 'cloud-info':    return `${base}?view=cloudinfo&info=${s}`;
    case 'documents':     return `${base}?view=documents&doc=${s}`;
    case 'combinations':  return `${base}?product=${s}`; // slug holds the product name
    default:              return base;
  }
}

// ═══ SCORING ═══

// Domain-generic words that appear in nearly every Migration Docs page/matrix,
// so they carry no discriminating signal (every doc is about "migration").
// Dropping them lets the meaningful terms — platforms, paths, features — rank.
const STOPWORDS = new Set([
  'migrate', 'migrates', 'migrating', 'migration', 'migrations', 'migrated',
  'cloudfuze', 'data', 'file', 'files', 'support', 'supports', 'supported',
  'can', 'does', 'will', 'the', 'from', 'into', 'between', 'tool', 'using',
  'use', 'for', 'and', 'with', 'how', 'what', 'are', 'our', 'this', 'that',
  'when', 'event', 'events' // "event(s)" is too generic across matrices/docs
]);

function tokenize(query) {
  return (query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

function scoreText(tokens, name, text) {
  const lowerName = (name || '').toLowerCase();
  const lowerText = (text || '').toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (lowerName.includes(t)) score += 10;
    const matches = lowerText.split(t).length - 1;
    score += Math.min(matches, 8); // cap a single term's contribution
  }
  return score;
}

// ═══ SOURCES ═══

async function loadDocItems() {
  // Combine /api/documents and /api/cloud-info into a normalized, text-only list.
  const [docs, cloud] = await Promise.allSettled([
    fetchJson('/api/documents'),
    fetchJson('/api/cloud-info')
  ]);

  const items = [];
  const collect = (result, source) => {
    if (result.status !== 'fulfilled') return;
    for (const it of result.value?.items || []) {
      items.push({
        name: it.name || 'Untitled',
        slug: it.slug || '',
        source,
        text: htmlToText(it.content)
      });
    }
  };
  collect(docs, 'documents');
  collect(cloud, 'cloud-info');
  return items;
}

// Build searchable items from /api/product-config — the Product Types →
// Combinations data (which source→destination paths CloudFuze supports per
// product line: Message, Mail, Content). This answers "is A→B supported at all"
// questions, distinct from the feature-level Yes/NO in the compatibility matrices.
async function loadCombinations() {
  let cfg;
  try {
    cfg = await fetchJson('/api/product-config');
  } catch {
    return [];
  }
  const byProduct = cfg?.combinationsByProduct || {};
  const items = [];
  for (const [product, combos] of Object.entries(byProduct)) {
    if (!Array.isArray(combos) || combos.length === 0) continue;
    items.push({
      name: `${product} — Supported Migration Combinations`,
      slug: product, // used to deep-link to ?product=<product>
      source: 'combinations',
      text:
        `High-level list of ${product} migration combinations (source → destination) highlighted in CloudFuze Migration Docs:\n` +
        combos.map(c => `- ${c}`).join('\n') +
        `\n\nNOTE: This is a summary list and may NOT be exhaustive — the Compatibility matrices ` +
        `("...as source combination" / feature lists) enumerate the complete set of supported ${product} paths ` +
        `(as columns) plus feature-by-feature support. Do NOT conclude a path is unsupported just because it is ` +
        `missing from this summary; verify against the relevant compatibility matrix.`
    });
  }
  return items;
}

// Fetch every compatibility/feature matrix (raw structure + rendered text).
// Cached per-path by fetchJson, so only the first query in a TTL window pays.
async function loadMatrices() {
  let list;
  try {
    list = await fetchJson('/api/compatibility');
  } catch {
    return [];
  }
  const matrices = list?.matrices || [];
  const settled = await Promise.allSettled(
    matrices.map(m =>
      fetchJson(`/api/compatibility/${encodeURIComponent(m.slug)}`)
        .then(d => ({ name: m.name, slug: m.slug, matrix: d?.matrix, text: renderMatrix(d?.matrix) }))
    )
  );
  return settled.filter(r => r.status === 'fulfilled').map(r => r.value);
}

/**
 * Relevance score for a feature matrix. The strongest signals for a
 * "can we migrate X from A to B" question are the COLUMN HEADERS (the actual
 * source→destination paths) and the ROW FEATURE LABELS — NOT the bulk of
 * Yes/NO cells or description prose, which inflate large tables with incidental
 * keyword hits. We score structure heavily and ignore cell values.
 */
function scoreMatrix(tokens, matrix) {
  if (!matrix) return 0;
  const name = (matrix.name || '').toLowerCase();
  const cols = (matrix.columns || []).map(c => (c || '').toLowerCase());
  const feats = (matrix.rows || []).map(r => (r.feature || '').toLowerCase());
  let score = 0;
  for (const t of tokens) {
    if (name.includes(t)) score += 8;
    for (const c of cols) if (c.includes(t)) score += 6;   // migration-path match
    for (const f of feats) if (f.includes(t)) score += 5;  // feature match
  }
  return score;
}

async function searchCompatibility(tokens) {
  const matrices = await loadMatrices();
  return matrices
    .map(m => ({
      name: m.name,
      slug: m.slug,
      source: 'compatibility',
      text: m.text,
      score: scoreMatrix(tokens, m.matrix)
    }))
    .filter(m => m.score > 0);
}

function renderMatrix(matrix) {
  if (!matrix) return '';
  const cols = matrix.columns || [];
  const rows = matrix.rows || [];
  let out = `${matrix.name || 'Feature Matrix'}\n\n`;
  // Prepend a "Feature" header so the row-label column aligns with the data
  // columns — otherwise the model reads Yes/No values against the wrong path.
  if (cols.length) out += ['Feature', ...cols].join(' | ') + '\n';
  for (const r of rows) {
    const feature = r.feature || '';
    const values = (r.values || []).join(' | ');
    out += `${feature} | ${values}\n`;
  }
  return out.trim();
}

// ═══ PUBLIC API ═══

/**
 * Always available — the docs API is public and a default base URL is configured.
 */
export function isCftoolsDocsConfigured() {
  return !!BASE_URL;
}

/**
 * Main entry point for the agent tool. Searches Migration Docs for a query and
 * returns the best-matching content. Shape mirrors the old SharePoint service so
 * the agent layer can consume it unchanged.
 */
export async function searchAndFetchContent(query) {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return { found: false, query, message: `Empty query — provide keywords to search Migration Docs.` };
  }

  const [docItems, matrixItems, comboItems] = await Promise.all([
    loadDocItems(),
    searchCompatibility(tokens),
    loadCombinations()
  ]);

  const scoredDocs = docItems
    .map(it => ({ ...it, score: scoreText(tokens, it.name, it.text) }))
    .filter(it => it.score > 0);

  // Combinations are the clearest authority on whether a source→destination path
  // is supported at all, so give matches a boost to keep them in the content tier.
  const COMBO_BOOST = 8;
  const scoredCombos = comboItems
    .map(it => ({ ...it, score: scoreText(tokens, it.name, it.text) }))
    .filter(it => it.score > 0)
    .map(it => ({ ...it, score: it.score + COMBO_BOOST }));

  const all = [...scoredDocs, ...scoredCombos, ...matrixItems.filter(m => m.text)]
    .sort((a, b) => b.score - a.score);

  if (all.length === 0) {
    return { found: false, query, message: `No Migration Docs pages found matching "${query}".` };
  }

  const MAX_CONTENT = 5000;
  const toResult = (it) => ({
    name: it.name,
    webUrl: docUrl(it.source, it.slug),
    snippet: (it.text || '').substring(0, 280),
    lastModified: null,
    content: (it.text || '').substring(0, MAX_CONTENT) || null,
    contentType: it.source
  });

  return {
    found: true,
    query,
    totalResults: all.length,
    topResult: toResult(all[0]),
    additionalResults: all.slice(1, 5).map(toResult),
    otherResults: all.slice(5, 10).map(it => ({
      name: it.name,
      webUrl: docUrl(it.source, it.slug),
      snippet: (it.text || '').substring(0, 200),
      lastModified: null
    }))
  };
}

/**
 * Fetch a specific Migration Docs page by its doc.cftools.live URL. Handles both
 * deep links with query params (?view=compatibility&matrix=<slug>, ?view=cloudinfo
 * &info=<slug>, ?view=documents&doc=<slug>) and bare slugs in the path.
 */
export async function getPageByUrl(url) {
  // Prefer an explicit slug from the deep-link query params.
  let qpSlug = '';
  let qpMatrix = false;
  try {
    const u = new URL(url);
    qpMatrix = !!u.searchParams.get('matrix');
    qpSlug = (u.searchParams.get('matrix') ||
              u.searchParams.get('info') ||
              u.searchParams.get('doc') || '').trim();
  } catch { /* not an absolute URL — fall back to path parsing */ }

  const clean = (url || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
  const slug = (qpSlug || decodeURIComponent(clean.split('/').pop() || '')).toLowerCase();
  if (!slug) throw new Error(`Could not parse a doc slug from: ${url}`);

  // If the link explicitly points at a matrix, resolve it directly.
  if (qpMatrix) {
    try {
      const detail = await fetchJson(`/api/compatibility/${encodeURIComponent(slug)}`);
      if (detail?.matrix) {
        return { title: detail.matrix.name, webUrl: docUrl('compatibility', slug), content: renderMatrix(detail.matrix), lastModified: null };
      }
    } catch { /* fall through to general matching */ }
  }

  const docItems = await loadDocItems();
  const match = docItems.find(it =>
    (it.slug || '').toLowerCase() === slug ||
    (it.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug ||
    (it.name || '').toLowerCase().includes(slug.replace(/-/g, ' '))
  );
  if (match) {
    return { title: match.name, webUrl: docUrl(match.source, match.slug), content: match.text, lastModified: null };
  }

  // Try compatibility matrices by slug.
  try {
    const detail = await fetchJson(`/api/compatibility/${encodeURIComponent(slug)}`);
    if (detail?.matrix) {
      return { title: detail.matrix.name, webUrl: docUrl('compatibility', slug), content: renderMatrix(detail.matrix), lastModified: null };
    }
  } catch { /* not a matrix slug */ }

  throw new Error(`Could not find a Migration Docs page for: ${url}`);
}
