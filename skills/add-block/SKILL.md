---
name: add-block
description: Install a heavy aura add-on block into an app made from the aura starter - rich-text-editor (Tiptap editor with a token-styled toolbar, plus RichTextContent to render saved HTML safely) or file-lightbox (full-screen viewer for images, PDF, Word .docx, Excel/CSV and text). Use when a screen needs formatted text input, notes or descriptions with formatting, or opening and previewing attachments and documents.
---

# Aura add-block

`AURA` = the aura-ui plugin folder, two levels above this skill's real directory (`<base>/../..`; outside Claude Code, the folder where the aura-ui repo is cloned).

```bash
node "AURA/scripts/add-block.mjs" list
node "AURA/scripts/add-block.mjs" <rich-text-editor|file-lightbox> <app-dir>   # --force to overwrite
```
It copies the block into `src/components/blocks/`, installs its npm packages and, for file-lightbox, copies
pdf.js fonts/cmaps/wasm into `public/pdfjs/`. Existing files are never overwritten without `--force`.
Afterwards the Aura registry picks the new files up on the next command or hook; describe them only if
they aren't found by `aura find` (they are usually pre-described from the catalog).

| Add-on | Use | Notes |
|---|---|---|
| `rich-text-editor` | `<RichTextEditor value onChange toolbar="basic" \| "full" maxLength placeholder />` inside a `FormField`; `<RichTextContent html />` to show saved HTML (sanitized with DOMPurify) | Large bundle: `React.lazy` it when it is not on the first screen. Value is HTML. |
| `file-lightbox` | `<FileLightbox files={[{ name, url } \| { name, file }]} index={i} onIndexChange={setI} />`; `FileUpload` has `onPreview` to open it | Viewers are lazy-loaded per type. PDF (react-pdf), .docx (docx-preview), Excel/CSV/ODS (SheetJS, first 1000 rows), images, text; other types show a download fallback. |

Only for apps made from the aura starter (Base UI primitives, `@/` alias, `src/lib/format.ts`). In other
projects, use the files as a reference and port them to the project's primitives.
