# Core

Application bootstrap, lifecycle, top-level navigation and shared state contracts belong here.

Keep core independent from feature implementation details. Core may register feature entry points and coordinate navigation, but should not become a new home for feature-specific business logic.

No runtime code is moved in the foundation PR.
