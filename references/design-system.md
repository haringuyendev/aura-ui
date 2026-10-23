# Design system patterns (Tailwind v4 + shadcn)

Everything visual is defined once in `src/index.css`, then used by name. This file shows how.

## 1. Brand colors: edit the existing tokens
Change values in `:root` (light) and `.dark` (dark). Keep the names; every shadcn component already
reads them.
```css
:root {
  --primary: oklch(0.55 0.16 155);          /* brand */
  --primary-foreground: oklch(0.99 0 0);    /* text on brand: check contrast */
  --accent: oklch(0.95 0.04 155);           /* soft brand tint for hovers/highlights */
  --accent-foreground: oklch(0.30 0.08 155);
  --ring: oklch(0.55 0.16 155);
  --radius: 0.75rem;
}
```
Each `--x` needs a readable `--x-foreground`. Keep neutrals (`--background`, `--muted`, `--border`)
low-chroma so the brand color stays meaningful.

## 2. New tokens: declare, then register
Colors go in `:root`/`.dark` and are mapped in `@theme inline` so Tailwind generates classes.
```css
:root {
  --success: oklch(0.60 0.14 150);
  --success-foreground: oklch(0.99 0 0);
  --primary-glow: oklch(0.72 0.14 155);
  --gradient-primary: linear-gradient(135deg, var(--primary), var(--primary-glow));
  --shadow-elegant: 0 10px 30px -10px color-mix(in oklch, var(--primary) 30%, transparent);
}
@theme inline {
  --color-success: var(--success);                 /* bg-success, text-success */
  --color-success-foreground: var(--success-foreground);
  --shadow-elegant: var(--shadow-elegant);         /* shadow-elegant */
}
@utility bg-gradient-primary { background-image: var(--gradient-primary); }
@utility transition-smooth { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
```

## 3. Font
```bash
npm i @fontsource/be-vietnam-pro   # any @fontsource family with Vietnamese glyphs
```
```css
@import "@fontsource/be-vietnam-pro/400.css";
@import "@fontsource/be-vietnam-pro/500.css";
@import "@fontsource/be-vietnam-pro/600.css";
@theme inline { --font-sans: 'Be Vietnam Pro', sans-serif; }
```
Variable families live under `@fontsource-variable/<name>` (e.g. `inter`); not every family has one.
Remove the starter's Geist import if you replace it.

## 4. Motion
```css
@theme inline {
  --animate-fade-up: fade-up 0.4s ease-out both;
  @keyframes fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
}
```
Use `animate-fade-up`. Keep motion subtle and respect `motion-reduce:` where it moves content.

## 5. Variants instead of overrides
```tsx
// components/ui/button.tsx, inside buttonVariants.variants.variant
hero: "bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-90 transition-smooth",
soft: "bg-accent text-accent-foreground hover:bg-accent/80",
```
```tsx
// ❌ <Button className="bg-gradient-to-r from-emerald-500 to-teal-400 text-white shadow-xl">
// ✅ <Button variant="hero">
```
Same idea for `badge.tsx` (status variants: `success`, `warning`…), `card.tsx`, `alert.tsx`.

## 6. Pitfalls
- `outline` buttons have a background; light text on them disappears. Make a dedicated variant.
- A new token used in a component but missing from `@theme inline` produces no class and fails silently.
- Don't mix formats: if a token is `oklch(...)`, use it as `var(--token)`, never `hsl(var(--token))`.
- Dark mode: whenever you change a `:root` color, set its `.dark` counterpart too.
