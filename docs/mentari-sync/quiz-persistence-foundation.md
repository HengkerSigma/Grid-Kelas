# Mentari quiz persistence foundation (PR #181)

## Scope

This migration adds durable Mentari activity identity to `course_updates` and a database RPC for atomic per-student quiz submission updates.

It is infrastructure only:
- no Mentari HTTP requests are made;
- no application endpoint calls the RPC yet;
- no automatic task creation or synchronization is enabled;
- no attendance or Status Pemeriksaan state is changed.

## Durable task identity

Each `course_updates` row can retain:
- `mentari_activity_id`: unique external activity ID;
- `mentari_quiz_type`: `PRE_TEST` or `POST_TEST`;
- `mentari_course_code`: Mentari course identifier;
- `mentari_section`: Mentari section such as `PERTEMUAN_15`.

The partial unique index prevents one Mentari activity from being bound to multiple Grid Kelas rows. The RPC also validates the known Mentari course suffix-to-Grid-Kelas course mapping and checks that the Mentari section matches the target row's meeting number.

## Atomic submission RPC

`public.mentari_sync_quiz_submission(...)`:
1. locks the target `course_updates` row with `FOR UPDATE`;
2. validates the activity, quiz type, course/section identity and meeting number;
3. rejects a conflicting or already-bound activity;
4. preserves a manual submission that has no Mentari provenance;
5. rejects a submission whose provenance belongs to another Mentari activity;
6. preserves a newer timestamp;
7. updates only the selected student's JSONB path, retaining other students and `subs.__review`.

The RPC returns a JSON status such as `created_mentari_submission`, `manual_submission_preserved`, `foreign_activity_conflict`, or `newer_existing_submission_preserved`. Callers must handle non-write statuses as outcomes, not as successful writes.

Execution is revoked from `PUBLIC`, `anon`, and `authenticated`; only `service_role` can execute it. The service key must remain server-side.

## Important concurrency limitation

The row lock serializes calls to this RPC. The existing general Grid Kelas task-save path still writes a complete `task_submissions` JSON value after reading the task. Until that path is also changed to use compatible atomic operations (or a version-checked compare-and-swap), a concurrent general task save could still overwrite a Mentari RPC update.

Therefore this RPC must **not** be called in production yet. The next integration step must route all relevant submission/review writes through concurrency-safe database operations before enabling Mentari sync.

## Rollout and verification

1. Review and merge this PR.
2. Apply `supabase/migrations/20261114_add_mentari_quiz_sync_persistence.sql` to a non-production/staging Supabase project first.
3. Verify the four new columns, check constraint, unique index, and function exist.
4. Test the RPC with a disposable `course_updates` row in staging. Cover a new submission, replay of the same attempt, newer stored timestamp, manual submission, foreign activity ID, activity/course/meeting conflicts, and preservation of `__review`.
5. Do not apply this migration to production or enable any caller until staging checks pass and the existing application write paths are made concurrency-safe.

This PR does not update the `taskFromCourseUpdate` projection or invoke the RPC. It provides the database foundation for the next integration step only.
