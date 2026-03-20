const ARTICLE_CSS = `/* CloudFuze Blog Article Styles */
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #fff; }

.cf-article {
  font-family: 'Poppins', Arial, Helvetica, sans-serif;
  max-width: 820px;
  margin: 0 auto;
  padding: 48px 24px;
  color: #424242;
  line-height: 32px;
  font-size: 16px;
  background: #ffffff;
}

/* Headings */
.cf-article h1 {
  font-size: 36px;
  font-weight: 700;
  color: #092933;
  line-height: 1.3;
  margin: 0 0 24px 0;
}

.cf-article h2 {
  font-size: 24px;
  font-weight: 600;
  color: #092933;
  margin: 40px 0 16px 0;
  line-height: 1.35;
}

.cf-article h3 {
  font-size: 20px;
  font-weight: 600;
  color: #092933;
  margin: 28px 0 12px 0;
  line-height: 1.4;
}

/* Body */
.cf-article p {
  margin: 14px 0;
  color: #424242;
  font-size: 16px;
  line-height: 32px;
}

.cf-article a {
  color: #0129ac;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.cf-article a:hover {
  color: #6239bd;
}

.cf-article strong {
  font-weight: 600;
  color: #092933;
}

.cf-article em {
  font-style: italic;
}

/* Lists */
.cf-article ul, .cf-article ol {
  margin: 16px 0;
  padding-left: 28px;
}

.cf-article ul { list-style: disc; }
.cf-article ol { list-style: decimal; }

.cf-article li {
  margin: 8px 0;
  line-height: 30px;
  color: #424242;
  font-size: 16px;
}

.cf-article li::marker {
  color: #0129ac;
  font-weight: 600;
}

/* List Box — blue background for bullet/numbered lists (matches CloudFuze blog) */
.cf-list-box {
  background: linear-gradient(170deg, #0129ac -200%, #e1ecff 30%, #e1ecff 70%, #0129ac 180%);
  padding: 24px 28px;
  border-radius: 8px;
  margin: 20px 0;
  border: 1px solid #c5d5f0;
}

.cf-list-box ul, .cf-list-box ol {
  margin: 0;
  padding-left: 24px;
}

.cf-list-box li {
  color: #1a2b3d;
  margin: 10px 0;
}

/* Sub-section box — wraps groups of H3 + paragraph steps */
.cf-subsection-box {
  background: linear-gradient(170deg, #0129ac -200%, #e1ecff 30%, #e1ecff 70%, #0129ac 180%);
  padding: 24px 28px;
  border-radius: 8px;
  margin: 20px 0;
  border: 1px solid #c5d5f0;
}

.cf-subsection-box h3 {
  font-size: 18px;
  font-weight: 600;
  color: #092933;
  margin: 16px 0 6px 0;
}

.cf-subsection-box h3:first-child {
  margin-top: 0;
}

.cf-subsection-box p {
  margin: 6px 0 14px 0;
  color: #1a2b3d;
}

/* Key Takeaways highlight box — heading + list together */
.cf-highlight-box {
  background: linear-gradient(170deg, #0129ac -200%, #e1ecff 30%, #e1ecff 70%, #0129ac 180%);
  padding: 28px 24px;
  border-radius: 8px;
  margin: 28px 0;
  border: 1px solid #c5d5f0;
}

.cf-highlight-box h2, .cf-highlight-box h3 {
  color: #092933;
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 14px 0;
  padding: 0;
}

.cf-highlight-box ul, .cf-highlight-box ol {
  margin: 8px 0;
}

.cf-highlight-box li {
  color: #1a2b3d;
}

/* Blockquote / Callout */
.cf-article blockquote {
  margin: 24px 0;
  padding: 20px 24px;
  border-left: 4px solid #0129ac;
  background: #f4f6f7;
  border-radius: 0 8px 8px 0;
  color: #333;
  font-style: normal;
}

.cf-article blockquote p {
  margin: 4px 0;
  color: #333;
}

/* Divider */
.cf-article hr {
  border: none;
  border-top: 1px solid #e8ecf0;
  margin: 36px 0;
}

/* Tables */
.cf-article table {
  width: 100%;
  border-collapse: collapse;
  margin: 24px 0;
  font-size: 15px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e8ecf0;
}

.cf-article thead th {
  background: #0129ac;
  color: #fff;
  font-weight: 600;
  padding: 14px 16px;
  text-align: left;
  font-size: 14px;
}

.cf-article tbody td {
  padding: 12px 16px;
  border-bottom: 1px solid #e8ecf0;
  color: #424242;
}

.cf-article tbody tr:nth-child(even) td {
  background: #f4f6f7;
}

.cf-article tbody tr:hover td {
  background: #e8f0fe;
}

/* Code */
.cf-article code {
  background: #f4f6f7;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  color: #6239bd;
  font-family: 'Courier New', monospace;
}

.cf-article pre {
  background: #092933;
  color: #e5e7eb;
  padding: 20px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 24px 0;
  font-size: 14px;
  line-height: 1.6;
}

.cf-article pre code {
  background: none;
  padding: 0;
  color: inherit;
}

/* Misc */
.cf-article mark {
  background: #fff3cd;
  padding: 1px 4px;
  border-radius: 2px;
}

.cf-article img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 24px 0;
}

/* CTA Button */
.cf-cta-btn {
  display: inline-block;
  padding: 12px 28px;
  background: #0129ac;
  color: #fff !important;
  font-weight: 600;
  font-size: 14px;
  text-transform: uppercase;
  text-decoration: none !important;
  border-radius: 4px;
  border: 2px solid #0129ac;
  margin: 16px 0;
  letter-spacing: 0.5px;
}

.cf-cta-btn:hover {
  background: #6239bd;
  border-color: #6239bd;
}`

