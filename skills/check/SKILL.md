---
name: check
description: Run and act on Aura's component rules - duplicate components, raw <button>/<input> when the project has the primitive, undefined color tokens, foreign UI libraries, raw colors, status colors used as text, missing alt or aria-label - and fix what they report, or tune rule severities. Use when an Aura hook blocks or notes an edit ("Aura blocked this change"), before finishing UI work, when the user asks to lint or check components, or to configure .aura/rules.json.
---

# Aura check

```bash
node .aura/bin/aura.mjs check <file…>     # specific files
node .aura/bin/aura.mjs check --changed   # files changed in git (what CI/pre-commit runs)
node .aura/bin/aura.mjs check apps/web/src # a folder
node .aura/bin/aura.mjs check             # all registered components (new findings only)
node .aura/bin/aura.mjs check --existing  # also list baseline findings, with their current lines
node .aura/bin/aura.mjs stats             # findings per rule: new vs existing, files with the most
node .aura/bin/aura.mjs check --json      # machine-readable
```
Exit code 1 when there is a new error. The first line says what was checked. `[existing]` findings come
from the baseline and don't block.

## Fixing each rule
| Rule | Default | Fix |
|---|---|---|
| `duplicate-component` | error | Delete the new copy and import the existing component the message names. If it lacks something, add a variant or prop to the existing one. |
| `bypasses-primitive` | error | Replace the raw `<button>`/`<input>`/`<select>`/`<textarea>`/`<dialog>`/`<table>` with the project primitive the message names, using its variants. |
| `undefined-token` | error | Use one of the existing tokens listed in the message. If a new color is really needed, add the variable in the token file for light **and** dark and register it in `@theme` (`--color-<name>`), then use it. |
| `foreign-ui-library` | error | Remove the import; build it from the project's components (`aura-ui:find`). |
| `raw-color` | warn | Replace palette/hex/white/black classes with semantic tokens. |
| `status-text-unsafe` | warn | Use the text-safe token the message names, or a tint with `text-foreground`. |
| `img-alt`, `icon-button-label` | warn | Add `alt` (empty `alt=""` only for decoration) / `aria-label`. |
| `undescribed-component` | info | Describe it with the `aura-ui:describe` skill. |

After fixing, run `check` on the file again. The stop hook re-checks every file you touched in the session
and won't let you finish with new errors or undescribed new components.

In a monorepo, a message names the import to use from where the file is: the package's public path from
an app (`@acme/ui/components/button`), its local path inside that package (`#components/button`).

## Tuning (`.aura/rules.json`)
Change it only when the user asks; explain the trade-off.
- `rules`: each rule `error`, `warn`, `info` or `off` (e.g. a legacy area where raw elements are allowed).
- `allowUiLibraries`: import prefixes allowed besides the detected UI libraries, e.g. `["@base-ui/react",
  "@tanstack/react-table"]`. Prefer this over turning `foreign-ui-library` off.
- `primitivesDir`: the folder of base components when it isn't found automatically (e.g.
  `"packages/ui/src/components"`). Aura reads shadcn `components.json` aliases, tsconfig paths and
  package.json `#imports` first.
- `tokenFiles`: CSS entry files to read tokens from (default: every `.css` in the repo). `@import`s are
  followed, including workspace packages and packages in node_modules (Tailwind's own files are skipped).
- `cli: "local"`: hooks run `.aura/bin/aura.mjs` instead of the plugin copy, for a patched local CLI.
  Re-running `aura init` overwrites `.aura/bin` with the plugin version, so keep patches elsewhere too.

Re-run `aura scan` after editing it. To accept current findings as
debt, use `aura baseline` (the `aura-ui:scan` skill), with the user's agreement.
