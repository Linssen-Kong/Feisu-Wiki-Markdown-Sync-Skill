---
name: feishu-wiki-markdown-sync
version: 1.3.1
description: Export a Feishu wiki tree to local Markdown, inline document images into the Markdown body, expand embedded sheets into CSV plus Markdown previews, convert raw whiteboards into embedded Mermaid mindmap text plus sidecar raw JSON, audit round-trip fidelity, partially update Feishu docs by block/section or git unified diff through lark-cli docs v2, and re-import Markdown back into Feishu docs with original-position image and file restore via lark-cli positioned media insertion. Use when the user asks to sync, export, archive, audit, merge a .diff into, partially update, or re-import Feishu wiki or docx content in a Git-friendly way.
---

# Feishu Wiki Markdown Sync

Version: `v1.3.1`

Required `lark-cli`: `>= 1.0.20`

## Configuration

This skill no longer hardcodes tenant domains or wiki tokens.

Set configuration through environment variables or CLI options:

```powershell
$env:FEISHU_BASE_URL = "https://your-tenant.feishu.cn"
```

Available configuration:

- `FEISHU_BASE_URL`: required tenant base URL for export links
- `FEISHU_WIKI_TOKEN`: optional default wiki token for export
- `FEISHU_OUTPUT_ROOT`: optional default export directory, defaults to `exports/feishu-wiki/`
- `FEISHU_EXPORT_ROOT`: optional default audit directory
- `FEISHU_INCLUDE_SENSITIVE_METADATA`: optional, defaults to `false`
- `FEISHU_KEEP_SENSITIVE_PLACEHOLDERS`: optional, defaults to `false`
- `LARK_CLI_PATH`: optional custom `lark-cli` entry path

## Overview

Use this skill to convert a Feishu wiki tree into Git-friendly local files and, when needed, push one Markdown document back into a Feishu doc with inline images, embedded CodePen blocks, and CSV-expanded sheet content. For surgical changes, prefer `lark-cli docs` v2 partial fetch/update instead of overwriting the whole document.

Run this skill from the target workspace root so generated files stay inside the repo.

## Core Capabilities

### Export a wiki tree

Run:

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

The export workflow:

- saves each docx/wiki node as its own `index.md`
- downloads document images into `assets/` and places them inline in the Markdown body
- converts Feishu text-drawing add-ons into plain code blocks that preserve Mermaid text
- exports whiteboards via `code -> raw` fallback; when no code blocks are available, it stores raw node JSON, converts raw nodes into Mermaid mindmap text, and embeds the Mermaid directly into the Markdown body
- expands embedded sheet blocks into local `CSV` files plus Markdown table previews
- preserves top-level sheet nodes as `xlsx + csv + preview.md + README.md`
- stores export-level `tree.txt` and `codepen-links.md` in the root document `*.assets/` folder, with the export index appended to the root Markdown file; recognized legacy root-level sidecars are cleaned up on export

### Partially update a document

Use `lark-cli docs` v2 for chapter, paragraph, and block-level updates. Start by locating a stable block id:

```powershell
lark-cli docs +fetch --api-version v2 --doc "<docx_url_or_token>" --scope outline --max-depth 3 --detail with-ids
lark-cli docs +fetch --api-version v2 --doc "<docx_url_or_token>" --scope section --start-block-id "<heading_block_id>" --detail with-ids
```

Then patch only the target block or text span:

```powershell
node scripts/patch_feishu_doc.cjs --doc "<docx_url_or_token>" --command block_replace --block-id "<block_id>" --content "@.\section.xml"
```

For Markdown-first edits, use `str_replace` with the v2 Markdown ellipsis matcher:

```powershell
node scripts/patch_feishu_doc.cjs --doc "<docx_url_or_token>" --command str_replace --doc-format markdown --pattern "## 旧章节...旧章节结尾" --content "@.\section.md"
```

Add `--dry-run` before risky writes to inspect the generated request without updating Feishu.

Recommended decision path:

