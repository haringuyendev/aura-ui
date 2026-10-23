---
name: check
description: Run and act on Aura's component rules - duplicate components, raw <button>/<input> when the project has the primitive, undefined color tokens, foreign UI libraries, raw colors, status colors used as text, missing alt or aria-label - and fix what they report, or tune rule severities. Use when an Aura hook blocks or notes an edit ("Aura blocked this change"), before finishing UI work, when the user asks to lint or check components, or to configure .aura/rules.json.
---

# Aura check

```bash
node .aura/bin/aura.mjs check <file…>     # specific files
node .aura/bin/aura.mjs check --changed   # files changed in git (what CI/pre-commit runs)
node .aura/bin/aura.mjs check             # all components (existing findings marked [existing])
node .aura/bin/aura.mjs check --json      # machine-readable
```
Exit code 1 when there is a new error. `[existing]` findings come from the baseline and don't block.

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

## Tuning
`.aura/rules.json` sets each rule to `error`, `warn`, `info` or `off`. Change it only when the user asks
(e.g. a legacy area where raw elements are allowed); explain the trade-off. To accept current findings as
debt, use `aura baseline` (the `aura-ui:scan` skill), with the user's agreement.
