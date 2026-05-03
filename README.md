# Feishu Markdown Sync

`feishu-wiki-markdown-sync` is a local Codex skill for exporting Feishu wiki/doc content into Git-friendly Markdown and round-tripping selected Markdown documents back into Feishu docs.

Current release: `v1.3.1`

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
- Export whiteboards as code when available, and automatically fall back to raw node JSON plus embedded Mermaid mindmap text when code export is unavailable
- Convert CodePen embeds into stable Markdown links on export and restore them as Feishu `iframe` blocks on import
- Patch one chapter, paragraph, or block through `lark-cli docs` v2 without overwriting the whole document
- Merge a git unified diff (`.diff` / `.patch`) into a Feishu doc hunk by hunk
- Update existing Feishu whiteboards through `lark-cli whiteboard +query/+update` when a live whiteboard token is available
- Re-import Markdown into Feishu docs with original-position image restore
- Re-import standalone local non-Markdown files into Feishu docs as positioned file blocks
- Keep export-level `tree.txt` and `codepen-links.md` inside the root document assets folder, with the export index appended to the root Markdown file

## Why This Exists

Feishu docs are great for collaboration, but they are not Git-friendly by default. This skill makes Feishu content:

- easier to diff
- easier to archive
- easier to review offline
- safer to round-trip when docs contain images, CodePen embeds, Mermaid text, and embedded sheets

## Version and CLI Requirement

- Skill version: `v1.3.1`
- Required `lark-cli`: `>= 1.0.20`

This version depends on `lark-cli docs +media-insert --selection-with-ellipsis` for positioned media restore, and uses the newer `docs +fetch/+update --api-version v2` and `whiteboard +query/+update` flows for focused edits.

## Release Log

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
feishu-wiki-markdown-sync/
  README.md
  SKILL.md
  agents/
    openai.yaml
  scripts/
    export_feishu_wiki.cjs
    audit_feishu_export.cjs
    import_feishu_markdown.cjs
    patch_feishu_doc.cjs
    merge_diff_to_feishu_doc.cjs
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
lark-cli whiteboard +query --whiteboard-token "<whiteboard_token>" --output_as code --as user
Get-Content .\diagram.mmd | lark-cli whiteboard +update --whiteboard-token "<whiteboard_token>" --source - --input_format mermaid --overwrite --yes --as user
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

## Tested Result on `lark-cli v1.0.20`

Real tests were run on `2026-04-27`.

### Complex diff merge into Feishu doc

Created a real Feishu document from local Markdown, then merged a complex `.diff` into it:

- target doc: `https://milesight.feishu.cn/docx/PEM3dMlC5o3yxlxLu9tcJVSwno2`
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

- Feishu text-drawing `add-ons` are preserved as Mermaid/text code blocks by default. Keep treating live add-on round-trip as unproven unless a target-tenant write test succeeds
- Exported whiteboards still use `code -> raw` fallback. Non-code whiteboards are preserved as Mermaid mindmap text plus raw JSON sidecars; live whiteboard updates should go through `lark-cli whiteboard +update`
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
- `scripts/audit_feishu_export.cjs`
  Generate a round-trip audit report
- `scripts/import_feishu_markdown.cjs`
  Re-import Markdown into Feishu docs with positioned media restore
- `scripts/patch_feishu_doc.cjs`
  Run focused `docs +update --api-version v2` operations for chapter, paragraph, and block edits
- `scripts/merge_diff_to_feishu_doc.cjs`
  Merge a git unified diff into a Feishu doc through Markdown fetch, local hunk application, v2 hunk updates with `str_replace` or EOF `append`, and Markdown merge audits

## License

MIT