function stripSourceBlocks(html) {
  if (!html) return ''

  let cleaned = html

  cleaned = cleaned.replace(/<blockquote[^>]*>[\s\S]*?(?:📋|Sources?\s+for\s+this\s+section|Sources?\s+for\s+this\s+article)[\s\S]*?<\/blockquote>/gi, '')
  cleaned = cleaned.replace(/<p[^>]*>(?:<em>)?(?:<strong>)?[^<]*📋[^<]*(?:<\/strong>)?(?:<\/em>)?<\/p>/gi, '')
  cleaned = cleaned.replace(/<p[^>]*>(?:<em>)?(?:<strong>)?\*?Sourced? from[^<]*(?:<\/strong>)?(?:<\/em>)?<\/p>/gi, '')
  cleaned = cleaned.replace(/<p[^>]*>(?:<em>)?(?:<strong>)?\*?Source:?[^<]*(?:<\/strong>)?(?:<\/em>)?<\/p>/gi, '')
  cleaned = cleaned.replace(/<p[^>]*>(?:<em>)?(?:<strong>)?\*?Sources:?[^<]*(?:<\/strong>)?(?:<\/em>)?<\/p>/gi, '')
  cleaned = cleaned.replace(/<p[^>]*>(?:<em>)?(?:<strong>)?\*?FAQs will be[^<]*(?:<\/strong>)?(?:<\/em>)?<\/p>/gi, '')
  cleaned = cleaned.replace(/<p[^>]*><em>[^<]*(?:Source|Sourced|FAQ pipeline|Fanout|Google PAA|Reddit|Quora|Internal SharePoint|verify link|verify product)[^<]*<\/em><\/p>/gi, '')
  cleaned = cleaned.replace(/<p[^>]*>[^<]*\*?Source:[^<]*<\/p>/gi, '')
  cleaned = cleaned.replace(/<p[^>]*>[^<]*\*?Sourced from[^<]*<\/p>/gi, '')
  cleaned = cleaned.replace(/<p[^>]*>[^<]*\*?Sources for this[^<]*<\/p>/gi, '')
  cleaned = cleaned.replace(/<p[^>]*>[^<]*(?:🔗\s*Internal SharePoint|⚠️\s*verify)[^<]*<\/p>/gi, '')
  cleaned = cleaned.replace(/<li[^>]*>[^<]*(?:🔗\s*Internal SharePoint|⚠️\s*verify link|📋\s*Sources)[^<]*<\/li>/gi, '')
  cleaned = cleaned.replace(/<h2[^>]*>[^<]*Semantic Keywords[^<]*<\/h2>/gi, '')
  cleaned = cleaned.replace(/<p[^>]*>(?:<strong>)?(?:Primary Keyword|Secondary Keywords|LSI|Question Keywords|Entity Keywords)[^<]*(?:<\/strong>)?[^<]*<\/p>/gi, '')
  cleaned = cleaned.replace(/🔥/g, '').replace(/⬆️/g, '').replace(/📌/g, '')
  cleaned = cleaned.replace(/<hr\s*\/?>\s*<hr\s*\/?>/gi, '<hr />')
  cleaned = cleaned.replace(/<blockquote[^>]*>\s*<\/blockquote>/gi, '')
  cleaned = cleaned.replace(/<ul[^>]*>\s*<\/ul>/gi, '')
  cleaned = cleaned.replace(/<ol[^>]*>\s*<\/ol>/gi, '')

  return cleaned
}

