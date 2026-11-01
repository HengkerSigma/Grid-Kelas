# Phase 1 regression test checklist

Run against a non-production test deployment or a verified staging copy before merging/deploying.

## Authentication and sessions
- [ ] Existing student account can log in with current credentials.
- [ ] Admin account can log in and retain admin-only actions.
- [ ] Invalid credentials remain rate-limited.
- [ ] Password change invalidates older signed sessions as expected.
- [ ] Logout clears the browser cookie.
- [ ] On Vercel HTTPS, inspect cookie flags: `Secure`, `HttpOnly`, `SameSite=Lax`.
- [ ] Confirm `SESSION_SECRET` is stable across serverless instances and deploys.

## Guest privacy
- [ ] Anonymous `GET /api/c/students` contains only `depan` and `belakang` per student.
- [ ] Anonymous `GET /api/d/students/{id}` does not expose NIM, email, phone, address, or other private columns.
- [ ] Logged-in students/admins retain the data required by the existing UI.
- [ ] Guest-facing courses, Constructor, announcements, media, and Class Archive remain functional.

## Existing features (no data-loss tolerance)
- [ ] Individual task list, deadline, submission and attachment.
- [ ] Group task submission and Constructor mapping.
- [ ] Legacy tasks and tasks integrated into `course_updates`.
- [ ] Historical tasks, Achievement, Grand Prix/Time Tower and ranking.
- [ ] Attendance input, admin/offline attendance, and evidence files.
- [ ] Certificates, profile images, and Class Archive uploads.
- [ ] Admin task/course/student/account management.
- [ ] Mobile layout and realtime refresh/SSE fallback.

## Database safety
- [ ] Confirm backup timestamp and retention.
- [ ] Restore a backup into an isolated project and verify row counts and representative records.
- [ ] No migration or destructive SQL is run as part of this PR.
