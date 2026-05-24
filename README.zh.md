# Feishu Markdown Sync

[English](README.md) | [简体中文](README.zh.md)

`feishu-markdown-sync` 是一个面向 Codex/AI Agent 的飞书内容同步工具。它把飞书 Wiki、Docx、Sheet、白板等内容导出成适合 Git 管理的 Markdown、CSV、资源文件和格式快照，并提供谨慎的回写、审计和同步能力。

当前版本：`v1.7.0`

最低要求：`lark-cli >= 1.0.39`

本版本接入了 `lark-cli v1.0.39`，新增 Claude Code 和 npm 安装支持，增加 Drive 普通文件直接同步，扩展 Sheet 样式/图片/筛选器写回，支持 Slides 快照导出，并修复导出文件未稳定使用 Feishu title 命名的问题。

- Doc/Wiki Markdown Sync：飞书文档或 Wiki 与本地 Markdown/CSV/资源文件之间的同步。
- Drive 普通文件同步：图片、PDF、PPTX、附件、Drive 原生 Markdown 等无需格式转换的文件直接双向同步。
- Drive 原生 Markdown：飞书云空间中作为普通 `.md` 文件存储的 Markdown 文件。

## npm 安装

全局安装后，显式安装到 Codex、Claude Code 或两者：

```powershell
npm install -g feishu-markdown-sync
feishu-markdown-sync install --target both --scope user
```

也可以通过 `npx` 使用已发布或本地打包的包：

```powershell
npx feishu-markdown-sync install --target claude --scope project
```

安装命令只复制 skill 文件，不写凭据、不自动登录飞书、不默认覆盖已有目录；需要覆盖时传 `--force`。

## 安装为本地 Codex Skill