function wrapListsInBoxes(html) {
  let result = html

  // Wrap top-level <ul> and <ol> in cf-list-box (handle nesting by matching balanced tags)
  result = result.replace(/<(ul|ol)([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag, attrs, inner) => {
    // If this list is already inside a cf-list-box, skip
    return `<div class="cf-list-box"><${tag}${attrs}>${inner}</${tag}></div>`
  })

  return result
}

function wrapH3SubsectionsInBoxes(html) {
  // Detect consecutive H3 + paragraph groups (e.g. "1. Validation Checks" followed by paragraph)
  // and wrap them together in a subsection box
  const h3Pattern = /<h3[^>]*>.*?<\/h3>/i
  if (!h3Pattern.test(html)) return html

  // Split content into tokens: h3 headings and everything else
  const tokens = html.split(/(<h3[^>]*>[\s\S]*?<\/h3>)/gi)
  let result = ''
  let grouping = false
  let groupContent = ''

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t]
    const isH3 = /<h3[^>]*>/i.test(token)
    const isNumberedH3 = /<h3[^>]*>\s*(?:<strong>)?\s*\d+[\.\)]/i.test(token)

    if (isNumberedH3) {
      if (!grouping) {
        grouping = true
        groupContent = token
      } else {
        groupContent += token
      }
    } else if (grouping) {
      // Non-H3 content while grouping: include paragraphs that follow the H3
      const isNextTokenH3 = t + 1 < tokens.length && /<h3[^>]*>\s*(?:<strong>)?\s*\d+[\.\)]/i.test(tokens[t + 1])
      if (isNextTokenH3 || token.trim() === '') {
        groupContent += token
      } else {
        // This is the last paragraph after the last numbered H3 in the group
        groupContent += token
        // Check if there's another numbered H3 coming (look ahead past whitespace)
        let hasMoreNumbered = false
        for (let look = t + 1; look < tokens.length; look++) {
          if (tokens[look].trim() === '') continue
          hasMoreNumbered = /<h3[^>]*>\s*(?:<strong>)?\s*\d+[\.\)]/i.test(tokens[look])
          break
        }
        if (!hasMoreNumbered) {
          result += `<div class="cf-subsection-box">${groupContent}</div>`
          grouping = false
          groupContent = ''
        }
      }
    } else {
      result += token
    }
  }

  if (grouping && groupContent) {
    result += `<div class="cf-subsection-box">${groupContent}</div>`
  }

  return result
}

function styleSection(sectionBody) {
  let styled = sectionBody
  const hasList = /<(ul|ol)[\s>]/i.test(styled)
  const hasNumberedH3 = /<h3[^>]*>\s*(?:<strong>)?\s*\d+[\.\)]/i.test(styled)

  if (hasList) {
    styled = wrapListsInBoxes(styled)
  }
  if (hasNumberedH3) {
    styled = wrapH3SubsectionsInBoxes(styled)
  }
  return styled
}

function processHTML(rawHtml) {
  if (!rawHtml) return ''

  let cleaned = stripSourceBlocks(rawHtml)

  const parts = cleaned.split(/(<h2[^>]*>.*?<\/h2>)/gi)
  let result = ''
  let i = 0

  while (i < parts.length) {
    const part = parts[i]
    const h2Match = part.match(/<h2[^>]*>(.*?)<\/h2>/i)

    if (h2Match) {
      const heading = h2Match[1].replace(/<[^>]+>/g, '').toLowerCase()

      let sectionBody = ''
      let j = i + 1
      while (j < parts.length && !/<h2[^>]*>/i.test(parts[j])) {
        sectionBody += parts[j]
        j++
      }

      const isFaq = /faq|frequently\s*asked/i.test(heading)
      const isKeyTakeaway = /key\s*take\s*away|takeaway|highlights|at\s*a\s*glance/i.test(heading)

      if (isFaq) {
        sectionBody = sectionBody.replace(/\s*🔥\s*/g, '').replace(/\s*⬆️\s*/g, '')
        result += part + sectionBody
      } else if (isKeyTakeaway) {
        result += `<div class="cf-highlight-box">${part}${sectionBody}</div>`
      } else {
        result += part + styleSection(sectionBody)
      }

      i = j
    } else {
      result += part
      i++
    }
  }

  return result
}

