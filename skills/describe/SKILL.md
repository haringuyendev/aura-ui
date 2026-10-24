---
name: describe
description: Write registry descriptions for the project's components - what each is for, when to use and avoid it, Vietnamese and English keywords, a usage example - so agents can find them with aura find. Use after creating a component, when the Aura stop hook asks to describe new components, or when the user asks to document or enrich the component registry (one component or all undescribed ones).
---

# Aura describe

Only registry entries need descriptions: with the default scope `"primitives"` that is the primitives and
shared blocks, not components that belong to one app.

```bash
node .aura/bin/aura.mjs describe <Name> \
  --summary "Nhãn giá căn hộ dạng 'từ 3,85 tỷ'." \
  --use "thẻ căn hộ; bảng giá" \
  --avoid "giá cần chỉnh sửa (dùng ô nhập)" \
  --keywords "giá, nhãn giá, price, price tag" \
  --example '<PriceTag value={3.85} />'
```

## One component (after creating it)
1. `node .aura/bin/aura.mjs show <Name>` to see its exports, props and variants.
2. Write the description from the code and how it is used:
   - `--summary`: one sentence, what it is (in the project's UI language is fine).
   - `--use`: 1–3 situations, separated by `;`.
   - `--avoid`: when another component fits better, naming it.
   - `--keywords`: words people would search with, **Vietnamese and English**, comma-separated (include
     domain words, e.g. "căn hộ, apartment, unit").
   - `--example`: one line of JSX with the props that matter.

## All undescribed components (enriching a fresh registry)
1. List them: `node -e 'const r=require("./.aura/registry.json");for(const c of r.components)if(!c.described)console.log(c.name, c.category, c.path, "used", c.usedBy)'`
2. Work most-used first. For each: read the file (and one usage from `usedIn`) and write an entry.
   Keep each description short; skip trivial internal helpers (say so).
3. Write all entries to one JSON file and apply them at once:
   ```bash
   node .aura/bin/aura.mjs describe --from /tmp/aura-describe.json
   ```
   ```json
   [{ "name": "price-tag", "summary": "…", "use_when": ["thẻ căn hộ", "bảng giá"], "avoid_when": "…",
      "keywords": ["giá", "price"], "example": "<PriceTag value={3.85} />" }]
   ```
   Add `"path"` when two components share a name (e.g. in different apps of a monorepo).
4. Spot-check with `aura find "<a natural query>"` that the component now comes up.

Descriptions live in `.aura/registry.json` and survive edits and file moves; commit them with the code.
Entries with `describedBy: "aura-catalog"` were pre-filled from the aura catalog for shadcn-style
primitives whose exports match, and follow catalog updates; describe one yourself to take it over when the
project's version behaves differently.
