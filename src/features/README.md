# Features

Each product capability should own its rendering, feature-specific interactions and public interface.

Initial feature boundaries:

- dashboard
- students
- profile
- lineup
- courses
- assignments
- attendance
- constructor
- grand-prix
- super-license
- class-archive
- team-radio
- admin

Keep feature internals private. Share cross-feature behavior through explicit interfaces and core orchestration rather than importing private functions from neighboring features.

No runtime code is moved in the foundation PR.
