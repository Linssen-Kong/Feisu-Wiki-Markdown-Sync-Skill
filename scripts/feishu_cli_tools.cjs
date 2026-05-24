#!/usr/bin/env node
const fs = require("fs");
const {
  MIN_LARK_CLI_VERSION,
  SKILL_VERSION,
  assertMinimumLarkCliVersion,
  printJson,
  readOptionValue,
  runLark,
  toCliRelativePath,
} = require("./lib/lark_cli.cjs");

const COMMANDS = {
  doctor: { service: null },
  "sheet info": { service: "sheets", shortcut: "+info", risk: "read" },
  "sheet create-sheet": { service: "sheets", shortcut: "+create-sheet", risk: "write" },
  "sheet copy-sheet": { service: "sheets", shortcut: "+copy-sheet", risk: "write" },
  "sheet update-sheet": { service: "sheets", shortcut: "+update-sheet", risk: "write" },
  "sheet delete-sheet": { service: "sheets", shortcut: "+delete-sheet", risk: "high-risk-write", requiresYes: true },
  "base record-get": { service: "base", shortcut: "+record-get", risk: "read" },
  "base record-delete": { service: "base", shortcut: "+record-delete", risk: "high-risk-write", requiresYes: true },
  "task upload-attachment": { service: "task", shortcut: "+upload-attachment", risk: "write" },
  "im messages-search": { service: "im", shortcut: "+messages-search", risk: "read" },
  "drive add-comment": { service: "drive", shortcut: "+add-comment", risk: "write" },
  "drive inspect": { service: "drive", shortcut: "+inspect", risk: "read" },
  "drive version-history": { service: "drive", shortcut: "+version-history", risk: "read" },
  "drive version-get": { service: "drive", shortcut: "+version-get", risk: "read" },
  "drive version-revert": { service: "drive", shortcut: "+version-revert", risk: "high-risk-write", requiresYes: true },
  "wiki space-list": { service: "wiki", shortcut: "+space-list", risk: "read" },
  "wiki node-list": { service: "wiki", shortcut: "+node-list", risk: "read" },
  "wiki node-get": { service: "wiki", shortcut: "+node-get", risk: "read" },
  "config bind": { service: "config", shortcut: "bind", risk: "credential-bind", requiresConfirmBind: true },
};

const OPTION_MAP = {
  "--spreadsheet-token": "spreadsheetToken",
  "--url": "url",
  "--sheet-id": "sheetId",
  "--title": "title",
  "--index": "index",
  "--frozen-row-count": "frozenRowCount",
  "--frozen-col-count": "frozenColCount",
  "--hidden": "hidden",
  "--lock": "lock",
  "--lock-info": "lockInfo",
  "--user-ids": "userIds",
  "--user-id-type": "userIdType",
  "--base-token": "baseToken",
  "--table-id": "tableId",
  "--record-id": "recordId",
  "--field-id": "fieldId",
  "--json": "json",
  "--format": "format",
  "--file": "file",
  "--resource-id": "resourceId",
  "--resource-type": "resourceType",
  "--chat-id": "chatId",
  "--chat-type": "chatType",
  "--query": "query",
  "--sender": "sender",
  "--sender-type": "senderType",
  "--exclude-sender-type": "excludeSenderType",
  "--start": "start",
  "--end": "end",
  "--page-size": "pageSize",
  "--page-token": "pageToken",
  "--page-limit": "pageLimit",
  "--include-attachment-type": "includeAttachmentType",
  "--at-chatter-ids": "atChatterIds",
  "--doc": "doc",
  "--type": "type",
  "--block-id": "blockId",
  "--content": "content",
  "--selection-with-ellipsis": "selectionWithEllipsis",
  "--source": "source",
  "--as": "as",
  "--app-id": "appId",
  "--identity": "identity",
  "--lang": "lang",
  "--file-token": "fileToken",
  "--version": "version",
  "--output": "output",
  "--overwrite": "overwrite",
  "--cursor": "cursor",
  "--limit": "limit",
  "--space-id": "spaceId",
  "--parent-node-token": "parentNodeToken",
  "--node-token": "nodeToken",
  "--obj-token": "objToken",
};

const REPEATABLE_OPTIONS = new Set(["--record-id", "--field-id"]);
const BOOLEAN_OPTIONS = new Set([
  "--dry-run",
  "--yes",
  "--full-comment",
  "--is-at-me",
  "--page-all",
  "--confirm-bind",
  "--force",
  "--overwrite",
]);

