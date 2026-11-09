# Services

This layer contains adapters for external systems and persistence:

- database access and repositories
- storage and file upload/access
- notifications and presence transport

Feature modules should depend on stable service interfaces rather than directly duplicating transport or persistence logic.

Existing Supabase tables, keys, buckets, policies and data formats are compatibility constraints. This foundation PR does not alter them.