- For every document modification, first try chapter/paragraph/block-level update with `docs +fetch --api-version v2 --scope outline/section --detail with-ids`, then `scripts/patch_feishu_doc.cjs`.
- If the user provides a git unified diff (`.diff` / `.patch`) and a Feishu document link, use `scripts/merge_diff_to_feishu_doc.cjs`. It fetches the current Feishu Markdown, applies the diff locally, and then merges matched hunks with Markdown `str_replace` or EOF `append`.
- If a stable heading, paragraph, block id, or `start...end` text span can be identified, patch only that range.
- If the exported Markdown and target Feishu document are structurally incompatible enough that no reliable chapter/paragraph/block match exists, fall back to whole-document import with `scripts/import_feishu_markdown.cjs`.
- Existing whiteboard content: use `whiteboard +query/+update`, not `docs +update`.

### Merge a git diff into a Feishu doc

Run:

```powershell
node scripts/merge_diff_to_feishu_doc.cjs --doc "<docx_url_or_token>" --diff ".\changes.diff"
```

Safe preview:

```powershell
node scripts/merge_diff_to_feishu_doc.cjs --doc "<docx_url_or_token>" --diff ".\changes.diff" --dry-run --merged-output ".\merged-preview.md"
```

Write an explicit audit report:

```powershell
node scripts/merge_diff_to_feishu_doc.cjs --doc "<docx_url_or_token>" --diff ".\changes.diff" --audit-output ".\merge-audit.md"
```

Behavior:

- accepts standard unified diff files generated by `git diff`, `git show`, or PR patch exports
- fetches the current Feishu document as Markdown with `docs +fetch --api-version v2 --doc-format markdown`
- applies each hunk locally and writes `--merged-output` when requested
- updates Feishu hunk by hunk with `docs +update --api-version v2`; ordinary hunks use Markdown `str_replace`, and EOF append hunks use Markdown `append`
- stops if a hunk cannot be matched exactly in the current Feishu Markdown
- writes a Markdown audit report automatically on failed partial merge; use `--audit-output` to write an audit report for successful or dry-run merges too
- only uses whole-document overwrite when `--allow-overwrite-fallback` is explicitly provided
- does not delete the user-provided `.diff` file; successful non-dry-run merges clean script-generated `.tmp/feishu-diff-merged-*.md` files unless `--keep-temp` is passed

Audit report contents:

- merge status, strategy, target doc, diff file, matched/failed hunk counts
- failed hunk file path, hunk header, original line, expected old-text snippet
- ambiguity warnings when old text appears in multiple places
- suggestions such as refetching current Feishu Markdown, normalizing table/checklist/code-block formatting, shrinking the hunk, or using overwrite fallback only after review

Temporary file rule:

- `--dry-run --merged-output .\.tmp\...` keeps the preview for review
- a successful real merge removes generated merged-output files under `.tmp` by default
- pass `--keep-temp` to keep generated `.tmp` merge previews after a successful real merge
- input files such as `.diff`, `.patch`, and hand-written source Markdown are never deleted automatically

Fallback example:

```powershell
node scripts/merge_diff_to_feishu_doc.cjs --doc "<docx_url_or_token>" --diff ".\changes.diff" --allow-overwrite-fallback
```

### Audit round-trip safety

Run:

```powershell
node scripts/audit_feishu_export.cjs exports/feishu-wiki
```

This generates:

```text
exports/feishu-wiki/roundtrip-audit.md
```

Use the report to check:

- whether any image token placeholders remain
- whether embedded sheet blocks were expanded
- whether sheet roots have the expected `csv / preview / README` structure
- which content types are fully preserved versus text-only preserved

### Re-import one Markdown file

Run:

```powershell
node scripts/import_feishu_markdown.cjs "<markdown_file>" "<docx_url_or_token>" "Optional Title"
```

The import workflow:

- is the fallback path when chapter/paragraph/block-level patching cannot be matched safely
- overwrites the target doc with the Markdown content
- converts CodePen links into Feishu `iframe` blocks
- keeps Mermaid as plain code blocks
- reinserts local images at the original Markdown position through `docs +media-insert --selection-with-ellipsis`
- reinserts standalone local non-Markdown file links as Feishu file blocks at the original Markdown position
- drops standalone local `CSV` links during import so embedded-sheet previews stay as inline tables only

