# Feishu Markdown Sync Product Roadmap

## Product Positioning

The original project name, `Feishu Wiki Markdown Sync`, describes the first wedge: exporting Feishu wiki/doc content into Git-friendly Markdown.

The next product name should be **Feishu Markdown Sync**. It keeps the Markdown-centered value proposition while making room for Feishu Sheet pages, Drive files, whiteboards, and future structured content types.

Keep legacy command names such as `scripts/export_feishu_wiki.cjs` until a compatibility wrapper exists. Rename the product before renaming scripts.

## Target Users

- Product managers who want PRDs, wiki pages, and sheet-backed planning artifacts in Git.
- Engineering and AI agents that need stable Markdown, CSV, and asset files instead of opaque Feishu links.
- Teams that want to review Feishu changes through diff, audit, and repeatable import/export flows.

## v1.7.0 Goals

- Adopt `lark-cli >= 1.0.39` and document the `1.0.24-1.0.39` upgrade intake.
- Keep doc/wiki Markdown Sync as the core workflow while adding a separate Drive-native Markdown file path.
- Add guarded wrappers for Sheet management, Base records, Task attachments, IM search, Drive comments, and config binding.
- Make Mermaid/PlantUML whiteboard updates the supported text-drawing path, while keeping doc `<add-ons>` round-trip as explicit validation only.

## Sheet Capability Roadmap

### Current

- Embedded sheet blocks can be expanded into local CSV files and Markdown previews.
- Top-level sheet nodes can be preserved as workbook, CSV, preview, and README files during wiki export.
- Import currently keeps CSV-derived preview tables as Markdown content and intentionally avoids re-attaching standalone CSV links.

### Next

- Add explicit examples for exporting a wiki tree that contains Sheet pages.
- Add audit checks that distinguish embedded Sheet blocks from top-level Sheet pages.
- Support explicit-range Sheet write-back from CSV or JSON 2D arrays with read-back verification.

### Later

- Support Sheet-to-Git sync modes: workbook snapshot, per-sheet CSV, and Markdown preview.
- Support richer targeted Sheet updates when stable range, style, image, dropdown, and schema operations are needed.
- Add sheet schema snapshots so column changes are visible in review.

## CLI Upgrade Intake

For every meaningful `lark-cli` release:

1. Record the release date, CLI version, and relevant commands.
2. Classify changes into docs, sheets, drive, media, whiteboard, auth, and breaking changes.
3. Decide whether the minimum supported CLI version should move.
4. Update `README.md`, `SKILL.md`, `.env.example`, and script version checks together.
5. Add or update a small verification case for each adopted CLI behavior.

## Current CLI Baseline

As of 2026-05-04, the previous project baseline was `lark-cli >= 1.0.23`.

Relevant capabilities to track from the recent CLI line:

- `docs +fetch/+update --api-version v2` for precise document edits.
- `docs +media-insert --selection-with-ellipsis` for positioned media restore.
- `sheets +export/+write/+append/+read` for workbook/CSV export and explicit-range write-back flows.
- `whiteboard +query/+update` for live whiteboard updates.
- Drive sync shortcuts such as pull, push, and status if they can replace custom export plumbing.
- Markdown shortcuts and `@file` parameter support where they reduce temporary-file handling.

As of 2026-05-10, the project baseline is `lark-cli >= 1.0.39`.

Adopted in v1.7.0:

- Drive-native Markdown file create/fetch/overwrite through `scripts/feishu_markdown_file.cjs`.
- Sheet management, Base record, Task attachment, IM search, Drive comment, and config bind wrappers through `scripts/feishu_cli_tools.cjs`.
- Mermaid/PlantUML whiteboard updates and doc `<add-ons>` verification through `scripts/feishu_text_diagram.cjs`.
- Shared `scripts/lib/lark_cli.cjs` helper for CLI execution, version checks, JSON parsing, and path normalization.

Boundary rule: `lark-cli markdown` does not replace doc/wiki sync. It only manages Drive-native `.md` files.

## Non-Goals

- Do not promise live Feishu text-drawing add-on round-trip until a tenant fetch test proves the live add-ons block is preserved.
- Do not rename public scripts in a breaking way before adding aliases or migration notes.
- Do not treat Sheet write-back like Markdown document import; it needs separate conflict rules.
