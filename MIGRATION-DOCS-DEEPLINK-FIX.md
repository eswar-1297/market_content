# Migration Docs (doc.cftools.live) — Bug: deep links are lost after sign-in

## Summary
When a user opens a **deep link** to a specific page (e.g. a compatibility matrix
or a document) while signed out, the app correctly sends them to Microsoft
sign-in — but **after signing in, the original URL's query parameters are
discarded and the user lands on the home screen** instead of the page they
requested.

This must be fixed in the **doc.cftools.live SPA** (the "Migration Docs" React
app). It is NOT a problem in whatever tool generated the link — the link is
correct; the app drops it during the OAuth round-trip.

## How the app deep-links (for reference — this part works)
The SPA selects content from query params on `/`:

| Content | URL |
|---|---|
| Compatibility matrix | `/?view=compatibility&matrix=<slug>` |
| Cloud Info doc | `/?view=cloudinfo&info=<slug>` |
| Document | `/?view=documents&doc=<slug>` |
| Product combinations | `/?product=<Message\|Mail\|Content>` |

Example: `https://doc.cftools.live/?view=compatibility&matrix=email-migration-combinations`

## Steps to reproduce
1. Sign out of doc.cftools.live.
2. Open `https://doc.cftools.live/?view=compatibility&matrix=email-migration-combinations`.
3. You are redirected to Microsoft sign-in.
4. After signing in you land on the **home page**, not the Email migration matrix.

## Root cause
The Microsoft sign-in uses an OAuth authorization-code (PKCE) flow built like this:

```js
// When starting login:
const params = new URLSearchParams({
  client_id: Fz,
  response_type: "code",
  redirect_uri: window.location.origin,   // <-- origin only: no path, no query
  scope: "openid profile ...",
});
sessionStorage.setItem("ms_pkce_verifier", verifier);
sessionStorage.setItem("ms_oauth_state", state);
// ...redirect to Microsoft...
```

Two issues combine:
1. `redirect_uri` is `window.location.origin` (`https://doc.cftools.live/`), so
   Microsoft returns the user to the **bare origin** — the `?view=...&matrix=...`
   part of the original URL is gone.
2. The app **never saves the originally-requested URL** before redirecting, so
   after the token exchange (`/api/auth/microsoft/exchange` → `sessionStorage`
   `docs_token`) there is nothing to restore, and it defaults to home.

> Do NOT try to fix this by changing `redirect_uri` to include the query string —
> the redirect URI must exactly match what's registered in Azure AD, and the
> OAuth callback also carries `?code=...&state=...`. The correct fix is to
> **save the target URL before login and restore it after login** (below).

## The fix (3 small edits in the SPA)

### 1. Before redirecting to Microsoft sign-in — remember where the user wanted to go
Right before building the auth URL / redirecting:

```js
// Save the in-app destination (path + query), but NOT the OAuth callback itself.
sessionStorage.setItem(
  "post_login_redirect",
  window.location.pathname + window.location.search
);
```

### 2. After a successful sign-in — restore that destination
In the OAuth callback handler, right after the token exchange succeeds and
`docs_token` is set (and after you've validated `ms_oauth_state`):

```js
// ...exchange code, set sessionStorage "docs_token", set user state...

const back = sessionStorage.getItem("post_login_redirect");
sessionStorage.removeItem("post_login_redirect");

// SECURITY: only allow a same-origin relative path (must start with a single "/").
const safe = back && /^\/(?!\/)/.test(back) ? back : "/";

// Restore the deep link so the SPA's query-param logic picks it up.
window.history.replaceState({}, "", safe);
// If your app reads params via React Router's useSearchParams, also navigate:
//   navigate(safe, { replace: true });
```

### 3. Clean the OAuth params off the URL (you likely already do this)
After handling the callback, strip `?code=...&state=...` so a refresh doesn't
re-run the exchange. If you do `window.history.replaceState` to `safe` in step 2,
that already removes them — just make sure step 2 runs instead of a hard redirect
to `/`.

## Acceptance criteria
- Signed out, opening `/?view=compatibility&matrix=email-migration-combinations`
  → after sign-in, the **Email migration combinations matrix** is shown (not home).
- Same for `?view=documents&doc=<slug>`, `?view=cloudinfo&info=<slug>`,
  and `?product=Mail`.
- Already-signed-in users opening a deep link go straight to the page (no change).
- A normal sign-in from the home page (no deep link) still lands on home.
- `?code`/`state` are not left in the address bar after login.

## Notes
- The read APIs (`/api/documents`, `/api/cloud-info`, `/api/compatibility`,
  `/api/product-config`) are already public; this issue is purely the **front-end
  auth redirect losing the requested URL**.
- Keep the same `redirect_uri` registered in Azure AD — no Azure changes needed.
