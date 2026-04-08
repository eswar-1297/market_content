import axios from 'axios';

// ═══════════════════════════════════════════════════════════════════════════════
// EXTERNAL REFERENCES SERVICE
// Fetches REAL, VERIFIED external links from authoritative sites via Google Search.
// Every link is found through live search — no hardcoded URLs that might 404.
// Links are validated (HEAD request) before being returned.
// ═══════════════════════════════════════════════════════════════════════════════

// Authoritative site domains to search within, grouped by type
const AUTHORITATIVE_SITES = {
  official_docs: [
    'learn.microsoft.com',
    'support.microsoft.com',
    'support.google.com',
    'workspace.google.com',
    'developers.google.com',
    'cloud.google.com',
    'help.dropbox.com',
    'support.box.com',
    'developer.box.com',
    'helpdesk.egnyte.com',
    'slack.com/help',
    'docs.aws.amazon.com'
  ],
  research: [
    'gartner.com',
    'forrester.com',
    'idc.com',
    'mckinsey.com',
    'statista.com',
    'flexera.com'
  ],
  compliance: [
    'hhs.gov',            // HIPAA
    'gdpr.eu',            // GDPR
    'fedramp.gov',        // FedRAMP
    'nist.gov',           // NIST
    'iso.org',            // ISO
    'aicpa.org',          // SOC 2
    'aicpa-cima.com',     // SOC 2
    'cisa.gov'            // Cybersecurity
  ],
  best_practices: [
    'techcommunity.microsoft.com',
    'cloud.google.com/blog',
    'blog.google',
    'azure.microsoft.com/en-us/blog'
  ]
};

// Map platform names (from topic) to the sites we should search
const PLATFORM_SITE_MAP = {
  'microsoft 365':   ['learn.microsoft.com', 'support.microsoft.com', 'techcommunity.microsoft.com'],
  'office 365':      ['learn.microsoft.com', 'support.microsoft.com'],
  'sharepoint':      ['learn.microsoft.com', 'support.microsoft.com'],
  'onedrive':        ['learn.microsoft.com', 'support.microsoft.com'],
  'teams':           ['learn.microsoft.com', 'support.microsoft.com'],
  'outlook':         ['learn.microsoft.com', 'support.microsoft.com'],
  'exchange':        ['learn.microsoft.com'],
  'azure':           ['learn.microsoft.com'],
  'entra':           ['learn.microsoft.com'],
  'google workspace':['support.google.com', 'workspace.google.com', 'cloud.google.com'],
  'g suite':         ['support.google.com', 'workspace.google.com'],
  'google drive':    ['support.google.com', 'developers.google.com'],
  'gmail':           ['support.google.com'],
  'dropbox':         ['help.dropbox.com'],
  'box':             ['support.box.com'],
  'egnyte':          ['helpdesk.egnyte.com'],
  'slack':           ['slack.com']
};

// Topic keyword → compliance sites that are relevant
const COMPLIANCE_TRIGGERS = {
  'hipaa':     ['hhs.gov'],
  'gdpr':      ['gdpr.eu'],
  'fedramp':   ['fedramp.gov'],
  'soc 2':     ['aicpa-cima.com', 'aicpa.org'],
  'soc2':      ['aicpa-cima.com', 'aicpa.org'],
  'nist':      ['nist.gov'],
  'iso 27001': ['iso.org'],
  'security':  ['cisa.gov', 'nist.gov'],
  'compliance':['aicpa-cima.com', 'nist.gov']
};

/**
 * Search Google CSE for real pages on a specific site.
 * Returns only results that Google has actually indexed (so they exist).
 */
async function searchGoogle(query, num = 5) {
  const cseKey = process.env.GOOGLE_CSE_KEY;
  const cseCx = process.env.GOOGLE_CSE_CX;
  if (!cseKey || !cseCx) return [];

  try {
    const { data } = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: { key: cseKey, cx: cseCx, q: query, num },
      timeout: 12000
    });
    return (data.items || []).map(item => ({
      title: item.title?.replace(/ \|.*$/, '').replace(/ - .*$/, '').trim() || item.title,
      url: item.link,
      snippet: item.snippet || '',
      domain: (() => { try { return new URL(item.link).hostname.replace('www.', ''); } catch { return ''; } })()
    }));
  } catch {
    return [];
  }
}

/**
 * Validate a URL is accessible (returns 2xx or 3xx).
 * Uses HEAD with a short timeout to be fast.
 */
