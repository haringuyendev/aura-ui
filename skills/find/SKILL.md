---
name: find
description: Find which of the project's own components to use for a UI need (an input, a dialog, a date range, a price table, a media gallery…), with import path, props, variants and where it is already used, plus the design tokens to style it - by asking the Aura registry instead of scanning folders. Use whenever you are about to build or change UI in a repo with .aura/, before writing a new component, and when the user asks which component, prop, variant or color token to use.
hooks:
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: node "${CLAUDE_PLUGIN_ROOT}/manager/aura.mjs" hook skill-nudge
          once: true
---

# Aura find

Ask the registry, from the repo root. Queries work in Vietnamese or English, accents optional.

```bash
node .aura/bin/aura.mjs find "ô nhập liệu"        # ranked project components for a need
node .aura/bin/aura.mjs show Button               # props, variants, description, what it wraps, where used
node .aura/bin/aura.mjs usage Dialog              # files that import it (examples of real usage)
node .aura/bin/aura.mjs tokens                    # color/font/status tokens; which are text-safe
```

How to use the answers:
1. **Pick the top result that fits** and import it exactly as shown (`import { … } from "…"`). In a
   monorepo that is the package's public path; inside that package itself use the `inside <package>:` path.
   A result marked `<package> only` lives in one app and can't be imported from another. Results
   marked `(wraps input)` are project components built on that primitive: prefer them when they already do
   what you need (e.g. a form field that wraps `Input`).
2. Before writing JSX, `show` the component for its props and variants, and open one file from "used in" to
   copy the real usage pattern.
3. **Nothing fits?** The output lists aura references under "Not in the project?":
   - In an app made from the aura starter, an **add-on** line shows its install command (rich text editor,
     PDF/Word/Excel/image viewer). Run it from the app root, then use the block (`aura show <name>`).
   - Otherwise build the missing piece in the project's style from its primitives (Radix-based shadcn uses
     `asChild`, Base UI uses `render`).
   Then describe the new component (`aura-ui:describe`).
4. **Colors** come from `tokens` only. If a status token is "background/tint only", use the text token it
   names, or a tint (`bg-<token>/15`) with `text-foreground`.

Don't scan `components/` folders with grep/glob to choose components; the registry is kept in sync by the
hooks and is faster. Read component files only to understand one you already picked.

No `.aura/` in the repo? Run the `aura-ui:init` skill first. To browse what the aura starter itself offers,
`node "${CLAUDE_PLUGIN_ROOT}/scripts/catalog.mjs" find <words>` searches its catalog.