function buildFullHTML(bodyHtml, topic, forPreview = false) {
  const styled = processHTML(bodyHtml)
  const previewScript = forPreview ? `
  <script>
    document.addEventListener('click', function(e) {
      var a = e.target.closest('a');
      if (a) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  </script>` : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${(topic || 'CloudFuze Article').replace(/</g, '&lt;')}</title>
  <style>
${ARTICLE_CSS}
  </style>
</head>
<body>
  <article class="cf-article">
${styled}
  </article>${previewScript}
</body>
</html>`
}

const POPUP_SKELETON = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Article Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #f9fafb; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: #111827; flex-shrink: 0; }
    .toolbar-left { display: flex; align-items: center; gap: 16px; }
    .toolbar-right { display: flex; align-items: center; gap: 8px; }
    .toolbar h1 { font-size: 13px; font-weight: 600; color: #f9fafb; letter-spacing: 0.01em; }
    .tab-group { display: flex; background: #1f2937; border-radius: 8px; padding: 3px; }
    .tab-btn { display: flex; align-items: center; gap: 6px; padding: 7px 16px; border: none; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s; background: transparent; color: #9ca3af; }
    .tab-btn.active { background: #4f46e5; color: #fff; }
    .tab-btn:hover:not(.active) { color: #e5e7eb; background: #374151; }
    .tab-btn svg { flex-shrink: 0; }
    .action-btn { display: flex; align-items: center; gap: 6px; padding: 7px 16px; border: 1px solid #374151; border-radius: 8px; background: transparent; color: #d1d5db; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
    .action-btn:hover { background: #1f2937; color: #fff; border-color: #4b5563; }
    .action-btn.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
    .action-btn.primary:hover { background: #4338ca; border-color: #4338ca; }
    .action-btn.copied { background: #059669; border-color: #059669; color: #fff; }
    .content { flex: 1; overflow: hidden; position: relative; }
    .content iframe { width: 100%; height: 100%; border: 0; background: #fff; display: block; }
    .code-view { width: 100%; height: 100%; overflow: auto; background: #0a0a0f; padding: 24px; }
    .code-view pre { font-size: 13px; line-height: 1.7; font-family: 'Cascadia Code', 'Fira Code', Consolas, 'Courier New', monospace; color: #d1d5db; white-space: pre-wrap; word-break: break-word; margin: 0; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <h1 id="popup-title">Article Preview & Code</h1>
      <div class="tab-group">
        <button class="tab-btn active" id="tab-preview" onclick="switchTab('preview')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Preview
        </button>
        <button class="tab-btn" id="tab-code" onclick="switchTab('code')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          HTML + CSS
        </button>
      </div>
    </div>
    <div class="toolbar-right">
      <button class="action-btn primary hidden" id="copy-btn" onclick="copyCode()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        <span id="copy-label">Copy Code</span>
      </button>
      <button class="action-btn" onclick="downloadHTML()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download .html
      </button>
    </div>
  </div>
  <div class="content">
    <iframe id="preview-frame" title="Article Preview" sandbox="allow-same-origin allow-scripts"></iframe>
    <div id="code-view" class="code-view hidden">
      <pre><code id="code-content"></code></pre>
    </div>
  </div>
  <script>
    var previewHTML = window.__previewHTML || '';
    var exportHTML = window.__exportHTML || '';
    var topic = window.__topic || 'Article';

    document.title = 'Preview \\u2014 ' + topic;
    document.getElementById('popup-title').textContent = topic || 'Article Preview & Code';
    document.getElementById('preview-frame').srcdoc = previewHTML;
    document.getElementById('code-content').textContent = exportHTML;

    function switchTab(tab) {
      var frame = document.getElementById('preview-frame');
      var codeView = document.getElementById('code-view');
      var tabPreview = document.getElementById('tab-preview');
      var tabCode = document.getElementById('tab-code');
      var copyBtn = document.getElementById('copy-btn');

      if (tab === 'preview') {
        frame.classList.remove('hidden');
        codeView.classList.add('hidden');
        tabPreview.classList.add('active');
        tabCode.classList.remove('active');
        copyBtn.classList.add('hidden');
      } else {
        frame.classList.add('hidden');
        codeView.classList.remove('hidden');
        tabPreview.classList.remove('active');
        tabCode.classList.add('active');
        copyBtn.classList.remove('hidden');
      }
    }

    function copyCode() {
      navigator.clipboard.writeText(exportHTML).then(function() {
        var btn = document.getElementById('copy-btn');
        var label = document.getElementById('copy-label');
        btn.classList.add('copied');
        label.textContent = 'Copied!';
        setTimeout(function() {
          btn.classList.remove('copied');
          label.textContent = 'Copy Code';
        }, 2000);
      });
    }

    function downloadHTML() {
      var blob = new Blob([exportHTML], { type: 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (topic || 'article').replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`

export function openCodePreview(html, topic) {
  const previewHTML = buildFullHTML(html, topic, true)
  const exportHTML = buildFullHTML(html, topic, false)

  const width = Math.min(1400, window.screen.availWidth - 100)
  const height = Math.min(900, window.screen.availHeight - 100)
  const left = Math.round((window.screen.availWidth - width) / 2)
  const top = Math.round((window.screen.availHeight - height) / 2)

  const popup = window.open(
    '',
    'cf-article-preview',
    `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
  )

  if (!popup) {
    alert('Please allow popups for this site to use Preview & Code.')
    return
  }

  popup.__previewHTML = previewHTML
  popup.__exportHTML = exportHTML
  popup.__topic = topic || 'Article'

  popup.document.open()
  popup.document.write(POPUP_SKELETON)
  popup.document.close()
  popup.focus()
}

export default openCodePreview
