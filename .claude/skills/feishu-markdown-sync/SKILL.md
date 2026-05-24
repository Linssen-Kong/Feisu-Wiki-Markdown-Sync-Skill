---
name: feishu-markdown-sync
version: 1.7.0
description: Sync, audit, and write back Feishu/Lark wiki, doc, Sheet, Drive file, Markdown, whiteboard, and Slides assets into Git-friendly Markdown/CSV/snapshot files. Use when working with Feishu content exports, manifest sync, Drive-native Markdown, Sheet range/style/image/filter writes, Drive file sync/version history, or Feishu document re-import.
allowed-tools: Bash, Read, Write, Edit, MultiEdit, Glob, Grep
---

# Feishu Markdown Sync

Use this skill from the repository or installed skill directory. In Claude Code, resolve scripts relative to `${CLAUDE_SKILL_DIR}` when installed as a skill, or relative to the current repository root when developing locally.

## Core Commands

- Structured Doc/Wiki/Sheet sync:
  - `node ${CLAUDE_SKILL_DIR}/scripts/feishu_sync.cjs status --root exports/feishu-wiki`
  - `node ${CLAUDE_SKILL_DIR}/scripts/feishu_sync.cjs pull --wiki-token "<wiki_token>" --base-url "https://your-tenant.feishu.cn" --root exports/feishu-wiki`
  - `node ${CLAUDE_SKILL_DIR}/scripts/feishu_sync.cjs push --root exports/feishu-wiki --apply`
- Drive ordinary file sync:
  - `node ${CLAUDE_SKILL_DIR}/scripts/feishu_drive_sync.cjs sync --folder-token "<folder_token>" --local-dir "./drive-files" --dry-run`
- Drive-native Markdown:
  - `node ${CLAUDE_SKILL_DIR}/scripts/feishu_markdown_file.cjs create|fetch|overwrite|diff|patch ...`
- Sheet write-back:
  - `node ${CLAUDE_SKILL_DIR}/scripts/import_feishu_sheet.cjs --url "<sheet_url>" --sheet-id "<sheet_id>" --range "A1:C3" --input "./data.csv"`
  - Add `--style-json`, `--batch-style-json`, `--image --cell`, or `--filter-view-json` only when the user explicitly wants format/view changes.

## Safety Boundaries

- `drive +sync` is only for ordinary Drive files. It skips online docx, sheet, slides, bitable, and similar cloud documents.
- Do not use Drive-native Markdown commands to replace Doc/Wiki Markdown Sync.
- Sheet format writes are explicit opt-in; CSV data writes remain the default safe path.
- Destructive Drive version revert and sheet deletes require explicit confirmation flags.
- Never write tokens, tenant URLs, or credentials into committed docs unless the user explicitly asks for a private local audit file.
