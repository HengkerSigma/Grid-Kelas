# Security hardening — Phase 1

This branch contains limited, reviewable server-side hardening. It does not modify Supabase data, run migrations, rotate secrets, or change existing task/achievement records.

## Changes in this PR

- Anonymous reads of `students/*` now expose only `depan` and `belakang`. Authenticated users retain the existing student record shape so current class features are not silently changed.
- Session cookies are marked `Secure` on Vercel deployments, independently of `TRUST_PROXY`. `HttpOnly`, `SameSite=Lax`, and `Path=/` remain unchanged.

## Findings requiring deployment-owner verification

### Critical: legacy default password fallback

`checkPw()` currently accepts `DEFAULT_PASSWORD`, falling back to the literal `12345678`, when an account has no `hash` and `salt`. Removing this fallback without checking production account records could lock out students. Before a follow-up change:
1. Verify how many `akun` records lack `hash` or `salt` (do not export password material).
2. Confirm a tested password-reset path and administrator recovery procedure.
3. Migrate affected accounts to PBKDF2 hashes, then remove the fallback and unset `DEFAULT_PASSWORD`.
4. Do not share secret values in GitHub issues, PR comments, or chat.

### Session signing secret

`SESSION_SECRET` must be a stable, high-entropy production environment variable. If absent, the application generates a process-local random secret, which can invalidate sessions when serverless instances change. Verify presence and consistency in Vercel Production and Preview environments without revealing its value.

### Other review items

- Confirm `COOKIE_SECURE=1` or Vercel HTTPS behavior for every production domain.
- Session tokens are stateless; logout clears the browser cookie but cannot revoke a copied token. A server-side session/version store is a separate design change and needs load/concurrency testing.
- Upload validation currently trusts declared MIME type and size before issuing a signed upload URL. Verify actual stored object type/size and signed-upload lifecycle before tightening it, to avoid breaking task, attendance, certificate, profile, and archive uploads.
- Upload throttling is process-local; it is not a reliable global quota across serverless instances.
- Review public access expectations for `constructors`, `media`, `classArchive`, `pengumuman`, and `courses` before changing guest visibility.

## Data and feature preservation

No schema migration or destructive operation is included. In particular, preserve:
- legacy task rows and task submissions;
- `course_updates` task fields and all 16 meeting slots;
- individual and group submissions;
- Constructor membership and Team Principal assignments;
- Achievement, Grand Prix/Time Tower, and historical task results;
- attendance records and evidence;
- certificates, uploaded files, and Class Archive metadata.

## Pre-merge gates

- [ ] Confirm a current Supabase backup exists and recovery/restore has been tested or documented.
- [ ] Confirm Vercel Production environment variables are present (names only; never expose values): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SESSION_SECRET`.
- [ ] Verify existing accounts can log in; do not remove legacy password fallback until account state is known.
- [ ] Test guest directory: names visible, private student columns absent.
- [ ] Test authenticated student and admin views and all role-based writes.
- [ ] Regression-test tasks, submissions, achievements, Constructor, attendance, uploads, certificates, and Class Archive.
- [ ] Review this PR before merge. No production database migration is part of this PR.
