# Independent course activities

## Purpose

A course configured as **Ruangan** may have face-to-face meetings on its regular
course schedule and separate online activities on other days. Online attendance,
online assignments, and face-to-face attendance must not be forced to share one
meeting sequence or one attendance-session record.

Example:

- Wednesday: online attendance, meeting 1; online assignment, meeting 2.
- Saturday: face-to-face class and attendance, meeting 14.

The course remains `Ruangan`. Activity delivery is a separate concern from the
course's primary delivery configuration.

## Activity vocabulary

Use `activity_mode` on new attendance-session records:

- `online`
- `tatap_muka`

The course's existing configuration remains authoritative for its historical
behavior. The current application identifies Platform courses from their existing
`platform/<course-code>` configuration; courses without that configuration use
the regular Ruangan schedule. Do not introduce a new course type or rewrite course
records as part of this feature.

## Backward-compatible attendance identity

Existing attendance session keys are `${courseCode}_${NN}`. Keep that key for the
activity matching the course's historical behavior:

- Platform course: `online` keeps the legacy key.
- Ruangan course: `tatap_muka` keeps the legacy key.

The additional activity uses a namespaced key:

- Ruangan online session: `${courseCode}_online_${NN}`.
- Platform face-to-face session (if ever enabled): `${courseCode}_tatap_muka_${NN}`.

This allows the same course and meeting number to exist in both modes without
colliding, while leaving all existing session keys and stored attendance data in
place. `src/features/courses/activity-model.js` is the pure, tested contract for
normalizing activity modes and producing these keys.

## Assignments and attendance remain separate records

- Online assignments continue to use the existing `course_updates` / Hub Tugas
  workflow and its current submission, deadline, attachment, and notification
  behavior.
- The assignment meeting number is independent of the face-to-face meeting
  number; it is not inferred from `courses.hari`, `courses.jam`, or `courses.ruang`.
- Online attendance is a separate attendance session with its own meeting number
  and its own `tanggal` / `tanggalAkhir` period.
- Face-to-face attendance continues to use the course's regular weekday, time,
  room, and existing attendance workflow.
- An online assignment does not create an attendance session. An attendance
  session does not create an assignment.

## Jadwal Hari Ini rules

The daily schedule must be composed from independent sources:

1. Face-to-face class entries come from the course's existing weekday/time/room
   configuration and use face-to-face attendance.
2. Online attendance entries come from online sessions whose active date period
   includes today, regardless of the course's regular class weekday.
3. Assignment entries come from online task deadlines/publication data and remain
   visible through Hub Tugas and the existing notification workflow.
4. A task-only activity must not display an attendance button. An online
   attendance-only activity must not fabricate a task card.
5. When a course has both a Wednesday online activity and a Saturday class, each
   appears only on its own applicable day and keeps its own meeting number.

## Compatibility and safety requirements

- No Supabase schema migration or production-data rewrite in the model-foundation
  stage.
- Existing Platform link attendance, forum confirmations, task confirmations,
  and stored session IDs must continue to work.
- Existing Ruangan attendance history remains face-to-face unless a new record
  explicitly declares `activity_mode: 'online'`.
- Server-side authorization and validation remain authoritative.
- Integration must update every read/write path consistently: admin session
  management, student attendance, attendance history, exports, daily schedule,
  notification formatting, and server-side validation.
- Add regression coverage before switching existing UI flows to the new identity.

## Implementation sequence

1. Establish and test the pure activity identity contract (this PR).
2. Integrate namespaced session reads/writes and admin management without changing
   the daily schedule yet.
3. Add online attendance to Jadwal Hari Ini using the session's own active period.
4. Confirm online assignments remain independent and visible in Hub Tugas.
5. Add notification and export coverage, then run Platform/Ruangan regression tests.
