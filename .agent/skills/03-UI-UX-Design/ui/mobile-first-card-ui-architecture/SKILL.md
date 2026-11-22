---
name: mobile-first-card-ui-architecture
description: Architect and redesign web application interfaces using a Mobile-First Card UI layout with Arabic RTL support, persistent top and bottom navigation, a center floating action button with a 2x3 quick-actions bottom sheet, KPI hero cards, filterable account lists, bulk messaging modals, and a centralized settings hub. Use when designing, structuring, refactoring, or generating UI layouts or agent prompts for web apps, dashboards, accounting systems, POS products, inventory tools, or management platforms.
---

# Mobile-First Card UI Architecture

Design responsive, app-like web interfaces with a clear Arabic RTL experience. Treat the interface as a focused mobile product first, then adapt it to wider screens without losing the compact navigation shell or card hierarchy.

## Operating Workflow

1. Inspect the existing routes, user roles, primary workflows, content density, and responsive behavior before changing the UI.
2. Identify the domain's four primary destinations and the six most frequent daily actions.
3. Define information hierarchy and screen states before writing components: loading, empty, error, success, permission denied, and offline states.
4. Keep main navigation and primary actions visible on small screens; route secondary administration to the Settings Hub or Home Services Grid.
5. Implement the shell and reusable card primitives first, then build screen-specific cards and modals.
6. Verify RTL alignment, keyboard navigation, touch target size, contrast, overflow, and narrow viewport behavior.
7. Test representative flows on a narrow mobile viewport and a desktop viewport with the centered app shell before completion.

## Global Layout and Visual System

Apply these rules consistently unless the product has an explicit design system that overrides them:

- Center the application shell inside a `480px` maximum-width container on desktop over a neutral outer backdrop. On mobile, use the full viewport width.
- Set `dir="rtl"` at the application root and use Arabic-friendly typography such as `Tajawal` or `Cairo`. Keep numeric values, dates, phone numbers, and identifiers legible and consistently aligned.
- Group functional blocks inside standalone white cards (`#FFFFFF`) with `16px`–`20px` radius and subtle borders (`#EAE4DC`) over a warm cream background (`#F7F4EF`).
- Use a warm primary accent such as terracotta `#D97757` with a darker `#C86446` gradient for primary buttons and hero cards.
- Use soft tinted containers such as `#F9E5DC` for icon badges, dark high-contrast text such as `#2D1810` for headings and figures, and muted gray such as `#7A6F69` for secondary descriptions.
- Pair monetary figures with an explicit currency label and semantic color: green for positive or credit, red for negative or debit, and neutral gray for zero.
- Maintain this vertical rhythm: Top Header → KPI/Summary Metrics → Primary Actions/Search/Filters → Main Content → Fixed Bottom Navigation.

## Persistent Navigation Shell

### Top Header

For Home, use a prominent top card with curved bottom corners. Include a centered app-logo badge, workspace or business name and current date on the right, app title and tagline on the left, and small circular Settings and Notifications shortcuts below the center badge.

For inner screens, use a compact horizontal header with a tinted square icon, page title, and one-line subtitle on the right. Place refresh, export, search, or back actions in small circular buttons on the left.

### Bottom Navigation

- Use exactly four primary tabs: Home, Accounts/Entities, Reports, and one domain-specific core tab such as Inventory, Sales, or Orders.
- Keep two tabs on each side of the center action.
- Embed a large circular `+` Floating Action Button in the center, elevated into a smooth upward curve in the navigation bar.
- Account for the fixed bar in page padding and safe-area insets; do not allow content or form controls to hide behind it.
- Route secondary modules through Settings or the Home Services Grid rather than adding more tabs.

### Quick Actions Bottom Sheet

When the center `+` button is tapped:

- Open a modal bottom sheet with a dimmed backdrop and a visible top drag handle.
- Show a centered title and a `2x3` grid of six large touch-friendly action cards.
- Give each card an icon, short action title, and one-line description.
- Keep focus inside the sheet, close on an explicit close action or backdrop according to the accessibility policy, and restore focus to the `+` button when it closes.
- Order the six actions by daily frequency and domain value.

## Screen Structures

### Home / Dashboard

- Place three horizontal status pills under the header: live system status in the center and actionable alert counters on the sides.
- Use a full-width primary gradient Hero KPI Card for the most important financial or operational metric.
- Add two semi-transparent comparison sub-cards at the bottom of the hero card and a thin progress bar underneath.
- Render a titled three-column Services Grid of equal square cards. Each card has a tinted square icon badge, a short title, and a one-line description for direct module navigation.

### Accounts and Entities

