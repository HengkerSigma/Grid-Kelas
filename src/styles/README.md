# Styles

The intended CSS organization is:

- base: reset, tokens, typography and global defaults
- layout: page shell, navigation and responsive layout
- components: reusable UI primitives
- features: styles owned by individual features

The current `public/style.css` remains authoritative until CSS is extracted in controlled slices. Preserve selector specificity, source order, breakpoints and responsive behavior during that work.