## Sheet Output Convention

For root sheet nodes, keep this Git-friendly structure:

```text
sheet-node/
  README.md
  index.md
  <workbook>.xlsx
  <sheet-name>.preview.md
  csv/
    <sheet-name>.csv
```

Use:

- `README.md` for navigation
- `csv/*.csv` for Git diffs and downstream processing
- `*.preview.md` for quick reading without leaving Markdown

## Important Constraints

- Feishu text-drawing `add-ons` are still safer to preserve as text/Mermaid code blocks in wiki exports. Do not claim they are round-trippable as live text-drawing add-ons unless a concrete `lark-cli` write test proves it for the target tenant.
- Whiteboards are exported with automatic `code -> raw` fallback. Non-code whiteboards are preserved as `Mermaid in Markdown + raw JSON sidecar`. To update a live whiteboard, query the token and call `lark-cli whiteboard +update --input_format mermaid|plantuml|raw`.
- Same-document anchor jumps are not reliable in Feishu imports. Do not depend on Markdown `#anchor` links surviving import.
- This skill assumes `lark-cli >= 1.0.20`, because document v2 partial fetch/update and current whiteboard update flows are part of the optimization path.
- Local Markdown links are still downgraded to readable text paths.
- Standalone local `CSV` links are intentionally removed during import. The inline Markdown table preview is kept as the Feishu-side representation.
- Only standalone local non-Markdown, non-CSV files are reinserted as Feishu file blocks.
- Asset filenames use token-derived MD5 suffixes by default instead of raw token fragments.
- Import temporary Markdown files are deleted automatically after the run completes.

## Typical Workflow

### Export and inspect

```powershell
node scripts/export_feishu_wiki.cjs <wiki_token> --base-url https://your-tenant.feishu.cn
node scripts/audit_feishu_export.cjs exports/feishu-wiki
```

### Re-import one document for verification

```powershell
node scripts/import_feishu_markdown.cjs ".\exports\feishu-wiki\<wiki_token>\...\index.md" "https://your-tenant.feishu.cn/docx/exampleDocToken" "Roundtrip Test"
```

### Patch one section or paragraph

```powershell
lark-cli docs +fetch --api-version v2 --doc "https://your-tenant.feishu.cn/docx/exampleDocToken" --scope outline --max-depth 3 --detail with-ids
node scripts/patch_feishu_doc.cjs --doc "https://your-tenant.feishu.cn/docx/exampleDocToken" --command block_insert_after --block-id "<heading_or_paragraph_block_id>" --content "@.\new-section.xml"
```

### Merge a git diff into one document

```powershell
node scripts/merge_diff_to_feishu_doc.cjs --doc "https://your-tenant.feishu.cn/docx/exampleDocToken" --diff ".\changes.diff" --dry-run --merged-output ".\merged-preview.md"
node scripts/merge_diff_to_feishu_doc.cjs --doc "https://your-tenant.feishu.cn/docx/exampleDocToken" --diff ".\changes.diff"
```

### Update a live whiteboard from Mermaid

```powershell
lark-cli whiteboard +query --whiteboard-token "<whiteboard_token>" --output_as code --as user
Get-Content .\diagram.mmd | lark-cli whiteboard +update --whiteboard-token "<whiteboard_token>" --source - --input_format mermaid --overwrite --yes --as user
```

## Scripts

- `scripts/export_feishu_wiki.cjs`
  Export the Feishu wiki tree and normalize docx and sheet content into local files.
- `scripts/audit_feishu_export.cjs`
  Summarize round-trip fidelity and remaining risks.
- `scripts/import_feishu_markdown.cjs`
  Push one Markdown file back into a Feishu doc with inline image and file block placement.
- `scripts/patch_feishu_doc.cjs`
  Apply a focused `docs +update --api-version v2` operation such as `str_replace`, `block_replace`, or `block_insert_after`.
- `scripts/merge_diff_to_feishu_doc.cjs`
  Merge a git unified diff into a Feishu doc by fetching Markdown, applying hunks locally, and updating matched hunks with v2 Markdown `str_replace`.
