// Tests for the Hotjar loader. Plain Node, no test framework -- the repo has none, and Hotjar is
// not a reason to introduce one. Run with: npm test --prefix client
//
// Each case runs in its OWN child process on purpose. HOTJAR_SITE_ID is captured once at module
// load in config/runtimeConfig.js, so re-importing hotjar.js with a cache-busting query would still
// reuse the already-evaluated resolver and read a stale site ID. A fresh process is the honest way
// to re-read it.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)

/** Minimal DOM stand-in: only the four things initHotjar actually touches. */
function installDom(hotjarSiteId) {
  const head = {
    children: [],
    appendChild(el) {
      this.children.push(el)
      return el
    },
  }
  globalThis.document = {
    head,
    getElementById: (id) => head.children.find((e) => e.id === id) || null,
    createElement: () => ({ id: '', async: false, src: '' }),
  }
  globalThis.window = { __APP_CONFIG__: { hotjarSiteId } }
  return head
}

function script(head) {
  return head.children.find((e) => e.id === 'hotjar-snippet') || null
}

const CASES = {
  async 'does nothing when no site ID is configured'() {
    const head = installDom('')
    const { initHotjar, isHotjarEnabled, identifyHotjarUser } = await import('./hotjar.js')

    assert.equal(isHotjarEnabled(), false)
    assert.equal(initHotjar(), false)
    assert.equal(script(head), null, 'no script element should be created')
    assert.equal(globalThis.window._hjSettings, undefined)
    // identify must also no-op rather than throwing when Hotjar is off.
    assert.equal(identifyHotjarUser({ email: 'a@b.com' }), false)
  },

  async 'injects once and sets a numeric hjid'() {
    const head = installDom('6766335')
    const { initHotjar } = await import('./hotjar.js')

    assert.equal(initHotjar(), true)
    const el = script(head)
    assert.ok(el, 'script element should be injected')
    assert.equal(el.src, 'https://static.hotjar.com/c/hotjar-6766335.js?sv=6')
    assert.equal(el.async, true)
    // Number, not string -- the remote loader reads this value back.
    assert.equal(globalThis.window._hjSettings.hjid, 6766335)
    assert.equal(typeof globalThis.window._hjSettings.hjid, 'number')
    assert.equal(globalThis.window._hjSettings.hjsv, 6)

    // Idempotent: StrictMode double-invocation must not open a second recording.
    assert.equal(initHotjar(), false)
    assert.equal(head.children.length, 1)
  },

  async 'refuses a non-numeric site ID and says why'() {
    const head = installDom('site-1234')
    const warnings = []
    const realWarn = console.warn
    console.warn = (...args) => warnings.push(args.join(' '))
    try {
      const { initHotjar } = await import('./hotjar.js')
      assert.equal(initHotjar(), false)
      assert.equal(script(head), null, 'must not request hotjar-NaN.js')
      assert.equal(warnings.length, 1, 'a typo should not look like a deliberate opt-out')
      assert.match(warnings[0], /digits only/)
    } finally {
      console.warn = realWarn
    }
  },

  async 'identifies an MSAL account by lowercased username'() {
    installDom('6766335')
    const { initHotjar, identifyHotjarUser } = await import('./hotjar.js')
    initHotjar()

    // MSAL AccountInfo carries the sign-in address on `username`, not `email`.
    assert.equal(identifyHotjarUser({ username: 'Jane.Doe@cloudfuze.com', name: 'Jane Doe' }), true)
    const queued = globalThis.window.hj.q
    assert.equal(queued.length, 1)
    const [event, id, attrs] = queued[0]
    assert.equal(event, 'identify')
    assert.equal(id, 'jane.doe@cloudfuze.com', 'must lowercase so one person is not two users')
    assert.deepEqual(attrs, { role: 'UNKNOWN' })

    // Nothing usable to identify by -> no call, no crash.
    assert.equal(identifyHotjarUser({}), false)
    assert.equal(identifyHotjarUser(undefined), false)
    assert.equal(queued.length, 1)
  },
}

const requested = process.argv[2]

if (requested) {
  const fn = CASES[requested]
  if (!fn) {
    console.error(`unknown case: ${requested}`)
    process.exit(2)
  }
  await fn()
} else {
  let failed = 0
  for (const name of Object.keys(CASES)) {
    const r = spawnSync(process.execPath, [SELF, name], { encoding: 'utf8' })
    if (r.status === 0) {
      console.log(`  ok  ${name}`)
    } else {
      failed++
      console.log(`FAIL  ${name}`)
      console.log((r.stderr || r.stdout || '').trim().replace(/^/gm, '        '))
    }
  }
  const total = Object.keys(CASES).length
  console.log(`\n${total - failed}/${total} passing`)
  process.exit(failed ? 1 : 0)
}