从 GitHub 安装或升级：

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py" --repo Linssen-Kong/Feisu-Markdown-Sync-Skill --ref master --path . --name feishu-markdown-sync
```

如果 `C:\Users\<you>\.codex\skills\feishu-markdown-sync` 已存在，请先删除或重命名这个已安装 skill 目录，再运行上面的命令。如果你之前安装过 `feishu-wiki-markdown-sync`，确认新 skill 可用后可以删除旧安装目录。安装后需要重启 Codex，新的 skill 才会被加载。

> 迁移说明：本 skill 旧安装名是 `feishu-wiki-markdown-sync`，新安装名是 `feishu-markdown-sync`。如果两个目录同时存在于 `C:\Users\<you>\.codex\skills\` 下，Codex 会加载两个功能范围相同的 skill。升级后请删除或重命名旧的 `feishu-wiki-markdown-sync` 目录，只保留新目录。

## 安装为 Claude Code Skill

项目级安装：

```powershell
feishu-markdown-sync install --target claude --scope project
```

用户级安装：

```powershell
feishu-markdown-sync install --target claude --scope user
```

Claude Code 会读取 `.claude/skills/feishu-markdown-sync/SKILL.md`。该 skill 使用 `${CLAUDE_SKILL_DIR}` 引用脚本，因此用户级、项目级和 npm 安装位置都可用。

## 为什么需要它

飞书文档适合协作，但默认不适合 Git diff、归档和离线审阅。本项目的目标是让产品文档、PRD、设计文档、表格型规划资料和白板内容变得：

- 更容易做版本对比
- 更容易归档
- 更容易离线审阅
- 更适合由 AI Agent 读取、审计和安全回写

## 主要能力

- 导出飞书 Wiki 树为本地可读 Markdown。
- 将顶层 Sheet 页面和文档内嵌 Sheet 作为一等同步对象处理。
- 将 Sheet 导出为 `xlsx`、`csv` 和 Markdown 预览。
- 将 CSV 或 JSON 二维数组写回飞书 Sheet 的显式 range，并回读校验。
- 用 manifest 支持 `status`、`plan`、`pull`、`push`、`refresh` 工作流。
- 保存 `*.format.xml` 和 `format-map.json`，用于富格式保护和后续三方合并。
- 下载文档图片并在 Markdown 正文内联。
- 将 CodePen 链接导出为稳定 Markdown 链接，并在导入时恢复为飞书 iframe。
- 将白板导出为代码；无法导出代码时，降级保存 raw JSON、Mermaid mindmap 和可读预览。
- 用 Mermaid/PlantUML 写入飞书白板，实现真正可回读的文本绘图。
- 将飞书文本绘图 add-ons 保留为 Mermaid/text 代码块；云端验证显示 doc v2 `<add-ons>` 不支持 live round-trip。
- 提供 Drive 原生 `.md` 文件的创建、读取和覆盖入口。
- 提供 Drive 原生 `.md` 文件的 diff/patch 能力。
- 通过 `drive +sync` 同步 Drive 普通文件，适合附件、图片、PDF、PPTX、Drive 原生 Markdown 等。
- 查询、下载和受控回滚 Drive 文件历史版本。
- 显式写回 Sheet 样式、批量样式、图片、筛选视图和筛选条件。
- 将 Slides 节点导出为 PPTX 快照，用于 Git 审阅和归档。
- 导出对象默认使用 Feishu title 命名，并在重名时自动加稳定短后缀。
- 提供 Sheet 管理、Base 记录读取/删除、任务附件上传、IM 搜索、Drive 评论、config bind 的受控 wrapper。

## 配置

项目不硬编码租户域名或 Wiki token。通过环境变量或命令行参数提供配置：

```powershell
$env:FEISHU_BASE_URL = "https://your-tenant.feishu.cn"
```

可用配置：

- `FEISHU_BASE_URL`：飞书租户基础 URL，导出 Wiki/Doc 链接时需要。
- `FEISHU_WIKI_TOKEN`：默认 Wiki token，可选。
- `FEISHU_OUTPUT_ROOT`：默认导出目录，兼容默认值为 `exports/feishu-wiki/`。
- `FEISHU_EXPORT_ROOT`：默认审计目录。
- `FEISHU_INCLUDE_SENSITIVE_METADATA`：是否写入敏感元数据，默认 `false`。
- `FEISHU_KEEP_SENSITIVE_PLACEHOLDERS`：是否保留敏感 token 占位，默认 `false`。
- `LARK_CLI_PATH`：自定义 `lark-cli` 入口路径。

## 常用工作流

### 1. 同步状态和计划

```powershell
node scripts/feishu_sync.cjs status --root exports/feishu-wiki
node scripts/feishu_sync.cjs plan --root exports/feishu-wiki
```

拉取并刷新 manifest：

```powershell
node scripts/feishu_sync.cjs pull --wiki-token "<wiki_token>" --base-url https://your-tenant.feishu.cn --root exports/feishu-wiki
```

推送默认只生成计划，只有显式传 `--apply` 才会写回：

```powershell
node scripts/feishu_sync.cjs push --root exports/feishu-wiki
node scripts/feishu_sync.cjs push --root exports/feishu-wiki --apply
```

### 2. 导出 Wiki 树

```powershell
node scripts/export_feishu_wiki.cjs <wiki_token> --base-url https://your-tenant.feishu.cn
```

默认输出：

```text
exports/feishu-wiki/
```

### 3. 审计导出质量

```powershell
node scripts/audit_feishu_export.cjs exports/feishu-wiki
```

生成：

```text
exports/feishu-wiki/roundtrip-audit.md
```

### 4. 回导一个 Markdown 文档到飞书 Docx

```powershell
node scripts/import_feishu_markdown.cjs "<markdown_file>" "<docx_url_or_token>" "Optional Title"
```

建议优先尝试章节、段落、block 或 diff 级别更新；只有无法安全匹配局部内容时，再使用整篇覆盖回导。

### 5. 写回一个 Sheet range

```powershell
node scripts/import_feishu_sheet.cjs --url "<sheet_url>" --sheet-id "<sheet_id>" --range "A2:C3" --input ".\changes.csv"
```

追加 JSON 二维数组：

```powershell
node scripts/import_feishu_sheet.cjs --url "<sheet_url>" --sheet-id "<sheet_id>" --range "A:C" --mode append --values '[[2026,"追加","ok"]]'
```

Sheet 写回必须显式提供 `--range`，禁止隐式整表覆盖。

### 6. 管理 Drive 原生 Markdown 文件

这只适用于飞书云空间中作为普通 `.md` 文件存储的 Markdown，不替代 Doc/Wiki 同步。

```powershell
node scripts/feishu_markdown_file.cjs create --file ".\note.md" --folder-token "<folder_token>" --dry-run
node scripts/feishu_markdown_file.cjs fetch --file-token "<markdown_file_token>" --output ".\exports\drive-markdown\note.md"
node scripts/feishu_markdown_file.cjs overwrite --file-token "<markdown_file_token>" --file ".\note.md" --dry-run
node scripts/feishu_markdown_file.cjs diff --file-token "<markdown_file_token>" --file ".\note.md"
node scripts/feishu_markdown_file.cjs patch --file-token "<markdown_file_token>" --pattern "旧内容" --content "新内容" --dry-run
```

### 6b. 同步 Drive 普通文件

这条链路只处理 Drive 普通文件，不替代 Doc/Wiki/Sheet 结构化同步。默认冲突策略是 `keep-both`，避免双边修改时覆盖任意一侧。

```powershell
node scripts/feishu_drive_sync.cjs sync --folder-token "<folder_token>" --local-dir ".\drive-files" --dry-run
```

### 6c. 写回 Sheet 样式、图片和筛选器

CSV/JSON 数据写回仍是默认安全路径；格式写回必须显式指定。

```powershell
node scripts/import_feishu_sheet.cjs --url "<sheet_url>" --sheet-id "<sheet_id>" --range "A1:C3" --style-json ".\style.json" --dry-run
node scripts/import_feishu_sheet.cjs --url "<sheet_url>" --sheet-id "<sheet_id>" --image ".\logo.png" --cell "B2" --dry-run
node scripts/import_feishu_sheet.cjs --url "<sheet_url>" --sheet-id "<sheet_id>" --filter-view-json ".\filter-view.json" --dry-run
```

### 6d. 导出 Slides 快照

Wiki 树中的 Slides 节点会导出为 PPTX 快照，并保留 `README.md` 和 `metadata.json`。v1.7.0 暂不做 Slides 结构化回写。

### 6e. 导出命名规则

导出文件名按以下顺序解析：Feishu 文档/文件真实 title、Wiki node title、token fallback。同级重名会追加稳定短后缀，避免覆盖。`metadata.json` 会记录 `wikiNodeTitle`、`resolvedTitle`、`filenameTitleSource` 和 `safeFilename` 方便审计。

### 6f. v1.7.0 验证状态

已在 2026-05-24 完成本地验证：

- `npm run check` 通过所有脚本语法检查。
- `feishu-markdown-sync doctor` 和 `feishu_cli_tools doctor` 均确认当前 CLI 为 `lark-cli version 1.0.39`。
- Drive sync、Drive version revert、Sheet style、Sheet filter-view 的 dry-run 均生成预期 API 请求。
- `npm pack`、tarball 安装、bin 命令执行、项目级 Claude skill 安装均通过。

补充授权后，真实云端验证已完成：

- Drive 普通文件同步通过 push、pull 和 `keep-both` 冲突保留验证。
- Drive 版本历史和指定历史版本下载通过。
- Sheet CSV 写回、样式写回、图片写入、筛选视图/筛选条件创建、格式快照导出均通过。
- Slides 创建和 PPTX 导出通过。

部分飞书 OpenAPI 调用出现过临时 TLS handshake timeout，重试后成功。脱敏后的验证记录见 `docs/validation-log.md`。

### 7. 更新飞书白板文本绘图

```powershell
node scripts/feishu_text_diagram.cjs whiteboard query --whiteboard-token "<whiteboard_token>" --output-as code --as user
node scripts/feishu_text_diagram.cjs whiteboard update --whiteboard-token "<whiteboard_token>" --source "@.\diagram.mmd" --input-format mermaid --overwrite
```

`--overwrite` 默认 dry-run。确认请求无误后，添加 `--apply` 执行真实写入。

### 8. lark-cli 1.0.39 旁路能力

```powershell
node scripts/feishu_cli_tools.cjs doctor
node scripts/feishu_cli_tools.cjs sheet info --url "<sheet_url>"
node scripts/feishu_cli_tools.cjs base record-get --base-token "<base_token>" --table-id "<table_id>" --record-id "<record_id>"
node scripts/feishu_cli_tools.cjs task upload-attachment --resource-id "<task_guid_or_url>" --file ".\brief.pdf"
node scripts/feishu_cli_tools.cjs im messages-search --query "PRD" --page-size 10
node scripts/feishu_cli_tools.cjs drive add-comment --doc "<doc_or_wiki_url>" --content '[{"type":"text","text":"请 review"}]' --dry-run
node scripts/feishu_cli_tools.cjs drive version-history --file-token "<file_token>"
node scripts/feishu_cli_tools.cjs drive version-get --file-token "<file_token>" --version "<version>" --output ".\versions"
node scripts/feishu_cli_tools.cjs drive version-revert --file-token "<file_token>" --version "<version>" --dry-run
```

高风险动作有门禁：

- `sheet delete-sheet` 必须传 `--yes` 或先 `--dry-run`。
- `base record-delete` 必须传 `--yes` 或先 `--dry-run`。
- `config bind` 必须传 `--confirm-bind` 和明确的 `--identity`。
- `drive version-revert` 必须传 `--yes` 或先 `--dry-run`。

## 功能支持状态

详见：

- [英文功能支持列表](docs/feature-support.md)
- [中文功能支持列表](docs/feature-support.zh.md)

摘要：

- 已云端验证：Drive Markdown、Doc/Wiki 同步、Drive 评论、Sheet 管理、Sheet range 写回、Base 记录读取/删除、白板 Mermaid 文本绘图。
- 明确不支持：doc v2 `<add-ons>` live 文本绘图 round-trip。
- 权限阻塞待验证：任务附件上传、IM 消息搜索。
- 按设计不做云端验证：config bind。

## 安全与隐私

详见 [GitHub 上传安全检查](docs/security-privacy-check.md)。

默认隐私策略：

- `.env`、`.env.*`、`.tmp/`、`exports/`、`node_modules/` 已忽略。
- `.env.example` 只保留占位符。
- 默认不导出敏感元数据。
- 只有显式设置 `FEISHU_INCLUDE_SENSITIVE_METADATA=true` 才会写入真实 token/URL 到本地导出结果。
- 只有显式设置 `FEISHU_KEEP_SENSITIVE_PLACEHOLDERS=true` 才会保留敏感 token 占位。

不要把带有真实组织内容或 token 的 `exports/` 输出提交到 GitHub。

## 脚本列表

- `scripts/export_feishu_wiki.cjs`：导出 Wiki/Doc/Sheet 内容到本地。
- `scripts/feishu_sync.cjs`：manifest 支持的 status、plan、pull、push、refresh。
- `scripts/compile_feishu_doc_xml.cjs`：把 Markdown 编辑合并回 XML 格式快照。
- `scripts/audit_feishu_export.cjs`：生成可读性和回写风险审计报告。
- `scripts/import_feishu_markdown.cjs`：将一个 Markdown 文件回导到飞书 Docx，并恢复图片/文件位置。
- `scripts/import_feishu_sheet.cjs`：显式 range 的 Sheet 写回和回读校验。
- `scripts/feishu_markdown_file.cjs`：Drive 原生 Markdown 文件 create/fetch/overwrite。
- `scripts/feishu_cli_tools.cjs`：lark-cli 1.0.24-1.0.39 新增能力的受控入口。
- `scripts/feishu_text_diagram.cjs`：白板 Mermaid/PlantUML 写入，以及 doc add-ons 不支持状态验证。
- `scripts/lib/lark_cli.cjs`：公共 lark-cli runner、版本检查、JSON 解析和路径处理。

## 已知限制

- doc v2 `<add-ons>` 不支持 live round-trip；请保留为代码块或使用飞书白板。
- 内嵌 Sheet 回导为 Docx 时仍以表格预览为主，不会自动恢复成原始内嵌 Sheet。
- Same-document anchor 链接在飞书导入后不可靠。
- 本地 Markdown 链接会降级为可读文本路径。
- 任务附件上传和 IM 消息搜索需要租户审批对应 scope 后才能验证。

## License

MIT
