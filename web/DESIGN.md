# Orabl - Design System & Anti-Slop Guidelines (design.md)

## 1. Core Philosophy
Orabl is a premium, editorial "Learning Out Loud" platform. The design is structured, architectural, and tactile—resembling a high-end digital ledger or magazine, NOT a generic SaaS dashboard. 
- **Rule Zero:** No "AI Slop". Do not use glowing orbs, blurred gradients, 3D floating illustrations, or default UI component library styles.

## 2. Color Palette
Strictly adhere to these exact hex codes. Never use default Tailwind grays, slates, zincs, or blues unless explicitly instructed.
- **Warm Beige (`#EBE5D9`):** The primary canvas color. Used for light-mode backgrounds and text on dark backgrounds.
- **Deep Maroon (`#451017`):** The primary heavy anchor color. Used for massive background blocks, primary dark-mode canvases, and primary text on Warm Beige.
- **True Black (`#000000`):** Used for stark contrast, structural borders, the footer background, and brutalist buttons.
- **Opacity Rules:** Do not introduce new gray hex codes for borders or subtle backgrounds. Use opacity variants of the brand colors (e.g., `border-[#451017]/20` or `bg-[#451017]/5`).

## 3. Typography
The typographic hierarchy relies on extreme contrast between massive serifs and microscopic sans-serifs/monospaces.
- **Headings (Serif):** Must be massive, highly legible, and elegantly structured. 
  - Classes: `font-serif text-5xl md:text-7xl lg:text-[10rem] tracking-tighter leading-tight` (or `leading-[0.95]`). Use `italic` for physical, sweeping emphasis.
- **Labels & Overlines (Sans-serif/Monospace):** Used for structural metadata, overlines, and table headers. 
  - Classes: `font-sans uppercase tracking-[0.2em] text-xs font-bold`.
- **Body Text:** Clean, readable, and perfectly contrasted against the background.

## 4. Shape & Structure Constraints
- **The "No Pill" Rule:** Absolutely NO `rounded-full` classes on buttons, badges, or layouts. 
- **Standard Rounding:** Interactive elements (buttons, cards, dropdowns) should use `rounded-xl` or `rounded-2xl` to feel like a premium tactile app.
- **Avatars:** User avatars/monograms must be structural squares (`rounded-lg` or `rounded-xl`), never perfect circles.
- **Borders:** Use crisp, 1px or 2px solid borders for separation (`border-[#451017]/20` or `border-black`).

## 5. Component Master Rules
When building components, default to these structures:

### Buttons
- Primary buttons must have high contrast and sharp intent. 
- Tailwind: `bg-[#451017] text-[#EBE5D9] hover:bg-black rounded-xl px-6 py-3 font-sans font-semibold transition-colors`.

### Cards & Dashboards
- Dashboard metrics and cards must use the brand palette. 
- Tailwind (Dark Card): `bg-[#451017] text-[#EBE5D9] rounded-xl p-6 shadow-sm`.
- Do not use floating cards in empty voids; anchor them structurally within grids.

### Tables & Ledgers
- Tables must be completely transparent. NO gray background wrappers.
- Table Headers: Stark, uppercase, heavily spaced text with a strong bottom border. 
  - Tailwind: `border-b-2 border-black pb-3 text-black font-sans font-bold text-xs uppercase tracking-widest bg-transparent`.
- Table Rows: `border-b border-[#451017]/20 py-4 hover:bg-[#451017]/5`.
- **CRITICAL:** Do NOT use status dots/orbs.

### Dropdowns & Popovers
- Override all UI library defaults (shadcn, Radix, etc.).
- Dropdown Canvas: `bg-[#EBE5D9] border border-[#451017]/15 rounded-2xl shadow-xl shadow-[#451017]/10 p-2`.
- Focus States: You MUST remove default blue/orange focus rings. Apply `outline-none focus:outline-none focus:ring-0 focus-visible:ring-0` to all dropdown items. 
- Hover states inside menus should be `rounded-lg hover:bg-[#451017] hover:text-[#EBE5D9]`.

## 6. Graphics & Textures
- **Visual Identity:** Rely on DOM-based marquee paths, large typography, and geometric line-art ASCII.
- **ASCII Art:** When using ASCII watermarks, use `whitespace-pre font-mono text-[8px] leading-tight pointer-events-none select-none`. Use low opacity (e.g., 15% to 40%) depending on the background contrast.
- **No Images:** Avoid generic stock photography, vector illustrations, or glowing 3D objects. 

## Agent Instruction:
Before writing any UI code, cross-reference your proposed Tailwind classes against this document. If your code introduces a default gray background, a drop-shadow glow, a pill-shaped button, or an unstyled focus ring, you have violated the design system. Rewrite it using only the rules above.