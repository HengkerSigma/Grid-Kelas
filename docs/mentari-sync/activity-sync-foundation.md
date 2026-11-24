# Mentari activity-sync foundation

## Purpose

This module is the read-only normalization layer for activity participation, separate from grade import. It discovers the four activity families used by the class: Pre-test, Forum Diskusi, Post-test, and the final Kuesioner. It deliberately excludes `ASSIGNMENT` because the observed class workflow does not use a separate assignment activity.

## Input

- A `GET /api/user-course/{kode_course}` response containing `peserta` and section `sub_section` metadata.
- Optional forum snapshots captured from the browser's observed `GET /api/forum/reply/{forum_id}` response. Each snapshot is supplied as `{ topic, data, dataComplete }`.
- The forum topic is matched to course metadata through `id_trx_course_sub_section`.

## Status rules

- A roster student with one or more direct level-1 replies is `participated`, even when the response is partial.
- A roster student with no observed direct reply is `unknown` unless the caller explicitly establishes `dataComplete: true`.
- Only then may an absent student be labeled `not_started`.
- Lecturer posts and nested replies do not count as direct student participation.
- Pre-test/Post-test and Kuesioner are discovered as activity metadata, but this module does not infer their participation from the forum endpoint. Quiz participation remains in the existing grade/quiz pipeline; Kuesioner participation remains unsupported until its endpoint is verified.

## Privacy and boundaries

- Output contains NIM as the roster join key and aggregate direct-reply counts only.
- Student names, email, phone, post body, and raw posts are never copied into preview output.
- This module does not fetch Mentari, persist data, write attendance, alter `course_updates`, or confirm task completion.
- Forum counts are structural evidence only; content relevance, separate-chat requirements, and lecturer acceptance require separate verification.

## Tests

Run:

```sh
node --test tests/mentari/activity-sync.test.js
```

## Collector forum capture (v2.3.0)

The userscript observes the normal browser response for `GET /api/forum/reply/{forum_id}`.
It computes direct level-1 student reply counts immediately and stores only:
- course and activity identifiers,
- roster NIMs,
- per-NIM direct reply counts,
- capture timestamp and received row count.

It does not store raw posts, post bodies, names, email, or phone numbers. The response
has no verified pagination/completeness indicator, so forum snapshots always remain
`dataComplete: false`; absent roster members remain `unknown`, never `not_started`.
The IndexedDB upgrade adds stores without clearing existing quiz snapshots or grade rows.
