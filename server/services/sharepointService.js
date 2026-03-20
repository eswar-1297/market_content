/**
 * SharePoint Service — Microsoft Graph API integration
 *
 * Provides authenticated access to CloudFuze's SharePoint sites.
 * Used by the copilot agent to fetch documentation, golden image combos,
 * migration guides, feature specs, and product docs in real-time.
 *
 * Content structure in DOC360 site:
 *   - Site Pages: Email Migration, Home, Office 365 Services (via beta pages API)
 *   - Documents drive: PDFs, Excel, PowerPoints in organized folders
 *     - CloudFuze Product Features and Combinations/ (source combo PDFs)
 *     - Documentation/ (product docs)
 *     - Certificates/, Policy Documents/, etc.
 *
 * Required env vars:
 *   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
 *   SHAREPOINT_HOST (default: cloudfuzecom.sharepoint.com)
 *   SHAREPOINT_SITE (default: DOC360)
 *
 * Azure AD App permissions (Application type, admin consented):
 *   - Sites.Read.All
 *   - Files.Read.All (for downloading file content)
 */

let cachedToken = null;
let tokenExpiry = 0;
let cachedSiteId = null;
let cachedDriveId = null;

// ═══ AUTHENTICATION ═══

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('SharePoint not configured. Add MS_TENANT_ID, MS_CLIENT_ID, and MS_CLIENT_SECRET to .env');
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    }).toString()
  });

  if (!res.ok) {
    cachedToken = null;
    tokenExpiry = 0;
    const text = await res.text();
    throw new Error(`SharePoint auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + ((data.expires_in || 3600) - 300) * 1000;
  return cachedToken;
}

async function graphApi(path, options = {}) {
  const token = await getAccessToken();
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    if (res.status === 401) { cachedToken = null; tokenExpiry = 0; }
    const text = await res.text();
    throw new Error(`Graph API error (${res.status}): ${text}`);
  }

  return res.json();
}

async function graphApiBeta(path, options = {}) {
  const token = await getAccessToken();
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/beta${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    if (res.status === 401) { cachedToken = null; tokenExpiry = 0; }
    const text = await res.text();
    throw new Error(`Graph API (beta) error (${res.status}): ${text}`);
  }

  return res.json();
}

// ═══ SITE & DRIVE DISCOVERY ═══

async function getSiteId() {
  if (cachedSiteId) return cachedSiteId;
  const host = process.env.SHAREPOINT_HOST || 'cloudfuzecom.sharepoint.com';
  const siteName = process.env.SHAREPOINT_SITE || 'DOC360';
  const data = await graphApi(`/sites/${host}:/sites/${siteName}`);
  cachedSiteId = data.id;
  return cachedSiteId;
}

async function getDocumentsDriveId() {
  if (cachedDriveId) return cachedDriveId;
  const siteId = await getSiteId();
  const data = await graphApi(`/sites/${siteId}/drives`);
  const docDrive = (data.value || []).find(d =>
    d.name === 'Documents' || d.name === 'Shared Documents'
  );
  if (!docDrive) throw new Error('Documents drive not found in SharePoint site');
  cachedDriveId = docDrive.id;
  return cachedDriveId;
}

// ═══ SEARCH (Primary method) ═══

/**
 * Search across all CloudFuze SharePoint using Microsoft Graph Search.
 * This is the most powerful method — finds files across all sites/drives.
 */
export async function searchSharePoint(query, limit = 10) {
  const token = await getAccessToken();

  const res = await fetch('https://graph.microsoft.com/v1.0/search/query', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [{
        entityTypes: ['driveItem', 'listItem'],
        query: { queryString: query },
        from: 0,
        size: limit,
        region: 'US'
      }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn('Graph Search failed:', errText);
    // Fall back to drive search
    return searchDriveFiles(query, limit);
  }

  const data = await res.json();
  const hits = data.value?.[0]?.hitsContainers?.[0]?.hits || [];

  if (hits.length === 0) {
    // Fall back to drive search
    return searchDriveFiles(query, limit);
  }

  return hits.map(hit => {
    const r = hit.resource || {};
    return {
      name: r.name || 'Untitled',
      webUrl: r.webUrl || '',
      snippet: (hit.summary || '').replace(/<[^>]+>/g, '').substring(0, 300),
      lastModified: r.lastModifiedDateTime || null,
      size: r.size || 0,
      driveItemId: r.id || null,
      parentDriveId: r.parentReference?.driveId || null
    };
  });
}

/**
 * Fallback: Search within the DOC360 Documents drive.
 * Uses the drive search endpoint.
 */
async function searchDriveFiles(query, limit = 10) {
  const driveId = await getDocumentsDriveId();
  const data = await graphApi(`/drives/${driveId}/root/search(q='${encodeURIComponent(query)}')?$top=${limit}`);

  return (data.value || []).map(item => ({
    name: item.name || 'Untitled',
    webUrl: item.webUrl || '',
    snippet: '',
    lastModified: item.lastModifiedDateTime || null,
    size: item.size || 0,
    driveItemId: item.id || null,
    parentDriveId: driveId
  }));
}

// ═══ FILE CONTENT RETRIEVAL ═══

/**
 * Download and read the text content of a file from SharePoint.
 * Supports: .txt, .csv, .docx, .doc, .pptx, .xlsx, .pdf
 * For Office docs, uses Graph API PDF conversion then extracts text,
 * or downloads raw .docx and parses the XML inside.
 */
async function getFileContent(driveId, itemId) {
  const token = await getAccessToken();

  // First, get file metadata to know the type
  const meta = await graphApi(`/drives/${driveId}/items/${itemId}`);
  const name = meta.name || '';
  const ext = name.split('.').pop().toLowerCase();

  // For text files, download directly
  if (['txt', 'csv', 'md', 'json'].includes(ext)) {
    const contentRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`, {
      headers: { 'Authorization': `Bearer ${token}` },
      redirect: 'follow'
    });
    if (contentRes.ok) {
      return { content: await contentRes.text(), type: ext, name };
    }
  }

  // For Word documents (.docx, .doc), extract text from the XML inside the ZIP
  if (['docx', 'doc'].includes(ext)) {
    try {
      const contentRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`, {
        headers: { 'Authorization': `Bearer ${token}` },
        redirect: 'follow'
      });
      if (contentRes.ok) {
        const buffer = Buffer.from(await contentRes.arrayBuffer());
        const text = await extractTextFromDocx(buffer);
        if (text && text.length > 30) {
          return { content: text, type: 'docx', name };
        }
      }
    } catch (e) {
      console.warn(`Could not extract text from ${name}:`, e.message);
    }

    // Fallback: try Graph API's PDF conversion endpoint
    try {
      const pdfRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content?format=pdf`, {
        headers: { 'Authorization': `Bearer ${token}` },
        redirect: 'follow'
      });
      if (pdfRes.ok) {
        const buffer = Buffer.from(await pdfRes.arrayBuffer());
        const text = extractTextFromPdfBuffer(buffer);
        if (text && text.length > 50) {
          return { content: text, type: 'docx', name };
        }
      }
    } catch (e) { /* fall through */ }

    return { content: `[Word document: ${name} — could not extract text. URL: ${meta.webUrl}]`, type: 'docx', name };
  }

  // For PowerPoint files, try PDF conversion
  if (['pptx', 'ppt'].includes(ext)) {
    try {
      const pdfRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content?format=pdf`, {
        headers: { 'Authorization': `Bearer ${token}` },
        redirect: 'follow'
      });
      if (pdfRes.ok) {
        const buffer = Buffer.from(await pdfRes.arrayBuffer());
        const text = extractTextFromPdfBuffer(buffer);
        if (text && text.length > 50) {
          return { content: text, type: 'pptx', name };
        }
      }
    } catch (e) { /* fall through */ }
    return { content: `[PowerPoint: ${name} — could not extract text. URL: ${meta.webUrl}]`, type: 'pptx', name };
  }

  // For Excel files, try to read via worksheets API
  if (['xlsx', 'xls'].includes(ext)) {
    try {
      const worksheets = await graphApi(`/drives/${driveId}/items/${itemId}/workbook/worksheets`);
      const sheets = worksheets.value || [];

      let allContent = '';
      for (const sheet of sheets.slice(0, 3)) {
        try {
          const range = await graphApi(`/drives/${driveId}/items/${itemId}/workbook/worksheets/${sheet.id}/usedRange`);
          const rows = range.values || [];
          if (rows.length > 0) {
            allContent += `\n--- Sheet: ${sheet.name} ---\n`;
            if (rows[0]) {
              allContent += rows[0].join(' | ') + '\n';
              allContent += rows[0].map(() => '---').join(' | ') + '\n';
            }
            for (const row of rows.slice(1, 100)) {
              allContent += (row || []).join(' | ') + '\n';
            }
          }
        } catch (e) {
          allContent += `\n--- Sheet: ${sheet.name} (could not read) ---\n`;
        }
      }
      return { content: allContent.trim(), type: 'xlsx', name };
    } catch (e) {
      return { content: `[Excel file: ${name} — could not read contents via API. File URL: ${meta.webUrl}]`, type: 'xlsx', name };
    }
  }

  // For PDFs, try to get the text content via the content stream
  if (ext === 'pdf') {
    try {
      const contentRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`, {
        headers: { 'Authorization': `Bearer ${token}` },
        redirect: 'follow'
      });
      if (contentRes.ok) {
        const buffer = Buffer.from(await contentRes.arrayBuffer());
        const text = extractTextFromPdfBuffer(buffer);
        if (text && text.length > 50) {
          return { content: text, type: 'pdf', name };
        }
      }
    } catch (e) { /* fall through */ }
    return { content: `[PDF file: ${name} — download from SharePoint to view. URL: ${meta.webUrl}]`, type: 'pdf', name };
  }

  // For other files, return metadata
  return {
    content: `[File: ${name} (${ext}) — Size: ${Math.round((meta.size || 0) / 1024)}KB — URL: ${meta.webUrl}]`,
    type: ext,
    name
  };
}

