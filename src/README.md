# Frontend modular source

This directory is the planned home for the modular browser application. It is intentionally a documentation-only scaffold in the foundation PR.

The live application continues to load from `public/app.js`. Do not point the HTML shell here until the staged extraction is complete and a reviewed module entry point exists.

Planned areas:

- `core/`: bootstrap, lifecycle, navigation and shared application contracts.
- `features/`: feature-owned UI, state coordination and workflows.
- `services/`: browser data, storage and notification adapters.
- `shared/`: stable cross-feature components, helpers and constants.
- `styles/`: styles organized by global layer and feature ownership.

See [the modularization plan](../docs/architecture/modularization-plan.md) for boundaries, migration order and safety rules.