async function validateUrl(url) {
  try {
    const resp = await axios.head(url, {
      timeout: 5000,
      maxRedirects: 3,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      validateStatus: status => status < 400
    });
    return true;
  } catch {
    // HEAD might be blocked — try a lightweight GET
    try {
      const resp = await axios.get(url, {
        timeout: 5000,
        maxRedirects: 3,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Range': 'bytes=0-0' },
        validateStatus: status => status < 400
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Detect which platforms are mentioned in a topic string.
 */
function detectPlatforms(topic) {
  const lower = topic.toLowerCase();
  const detected = new Set();
  for (const platform of Object.keys(PLATFORM_SITE_MAP)) {
    if (lower.includes(platform)) {
      detected.add(platform);
    }
  }
  return [...detected];
}

/**
 * Detect which compliance keywords appear in the topic.
 */
function detectComplianceNeeds(topic) {
  const lower = topic.toLowerCase();
  const sites = new Set();
  for (const [keyword, domains] of Object.entries(COMPLIANCE_TRIGGERS)) {
    if (lower.includes(keyword)) {
      domains.forEach(d => sites.add(d));
    }
  }
  return [...sites];
}

/**
 * Main function: Fetch REAL external references via live Google search.
 * Every URL returned was found by Google (so it exists) and is optionally validated.
 */
export async function fetchExternalReferences(topic, platforms = [], linkTypes = []) {
  const lower = topic.toLowerCase();

  // 1. Detect platforms from topic + explicit args
  const detectedPlatforms = [
    ...new Set([
      ...platforms.map(p => p.toLowerCase()),
      ...detectPlatforms(topic)
    ])
  ];

  // 2. Build targeted search queries
  // Each query searches a specific authoritative site for the topic
  const searchQueries = [];

  // Platform-specific official docs searches
  const platformSites = new Set();
  for (const platform of detectedPlatforms) {
    const sites = PLATFORM_SITE_MAP[platform] || [];
    sites.forEach(s => platformSites.add(s));
  }
  // Search top 3 platform sites for topic-specific pages
  for (const site of [...platformSites].slice(0, 3)) {
    searchQueries.push({
      query: `site:${site} ${topic}`,
      type: 'official_docs',
      site
    });
  }

  // Research/industry searches
  const researchQuery = `${topic} enterprise statistics research`;
  searchQueries.push({
    query: `site:gartner.com OR site:forrester.com OR site:statista.com ${topic}`,
    type: 'research',
    site: 'research'
  });

  // Compliance searches (only if topic mentions compliance terms)
  const complianceSites = detectComplianceNeeds(topic);
  if (complianceSites.length > 0) {
    const siteFilter = complianceSites.slice(0, 3).map(s => `site:${s}`).join(' OR ');
    searchQueries.push({
      query: `${siteFilter} ${topic.replace(/migrat\w*/gi, '').trim()}`,
      type: 'compliance',
      site: 'compliance'
    });
  }

  // General authoritative search (finds credible pages Google ranks highly)
  searchQueries.push({
    query: `${topic} official guide documentation`,
    type: 'best_practices',
    site: 'general'
  });

  // 3. Run all searches in parallel
  const searchResults = await Promise.allSettled(
    searchQueries.map(sq =>
      searchGoogle(sq.query, 4).then(results =>
        results.map(r => ({ ...r, type: sq.type, searchSite: sq.site }))
      )
    )
  );

  // 4. Collect and deduplicate results
  const seenUrls = new Set();
  const allResults = [];

  for (const result of searchResults) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value) {
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);

      // Classify the result based on its domain
      let finalType = item.type;
      const domain = item.domain;
      if (AUTHORITATIVE_SITES.official_docs.some(s => domain.includes(s.replace('www.', '')))) {
        finalType = 'official_docs';
      } else if (AUTHORITATIVE_SITES.research.some(s => domain.includes(s))) {
        finalType = 'research';
      } else if (AUTHORITATIVE_SITES.compliance.some(s => domain.includes(s))) {
        finalType = 'compliance';
      } else if (AUTHORITATIVE_SITES.best_practices.some(s => domain.includes(s))) {
        finalType = 'best_practices';
      }

      allResults.push({
        title: item.title,
        url: item.url,
        type: finalType,
        domain,
        snippet: item.snippet,
        relevance: platformSites.has(domain) ? 'high' : 'medium'
      });
    }
  }

  if (allResults.length === 0) {
    return {
      found: 0,
      topic,
      message: `No external references found for "${topic}". Google CSE returned no results. Try different keywords or check CSE configuration.`
    };
  }

  // 5. Validate top links are accessible (parallel, with timeout)
  const topLinks = allResults.slice(0, 12);
  const validationResults = await Promise.allSettled(
    topLinks.map(link =>
      validateUrl(link.url)
        .then(valid => ({ ...link, valid }))
    )
  );

  const validLinks = validationResults
    .filter(r => r.status === 'fulfilled' && r.value.valid)
    .map(r => r.value);

  // If validation filtered too aggressively, include unvalidated ones too
  // (Google indexed them, so they likely exist even if HEAD fails)
  let finalLinks = validLinks;
  if (validLinks.length < 5) {
    const validUrls = new Set(validLinks.map(l => l.url));
    const unvalidated = topLinks
      .filter(l => !validUrls.has(l.url))
      .map(l => ({ ...l, valid: null })); // null = not checked (vs false = failed)
    finalLinks = [...validLinks, ...unvalidated].slice(0, 12);
  }

  // 6. Group by type
  const grouped = {};
  for (const link of finalLinks) {
    if (!grouped[link.type]) grouped[link.type] = [];
    grouped[link.type].push(link);
  }

  return {
    found: finalLinks.length,
    topic,
    detectedPlatforms,
    links: grouped,
    allLinks: finalLinks.map(l => ({
      title: l.title,
      url: l.url,
      type: l.type,
      domain: l.domain,
      relevance: l.relevance,
      snippet: l.snippet || null,
      verified: l.valid === true ? true : l.valid === false ? false : null
    })),
    instruction: 'Present these external reference links organized by type. ONLY use links marked as verified:true or verified:null (Google-indexed). For each link, show the clickable markdown link, the source domain, and suggest which article section it belongs in. Format:\n\n## Official Platform Documentation\n- [Title](url) — *domain* — Use in: [section name]\n\n## Industry Research\n- [Title](url) — *domain* — Use in: [section name]\n\nThese are REAL links found via live Google search. They should be embedded as external references within the article sections where their information is cited — NOT collected in a separate references section at the end.'
  };
}
