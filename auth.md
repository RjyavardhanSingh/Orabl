# Auth — backend sprint

## Architecture: identity vs authorization

Neon Auth (Managed Better Auth) **owns identity**: email signup, Google
OAuth, refresh, and the HTTP-only session cookie all happen directly between
the frontend SDK and the Neon Auth service. Our backend never sees passwords
or OAuth codes and mints no tokens.

Our backend **owns authorization**: it verifies the short-lived Bearer JWT
(EdDSA/Ed25519) against the branch JWKS, takes `user_id` from the `sub`
claim, and scopes every domain query with `WHERE user_id`. There is no
`users` table on our side — `neon_auth.user` is the source of truth.

```
Frontend SDK  ←→  Neon Auth service   (login, Google, refresh, cookie)
     │  Authorization: Bearer <~15-min JWT>
     ▼
FastAPI: verify vs JWKS (cached) → user_id = sub
     → every query scoped → 401 no/invalid token · 404 чужой/missing row
```

## Console checklist (per branch)

1. Enable Auth on the branch (Neon Console → Auth).
2. Add Google OAuth client ID + secret (shared creds work in dev only).
3. Allowlist callback origins: `localhost` ports are pre-approved; add
   production + preview hosts as trusted domains.

## Environment

Backend (this sprint) — nothing secret:

```
JWKS_URL=https://<auth-host>/.well-known/jwks.json
AUTH_URL=https://<auth-host>
```

`auth_service` reads exactly these two names. `AUTH_URL` is used only to
check the token `iss` claim (trailing slashes normalized).

Frontend (next sprint, not this one): `VITE_NEON_AUTH_URL` + callback URL.

## Protected-routes matrix

| Routes | Rule |
|---|---|
| `POST /materials`, `POST /materials/upload` | `user_id` stored on insert |
| `GET /materials/{id}`, `/download` | `WHERE id AND user_id`, else 404 |
| `POST /contexts` | All `material_ids` verified owned first (чужой → 404 before building) |
| `GET /contexts/{id}` | Cached payload carries `user_id`; legacy entries without it 404; DB fallback scoped |
| `POST/GET .../questions` | Context ownership verified before serving cache |
| `POST /sessions` | Context ownership verified, `user_id` embedded in cached state |
| All `/sessions/{id}/*`, retest | Cached state checked, DB fallback scoped; retest inherits the *caller's* id |
| `GET /stt/token` | Authenticated (abuse-gating; no per-user binding) |
| `GET /v1/auth/me` | Returns `{id, email?}` from verified claims |
| `/health*` | Open |

Legacy unversioned aliases share the same router objects, so they inherit
identical gating — no back door.

## Namespaced IDs

Material row IDs are `sha256(user_id + ":" + content_id)`, so identical
uploads by different users never collide (the old bare content hash would
have made user B's upload point at user A's row, then 404 for B). Context
IDs derive from source IDs, so they are per-user automatically. S3
`object_key` stays content-derived (overwrite-idempotent).

## Cache ownership rules

- Session state embeds `user_id` at creation; every read checks it.
- Context payloads embed `user_id`; entries predating this read as missing.
- Pre-auth cached states (no `user_id` key) fail closed with 404. In-flight
  sessions at deploy time need re-creation (≤24h TTL bounds the impact).

## Error contract

- Missing/malformed/expired/forged token → **401**, generic message (never
  which check failed, never the token).
- Valid token, чужой or absent row → **404** (no existence oracle; no 403s).
- Server misconfiguration (no `JWKS_URL`) → 500.

## Backfill runbook

Migration `003` adds nullable `user_id` + indexes to
`sessions`/`materials`/`contexts`. Run `BACKFILL_USER_ID=<sub> alembic
upgrade head` to claim orphans, or plain `upgrade head` to leave them
invisible (secure default; applied without backfill on 2026-09-26).
Migration `004` adds nullable `user_id` to `concept_mastery` (no backfill;
mastery recomputes on next completion).

## Test strategy

`tests/test_auth.py` crafts real Ed25519 JWTs locally and stubs only the
JWKS fetch — zero network. Covers: valid/expired/tampered/unknown-kid/
missing-sub/wrong-issuer/wrong-alg tokens, dependency 401s, `/me` open +
authed paths, cross-user session/retest reads-as-missing, context ownership,
user_id on writes, scoped reads. `tests/test_material_scoping.py` covers
ID namespacing (legacy preservation, determinism, cross-user isolation).

## Non-goals (this sprint)

No token minting, no `users` table, no login/signup routes, no roles in
claims (authorize from our tables), no frontend SDK wiring, no RLS
(managed at the application layer while Neon Auth is Beta; keeps the
provider swap to ~2 files).
