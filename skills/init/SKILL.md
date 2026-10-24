---
name: init
description: Set up the Aura component manager in a repository - scan the project's stack, design tokens, components and conventions into .aura/ (registry, profile, rules, baseline, vendored CLI) and add npm scripts, so agents ask Aura instead of scanning the repo and hooks check component edits. Use when the user asks to install, add or set up aura in a project, or when a UI task starts in a repo that has no .aura/ folder.
---

# Aura init

`${CLAUDE_PLUGIN_ROOT}` is the aura-ui plugin folder (Claude Code fills it in; with other agents, use the folder where the aura-ui repo is cloned).

## Steps
1. Go to the repository root. **In a monorepo** (package.json `workspaces` or `pnpm-workspace.yaml`), run it
   at the workspace root, not inside a package: one `.aura/` covers every app and package, the shadcn package
   (e.g. `packages/ui`) is the primitive source, usage is counted across apps, and hooks check every app.
   If `.aura/registry.json` already exists, re-running only rescans and refreshes `.aura/bin` (rules and
   baseline are kept); for a plain refresh use the `aura-ui:scan` skill.
2. Run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/manager/aura.mjs" init            # add --scripts to also add npm scripts aura / aura:check
   ```
   It is read-only on source code. It writes:
   - `.aura/registry.json`: every component (primitives in `components/ui`, shared components, sections/
     blocks) with exports, props, variants, what it is built on, usage count and where it is used;
     shadcn-style primitives get descriptions from the aura catalog.
   - `.aura/profile.json`: stack, UI library, token files and dark selector, colors, fonts, status and
     chart tokens (with contrast), conventions (e.g. Payload blocks).
   - `.aura/rules.json`: rule severities (`error` blocks the agent, `warn`, `info`, `off`).
   - `.aura/baseline.json`: findings that already exist, so hooks only block new ones.
   - `.aura/bin/`: a copy of the CLI, so the team and CI can run it without the plugin.
   - `package.json` is left untouched unless you pass `--scripts` (ask the user first in a shared repo).
3. **Adapt Aura to this repo.** Init ends with "Check these" notes (also `node .aura/bin/aura.mjs doctor`):
   what it couldn't detect, each with the fix. Work through them:
   - read the folders or files a note points at to confirm (e.g. where base components really live);
   - set the keys in `.aura/rules.json` (`primitivesDir`, `tokenFiles`, `allowUiLibraries`), or add a
     missing alias to tsconfig `paths` only if the user agrees to touch project config;
   - run `node .aura/bin/aura.mjs scan`, then `doctor` again, until only notes that are true facts about
     the project remain (e.g. "no dark mode").
   What Aura handles on its own: npm/pnpm/yarn/bun workspaces (Turborepo, Nx), tsconfig `paths`/`baseUrl`/
   `extends`, package.json `#imports` and `exports` (including built `dist/` mapped back to `src/`), barrel
   `index.ts` files, shadcn `components.json` (React, Vue, Svelte), a `ui`/`design-system` package, UI
   libraries used directly (antd, MUI, Chakra, Mantine, Headless UI… their components become the
   primitives), Tailwind v3 configs and presets anywhere in the repo, Tailwind v4 `@theme` through `@import`,
   and themes defined in code (createTheme, extendTheme).
4. Report to the user in a few lines, from the printed summary:
   - the stack, UI library, token file, number of components (and packages, in a monorepo);
   - if primitives show `?` or tokens look wrong, set `primitivesDir` / `tokenFiles` in `.aura/rules.json`
     (see `aura-ui:check`); if a library the project relies on is reported as foreign, add it to
     `allowUiLibraries`;
   - **findings** worth fixing (undefined tokens, status colors not text-safe, missing info/chart tokens,
     raw colors) and the baseline count;
   - how many components have no description yet; offer the `aura-ui:describe` skill to fill them.
   - what you set in `rules.json` and why;
5. Tell the user to **commit `.aura/`** (the cache folder is git-ignored) and, for people who edit code by
   hand, to add `node .aura/bin/aura.mjs check --changed` to their pre-commit hook or CI. If init notes a
   leftover per-package `.aura/` in a monorepo, suggest deleting it.

## After init
- The plugin's hooks are active in this repo: session-start summary, checks after Write/Edit, registry sync
  after Bash, and a stop gate. They stay silent in repos without `.aura/`.
- Agents use the `aura-ui:find` skill to pick components and `aura-ui:check` when a hook blocks.
- Don't edit `registry.json` by hand except through `aura describe`; it is regenerated from code.