- Start with a Statistical Summary Card containing a two-column internal grid for totals such as total records, receivables/debit, and payables/credit.
- Add a full-width interactive row at the bottom of the summary card to toggle a horizontal distribution chart.
- Place two equal-width primary CTAs directly below, such as Add New Record and Send Bulk Message.
- Add search by name, phone, or identifier, followed by a horizontally scrollable row of filter pills with live counters: All, Debit, Credit, Zero Balance, and domain-specific segments.
- Render each entity as a separate card with an avatar or number, status dot, name, identifier, and at most two compact status tags on the right.
- Show one color-coded balance pill on the left: green for positive/credit, red for negative/debit, gray for zero. Include an overflow menu and a details link without making the card dense.
- Provide clear loading, empty, error, and filtered-no-results states.

### Bulk Messaging / Notification Modal

- Provide audience pills with live recipient counters: All, Overdue/Debtors, Segment, and Manual Selection.
- Provide a template editor supporting variables such as `{customer_name}` and `{balance}`. Validate variables before sending and make save behavior explicit.
- Show a summary card with recipient count, character encoding/size, and expected message count.
- Show a live preview for the first recipient with visible rendered variable substitution.
- Keep Send and Cancel actions clear. Require confirmation for large audiences, irreversible operations, or external costs.

### Reports and Monitoring

- Use three equal square metric cards in a row on wider screens and a responsive two-column or horizontal layout on narrow screens.
- Add a Period Comparison Card split into current-day and monthly performance, showing monetary value and transaction count.
- Group report sections into cards with clickable rows, tinted icons on the right, title and count description, and a chevron on the left.
- Provide routes to detailed logs, date filters, export actions, and permission-aware states.

### Settings and Secondary Pages Hub

Keep secondary administrative pages in a centralized Settings Hub:

- Add an instant `Search settings...` field at the top.
- Show a Workspace and Account Card with business name, active-status badge, account ID, subscription status, and a bottom logout button that preserves local data according to product policy.
- Use one grouped System Preferences Card with an icon, title, and description on the right and an immediate toggle on the left.
- Add a Sub-Pages Directory for catalog/pricing, suppliers, wallets/payment methods, message templates, backups, permissions, and other secondary modules.
- Make search results keyboard accessible and preserve a clear back path to Settings.

## RTL and Accessibility Requirements

- Mirror layout relationships, not the meaning of icons. Keep familiar directional icons consistent with the user's mental model and verify them with RTL screenshots.
- Align Arabic text naturally and avoid forcing Latin identifiers or numeric data into confusing bidi sequences.
- Give every icon-only action an accessible name and every status color a non-color label.
- Use comfortable touch targets, visible focus states, semantic headings, dialog labels, and keyboard-operable sheets and filters.
- Test long Arabic labels, mixed Arabic/Latin text, large font settings, reduced motion, and screen-reader announcements.

## Responsive and Interaction Rules

- Keep the 480px app shell on desktop, but allow card content to reflow at narrow widths.
- Never rely on hover for essential actions; provide tap and keyboard alternatives.
- Make horizontal filter rows scrollable without clipping the final item or trapping the pointer.
- Keep cards scannable: one primary metric pill and no more than two compact status tags per list card.
- Reserve animation for hierarchy and feedback. Respect `prefers-reduced-motion` and avoid decorative movement that competes with data.
- Preserve unsaved form data when opening or closing secondary UI where possible, and warn before destructive navigation.

## Prompt Template for Coding Agents

```text
Read .agent/skills/03-UI-UX-Design/ui/mobile-first-card-ui-architecture/SKILL.md first.
Inspect the existing routes, components, data model, and responsive behavior before editing.
Redesign the interface as an Arabic RTL Mobile-First Card UI with:
- a centered 480px app shell on desktop;
- persistent top and bottom navigation;
- four bottom tabs and a centered + FAB;
- a 2x3 quick-actions bottom sheet;
- KPI hero cards, filterable entity lists, bulk messaging modal, and Settings Hub.
Preserve existing business behavior and identify assumptions.
First return an audit and implementation plan. Do not edit files or commit until I approve.
```

## Quality Checklist

Before declaring the interface complete, verify:

- [ ] The root direction is RTL and Arabic typography is loaded or safely substituted.
- [ ] The shell, fixed navigation, FAB, and bottom sheet work at narrow and wide viewports.
- [ ] The four primary tabs are the only persistent bottom tabs.
- [ ] Every important screen has loading, empty, error, and permission-aware states.
- [ ] Monetary values show currency labels and semantic non-color cues.
- [ ] Accounts/entities can be searched, filtered, and scanned quickly.
- [ ] Bulk messaging previews variables and confirms high-impact sends.
- [ ] Settings contains secondary modules without overloading navigation.
- [ ] Keyboard, screen-reader, focus, contrast, reduced-motion, and touch checks pass.
- [ ] Existing tests and visual checks pass, and no files were changed without approval.
