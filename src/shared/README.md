# Shared frontend code

Only place genuinely cross-feature code here:

- reusable UI components
- pure helpers
- shared constants and formatting utilities

Do not move a helper here merely because multiple files can technically import it. Shared code must have a stable contract and must not depend on feature modules or DOM elements owned by a specific feature.
