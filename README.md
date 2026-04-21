# Feishu Wiki Markdown Sync

`feishu-wiki-markdown-sync` is a local Codex skill for exporting Feishu wiki/doc content into Git-friendly Markdown and round-tripping selected Markdown documents back into Feishu docs.

Current release: `v1.0.16`

## Configuration

The project no longer hardcodes tenant domains or wiki tokens.

Set configuration through environment variables or CLI options:

```powershell
$env:FEISHU_BASE_URL = "https://your-tenant.feishu.cn"
```

Available configuration:

- `FEISHU_BASE_URL`: required tenant base URL for wiki/doc links
- `FEISHU_WIKI_TOKEN`: optional default wiki token for export
- `FEISHU_OUTPUT_ROOT`: optional default export directory, defaults to `exports/feishu-wiki/`
- `FEISHU_EXPORT_ROOT`: optional default audit directory
- `FEISHU_INCLUDE_SENSITIVE_METADATA`: optional, defaults to `false`
- `FEISHU_KEEP_SENSITIVE_PLACEHOLDERS`: optional, defaults to `false`
- `LARK_CLI_PATH`: optional custom `lark-cli` entry path

## What It Does

- Export a Feishu wiki tree into readable local Markdown
- Download doc images and rewrite them as inline Markdown images
- Expand embedded sheet blocks into local `CSV` files plus Markdown table previews
- Convert Feishu text-drawing add-ons into plain code blocks that preserve Mermaid text
- Export whiteboards as code when available, and automatically fall back to raw node JSON plus a readable summary when code export is unavailable
- Convert CodePen embeds into stable Markdown links on export and restore them as Feishu `iframe` blocks on import
- Re-import Markdown into Feishu docs with original-position image restore
- Re-import standalone local non-Markdown files into Feishu docs as positioned file blocks

## Why This Exists

Feishu docs are great for collaboration, but they are not Git-friendly by default. This skill makes Feishu content:

- easier to diff
- easier to archive
- easier to review offline
- safer to round-trip when docs contain images, CodePen embeds, Mermaid text, and embedded sheets

## Version and CLI Requirement

- Skill version: `v1.0.16`
- Required `lark-cli`: `>= 1.0.16`

This version depends on `lark-cli docs +media-insert --selection-with-ellipsis` for positioned media restore.

## Repository Layout

```text
feishu-wiki-markdown-sync/
  README.md
  SKILL.md
  agents/
    openai.yaml
  scripts/
    export_feishu_wiki.cjs
    audit_feishu_export.cjs
    import_feishu_markdown.cjs
```

## Main Workflows

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

## Import Behavior

During import, the skill will:

- overwrite the target doc with the Markdown body
- convert CodePen links into Feishu `iframe` blocks
- keep Mermaid as plain code blocks
- restore local images at their original Markdown position
- restore standalone local non-Markdown, non-CSV files as positioned Feishu file blocks
- remove standalone local `CSV` links so embedded-sheet previews remain inline tables only

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

- Feishu text-drawing `add-ons` cannot be round-tripped as live components through current CLI write paths
- Whiteboards are exported via `code -> raw` fallback. Non-code whiteboards are preserved as raw node JSON plus a Markdown summary, not as live editable whiteboard blocks
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

## Open Source Hygiene

- `.omx/`, `exports/`, `.tmp/`, and `.env` are ignored by `.gitignore`
- Exported metadata is redacted by default unless explicitly enabled
- Placeholder text avoids leaking runtime tokens unless `FEISHU_KEEP_SENSITIVE_PLACEHOLDERS=true`
- Import temporary Markdown files are deleted automatically after the run completes

## Files

- `scripts/export_feishu_wiki.cjs`
  Export Feishu wiki/doc content into local Markdown and assets
- `scripts/audit_feishu_export.cjs`
  Generate a round-trip audit report
- `scripts/import_feishu_markdown.cjs`
  Re-import Markdown into Feishu docs with positioned media restore

## License

MIT
