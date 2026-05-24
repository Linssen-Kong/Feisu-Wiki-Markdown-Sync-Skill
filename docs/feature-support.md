# Feature Support List

Baseline: `lark-cli >= 1.0.39`

This list records what is actually supported by this project after local and cloud validation. "Cloud verified" means a real operation succeeded in the user's Feishu tenant on temporary resources.

| Feature | Status | Validation | Project entry |
| --- | --- | --- | --- |
| Drive-native Markdown create/fetch/overwrite | Cloud verified | Created, fetched, overwritten, and fetched again on a temporary Drive Markdown file. | `scripts/feishu_markdown_file.cjs` |
| Drive-native Markdown diff/patch | Locally verified | Command parsing and dry-run request construction work; existing Drive version/download validation covers the underlying file scopes. | `scripts/feishu_markdown_file.cjs` |
| Doc/wiki Markdown sync | Cloud verified from earlier v1.5 flow | Pull/status/audit and guarded rich-format write-back validated on temporary wiki/doc resources. | `scripts/export_feishu_wiki.cjs`, `scripts/import_feishu_markdown.cjs`, `scripts/feishu_sync.cjs` |
| Drive ordinary file sync | Cloud verified | Push, pull, and `keep-both` conflict handling passed on a temporary Drive folder. | `scripts/feishu_drive_sync.cjs` |
| Drive version history/get/revert | Cloud verified for read/download; guarded locally for revert | Version history and version download passed; non-dry-run revert is blocked without `--yes`. | `scripts/feishu_cli_tools.cjs drive version-*` |
| Drive comments | Cloud verified | Created a full-document comment on a temporary validation doc. | `scripts/feishu_cli_tools.cjs drive add-comment` |
| Sheet management | Cloud verified | `info`, `create-sheet`, `copy-sheet`, `update-sheet`, and `delete-sheet` passed on a temporary spreadsheet; delete used a copied temporary sheet only. | `scripts/feishu_cli_tools.cjs sheet ...` |
| Sheet explicit-range write-back | Cloud verified from earlier v1.4 flow | `write`, `append`, `read`, CSV export, and XLSX export passed on a temporary cloud sheet. | `scripts/import_feishu_sheet.cjs` |
| Sheet style/image/filter write-back | Cloud verified | Style write, image write, filter view/condition creation, and format snapshot export passed on a temporary Sheet. | `scripts/import_feishu_sheet.cjs`, `scripts/export_feishu_sheet_format.cjs` |
| Slides PPTX snapshot export | Cloud verified | Temporary Slides creation and PPTX export passed. | `scripts/export_feishu_wiki.cjs` |
| Claude Code skill install | Locally verified | Project-level `.claude/skills/feishu-markdown-sync` install passed from the packed npm tarball. | `.claude/skills/feishu-markdown-sync/SKILL.md` |
| npm packaging/install | Locally verified | `npm pack`, tarball install, `npx feishu-markdown-sync doctor`, and project-level install passed. | `package.json`, `scripts/feishu_markdown_sync.cjs` |
| Base record get/delete | Cloud verified | Created temporary Base/table/records, read two records, and deleted one temporary record. | `scripts/feishu_cli_tools.cjs base ...` |
| Whiteboard Mermaid text drawing | Cloud verified | Created a temporary whiteboard, wrote Mermaid, and queried the same Mermaid code back. | `scripts/feishu_text_diagram.cjs whiteboard ...` |
| Doc v2 `<add-ons>` live text drawing | Unsupported | Cloud test returned service result `failed`, warning `Instruction produced no document changes`, and fetched XML did not contain `<add-ons>`. | Preserve as code block or use whiteboard instead. |
| Task attachment upload | Not verified: permission blocked | Real upload attempt was blocked by missing `task:attachment:write`; authorization request returned `The requested permissions are already under review`. | `scripts/feishu_cli_tools.cjs task upload-attachment` |
| IM message search | Not verified: permission blocked | Real search attempt was blocked by missing `search:message`; authorization request returned `The requested permissions are already under review`. | `scripts/feishu_cli_tools.cjs im messages-search` |
| Config bind | Not cloud-verified by design | Wrapper requires explicit `--confirm-bind` and identity selection because binding may overwrite agent credential policy. | `scripts/feishu_cli_tools.cjs config bind` |

## Unsupported Policy

- Do not claim doc v2 `<add-ons>` live round-trip support in this project.
- Exported Feishu text-drawing add-ons remain text-preserved as Mermaid/text code blocks.
- For live text drawing, use Feishu whiteboards with Mermaid or PlantUML through `scripts/feishu_text_diagram.cjs`.
- Retry Task attachment upload and IM message search only after the tenant approves the required scopes.
