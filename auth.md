# Auth — own Google OAuth + session tokens

## Architecture (2026-09-28 rewrite; Neon Auth / Better Auth fully removed)

We own identity end to end. No third-party auth service, no session
cookies, no JWKS — after the Neon session-cookie failures (see History),
every credential is a first-party exchange between our SPA, our API, and
Google directly:

```
SPA --GET /v1/auth/google/url--> API: mint state+PKCE (cache, 10 min) --> {url}
SPA --full-page navigate--> Google (consent, code flow, our client_secret stays server-side)
Google --top-level redirect--> API /v1/auth/google/callback?code&state
API: validate state (single-use) → exchange code → userinfo → upsert
     app_users → create app_sessions row → single-use exchange code (cache, 5 min)
     --302--> SPA /auth/callback?code=...&next=...
SPA --POST /v1/auth/token {code}--> {token, user} (raw token revealed once)
SPA --Authorization: Bearer <token>--> API: SHA-256 lookup in app_sessions
```

Why this survives what killed Neon Auth: the token travels in JSON bodies
and an `Authorization` header. No cookies are set, read, or required, so
incognito, Safari, and third-party-cookie blocking are all non-issues.

```
┌─────┐   GET /auth/google/url?next=/upload    ┌─────┐
│ SPA │ ─────────────────────────────────────▶ │ API │
│     │ ◀───────────────────────────────────── │     │
└─────┘   {url}  (state+PKCE cached, 10 min)    └──┬──┘
   │ full-page navigate to Google                  │
   ▼                                               │
┌────────┐  consent + code                         │
│ Google │ ──top-level redirect w/ ?code&state────▶│
└────────┘                                         ▼
                            validate state (single-use) → exchange code
                            → userinfo → upsert app_users
                            → create app_sessions → one-time code (5 min)
┌─────┐   302 /auth/callback?code=..&next=..   ┌────┴────┐
│ SPA │ ◀───────────────────────────────────── │   API   │
│     │ ── POST /auth/token {code} ───────────▶ │         │
│     │ ◀── {token, user} (raw shown once) ─── │         │
└──┬──┘                                        └─────────┘
   │  Authorization: Bearer <token> (sessionStorage)
   ▼
all /v1 routes → 401 no/invalid token · 404 чужой/missing row
```

## Tables (`005_app_auth`)

- `app_users`: `id` UUID, `email` (unique on `LOWER`), `name`,
  `google_sub` (unique), `email_verified`, timestamps. Lookup order on
  login: `google_sub` → same-email adoption → insert.
- `app_sessions`: `user_id` FK cascade, `token_hash` (SHA-256 hex, unique),
  `expires_at` (30 days), `revoked_at`, `last_used_at` (best-effort touch).

`user_id` on `sessions`/`materials`/`contexts`/`concept_mastery` is TEXT
and now carries `app_users.id`. Rows keyed by old Neon `sub` values are
orphaned (invisible, same fail-closed rule as before) — no backfill; the
Neon user base was one dev account.

## Environment (backend `.env`)

```
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
API_EXTERNAL_BASE_URL=http://localhost:8000   # builds our redirect_uri
FRONTEND_URL=http://localhost:5173            # callback redirect target
```

Google Cloud Console → this OAuth client → **Authorized redirect URIs**
must contain exactly `{API_EXTERNAL_BASE_URL}/v1/auth/google/callback`
(local: `http://localhost:8000/v1/auth/google/callback`). A missing entry
surfaces as `?error=` on Google's chooser page, then as `google_rejected`
on our callback screen — not a silent stall.

`GET /v1/auth/google/url` returns 500 when the creds are unset (fail loud,
not silent). No frontend env vars are needed for auth.

## Endpoint contract

| Route | Rule |
|---|---|
| `GET /auth/google/url?next=` | `next` sanitized to same-origin SPA paths, else `/upload` |
| `GET /auth/google/callback` | top-level only; bad state/replay → 302 `?error=invalid_state`; Google `?error=` → 302 `?error=google_rejected`; exchange/userinfo failure → 302 `?error=signin_failed` |
| `POST /auth/token` | single-use code (replay → 401); returns raw token once |
| `GET /auth/me` | `{id, email}` from session |
| `POST /auth/logout` | revokes the calling session; always 200 |
| everything else | unchanged: missing/invalid/expired/revoked token → 401 generic; valid token, чужой/absent row → 404 |

## Test strategy

`tests/test_auth.py` (no network): token hash/issue, `next` sanitizer,
authorize-URL shape, state/code single-use round-trips via a fake Redis,
session create/resolve/expiry/revocation/DB-error via a fake DB,
upsert branches (existing sub / same-email adoption / insert), full
callback→token→replay-401 round-trip via TestClient with overridden
`get_db`/`get_cache`, logout revocation, plus the unchanged per-user
ownership tests. `tsc -b` + `oxlint` cover the SPA.

## History (why Neon Auth is gone)

2026-09-27–28: Google login via managed Better Auth stalled on
`Sign-in did not complete` in all browsers. Proven by direct DB inspection:
sessions were created on every attempt (verified user, `google` account,
fresh rows per attempt) but the session cookie never reached the browser
— absent in DevTools, unsent on `fetch`, even with third-party cookies
allowed and after explicit Storage Access grants. Contributing misleads
along the way: branch on shared creds (`isShared: true`, since fixed to
`standard` via API — irrelevant in the end), `callback_has_code_param`
is normally false (Neon consumes the code server-side), and the managed
`/sign-in/social` endpoint ignores `idToken` (probed), so no cookie-free
path existed through Neon REST. No session-cookie knobs exist in the Neon
Auth API. Hence: own OAuth, own sessions, zero cookies.
