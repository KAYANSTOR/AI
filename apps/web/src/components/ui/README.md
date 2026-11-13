# KAYAN AI design system

The components in this directory are the shared UI foundation for the application.
They do not contain product data or business rules.

## Sources of truth

- Semantic CSS tokens and theme values: `src/app/globals.css`
- Runtime-safe design constants: `src/lib/design-system/tokens.ts`
- Reusable React primitives: this directory
- Reference visual language: KAYAN AI mobile Figma file

Raw palette values belong only in `globals.css`. Components and product pages should
consume semantic utilities such as `bg-surface`, `text-text`, `border-border`,
`text-error`, and `shadow-card`.

## Typography

The primary typeface is Cairo with the exact Figma faces:

- `Cairo:Regular` — 400
- `Cairo:Medium` — 500
- `Cairo:SemiBold` — 600
- `Cairo:Bold` — 700

Use `Heading`, `Text`, or the `type-*` classes for semantic hierarchy. Existing
Tailwind `font-medium`, `font-semibold`, and `font-bold` utilities are mapped to
the matching Cairo face.

## Direction

The application root remains Arabic/RTL. Use `Direction locale="en"` for an
English/LTR subtree. Components use logical `start`, `end`, `ms`, `me`, `ps`,
and `pe` utilities. Only directional icons receive explicit `rtl:` or `ltr:`
variants.

## Themes

Light theme is the default. The existing theme boot script applies `.dark` before
first paint. Components use semantic tokens, so they require no theme-specific
branching.

## Components

- Actions: `Button`, `IconButton`
- Forms: `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`
- Content: `Card`, `Heading`, `Text`, tables
- Feedback: `Badge`, `Alert`, `LoadingState`, `EmptyState`, `ErrorState`, toast
- Overlays: `Dialog`, `Drawer`, `Dropdown`, `Tooltip`
- Navigation: tabs and pagination

Interactive client-only components declare their own client boundary. Static
components remain usable from Server Components.
