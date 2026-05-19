// Reads File objects from <input type="file"> into in-memory attachment objects
// that can be shipped to the chat endpoint.
//
// Output shape per attachment:
//   { name, path, mime, size, kind: 'image'|'text'|'pdf'|'skipped', content, error? }
//     - kind 'image' → content is a base64 dataURL (sent to vision model)
//     - kind 'text'  → content is plain UTF-8 text
//     - kind 'pdf'   → content is extracted text (PDF parsed client-side)
//     - kind 'skipped' → file was unsupported or oversized; error explains why

const MAX_FILE_BYTES = 8 * 1024 * 1024        // 8 MB per file
const MAX_TOTAL_BYTES = 24 * 1024 * 1024      // 24 MB total payload
const MAX_FILES = 30

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif']
const TEXT_EXT = [
  'md', 'mdx', 'txt', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml',
  'html', 'htm', 'xml', 'log', 'ini', 'env', 'toml',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'css', 'scss', 'sass', 'less',
  'py', 'rb', 'go', 'java', 'kt', 'swift', 'rs', 'php', 'sh', 'ps1', 'sql', 'r'
]

function extOf(name) {
  const idx = name.lastIndexOf('.')
  if (idx < 0) return ''
  return name.slice(idx + 1).toLowerCase()
}

function classify(file) {
  const ext = extOf(file.name)
  if (file.type?.startsWith('image/') || IMAGE_EXT.includes(ext)) return 'image'
  if (file.type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (file.type?.startsWith('text/') || TEXT_EXT.includes(ext) || file.type === 'application/json') return 'text'
  return 'unknown'
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error || new Error('Read failed'))
    r.readAsDataURL(file)
  })
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error || new Error('Read failed'))
    r.readAsText(file)
  })
}

async function extractPdfText(file) {
  // Dynamic import keeps pdf.js out of the main bundle
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const parts = []
  const maxPages = Math.min(doc.numPages, 50) // cap at 50 pages
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i)
    const text = await page.getTextContent()
    const pageText = text.items.map(it => it.str).join(' ')
    parts.push(`--- Page ${i} ---\n${pageText}`)
  }
  if (doc.numPages > maxPages) {
    parts.push(`\n[Note: file has ${doc.numPages} pages; only first ${maxPages} were extracted]`)
  }
  return parts.join('\n\n')
}

export async function readAttachments(fileList) {
  const files = Array.from(fileList || []).slice(0, MAX_FILES)
  const out = []
  let totalBytes = 0

  for (const file of files) {
    const path = file.webkitRelativePath || file.name
    const base = { name: file.name, path, mime: file.type || '', size: file.size }

    if (file.size > MAX_FILE_BYTES) {
      out.push({ ...base, kind: 'skipped', content: '', error: `File too large (>${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)` })
      continue
    }
    if (totalBytes + file.size > MAX_TOTAL_BYTES) {
      out.push({ ...base, kind: 'skipped', content: '', error: 'Total attachment size limit reached' })
      continue
    }

    const kind = classify(file)
    try {
      if (kind === 'image') {
        const dataUrl = await readAsDataURL(file)
        out.push({ ...base, kind: 'image', content: dataUrl })
        totalBytes += file.size
      } else if (kind === 'text') {
        const text = await readAsText(file)
        out.push({ ...base, kind: 'text', content: text })
        totalBytes += file.size
      } else if (kind === 'pdf') {
        const text = await extractPdfText(file)
        out.push({ ...base, kind: 'pdf', content: text })
        totalBytes += file.size
      } else {
        out.push({ ...base, kind: 'skipped', content: '', error: 'Unsupported file type' })
      }
    } catch (err) {
      out.push({ ...base, kind: 'skipped', content: '', error: err.message || 'Read failed' })
    }
  }

  return out
}

export function attachmentDisplaySummary(attachments) {
  if (!attachments?.length) return ''
  const groups = { image: 0, text: 0, pdf: 0, skipped: 0 }
  for (const a of attachments) groups[a.kind] = (groups[a.kind] || 0) + 1
  const parts = []
  if (groups.image) parts.push(`${groups.image} image${groups.image > 1 ? 's' : ''}`)
  if (groups.text) parts.push(`${groups.text} text file${groups.text > 1 ? 's' : ''}`)
  if (groups.pdf) parts.push(`${groups.pdf} PDF${groups.pdf > 1 ? 's' : ''}`)
  if (groups.skipped) parts.push(`${groups.skipped} skipped`)
  return parts.join(', ')
}