/**
 * Extract text from a .docx file buffer.
 * A .docx is a ZIP archive — main content is in word/document.xml.
 * Uses Node.js built-in zlib to decompress.
 */
async function extractTextFromDocx(buffer) {
  const { Readable } = await import('stream');
  const { createInflateRaw } = await import('zlib');

  // Parse ZIP structure to find word/document.xml
  const entries = parseZipEntries(buffer);
  const docEntry = entries.find(e => e.name === 'word/document.xml');
  if (!docEntry) return '';

  // Decompress the entry
  let xmlContent;
  if (docEntry.compressionMethod === 0) {
    // Stored (no compression)
    xmlContent = buffer.slice(docEntry.dataOffset, docEntry.dataOffset + docEntry.compressedSize).toString('utf8');
  } else {
    // Deflated
    xmlContent = await new Promise((resolve, reject) => {
      const compressed = buffer.slice(docEntry.dataOffset, docEntry.dataOffset + docEntry.compressedSize);
      const inflate = createInflateRaw();
      const chunks = [];
      inflate.on('data', chunk => chunks.push(chunk));
      inflate.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      inflate.on('error', reject);
      inflate.end(compressed);
    });
  }

  // Extract text from XML: get content within <w:t> tags, respect <w:p> as paragraph breaks
  let text = xmlContent
    .replace(/<\/w:p>/g, '\n')              // paragraph breaks
    .replace(/<w:tab\/>/g, '\t')            // tabs
    .replace(/<w:br[^>]*\/>/g, '\n')        // line breaks
    .replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, '$1')  // extract text content
    .replace(/<[^>]+>/g, '')                // strip remaining XML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

