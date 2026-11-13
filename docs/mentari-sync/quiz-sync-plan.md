# Mentari quiz sync plan (PR #180)

## Purpose

This step converts validated parser output into a deterministic, read-only persistence plan. It does not call Mentari, write to Supabase, create a Hub Tugas item, or change attendance/review state.

## Task identity

A Mentari quiz is identified by the tuple: external activity ID, Grid Kelas course code, and meeting number. Quiz type remains explicit (PRE_TEST / POST_TEST). A Pre-test and Post-test in the same meeting therefore cannot collide based only on course and meeting.

The Hub Tugas model is backed by course_updates. Before enabling a writer, the persistence schema must explicitly retain the external activity identity. A property omitted from the existing taskColumns projection must not be assumed to survive a save. This PR deliberately does not bypass that projection.

## Submission merge rules

- Only records with status submitted produce planned submission operations.
- A response must be explicitly marked complete before any plan is generated.
- Student identity uses the trusted NIM-to-student-number index supplied to the parser.
- Existing submissions without Mentari provenance are treated as manual and preserved.
- Existing Mentari submissions are updated only when the incoming timestamp is not older.
- Existing link, note, and file metadata are retained on same-source updates.
- The subs.__review / Status Pemeriksaan metadata is outside the per-student merge helper and must be copied unchanged by any future transaction.
- Unknown, unmatched, invalid, and non-submitted records do not generate submission writes.

## Time Tower

The planned at value is the individual student's data[].quiz.end_at converted to epoch milliseconds. The root response.quiz timestamp is never used for student submissions.

## Why this is still dry-run

The current task model projects a defined set of course_updates columns into Hub Tugas. A live writer needs a durable external-activity metadata field and a transaction-safe update path that preserves the complete submissions JSON, including __review. This PR supplies and tests the planning/merge contract first; it does not claim live synchronization is enabled.

## Tests

Run: node --test tests/mentari/quiz-parser.test.js tests/mentari/quiz-sync-plan.test.js
