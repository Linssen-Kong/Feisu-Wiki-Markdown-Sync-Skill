# Feishu Markdown Sync

[English](README.md) | [简体中文](README.zh.md)

`feishu-markdown-sync` is the product direction for this local Codex skill: a Git-friendly Feishu content sync tool that started with wiki/doc Markdown export, and is expanding toward first-class Sheet page export, audit, and round-trip workflows.

Some legacy script names and default export folders still keep `wiki` for backward compatibility with existing doc/wiki sync workspaces. New product, install, roadmap, and release language should use **Feishu Markdown Sync** unless a command or environment variable requires the legacy name.

Current release: `v1.7.0`

This release adopts `lark-cli v1.0.39`, adds Claude Code and npm installation support, adds a Drive ordinary-file sync path, expands Sheet format/image/filter handling, exports Slides snapshots, and fixes export naming so Feishu titles are used whenever they are available.

## Configuration

The project no longer hardcodes tenant domains or wiki tokens.

Set configuration through environment variables or CLI options:

```powershell
$env:FEISHU_BASE_URL = "https://your-tenant.feishu.cn"
```

Available configuration:

- `FEISHU_BASE_URL`: required tenant base URL for wiki/doc links
- `FEISHU_WIKI_TOKEN`: optional default wiki token for export
- `FEISHU_OUTPUT_ROOT`: optional default export directory, defaults to `exports/feishu-wiki/` for compatibility
- `FEISHU_EXPORT_ROOT`: optional default audit directory
- `FEISHU_INCLUDE_SENSITIVE_METADATA`: optional, defaults to `false`
- `FEISHU_KEEP_SENSITIVE_PLACEHOLDERS`: optional, defaults to `false`
- `LARK_CLI_PATH`: optional custom `lark-cli` entry path

## What It Does

- Export a Feishu wiki tree into readable local Markdown
- Treat top-level Sheet pages and embedded Sheet blocks as first-class sync objects
- Write CSV or JSON 2D array data back into an explicit Feishu Sheet range with read-back verification
- Pull, inspect, and push through a manifest-backed sync shell without making Git commits for the user
- Preserve document format snapshots as XML plus format maps for safer future merges
- Download doc images and rewrite them as inline Markdown images
- Expand embedded sheet blocks into local `CSV` files plus Markdown table previews
- Convert Feishu text-drawing add-ons into plain code blocks that preserve Mermaid text
- Export whiteboards as code when available, and automatically fall back to raw node JSON plus embedded Mermaid mindmap text when code export is unavailable
- Convert CodePen embeds into stable Markdown links on export and restore them as Feishu `iframe` blocks on import
- Patch one chapter, paragraph, or block through `lark-cli docs` v2 without overwriting the whole document
- Merge a git unified diff (`.diff` / `.patch`) into a Feishu doc hunk by hunk
- Update existing Feishu whiteboards through `lark-cli whiteboard +query/+update` when a live whiteboard token is available
- Re-import Markdown into Feishu docs with original-position image restore
- Re-import standalone local non-Markdown files into Feishu docs as positioned file blocks
- Manage Drive-native Markdown files through `lark-cli markdown +create/+fetch/+overwrite` without mixing them into doc/wiki sync
- Sync ordinary Drive files directly through `drive +sync` for assets that do not need Markdown conversion
- Inspect Drive file version history, download historical versions, and guard version reverts
- Write explicit Sheet styles, images, and filter views in addition to CSV/JSON cell data
- Export Slides nodes as PPTX snapshots for Git review and archival
- Use Feishu titles consistently for exported object folders and files, with stable suffixes for duplicates
- Use guarded project wrappers for new Sheet management, Base record, Task attachment, IM search, Drive comment, and config bind shortcuts
- Write Mermaid/PlantUML text diagrams into live Feishu whiteboards, and keep doc v2 `<add-ons>` verification experimental
- Keep export-level `tree.txt` and `codepen-links.md` inside the root document assets folder, with the export index appended to the root Markdown file

## Why This Exists

Feishu docs are great for collaboration, but they are not Git-friendly by default. This skill makes Feishu content:

- easier to diff
- easier to archive
- easier to review offline
- safer to round-trip when docs contain images, CodePen embeds, Mermaid text, and embedded sheets

