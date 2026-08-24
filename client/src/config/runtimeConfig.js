// Resolves client configuration that must stay changeable after the bundle is built.
//
// Vite freezes `import.meta.env.VITE_*` into the built JavaScript, so a bundle built with tracking
// on could never be un-tracked without a rebuild, and one built without an ID could never be turned
// on. Reading window.__APP_CONFIG__ first (set by public/runtime-config.js, which Vite copies
// verbatim into dist/) keeps the value editable on the server after a build.

const runtime = typeof window !== 'undefined' && window.__APP_CONFIG__ ? window.__APP_CONFIG__ : {}

// `import.meta.env` exists under Vite but is undefined in plain Node (the test runner), hence `??`.
const buildTime = import.meta.env ?? {}

// Treated as "not set": undefined, null, blank, and the "__PLACEHOLDER__" shape container
// entrypoints substitute at start-up -- an unsubstituted placeholder must fall through, not be used.
function isUnset(v) {
  if (typeof v !== 'string') return true
  const t = v.trim()
  return !t || /^__.*__$/.test(t)
}

function resolve(runtimeValue, buildTimeValue) {
  for (const raw of [runtimeValue, buildTimeValue]) {
    if (!isUnset(raw)) return raw.trim()
  }
  return ''
}

export const HOTJAR_SITE_ID = resolve(runtime.hotjarSiteId, buildTime.VITE_HOTJAR_SITE_ID)