function printUsage() {
  console.error(
    [
      "用法:",
      "  node scripts/feishu_cli_tools.cjs doctor",
      "  node scripts/feishu_cli_tools.cjs sheet info|create-sheet|copy-sheet|update-sheet|delete-sheet [options]",
      "  node scripts/feishu_cli_tools.cjs base record-get|record-delete [options]",
      "  node scripts/feishu_cli_tools.cjs task upload-attachment [options]",
      "  node scripts/feishu_cli_tools.cjs im messages-search [options]",
      "  node scripts/feishu_cli_tools.cjs drive add-comment|inspect|version-history|version-get|version-revert [options]",
      "  node scripts/feishu_cli_tools.cjs wiki space-list|node-list|node-get [options]",
      "  node scripts/feishu_cli_tools.cjs config bind --source lark-channel|openclaw|hermes --identity bot-only|user-default --confirm-bind",
      "",
      "说明:",
      "  - 本脚本是 lark-cli 1.0.24-1.0.39 新增能力的项目入口，不替代原 Markdown Sync 工作流。",
      "  - delete-sheet、record-delete 必须显式传 --yes。",
      "  - config bind 必须显式传 --confirm-bind 和 --identity。",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  if (!argv.length || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    process.exit(0);
  }
  if (argv[0] === "doctor") {
    return { key: "doctor", values: {} };
  }
  const key = `${argv[0]} ${argv[1] || ""}`.trim();
  if (!COMMANDS[key]) {
    throw new Error(`未知命令: ${key}`);
  }
  const values = { as: "user" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      printUsage();
      process.exit(0);
    }
    if (BOOLEAN_OPTIONS.has(arg)) {
      values[arg.replace(/^--/, "").replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = true;
      continue;
    }
    const optionName = Object.keys(OPTION_MAP).find((name) => arg === name || arg.startsWith(`${name}=`));
    if (!optionName) {
      throw new Error(`未知参数: ${arg}`);
    }
    const { value, nextIndex } = readOptionValue(argv, i, arg, optionName);
    const keyName = OPTION_MAP[optionName];
    if (REPEATABLE_OPTIONS.has(optionName)) {
      values[keyName] = values[keyName] || [];
      values[keyName].push(value);
    } else {
      values[keyName] = value;
    }
    i = nextIndex;
  }
  return { key, values };
}

function pushArg(args, name, value) {
  if (value === undefined || value === null || value === "") return;
  args.push(name, String(value));
}

function pushRepeatable(args, name, values) {
  for (const value of values || []) {
    pushArg(args, name, value);
  }
}

function requireYes(command, values) {
  if (COMMANDS[command].requiresYes && !values.yes && !values.dryRun) {
    throw new Error(`${command} 是高风险写操作；请确认后追加 --yes，或先使用 --dry-run。`);
  }
}

function buildSheetArgs(command, values) {
  requireYes(command, values);
  const args = [COMMANDS[command].service, COMMANDS[command].shortcut];
  pushArg(args, "--spreadsheet-token", values.spreadsheetToken);
  pushArg(args, "--url", values.url);
  pushArg(args, "--sheet-id", values.sheetId);
  pushArg(args, "--title", values.title);
  pushArg(args, "--index", values.index);
  pushArg(args, "--frozen-row-count", values.frozenRowCount);
  pushArg(args, "--frozen-col-count", values.frozenColCount);
  pushArg(args, "--lock", values.lock);
  pushArg(args, "--lock-info", values.lockInfo);
  pushArg(args, "--user-ids", values.userIds);
  pushArg(args, "--user-id-type", values.userIdType);
  if (values.hidden) args.push("--hidden");
  if (values.dryRun) args.push("--dry-run");
  if (values.yes) args.push("--yes");
  args.push("--as", values.as || "user");
  return args;
}

function buildBaseArgs(command, values) {
  requireYes(command, values);
  const args = [COMMANDS[command].service, COMMANDS[command].shortcut];
  pushArg(args, "--base-token", values.baseToken);
  pushArg(args, "--table-id", values.tableId);
  pushRepeatable(args, "--record-id", values.recordId);
  pushRepeatable(args, "--field-id", values.fieldId);
  pushArg(args, "--json", values.json);
  pushArg(args, "--format", values.format);
  if (values.dryRun) args.push("--dry-run");
  if (values.yes) args.push("--yes");
  args.push("--as", values.as || "user");
  return args;
}

function buildTaskArgs(values) {
  const args = ["task", "+upload-attachment"];
  if (!values.file) throw new Error("task upload-attachment 必须提供 --file");
  pushArg(args, "--file", toCliRelativePath(values.file));
  pushArg(args, "--resource-id", values.resourceId);
  pushArg(args, "--resource-type", values.resourceType);
  pushArg(args, "--user-id-type", values.userIdType);
  pushArg(args, "--format", values.format);
  if (values.dryRun) args.push("--dry-run");
  args.push("--as", values.as || "user");
  return args;
}

function buildImArgs(values) {
  const args = ["im", "+messages-search"];
  pushArg(args, "--chat-id", values.chatId);
  pushArg(args, "--chat-type", values.chatType);
  pushArg(args, "--query", values.query);
  pushArg(args, "--sender", values.sender);
  pushArg(args, "--sender-type", values.senderType);
  pushArg(args, "--exclude-sender-type", values.excludeSenderType);
  pushArg(args, "--start", values.start);
  pushArg(args, "--end", values.end);
  pushArg(args, "--page-size", values.pageSize);
  pushArg(args, "--page-token", values.pageToken);
  pushArg(args, "--page-limit", values.pageLimit);
  pushArg(args, "--include-attachment-type", values.includeAttachmentType);
  pushArg(args, "--at-chatter-ids", values.atChatterIds);
  pushArg(args, "--format", values.format);
  if (values.isAtMe) args.push("--is-at-me");
  if (values.pageAll) args.push("--page-all");
  if (values.dryRun) args.push("--dry-run");
  args.push("--as", "user");
  return args;
}

function buildDriveArgs(values) {
  const args = ["drive", "+add-comment"];
  pushArg(args, "--doc", values.doc);
  pushArg(args, "--type", values.type);
  pushArg(args, "--block-id", values.blockId);
  pushArg(args, "--content", values.content);
  pushArg(args, "--selection-with-ellipsis", values.selectionWithEllipsis);
  if (values.fullComment) args.push("--full-comment");
  if (values.dryRun) args.push("--dry-run");
  args.push("--as", values.as || "user");
  return args;
}

function buildDriveGenericArgs(command, values) {
  requireYes(command, values);
  const args = ["drive", COMMANDS[command].shortcut];
  pushArg(args, "--url", values.url);
  pushArg(args, "--type", values.type);
  pushArg(args, "--file-token", values.fileToken);
  pushArg(args, "--version", values.version);
  pushArg(args, "--output", values.output ? toCliRelativePath(values.output) : "");
  pushArg(args, "--cursor", values.cursor);
  pushArg(args, "--limit", values.limit);
  pushArg(args, "--format", values.format);
  if (values.overwrite) args.push("--overwrite");
  if (values.dryRun) args.push("--dry-run");
  args.push("--as", values.as || "user");
  return args;
}

function buildWikiArgs(command, values) {
  const args = ["wiki", COMMANDS[command].shortcut];
  pushArg(args, "--space-id", values.spaceId);
  pushArg(args, "--parent-node-token", values.parentNodeToken);
  pushArg(args, "--node-token", values.nodeToken);
  pushArg(args, "--obj-token", values.objToken);
  pushArg(args, "--url", values.url);
  pushArg(args, "--page-size", values.pageSize);
  pushArg(args, "--page-token", values.pageToken);
  pushArg(args, "--format", values.format);
  if (values.pageAll) args.push("--page-all");
  if (values.dryRun) args.push("--dry-run");
  args.push("--as", values.as || "user");
  return args;
}

function buildConfigBindArgs(values) {
  if (!values.confirmBind) {
    throw new Error("config bind 会绑定/覆盖 Agent 凭据策略；确认后请追加 --confirm-bind。");
  }
  if (!values.identity || !["bot-only", "user-default"].includes(values.identity)) {
    throw new Error("config bind 必须提供 --identity bot-only|user-default。");
  }
  const args = ["config", "bind"];
  pushArg(args, "--source", values.source);
  pushArg(args, "--app-id", values.appId);
  pushArg(args, "--identity", values.identity);
  pushArg(args, "--lang", values.lang);
  if (values.force) args.push("--force");
  return args;
}

function doctor() {
  const version = assertMinimumLarkCliVersion();
  printJson({
    ok: true,
    skillVersion: SKILL_VERSION,
    larkCliVersion: version,
    minimumLarkCliVersion: MIN_LARK_CLI_VERSION,
    markdownBoundary: {
      driveMarkdownFiles: "使用 scripts/feishu_markdown_file.cjs 管理 Drive 原生 .md 文件。",
      docWikiSync: "继续使用 export_feishu_wiki.cjs、import_feishu_markdown.cjs、feishu_sync.cjs。",
    },
    adoptedCliUpgrades: [
      "1.0.24 sheet management, base batch record get/delete, task attachment upload, drive comment preflight, markdown create url",
      "1.0.25 skills version drift notice and unified update flow",
      "1.0.26 im message_app_link, auth scope hints, base error cleanup, whiteboard update risk classification",
      "1.0.27 lark-channel config bind source and installation fixes",
      "1.0.28-1.0.39 drive sync/version/inspect, markdown diff/patch, sheet style/image/filter, slides export, Claude/npm packaging intake",
    ],
  });
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.key === "doctor") {
    doctor();
    return;
  }
  assertMinimumLarkCliVersion();
  let args;
  if (parsed.key.startsWith("sheet ")) args = buildSheetArgs(parsed.key, parsed.values);
  else if (parsed.key.startsWith("base ")) args = buildBaseArgs(parsed.key, parsed.values);
  else if (parsed.key === "task upload-attachment") args = buildTaskArgs(parsed.values);
  else if (parsed.key === "im messages-search") args = buildImArgs(parsed.values);
  else if (parsed.key === "drive add-comment") args = buildDriveArgs(parsed.values);
  else if (parsed.key.startsWith("drive ")) args = buildDriveGenericArgs(parsed.key, parsed.values);
  else if (parsed.key.startsWith("wiki ")) args = buildWikiArgs(parsed.key, parsed.values);
  else if (parsed.key === "config bind") args = buildConfigBindArgs(parsed.values);
  else throw new Error(`未实现命令: ${parsed.key}`);

  if (parsed.values.file && !fs.existsSync(parsed.values.file) && parsed.key === "task upload-attachment") {
    throw new Error(`文件不存在: ${parsed.values.file}`);
  }
  printJson(runLark(args));
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
}
