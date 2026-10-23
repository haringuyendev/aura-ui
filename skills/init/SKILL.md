---
name: init
description: Set up the Aura component manager in a repository - scan the project's stack, design tokens, components and conventions into .aura/ (registry, profile, rules, baseline, vendored CLI) and add npm scripts, so agents ask Aura instead of scanning the repo and hooks check component edits. Use when the user asks to install, add or set up aura in a project, or when a UI task starts in a repo that has no .aura/ folder.
---

# Aura init

`AURA` = the aura-ui plugin folder, two levels above this skill's real directory (`<base>/../..`; outside Claude Code, the folder where the aura-ui repo is cloned).

## Steps
1. Go to the repository root (the folder with `package.json`). If `.aura/registry.json` already exists,
   stop: the repo is set up; use the `aura-ui:scan` skill to refresh instead.
2. Run:
   ```bash
   node "AURA/manager/aura.mjs" init            # add --no-scripts to leave package.json untouched
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
   - npm scripts `aura` and `aura:check` (unless `--no-scripts`).
3. Report to the user in a few lines, from the printed summary:
   - the stack, UI library, token file, number of components;
   - **findings** worth fixing (undefined tokens, status colors not text-safe, missing info/chart tokens,
     raw colors) and the baseline count;
   - how many components have no description yet; offer the `aura-ui:describe` skill to fill them.
4. Tell the user to **commit `.aura/`** (the cache folder is git-ignored) and, for people who edit code by
   hand, to add `npm run aura:check` to their pre-commit hook or CI.

## After init
- The plugin's hooks are active in this repo: session-start summary, checks after Write/Edit, registry sync
  after Bash, and a stop gate. They stay silent in repos without `.aura/`.
- Agents use the `aura-ui:find` skill to pick components and `aura-ui:check` when a hook blocks.
- Don't edit `registry.json` by hand except through `aura describe`; it is regenerated from code.
