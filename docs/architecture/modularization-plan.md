# Grid-Kelas — Modularization Plan

## Objective

Move Grid-Kelas from large, tightly coupled JavaScript files toward a feature-based modular architecture while preserving the current product behavior.

This document is the approved architectural direction for the staged refactor. It does not itself change runtime behavior.

## Current baseline

- The browser application is currently concentrated in `public/app.js`, wrapped in an IIFE and using shared state and DOM helpers.
- Browser persistence and data access are currently exposed through `public/db.js`.
- The HTML shell is `public/index.html`; styles are currently concentrated in `public/style.css`.
- The Vercel Node entry point and API implementation are currently concentrated in the root `server.js`.
- `vercel.json` routes requests to the existing root server entry point.

The current application relies on shared mutable state and function ordering. Extraction must account for those dependencies; moving functions by name alone is not sufficient.

## Target structure

```text
src/
  core/
    app.js                 # bootstrap and application lifecycle
    state/                 # shared state contracts and scoped stores
    navigation/            # top-level view navigation
  features/
    dashboard/
    students/
    profile/
    lineup/
    courses/
    assignments/
    attendance/
    constructor/
    grand-prix/
    super-license/
    class-archive/
    team-radio/
    admin/
  services/
    database/              # browser data adapter and repositories
    storage/               # upload and file access adapters
    notifications/
  shared/
    components/
    helpers/
    constants/
  styles/
    base/
    layout/
    components/
    features/

server/
  routes/
  middleware/
  services/
  repositories/
  validators/
  utils/
```

The existing `public/` directory remains the deployment-facing static asset directory. The existing root `server.js` remains the Vercel entry point until a separately reviewed backend extraction changes that contract.

## Feature ownership

| Feature module | Responsibility |
| --- | --- |
| dashboard | Overview, Exhibition, summary tiles |
| students | Student directory and student-facing identity data |
| profile | Personal Card, profile editing, account-facing profile views |
| lineup | Student Line-Up and slider behavior |
| courses | Course cards, course detail shell, schedule display |
| assignments | Individual and Constructor task lifecycle, submission views |
| attendance | Attendance sessions, status, records, exports and sector summaries |
| constructor | Constructor groups, membership, principal and group workflows |
| grand-prix | Course Grand Prix, History and Time Tower/podium presentation |
| super-license | Certificates, documentation and related submission views |
| class-archive | Archive posts, comments and reactions |
| team-radio | Announcements, presence and greeting interactions |
| admin | Admin navigation and management workflows |

A feature may depend on shared services and shared UI primitives, but must not reach into another feature's private implementation. Cross-feature workflows should use explicit public functions or application-level orchestration.

## Extraction rules

1. Preserve current behavior, Indonesian copy, permissions and responsive UI.
2. Do not change Supabase schema, stored document keys, bucket names or existing data formats as part of code movement.
3. Keep authentication, authorization and server-side validation authoritative on the server.
4. Keep Vercel's current entry point and routing stable until a dedicated backend migration is reviewed.
5. Extract one cohesive vertical slice at a time; avoid a single large rewrite.
6. Define module interfaces before moving code that relies on shared globals.
7. Avoid circular imports. Shared code must not import feature modules.
8. Keep deployment and static asset paths compatible during the transition.
9. Add or update tests/checks for each extracted slice before removing the old implementation.
10. Remove compatibility code only after the new path is verified in preview and production-like testing.

## Recommended migration sequence

1. Inventory globals, DOM ownership, event delegation, data subscriptions and call dependencies.
2. Establish core contracts and shared utilities without changing runtime behavior.
3. Extract low-coupling helpers and constants.
4. Extract read-only UI features, then feature-specific rendering and interactions.
5. Extract write workflows with their permission and validation paths intact.
6. Separate browser data access into service/repository modules.
7. Decompose the server into routes, middleware, services, validators and repositories while retaining the root entry point.
8. Split CSS by ownership and verify cascade/order equivalence.
9. Enable module loading in the HTML shell only after all imports and deployment paths are ready.
10. Run regression checks across guest, student, admin, mobile and desktop flows.

## Out of scope for this foundation stage

- No runtime JavaScript is moved or rewritten.
- No `type="module"` switch or bundler is introduced.
- No changes to `public/index.html`, `public/app.js`, `public/db.js`, `public/style.css`, `server.js`, `package.json`, `package-lock.json` or `vercel.json`.
- No database, storage, authentication, UI or feature behavior changes.

## Acceptance criteria for later extraction PRs

- The changed feature works for guest, student and authorized admin roles where applicable.
- Existing routes, API response shapes, database keys and storage paths remain compatible.
- No new console errors or failed network requests are introduced.
- Mobile and desktop layouts are checked.
- The PR explains the moved responsibilities, imports/exports and regression checks.
- The original implementation is removed only when the replacement is verified.
