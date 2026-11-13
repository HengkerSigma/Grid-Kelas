# Mentari quiz parser and mapping

## Scope of this PR

This PR adds a pure parser for the Mentari quiz-detail response and a validated mapping layer for the nine class courses. It is a preparation/dry-run layer: it does **not** fetch Mentari, write to Supabase, create Hub Tugas records, or modify student submissions. The live authenticated-browser bridge and persistence workflow remain a separate integration step.

## Course mapping

The Mentari course code is the final segment of `kode_course`; the current class mapping is:

| Mentari suffix | Grid Kelas |
|---|---|
| `26TEL0004` | `KIM` |
| `26PAM0007` | `WRG` |
| `26PAM0008` | `IND` |
| `26PAM0010` | `ENG` |
| `26FTK0021` | `FIS` |
| `26FTK0011` | `KAL` |
| `26TEL0003` | `ELE` |
| `26TEL0002` | `ALJ` |
| `26TEL0001` | `PRG` |

The course code must match the final segment exactly. Unknown suffixes are rejected rather than guessed.

## Data mapping

The caller supplies the original activity object from the Mentari section. Only `kode_template: PRE_TEST` or `POST_TEST` is accepted; this avoids inferring quiz type from a title that may be renamed. The parser maps:

- `activity.id` → external Mentari activity ID.
- `activity.kode_template` → Pre-test/Post-test classification.
- `response.kode_course` → mapped Grid Kelas course.
- `response.kode_section` (for example `PERTEMUAN_15`) → meeting number. It does not use `sort` or list position.
- `response.judul` → task title, with Pre-test/Post-test fallback.
- `data[].nim` → student lookup supplied by the trusted caller.
- `data[].quiz.id` → external attempt ID.
- `data[].quiz.end_at` → that student's completion timestamp in milliseconds, suitable for a future Time Tower adapter.
- `data[].quiz.grade` and `gradeAt` → optional Mentari grade metadata.

The root `response.quiz` is session-level metadata and is never copied as an individual student's submission timestamp. `end_in_second` is intentionally ignored because its meaning was not verified.

## Completeness and status rules

- `dataComplete` defaults to false. A null `data[].quiz` is `unknown` unless the caller independently confirms the response contains the complete roster; only then can it be `not_submitted`.
- Missing/invalid attempt IDs or timestamps become `invalid_attempt`.
- Students absent from the trusted NIM lookup become `unmatched_student`.
- Duplicate NIM rows are collapsed to one record.
- Student names, email addresses, phone numbers, quiz answers, and content are not copied into mapped output.

## Persistence contract for the next integration step

The existing Hub Tugas model is a projection of `course_updates`; submissions are stored in `task_submissions` / `subs`, and Time Tower reads numeric `subs[studentNo].at`. A future writer should:

1. Match the task by course + meeting + external activity ID (not just title).
2. Upsert by external attempt ID so repeated syncs are idempotent.
3. Preserve existing/manual submission records and never overwrite a manual submission with an older Mentari timestamp.
4. Store the Mentari completion time in the submission `at` field so Time Tower can read it.
5. Keep Status Pemeriksaan (`subs.__review`) independent and untouched.
6. Never mark an unmatched student or incomplete roster as not submitted.
7. Keep Pre-test and Post-test as separately identifiable tasks if both exist in one meeting.

No persistence or automatic attendance behavior is included in this PR.

## Tests

Run:

```sh
node --test tests/mentari/quiz-parser.test.js
```