/**
 * Parse ZIP file entries from a buffer (minimal parser for .docx/.pptx).
 */
function parseZipEntries(buffer) {
  const entries = [];
  let offset = 0;

  while (offset < buffer.length - 4) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // Not a local file header

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + nameLength).toString('utf8');
    const dataOffset = offset + 30 + nameLength + extraLength;

    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, dataOffset });
    offset = dataOffset + compressedSize;
  }

  return entries;
}

/**
 * Basic PDF text extraction from buffer.
 * Extracts text from PDF stream objects. Not perfect but works for text-based PDFs.
 */
function extractTextFromPdfBuffer(buffer) {
  const str = buffer.toString('latin1');
  const textChunks = [];

  // Find text between BT and ET (Begin Text / End Text) operators
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(str)) !== null) {
    const block = match[1];
    // Extract text from Tj, TJ, and ' operators
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      textChunks.push(tjMatch[1]);
    }
    // TJ arrays
    const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
    let arrMatch;
    while ((arrMatch = tjArrayRegex.exec(block)) !== null) {
      const items = arrMatch[1];
      const textParts = items.match(/\(([^)]*)\)/g);
      if (textParts) {
        textChunks.push(textParts.map(p => p.slice(1, -1)).join(''));
      }
    }
  }

  // Also try to find stream content that looks like text
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  while ((match = streamRegex.exec(str)) !== null) {
    const content = match[1];
    // If it contains readable text (ASCII), extract it
    const readable = content.replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s{3,}/g, ' ').trim();
    if (readable.length > 50 && readable.split(' ').length > 10) {
      textChunks.push(readable);
    }
  }

  return textChunks.join(' ').replace(/\s+/g, ' ').trim();
}

