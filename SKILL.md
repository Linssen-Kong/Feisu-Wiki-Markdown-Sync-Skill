---
name: feishu-wiki-markdown-sync
version: 1.1.0
description: Export a Feishu wiki tree to local Markdown, inline document images into the Markdown body, expand embedded sheets into CSV plus Markdown previews, convert raw whiteboards into embedded Mermaid mindmap text plus sidecar raw JSON, audit round-trip fidelity, and re-import Markdown back into Feishu docs with original-position image and file restore via lark-cli positioned media insertion. Use when the user asks to sync, export, archive, audit, or re-import Feishu wiki or docx content in a Git-friendly way.
---

# Feishu Wiki Markdown Sync

Version: `v1.1.0`

Required `lark-cli`: `>= 1.0.16`

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

Use this skill to convert a Feishu wiki tree into Git-friendly local files and, when needed, push one Markdown document back into a Feishu doc with inline images, embedded CodePen blocks, and CSV-expanded sheet content.

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

- Feishu text-drawing `add-ons` are not reliably writable through the current high-level CLI path. Preserve them as text, not as live drawing blocks.
- Whiteboards are exported with automatic `code -> raw` fallback. Non-code whiteboards are preserved as `Mermaid in Markdown + raw JSON sidecar`, not as live editable whiteboard blocks.
- Same-document anchor jumps are not reliable in Feishu imports. Do not depend on Markdown `#anchor` links surviving import.
- This skill assumes `lark-cli >= 1.0.16`, because positioned media insertion depends on `docs +media-insert --selection-with-ellipsis`.
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

## Scripts

- `scripts/export_feishu_wiki.cjs`
  Export the Feishu wiki tree and normalize docx and sheet content into local files.
- `scripts/audit_feishu_export.cjs`
  Summarize round-trip fidelity and remaining risks.
- `scripts/import_feishu_markdown.cjs`
  Push one Markdown file back into a Feishu doc with inline image and file block placement.
