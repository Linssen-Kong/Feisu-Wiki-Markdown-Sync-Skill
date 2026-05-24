# 功能支持列表

基线版本：`lark-cli >= 1.0.39`

本列表记录项目当前实际支持情况。“云端已验证”表示已经在用户飞书租户中用临时资源完成真实操作。为了便于上传 GitHub，本文件不保留真实租户域名、云文档链接或 token。

| 功能 | 状态 | 验证情况 | 项目入口 |
| --- | --- | --- | --- |
| Drive 原生 Markdown 创建/读取/覆盖 | 云端已验证 | 已在临时 Drive Markdown 文件上完成创建、读取、覆盖、再次读取。 | `scripts/feishu_markdown_file.cjs` |
| Drive 原生 Markdown diff/patch | 本地已验证 | 参数解析和 dry-run 请求构造通过；底层文件 scope 已通过 Drive 版本/下载验证覆盖。 | `scripts/feishu_markdown_file.cjs` |
| Doc/Wiki Markdown 同步 | 早期云端已验证 | v1.5 流程已验证 pull/status/audit 和富格式保护写回。 | `scripts/export_feishu_wiki.cjs`, `scripts/import_feishu_markdown.cjs`, `scripts/feishu_sync.cjs` |
| Drive 普通文件同步 | 云端已验证 | 已在临时 Drive 文件夹通过 push、pull 和 `keep-both` 冲突保留验证。 | `scripts/feishu_drive_sync.cjs` |
| Drive 版本历史/下载/回滚 | 读取/下载云端已验证，回滚本地门禁已验证 | 版本历史和版本下载通过；无 `--yes` 的真实回滚会被本地阻止。 | `scripts/feishu_cli_tools.cjs drive version-*` |
| Drive 评论 | 云端已验证 | 已在临时验证文档上创建全文评论。 | `scripts/feishu_cli_tools.cjs drive add-comment` |
| Sheet 管理 | 云端已验证 | `info`、`create-sheet`、`copy-sheet`、`update-sheet`、`delete-sheet` 已在临时表格通过；删除只用于复制出的临时工作表。 | `scripts/feishu_cli_tools.cjs sheet ...` |
| Sheet 显式范围写回 | 早期云端已验证 | 已验证 `write`、`append`、`read`、CSV 导出和 XLSX 导出。 | `scripts/import_feishu_sheet.cjs` |
| Sheet 样式/图片/筛选器写回 | 云端已验证 | 已在临时 Sheet 通过样式写入、图片写入、筛选视图/筛选条件创建和格式快照导出。 | `scripts/import_feishu_sheet.cjs`, `scripts/export_feishu_sheet_format.cjs` |
| Slides PPTX 快照导出 | 云端已验证 | 临时 Slides 创建和 PPTX 导出已通过。 | `scripts/export_feishu_wiki.cjs` |
| Claude Code skill 安装 | 本地已验证 | 从 npm tarball 安装到项目级 `.claude/skills/feishu-markdown-sync` 通过。 | `.claude/skills/feishu-markdown-sync/SKILL.md` |
| npm 打包/安装 | 本地已验证 | `npm pack`、tarball install、`npx feishu-markdown-sync doctor`、项目级安装通过。 | `package.json`, `scripts/feishu_markdown_sync.cjs` |
| Base 记录读取/删除 | 云端已验证 | 已创建临时 Base、表和记录，读取两条记录，并删除一条临时记录。 | `scripts/feishu_cli_tools.cjs base ...` |
| 白板 Mermaid 文本绘图 | 云端已验证 | 已创建临时白板，写入 Mermaid，并成功回读同一份 Mermaid 代码。 | `scripts/feishu_text_diagram.cjs whiteboard ...` |
| Doc v2 `<add-ons>` 实时文本绘图 | 明确不支持 | 云端测试返回服务端 `failed`，提示未产生文档变更，回读 XML 不包含 `<add-ons>`。 | 请保留为代码块，或改用白板文本绘图。 |
| 任务附件上传 | 未验证：权限阻塞 | 真实上传被 `task:attachment:write` scope 阻塞；授权申请返回权限审核中。 | `scripts/feishu_cli_tools.cjs task upload-attachment` |
| IM 消息搜索 | 未验证：权限阻塞 | 真实搜索被 `search:message` scope 阻塞；授权申请返回权限审核中。 | `scripts/feishu_cli_tools.cjs im messages-search` |
| Config bind | 按设计不做云端验证 | 该操作可能覆盖 Agent 凭据策略，wrapper 要求显式 `--confirm-bind` 和身份策略。 | `scripts/feishu_cli_tools.cjs config bind` |

## 不支持策略

- 不要在本项目中宣称 doc v2 `<add-ons>` 支持 live round-trip。
- 导出的飞书文本绘图 add-ons 继续按 Mermaid/text 代码块做文本保真。
- 需要真正可编辑的文本绘图时，使用 `scripts/feishu_text_diagram.cjs` 写入飞书白板。
- 任务附件上传和 IM 消息搜索需要等待租户审批对应 scope 后再验证。
