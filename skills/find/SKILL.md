---
name: find
description: Find which of the project's own components to use for a UI need (an input, a dialog, a date range, a price table, a media gallery…), with import path, props, variants and real usages, plus the design tokens to style it - by asking the Aura registry instead of scanning folders - and, when the project lacks a primitive, propose it to the user and add it with aura add. Use whenever you are about to build or change UI in a repo with .aura/, before writing a new component, when a needed primitive is missing, and when the user asks which component, prop, variant or color token to use.
hooks:
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: node "${CLAUDE_PLUGIN_ROOT}/manager/aura.mjs" hook skill-nudge
          once: true
---

# Aura find

> `node` not found ("command not found", "not recognized")? Run the `aura-ui:setup` skill first: it installs Node.js for the user, no admin rights needed.

Ask the registry, from the repo root. It lists the project's **building blocks** (primitives, shared
blocks, UI library components), not app-specific components: compose new screens from these. Queries work in Vietnamese or English, accents optional.

```bash
node .aura/bin/aura.mjs find "ô nhập liệu"        # ranked project components for a need
node .aura/bin/aura.mjs show Button               # props, variants, description, what it wraps, where used
node .aura/bin/aura.mjs snippet Item              # import line, variants and real usages from the codebase
node .aura/bin/aura.mjs usage Dialog              # files that import it
node .aura/bin/aura.mjs add calendar popover      # add missing primitives (only after the user agreed)
node .aura/bin/aura.mjs tokens                    # color/font/status tokens; which are text-safe
```

How to use the answers:
1. **Pick the top result that fits** and import it exactly as shown (`import { … } from "…"`). In a
   monorepo that is the package's public path; inside that package itself use the `inside <package>:` path.
   A result marked `<package> only` lives in one app and can't be imported from another. Results
   marked `(wraps input)` are project components built on that primitive: prefer them when they already do
   what you need (e.g. a form field that wraps `Input`).
2. Before writing JSX, run `snippet` for the component: it prints the import, its variants and real usages
   to copy. `show` adds props and the description.
3. **The project lacks it?** `find` lists catalog matches under "Not in the project":
   - `MISSING PRIMITIVE` (a standard shadcn component: date picker, kbd, toggle group…): **stop and ask the
     user** whether to add it, naming what it is for and the command it runs. If they agree, run
     `node .aura/bin/aura.mjs add <names>` (Claude Code also shows them a permission prompt), then describe the
     new primitive (`aura-ui:describe`). If they decline, compose from what exists and say so in your reply.
     Never hand-build a primitive from styled `div`s: the hooks block that (`hand-built-surface`), and a file
     created in the primitives folder without approval is flagged.
   - An **add-on** line (apps from the aura starter) shows its install command: run it from the app root.
   - An **aura block**: compose it from the project's primitives.
   - The primitive exists but lacks a look you need (a severity tone, an accent bar): add a variant with
     `node .aura/bin/aura.mjs variant <Component> <name> [--tone destructive] --write` and mention the change to
     the user, instead of styling a `div`.
4. **Colors** come from `tokens` only. If a status token is "background/tint only", use the text token it
   names, or a tint (`bg-<token>/15`) with `text-foreground`.

Don't scan `components/` folders with grep/glob to choose components; the registry is kept in sync by the
hooks and is faster. Read component files only to understand one you already picked.

No `.aura/` in the repo? Run the `aura-ui:init` skill first. To browse what the aura starter itself offers,
`node "${CLAUDE_PLUGIN_ROOT}/scripts/catalog.mjs" find <words>` searches its catalog.
