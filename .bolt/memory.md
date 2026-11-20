# Project memory

## Product intent & audience

- Stock/inventory management app for products with thickness, color, size, brand, and quantity attributes
- Users physically record stock in handwritten "minute books" / "manual books"
- "Print to Manual" feature generates PDFs laid out like handwritten stock book pages for physical printing and backup
- Supports printing to A5 and A4 paper sizes
- Print to Manual is on the main Inventory page, not Quick Stock dialog

## Brand personality & voice

- Practical, utility-focused tool for inventory workers
- Feature explanations are step-by-step and reference real-world workflow (e.g. "like you'd write it at the top of a page")

## Visual design & UX direction

- React + Vite + Tailwind CSS + JSX; Lucide React for icons; `@/` path alias for imports (maps to `src/`)
- Print to Manual buttons appear in Inventory page header next to export button, grouped under "Print to Manual" label
- Responsive header: full labels on laptop/desktop; on phone, labels hide and only compact A5/A4 buttons show
- Other inventory header buttons also shorten labels on small screens to fit without crowding
- `flex-wrap` used for header controls
- Manual book PDF layout unchanged: portrait orientation, thickness/color combos as headings, sizes listed beneath with brand names adjacent, two-column size layout, automatic page flow

## Decisions, constraints & rationale

- No extra UI/icon packages beyond lucide-react unless explicitly requested
- Print to Manual moved from Quick Stock dialog to Inventory page per explicit user request
- Print to Manual uses currently filtered inventory (search, brand, category, status filters applied) — reflects what's on screen
- No longer depends on Quick Stock dialog being open
- User reported "it does not work in this" — bug exists, not yet diagnosed or fixed
- Responsive layout applied via Tailwind classes but not visually confirmed in a real browser

## Open questions & assumptions

- What specifically "does not work" is unresolved — needs investigation on both phone and laptop
- Whether the issue is PDF generation, button rendering, or responsive behavior is unknown
- Print to Manual currently supports A5 and A4 only; other paper sizes may be requested later
- Assumed two-column size layout is sufficient; may need adjustment if size/brand count grows