// ═══ PAGES ═══

/**
 * List SharePoint site pages (uses beta API for more complete results).
 */
export async function listPages(limit = 50) {
  const siteId = await getSiteId();
  const data = await graphApiBeta(`/sites/${siteId}/pages?$top=${limit}`);

  return (data.value || []).map(page => ({
    id: page.id,
    title: page.title || page.name || 'Untitled',
    name: page.name,
    webUrl: page.webUrl,
    lastModified: page.lastModifiedDateTime,
    description: page.description || ''
  }));
}

/**
 * Get page content by ID (beta API with canvas layout).
 */
export async function getPageContent(pageId) {
  const siteId = await getSiteId();
  const data = await graphApiBeta(`/sites/${siteId}/pages/${pageId}/microsoft.graph.sitePage?$expand=canvasLayout`);

  let content = '';
  if (data.canvasLayout?.horizontalSections) {
    for (const section of data.canvasLayout.horizontalSections) {
      for (const column of (section.columns || [])) {
        for (const webPart of (column.webparts || [])) {
          if (webPart.innerHtml) {
            content += stripHtml(webPart.innerHtml) + '\n\n';
          }
        }
      }
    }
  }

  return {
    title: data.title || '',
    webUrl: data.webUrl,
    content: content.trim(),
    lastModified: data.lastModifiedDateTime
  };
}

// ═══ LIST FOLDER CONTENTS ═══

/**
 * List all files in a specific SharePoint folder.
 */
export async function listFolder(folderPath, limit = 50) {
  const driveId = await getDocumentsDriveId();
  const encodedPath = encodeURIComponent(folderPath).replace(/%2F/g, '/');
  const data = await graphApi(`/drives/${driveId}/root:/${encodedPath}:/children?$top=${limit}`);

  return (data.value || []).map(item => ({
    name: item.name,
    webUrl: item.webUrl,
    size: item.size || 0,
    isFolder: !!item.folder,
    childCount: item.folder?.childCount || 0,
    lastModified: item.lastModifiedDateTime,
    driveItemId: item.id,
    driveId
  }));
}

// ═══ HIGH-LEVEL: SEARCH AND FETCH ═══

/**
 * Main entry point for the agent tool.
 * Searches SharePoint for a query, then fetches the content of the best matching file.
 */
