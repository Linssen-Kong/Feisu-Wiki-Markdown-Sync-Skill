#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const {
  assertMinimumLarkCliVersion,
  ensureMarkdownFile,
  printJson,
  readOptionValue,
  runLark,
  toCliRelativePath,
} = require("./lib/lark_cli.cjs");

function printUsage() {
  console.error(
    [
      "用法:",
      "  node scripts/feishu_markdown_file.cjs create --file <local.md> [--folder-token <token>] [--name <name.md>] [--as user|bot] [--dry-run]",
      "  node scripts/feishu_markdown_file.cjs fetch --file-token <token> [--output <path>] [--overwrite] [--as user|bot]",
      "  node scripts/feishu_markdown_file.cjs overwrite --file-token <token> --file <local.md> [--name <name.md>] [--as user|bot] [--dry-run]",
      "  node scripts/feishu_markdown_file.cjs diff --file-token <token> [--file <local.md>|--from-version <v> [--to-version <v>]] [--context-lines <n>]",
      "  node scripts/feishu_markdown_file.cjs patch --file-token <token> --pattern <text|@file> --content <text|@file> [--regex] [--dry-run]",
      "",
      "说明:",
      "  - 本脚本只管理 Drive 原生 Markdown 文件，不用于 doc/wiki 文档同步。",
      "  - doc/wiki ↔ 本地 Markdown 同步继续使用 export_feishu_wiki.cjs、import_feishu_markdown.cjs 和 feishu_sync.cjs。",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  if (!argv.length || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    process.exit(0);
  }
  const options = {
    command: argv[0],
    as: "user",
    dryRun: false,
    overwrite: false,
  };
  const valueOptions = new Set([
    "--file",
    "--folder-token",
    "--wiki-token",
    "--name",
    "--file-token",
    "--output",
    "--as",
    "--from-version",
    "--to-version",
    "--context-lines",
    "--pattern",
    "--content",
  ]);
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--overwrite") {
      options.overwrite = true;
      continue;
    }
    if (arg === "--regex") {
      options.regex = true;
      continue;
    }
    const optionName = [...valueOptions].find((name) => arg === name || arg.startsWith(`${name}=`));
    if (!optionName) {
      throw new Error(`未知参数: ${arg}`);
    }
    const { value, nextIndex } = readOptionValue(argv, i, arg, optionName);
    const key = optionName.replace(/^--/, "").replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    options[key] = value;
    i = nextIndex;
  }
  if (!["create", "fetch", "overwrite", "diff", "patch"].includes(options.command)) {
    throw new Error(`未知命令: ${options.command}`);
  }
  if (!["user", "bot"].includes(options.as)) {
    throw new Error("--as 只能是 user 或 bot");
  }
  return options;
}

function requireExistingMarkdown(filePath) {
  if (!filePath) {
    throw new Error("必须提供 --file");
  }
  ensureMarkdownFile(filePath);
  if (!fs.existsSync(path.resolve(filePath))) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  return toCliRelativePath(filePath);
}

function buildCreateArgs(options) {
  const file = requireExistingMarkdown(options.file);
  const args = ["markdown", "+create", "--file", file, "--as", options.as];
  if (options.folderToken) args.push("--folder-token", options.folderToken);
  if (options.wikiToken) args.push("--wiki-token", options.wikiToken);
  if (options.name) args.push("--name", options.name);
  if (options.dryRun) args.push("--dry-run");
  return args;
}

function buildFetchArgs(options) {
  if (!options.fileToken) {
    throw new Error("fetch 必须提供 --file-token");
  }
  const args = ["markdown", "+fetch", "--file-token", options.fileToken, "--as", options.as];
  if (options.output) args.push("--output", toCliRelativePath(options.output));
  if (options.overwrite) args.push("--overwrite");
  return args;
}

function buildOverwriteArgs(options) {
  if (!options.fileToken) {
    throw new Error("overwrite 必须提供 --file-token");
  }
  const file = requireExistingMarkdown(options.file);
  const args = ["markdown", "+overwrite", "--file-token", options.fileToken, "--file", file, "--as", options.as];
  if (options.name) args.push("--name", options.name);
  if (options.dryRun) args.push("--dry-run");
  return args;
}

function buildDiffArgs(options) {
  if (!options.fileToken) {
    throw new Error("diff 必须提供 --file-token");
  }
  const args = ["markdown", "+diff", "--file-token", options.fileToken, "--as", options.as];
  if (options.file) {
    ensureMarkdownFile(options.file);
    args.push("--file", toCliRelativePath(options.file));
  }
  if (options.fromVersion) args.push("--from-version", options.fromVersion);
  if (options.toVersion) args.push("--to-version", options.toVersion);
  if (options.contextLines) args.push("--context-lines", options.contextLines);
  if (options.dryRun) args.push("--dry-run");
  return args;
}

function buildPatchArgs(options) {
  if (!options.fileToken) {
    throw new Error("patch 必须提供 --file-token");
  }
  if (!options.pattern || !options.content) {
    throw new Error("patch 必须提供 --pattern 和 --content");
  }
  const args = [
    "markdown",
    "+patch",
    "--file-token",
    options.fileToken,
    "--pattern",
    options.pattern,
    "--content",
    options.content,
    "--as",
    options.as,
  ];
  if (options.regex) args.push("--regex");
  if (options.dryRun) args.push("--dry-run");
  return args;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  assertMinimumLarkCliVersion();
  const argsByCommand = {
    create: buildCreateArgs,
    fetch: buildFetchArgs,
    overwrite: buildOverwriteArgs,
    diff: buildDiffArgs,
    patch: buildPatchArgs,
  };
  const result = runLark(argsByCommand[options.command](options));
  printJson(result);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
}