## Version and CLI Requirement

- Skill version: `v1.7.0`
- Required `lark-cli`: `>= 1.0.39`

This version depends on `lark-cli docs +media-insert --selection-with-ellipsis` for positioned media restore, and uses `docs +fetch/+update --api-version v2`, `sheets +export/+write/+append/+read`, `whiteboard +query/+update`, `markdown +create/+fetch/+overwrite`, and the newer Sheet/Base/Task/IM/Drive/config shortcuts added through `lark-cli v1.0.24-v1.0.39`.

## Install With npm

Install the package globally, then explicitly install the skill into Codex, Claude Code, or both:

```powershell
npm install -g feishu-markdown-sync
feishu-markdown-sync install --target both --scope user
```

Or use `npx` from a packed or published package:

```powershell
npx feishu-markdown-sync install --target claude --scope project
```

The installer copies skill files only. It does not write credentials, run Feishu login, or overwrite an existing skill directory unless `--force` is provided.

## Install As A Local Codex Skill

Install or upgrade from GitHub:

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py" --repo Linssen-Kong/Feisu-Markdown-Sync-Skill --ref master --path . --name feishu-markdown-sync
```

If `C:\Users\<you>\.codex\skills\feishu-markdown-sync` already exists, remove or rename that installed skill directory first, then run the command again. If you previously installed `feishu-wiki-markdown-sync`, remove that old installed skill directory after confirming the new skill loads. Restart Codex after installation so the updated skill is loaded.

> Migration note: this skill was previously installed as `feishu-wiki-markdown-sync`. The new install name is `feishu-markdown-sync`. Keeping both directories under `C:\Users\<you>\.codex\skills\` will make Codex load two skills with the same functional scope, so delete or rename the old `feishu-wiki-markdown-sync` directory after upgrading.

## Install As A Claude Code Skill

Project-local install:

```powershell
feishu-markdown-sync install --target claude --scope project
```

User-level install:

```powershell
feishu-markdown-sync install --target claude --scope user
```

Claude Code loads `.claude/skills/feishu-markdown-sync/SKILL.md`. The Claude skill references scripts via `${CLAUDE_SKILL_DIR}` so it works from user, project, or package-installed locations.

## Sync Modes

- **Structured content sync**: `scripts/feishu_sync.cjs` exports Wiki/Doc/Sheet content into Markdown, CSV, XML snapshots, metadata, and a manifest. Use this for reviewable PRDs, docs, and Sheet-backed planning artifacts.
- **Drive ordinary-file sync**: `scripts/feishu_drive_sync.cjs` wraps `drive +sync` for ordinary Drive files such as images, PDFs, PPTX snapshots, attachments, and Drive-native Markdown. It is faster because no Markdown conversion is needed, but it skips online docx, sheet, bitable, slides, and similar cloud documents.
- **Drive-native Markdown management**: `scripts/feishu_markdown_file.cjs` handles `.md` files stored as ordinary Drive files, including create/fetch/overwrite/diff/patch.

## Export Naming

v1.7.0 resolves export names in this order: fetched Feishu document/file title, Wiki node title, then a token-derived fallback. Same-folder duplicates receive a stable short suffix instead of overwriting each other. `metadata.json` records `wikiNodeTitle`, `resolvedTitle`, `filenameTitleSource`, and `safeFilename` so naming decisions are auditable.

Sheet workbook filenames use the Feishu file title. Per-sheet CSV and preview files use worksheet titles. Media and embedded resources keep a short token/hash suffix for collision resistance, with readable prefixes when captions or labels are available.

## v1.7.0 Validation Status

Local validation completed on 2026-05-24:

- `npm run check` passed for all scripts.
- `feishu-markdown-sync doctor` and `feishu_cli_tools doctor` passed on `lark-cli version 1.0.39`.
- Drive sync, Drive version revert, Sheet style, and Sheet filter-view dry-runs produced the expected API requests.
- `npm pack`, tarball install, package bin execution, and project-level Claude skill installation passed.

Cloud validation completed after additional authorization:

- Drive ordinary-file sync passed for push, pull, and `keep-both` conflict handling.
- Drive version history and historical-version download passed.
- Sheet CSV write-back, style write-back, image write-back, filter view/condition creation, and format snapshot export passed.
- Slides creation and PPTX export passed.

Some Feishu OpenAPI calls hit transient TLS handshake timeouts; retrying succeeded. See `docs/validation-log.md` for redacted artifact details.

## Product Direction

The product is moving from "Wiki Markdown export" to "Feishu knowledge asset sync":

- Wiki/doc pages remain the core Markdown export and import surface.
- Sheet pages become a first-class page type, not just an embedded-doc accessory.
- CLI upgrades are treated as product input: every meaningful `lark-cli` release should be reviewed for new document, sheet, drive, media, and whiteboard capabilities that can reduce custom code or improve round-trip fidelity.

See [docs/product-roadmap.md](docs/product-roadmap.md) for the v1.4+ roadmap and CLI upgrade intake checklist.
See [docs/cli-capability-matrix.md](docs/cli-capability-matrix.md) for the current CLI capability matrix and Sheet write-back rules.
See [docs/feature-support.md](docs/feature-support.md) for the cloud-verified, blocked, and unsupported feature list.
See [docs/feature-support.zh.md](docs/feature-support.zh.md) for the Chinese feature support list.
See [docs/security-privacy-check.md](docs/security-privacy-check.md) for the GitHub publishing safety check.

## Release Log

### v1.7.0

- Raised the documented and script-enforced `lark-cli` baseline to `>= 1.0.39`.
- Added npm packaging and explicit Codex/Claude Code skill installation.
- Added Claude Code skill metadata under `.claude/skills/feishu-markdown-sync/`.
- Added `scripts/feishu_drive_sync.cjs` for ordinary Drive file sync through `drive +sync`.
- Added Drive inspect/version wrappers, Markdown diff/patch support, and guarded version revert handling.
- Added Sheet style, batch style, image, filter view, and filter condition write paths.
- Added `scripts/export_feishu_sheet_format.cjs` for Sheet filter metadata snapshots.
- Added Slides PPTX snapshot export for Wiki slides nodes.
- Fixed export naming by resolving real Feishu titles, recording naming metadata, and avoiding same-folder title collisions.
- Local validation: `npm run check` passes on all project scripts. Cloud validation requires tenant tokens and permissions and should be recorded in `docs/validation-log.md` after running in the target tenant.

### v1.5.0

- Added `scripts/feishu_sync.cjs` with `status`, `plan`, `pull`, `push`, and `refresh`.
- Added manifest-backed sync baselines under `.feishu-sync/manifest.json`; Git commits remain a user-controlled workflow outside the sync script.
- Document export now writes `*.assets/*.format.xml` and `*.assets/format-map.json` for v2 XML format preservation.
- Added `scripts/compile_feishu_doc_xml.cjs` so Markdown edits can be merged into the XML format snapshot before rich-format write-back.
- Sheet export now writes `sheet-format.json` with CSV preview metadata, sheet IDs when available, row/column counts, and default write-back ranges.
- Whiteboard raw fallback now creates a human-readable `*.preview.md` alongside `*.mindmap.mmd` and `*.raw.json`.
- Audit reports now flag raw-only resources and missing format maps/sheet format metadata.
- Markdown import now uses `docs +update --api-version v2 --command overwrite --doc-format markdown --content @file`.

### v1.4.0

- Repositioned the project as Feishu Markdown Sync while keeping legacy `wiki` script names compatible.
- Raised the documented `lark-cli` baseline to `>= 1.0.23`.
- Added `scripts/import_feishu_sheet.cjs` for explicit-range Sheet write-back from CSV or JSON 2D arrays.
- Sheet write-back now runs read-back verification and retries transient read failures.
- Added CLI capability matrix and validation log docs.
- Verified real cloud Sheet create, write, append, read, CSV export, and XLSX export on `lark-cli v1.0.23`.
- Revalidated text-drawing `add-ons`; v1.0.23 accepts create/update calls without warnings, but fetch does not preserve live add-ons blocks, so live round-trip remains unsupported.

### v1.3.1

- Added Markdown audit reports for diff merges.
- Failed partial merges now automatically write an audit report under `.tmp/merge-diff-audit-*.md`.
- Added `--audit-output` for explicit success, dry-run, or failure audit reports.
- Audit reports include failed hunk details, expected old-text snippets, ambiguity warnings, and merge suggestions.

### v1.3.0

- Added git unified diff merge support through `scripts/merge_diff_to_feishu_doc.cjs`.
- The diff merge flow fetches the target Feishu document as Markdown, applies hunks locally, and updates matched hunks through `docs +update --api-version v2`; ordinary hunks use Markdown `str_replace`, and EOF append hunks use Markdown `append`.
- Whole-document overwrite is only used when `--allow-overwrite-fallback` is explicitly provided.
- Verified the diff merge flow against a real Feishu document with a complex multi-hunk diff covering headings, paragraphs, tables, checklists, Mermaid, JSON code blocks, and a new final section.
- Successful real diff merges now clean script-generated `.tmp` merged-output files by default; dry-run previews are kept for review, and `--keep-temp` preserves generated temp files when needed.

### v1.2.0

- Added a v2 document patch helper: `scripts/patch_feishu_doc.cjs`.
- Documented the recommended flow for chapter/paragraph updates: `docs +fetch --api-version v2 --scope outline/section --detail with-ids`, then `block_replace`, `block_insert_after`, or Markdown `str_replace`.
- Updated whiteboard guidance for `lark-cli whiteboard +query/+update`, including Mermaid/PlantUML/raw update paths.
- Raised the documented CLI baseline to `lark-cli >= 1.0.20`.

### v1.1.0

- Improved raw whiteboard fallback: mindmap-style whiteboard nodes are now represented in exported Markdown as readable Mermaid mindmap text, with the raw JSON sidecar retained for audit and future conversion.
- Moved export-level sidecars out of the output root. `tree.txt` and `codepen-links.md` now live under the root document `*.assets/` folder, and the former root `README.md` entrypoint is written into the root document Markdown as `导出索引`. Previously generated root-level sidecars are cleaned up when they are recognized as old export artifacts.

### v1.0.16

- Added positioned image and file restore for Markdown re-import through `lark-cli docs +media-insert --selection-with-ellipsis`.

## Repository Layout

```text
feishu-markdown-sync/
  README.md
  SKILL.md
  agents/
    openai.yaml
  docs/
    product-roadmap.md
  scripts/
    lib/lark_cli.cjs
    feishu_sync.cjs
    feishu_cli_tools.cjs
    feishu_markdown_file.cjs
    feishu_text_diagram.cjs
    export_feishu_wiki.cjs
    audit_feishu_export.cjs
    import_feishu_markdown.cjs
    import_feishu_sheet.cjs
```

## Main Workflows

### 0. Sync status and planning

Inspect local changes and readability risks:

```powershell
node scripts/feishu_sync.cjs status --root exports/feishu-wiki
```

Preview what would be pushed:

```powershell
node scripts/feishu_sync.cjs plan --root exports/feishu-wiki
```

Pull from Feishu and refresh the manifest baseline:

```powershell
node scripts/feishu_sync.cjs pull --wiki-token "<wiki_token>" --base-url https://your-tenant.feishu.cn --root exports/feishu-wiki
```

Push is conservative. It plans by default and only writes with `--apply`; format-layer changes or unsafe cases generate a conflict report under `.tmp/`:

```powershell
node scripts/feishu_sync.cjs push --root exports/feishu-wiki
node scripts/feishu_sync.cjs push --root exports/feishu-wiki --apply
```

For documents with rich blocks, `push --apply` first compiles the edited Markdown into the document's `*.assets/*.format.xml` snapshot, then writes the compiled XML back to Feishu. This keeps Markdown as the human editing surface while preserving callout, checkbox, table, and code-block formatting where the block mapping is safe.

### 1. Export a wiki tree

```powershell
node scripts/export_feishu_wiki.cjs <wiki_token>
```

Or:

```powershell
node scripts/export_feishu_wiki.cjs <wiki_token> --base-url https://your-tenant.feishu.cn
```

Default output:

```text
exports/feishu-wiki/
```

The output root stays clean. Export-level navigation files are placed under the root document folder:

```text
exports/feishu-wiki/
  <root-title>/
    <root-title>.md
    <root-title>.assets/
      tree.txt
      codepen-links.md
```

### 2. Audit round-trip safety

```powershell
node scripts/audit_feishu_export.cjs exports/feishu-wiki
```

This generates:

```text
exports/feishu-wiki/roundtrip-audit.md
```

### 3. Re-import one Markdown file

```powershell
node scripts/import_feishu_markdown.cjs "<markdown_file>" "<docx_url_or_token>" "Optional Title"
```

Use this whole-document import only after checking whether a chapter, paragraph, block id, or `start...end` text span can be updated safely. If the exported Markdown and target Feishu document are structurally incompatible and no reliable local match exists, fall back to this overwrite path.

### 3b. Write back one Sheet range

Write a local CSV into an explicit range and verify by read-back:

```powershell
node scripts/import_feishu_sheet.cjs --url "<sheet_url>" --sheet-id "<sheet_id>" --range "A2:C3" --input ".\changes.csv"
```

Append rows from a JSON 2D array:

```powershell
node scripts/import_feishu_sheet.cjs --url "<sheet_url>" --sheet-id "<sheet_id>" --range "A:C" --mode append --values '[[2026,"追加","ok"]]'
```

Sheet write-back intentionally requires `--range`; the script refuses implicit whole-sheet writes.

### 3c. Manage Drive-native Markdown files

Use this only for Drive files that are stored as plain `.md` files. It does not replace wiki/docx export, import, or sync.

```powershell
node scripts/feishu_markdown_file.cjs create --file ".\note.md" --folder-token "<folder_token>" --dry-run
node scripts/feishu_markdown_file.cjs fetch --file-token "<markdown_file_token>" --output ".\exports\drive-markdown\note.md"
node scripts/feishu_markdown_file.cjs overwrite --file-token "<markdown_file_token>" --file ".\note.md" --dry-run
```

### 4. Patch one chapter or paragraph

First locate the target section or block:

```powershell
lark-cli docs +fetch --api-version v2 --doc "<docx_url_or_token>" --scope outline --max-depth 3 --detail with-ids
lark-cli docs +fetch --api-version v2 --doc "<docx_url_or_token>" --scope section --start-block-id "<heading_block_id>" --detail with-ids
```

Then patch only the target block or text span:

```powershell
node scripts/patch_feishu_doc.cjs --doc "<docx_url_or_token>" --command block_replace --block-id "<block_id>" --content "@.\block.xml"
node scripts/patch_feishu_doc.cjs --doc "<docx_url_or_token>" --command str_replace --doc-format markdown --pattern "旧段落开头...旧段落结尾" --content "@.\new-paragraph.md"
```

Add `--dry-run` to inspect the request before risky writes.

### 5. Update a live whiteboard

```powershell
node scripts/feishu_text_diagram.cjs whiteboard query --whiteboard-token "<whiteboard_token>" --output-as code --as user
node scripts/feishu_text_diagram.cjs whiteboard update --whiteboard-token "<whiteboard_token>" --source "@.\diagram.mmd" --input-format mermaid --overwrite
```

The overwrite command dry-runs by default. After reviewing the request, add `--apply` to execute the whiteboard update.

### 5b. Use lark-cli 1.0.39 sidecar tools

```powershell
node scripts/feishu_cli_tools.cjs doctor
node scripts/feishu_cli_tools.cjs sheet info --url "<sheet_url>"
node scripts/feishu_cli_tools.cjs base record-get --base-token "<base_token>" --table-id "<table_id>" --record-id "<record_id>"
node scripts/feishu_cli_tools.cjs task upload-attachment --resource-id "<task_guid_or_url>" --file ".\brief.pdf"
node scripts/feishu_cli_tools.cjs im messages-search --query "PRD" --page-size 10
node scripts/feishu_cli_tools.cjs drive add-comment --doc "<doc_or_wiki_url>" --content '[{"type":"text","text":"请 review"}]' --dry-run
```

### 6. Merge a git diff into one document

Preview the merge first:

```powershell
node scripts/merge_diff_to_feishu_doc.cjs --doc "<docx_url_or_token>" --diff ".\changes.diff" --dry-run --merged-output ".\merged-preview.md"
```

Apply the matched hunks:

```powershell
node scripts/merge_diff_to_feishu_doc.cjs --doc "<docx_url_or_token>" --diff ".\changes.diff"
```

If a hunk cannot be matched in the current Feishu Markdown, the script stops. Only use overwrite fallback when you have reviewed the generated merge:

```powershell
node scripts/merge_diff_to_feishu_doc.cjs --doc "<docx_url_or_token>" --diff ".\changes.diff" --merged-output ".\merged-preview.md" --allow-overwrite-fallback
```

Keep generated `.tmp` merge previews after a successful real merge:

```powershell
node scripts/merge_diff_to_feishu_doc.cjs --doc "<docx_url_or_token>" --diff ".\changes.diff" --merged-output ".\.tmp\merged-applied.md" --keep-temp
```

Write a merge audit report:

```powershell
node scripts/merge_diff_to_feishu_doc.cjs --doc "<docx_url_or_token>" --diff ".\changes.diff" --audit-output ".\merge-audit.md"
```

## Diff Merge Behavior

`scripts/merge_diff_to_feishu_doc.cjs` is designed for the case where you have:

- a Feishu doc URL or doc token
- a git unified diff file from `git diff`, `git show`, or a PR patch export

The merge flow:

1. Fetches the current Feishu document as Markdown with `docs +fetch --api-version v2 --doc-format markdown`.
2. Parses the unified diff and applies each hunk locally to the fetched Markdown.
3. Writes `--merged-output` if requested, so the exact merged Markdown can be reviewed.
4. Updates Feishu hunk by hunk:
   - ordinary replacement hunks use `docs +update --api-version v2 --command str_replace --doc-format markdown`
   - EOF append hunks use `docs +update --api-version v2 --command append --doc-format markdown`
5. Stops when any hunk cannot be matched exactly in the current Feishu Markdown.
6. Uses whole-document overwrite only when `--allow-overwrite-fallback` is explicitly passed.
7. Writes a Markdown audit report automatically on failed partial merges; `--audit-output` writes one for successful or dry-run merges too.
8. Cleans script-generated merged-output files under `.tmp` after a successful real merge, unless `--keep-temp` is passed.

This keeps `.diff` merges aligned with the skill's main rule: prefer chapter, paragraph, block, or hunk-level updates; use full overwrite only as an explicit fallback.

Temporary file rules:

- user-provided `.diff` / `.patch` inputs are never deleted automatically
- dry-run previews are kept because they are intended for review
- successful non-dry-run merges remove generated `.tmp/feishu-diff-merged-*.md` outputs by default
- use `--keep-temp` when the merged Markdown should remain in `.tmp`

## Diff Merge Audit

The audit report is meant to answer: did the merge happen, and if not, what should be fixed?

It includes:

- merge status, strategy, target document, diff file, and hunk counts
- failed hunk file path and hunk header
- the old text the script expected to find in the current Feishu Markdown
- ambiguity warnings when the same old text appears in multiple places
- practical suggestions, such as:
  - fetch the latest Feishu Markdown and regenerate the diff from that content
  - check Feishu Markdown normalization for tables, checklists, code blocks, and heading structure
  - shrink the diff to a smaller section or paragraph
  - use `--allow-overwrite-fallback` only after reviewing `--merged-output`

Failure reports are written automatically to:

```text
.tmp/merge-diff-audit-<timestamp>.md
```

For success or dry-run audits, pass:

```powershell
node scripts/merge_diff_to_feishu_doc.cjs --doc "<docx_url_or_token>" --diff ".\changes.diff" --audit-output ".\merge-audit.md"
```

## Import Behavior

During import, the skill will:

- act as the fallback path when chapter/paragraph/block-level patching cannot be matched safely
- overwrite the target doc with the Markdown body
- convert CodePen links into Feishu `iframe` blocks
- keep Mermaid as plain code blocks
- restore local images at their original Markdown position
- restore standalone local non-Markdown, non-CSV files as positioned Feishu file blocks
- remove standalone local `CSV` links so embedded-sheet previews remain inline tables only

## Sync and Format Behavior

v1.7.0 uses three local layers:

- editable layer: Markdown, CSV, and readable preview files
- format layer: `*.assets/*.format.xml`, `*.xlsx`, `sheet-format.json`, `format-map.json`, and raw JSON audit files
- baseline layer: `.feishu-sync/manifest.json`

The sync shell treats format-layer edits as high risk. If a local change touches `*.format.xml`, `format-map.json`, `sheet-format.json`, or raw JSON, `push --apply` stops and writes a conflict report instead of guessing.

For Markdown push, v1.7.0 is deliberately conservative: if `format-map.json` shows rich format blocks, guarded push will not do a Markdown overwrite. It compiles supported Markdown edits into the XML snapshot first. If the Markdown and XML structures cannot be matched safely, it stops and writes a conflict report.

Manual consistency check:

```powershell
node scripts/compile_feishu_doc_xml.cjs --markdown ".\doc.md" --format-xml ".\doc.assets\doc.format.xml" --check
```

Manual compiled XML output:

```powershell
node scripts/compile_feishu_doc_xml.cjs --markdown ".\doc.md" --format-xml ".\doc.assets\doc.format.xml" --out ".\.tmp\doc.compiled.xml"
```

## Tested Result on `lark-cli v1.0.23`

Real tests were run on `2026-05-04`.

### Sheet bidirectional write-back

Created and retained a real Feishu Sheet:

- target sheet: `<redacted-feishu-sheet-url>`
- sheet id: `f97139`
- created with `sheets +create`
- range overwrite succeeded with `scripts/import_feishu_sheet.cjs --range A2:C3`
- JSON append succeeded with `scripts/import_feishu_sheet.cjs --mode append --range A:C`
- CSV write-back succeeded with `scripts/import_feishu_sheet.cjs --input .tmp\codex-sheet-writeback.csv --range A6:C7`
- CSV export saved `.tmp/codex-sheet-validation.csv`
- XLSX export saved `.tmp/codex-sheet-validation.xlsx`

One CSV write-back run hit a transient EOF during read-back after the write call. Retrying the same explicit range succeeded, and the script now retries transient read-back failures.

### Text-drawing add-ons support

Created and retained a real Feishu Doc:

- target doc: `<redacted-feishu-doc-url>`
- `docs +create --api-version v2` accepted XML containing `<add-ons .../>`
- `docs +update --api-version v2 --command append` accepted XML containing `<add-ons .../>`
- both calls returned success with no warnings
- `docs +fetch --api-version v2 --doc-format xml --detail full` did not return any live `<add-ons>` blocks

Conclusion:

- `lark-cli v1.0.23` does not prove live text-drawing round-trip support.
- Keep exporting text-drawing content as Mermaid/text code blocks.
- Do not claim live add-ons write-back unless a future fetch confirms the add-ons block is preserved.

## Tested Result on `lark-cli v1.0.20`

Real tests were run on `2026-04-27`.

### Complex diff merge into Feishu doc

Created a real Feishu document from local Markdown, then merged a complex `.diff` into it:

- target doc: `<redacted-feishu-doc-url>`
- local original: `.tmp/feishu-diff-original.md`
- local diff: `.tmp/feishu-diff-changes.diff`
- local merge preview: `.tmp/feishu-diff-merged-preview-2.md`

The diff covered:

- title and paragraph changes
- table row edits plus a new table row
- checklist status changes
- Mermaid code block changes
- JSON code block changes
- new final section appended at EOF

Result:

- dry-run succeeded with `6` matched hunks
- actual merge succeeded with partial hunk updates
- no whole-document overwrite fallback was used
- fetched document revision after merge: `9`
- verification checks all passed: title, paragraph, table, checklist, Mermaid, JSON, and new final section

During testing, EOF append hunks exposed a real edge case: using Markdown `str_replace` to replace the final context with `final context + new section` can report success without reliably appending content in Feishu. The script now detects EOF append hunks and uses Markdown `append` for that case.

## Tested Result on `lark-cli v1.0.16`

Real tests were run on `2026-04-21`.

### Positioned image and file restore

Using the exported document `File Manager V1.0.md` and a Feishu test doc:

- target doc: `https://your-tenant.feishu.cn/docx/exampleDocToken`
- restored successfully:
  - `2` inline images
  - `1` CodePen iframe
- after the CSV import adjustment:
  - `Gap Analysis` no longer shows a CSV attachment block
  - the preview table remains inline as expected

### Text-drawing add-ons support

Using a real `add-ons` payload on `lark-cli v1.0.16`:

- `docs +create` returns warning:
  - `WARNING:ADDONS_NOT_SUPPORTED`
- `docs +update --mode append` returns the same warning
- fetched result confirms:
  - the heading text is kept
  - the `<add-ons .../>` block itself is skipped
  - no text-drawing component is created

Conclusion:

- `lark-cli v1.0.16` still does **not** support writing Feishu text-drawing `add-ons`
- the safe round-trip strategy remains:
  - export `add-ons` as plain Mermaid/text code blocks
  - import them back as plain code blocks, not live text-drawing components

## Current Limitations

- Feishu text-drawing `add-ons` are preserved as Mermaid/text code blocks by default. Cloud validation on 2026-05-10 showed doc v2 `<add-ons>` are not live round-trippable in this tenant.
- Exported whiteboards still use `code -> raw` fallback. Non-code whiteboards are preserved as Mermaid mindmap text plus raw JSON sidecars; live whiteboard updates should go through `scripts/feishu_text_diagram.cjs`
- Drive-native `.md` files are managed separately through `scripts/feishu_markdown_file.cjs`; they are not doc/wiki sync objects
- Same-document anchor links are not reliable after Feishu import
- Local Markdown links are downgraded to readable text paths
- Standalone local `CSV` links are intentionally removed during import in favor of inline table previews
- Export is privacy-first by default: tenant URLs, node tokens, and source URLs are omitted unless `FEISHU_INCLUDE_SENSITIVE_METADATA=true`
- Asset filenames use token-derived MD5 suffixes by default instead of raw token fragments

## Recommended Use Cases

- Archive a Feishu wiki into Git
- Review PRD or design docs locally with images kept inline
- Audit which blocks are fully preserved versus downgraded
- Re-import one cleaned Markdown document back into Feishu for verification
- Merge PR or local git diffs into an existing Feishu document without replacing unrelated sections

## Open Source Hygiene

- `.omx/`, `exports/`, `.tmp/`, and `.env` are ignored by `.gitignore`
- Exported metadata is redacted by default unless explicitly enabled
- Placeholder text avoids leaking runtime tokens unless `FEISHU_KEEP_SENSITIVE_PLACEHOLDERS=true`
- Import temporary Markdown files are deleted automatically after the run completes

## Files

- `scripts/export_feishu_wiki.cjs`
  Export Feishu wiki/doc content into local Markdown and assets
- `scripts/feishu_sync.cjs`
  Inspect, pull, plan, and guarded-push manifest-backed sync workspaces
- `scripts/compile_feishu_doc_xml.cjs`
  Merge human-edited Markdown text into the XML format snapshot before rich-format write-back
- `scripts/audit_feishu_export.cjs`
  Generate a round-trip audit report
- `scripts/import_feishu_markdown.cjs`
  Re-import Markdown into Feishu docs with positioned media restore
- `scripts/import_feishu_sheet.cjs`
  Write CSV or JSON 2D array data back into a Feishu Sheet explicit range and verify by read-back
- `scripts/feishu_markdown_file.cjs`
  Create, fetch, and overwrite Drive-native Markdown files without replacing doc/wiki sync
- `scripts/feishu_cli_tools.cjs`
  Run guarded wrappers for lark-cli v1.0.24-v1.0.39 Sheet, Base, Task, IM, Drive, and config capabilities
- `scripts/feishu_text_diagram.cjs`
  Update whiteboards from Mermaid/PlantUML and verify doc `<add-ons>` text drawing experimentally
- `scripts/lib/lark_cli.cjs`
  Shared lark-cli runner, version check, JSON parser, and path helper
- `scripts/patch_feishu_doc.cjs`
  Run focused `docs +update --api-version v2` operations for chapter, paragraph, and block edits
- `scripts/merge_diff_to_feishu_doc.cjs`
  Merge a git unified diff into a Feishu doc through Markdown fetch, local hunk application, v2 hunk updates with `str_replace` or EOF `append`, and Markdown merge audits

## License

MIT