export async function searchAndFetchContent(query) {
  // Search across all SharePoint
  const results = await searchSharePoint(query, 10);

  if (results.length === 0) {
    // As a last resort, try listing the Product Features folder
    try {
      const files = await listFolder('CloudFuze Product Features and Combinations');
      const queryLower = query.toLowerCase();
      const matches = files.filter(f => f.name.toLowerCase().includes(queryLower.split(' ')[0]));
      if (matches.length > 0) {
        return {
          found: true,
          query,
          totalResults: matches.length,
          topResult: null,
          fileList: matches.map(f => ({ name: f.name, webUrl: f.webUrl, size: f.size })),
          otherResults: []
        };
      }
    } catch (e) { /* ignore */ }

    return { found: false, query, message: `No results found for "${query}" in SharePoint.` };
  }

  // Fetch content from the top 3 results (not just 1) for comprehensive answers
  const fetchedResults = [];
  const MAX_FETCH = 3;
  const MAX_CONTENT_PER_FILE = 5000;

  // Fetch all file contents in parallel (was sequential — saves 2-6s)
  const fetchPromises = results.slice(0, MAX_FETCH).map(async (result) => {
    let fileContent = null;

    // For Site Pages (.aspx) — use the beta pages API
    if (result.webUrl && result.webUrl.includes('/SitePages/') && !result.parentDriveId) {
      try {
        const pageData = await getPageByUrl(result.webUrl);
        if (pageData?.content) {
          fileContent = { content: pageData.content, type: 'aspx', name: pageData.title || result.name };
        }
      } catch (e) {
        console.warn(`Could not fetch site page ${result.name}:`, e.message);
      }
    }
    // For drive items (docx, xlsx, pdf, etc.)
    else if (result.driveItemId && result.parentDriveId) {
      try {
        fileContent = await getFileContent(result.parentDriveId, result.driveItemId);
      } catch (e) {
        console.warn(`Could not fetch content for ${result.name}:`, e.message);
      }
    }

    return {
      name: fileContent?.name || result.name,
      webUrl: result.webUrl,
      snippet: result.snippet,
      lastModified: result.lastModified,
      content: fileContent?.content?.substring(0, MAX_CONTENT_PER_FILE) || null,
      contentType: fileContent?.type || null
    };
  });

  const settled = await Promise.allSettled(fetchPromises);
  for (const r of settled) {
    if (r.status === 'fulfilled') fetchedResults.push(r.value);
  }

  // Sort fetched results so ones with actual content come first
  const withContent = fetchedResults.filter(r => r.content && r.content.length > 50);
  const withoutContent = fetchedResults.filter(r => !r.content || r.content.length <= 50);
  const sortedResults = [...withContent, ...withoutContent];

  return {
    found: true,
    query,
    totalResults: results.length,
    topResult: sortedResults[0] || null,
    additionalResults: sortedResults.slice(1),
    otherResults: results.slice(MAX_FETCH, 8).map(r => ({
      name: r.name,
      webUrl: r.webUrl,
      snippet: r.snippet,
      lastModified: r.lastModified
    }))
  };
}

/**
 * Fetch a specific SharePoint page or file by URL.
 */
export async function getPageByUrl(url) {
  // Clean the URL
  const cleanUrl = url.split('?')[0];

  // Check if it's a SitePages URL
  if (cleanUrl.includes('/SitePages/')) {
    const rawPageName = cleanUrl.split('/SitePages/').pop();
    // Decode URL-encoded page name: "Box%20for%20Business..." → "Box for Business..."
    const pageName = decodeURIComponent(rawPageName);
    // Normalize for matching: remove .aspx, replace hyphens/underscores with spaces, lowercase
    const normalizedSearch = pageName.replace('.aspx', '').replace(/[-_]/g, ' ').toLowerCase().trim();

    const pages = await listPages(100);
    const match = pages.find(p => {
      const normalizedName = (p.name || '').replace('.aspx', '').replace(/[-_]/g, ' ').toLowerCase().trim();
      const normalizedTitle = (p.title || '').toLowerCase().trim();
      return normalizedName === normalizedSearch
        || normalizedTitle === normalizedSearch
        || normalizedName.includes(normalizedSearch)
        || normalizedSearch.includes(normalizedName)
        || normalizedTitle.includes(normalizedSearch);
    });
    if (match) {
      return getPageContent(match.id);
    }
  }

  // Check if it's a document URL — try to find it via search
  const fileName = decodeURIComponent(cleanUrl.split('/').pop());
  const results = await searchSharePoint(fileName.replace(/\.[^.]+$/, ''), 5);

  if (results.length > 0 && results[0].driveItemId && results[0].parentDriveId) {
    const content = await getFileContent(results[0].parentDriveId, results[0].driveItemId);
    return {
      title: content.name,
      webUrl: results[0].webUrl,
      content: content.content,
      lastModified: results[0].lastModified
    };
  }

  throw new Error(`Could not find or access: ${cleanUrl}`);
}

// ═══ UTILITIES ═══

function stripHtml(html) {
  return (html || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isSharePointConfigured() {
  return !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
}
