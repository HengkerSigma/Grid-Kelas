# Backend modularization

The root `server.js` remains the active Vercel Node entry point.

The intended decomposition is:

- `routes/`: HTTP endpoint dispatch and request/response mapping
- `middleware/`: session resolution, authentication and rate limiting
- `services/`: business workflows such as file handling and exports
- `repositories/`: Supabase persistence operations
- `validators/`: request and document validation/authorization decisions
- `utils/`: stateless helpers such as ZIP and serialization utilities

Do not change Vercel routing or the entry point until a backend extraction PR explicitly preserves the existing handler contract. Security-sensitive validation and authorization must remain server-side.

No backend runtime code is moved in the foundation PR.
