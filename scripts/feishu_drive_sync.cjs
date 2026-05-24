#!/usr/bin/env node
const {
  assertMinimumLarkCliVersion,
  printJson,
  readOptionValue,
  runLark,
  toCliRelativePath,
} = require("./lib/lark_cli.cjs");

function printUsage() {
  console.error(
    [
      "用法:",
      "  node scripts/feishu_drive_sync.cjs sync --folder-token <token> --local-dir <dir> [--dry-run] [--on-conflict keep-both|local-wins|remote-wins|ask] [--quick]",
      "",
      "说明:",
      "  - 这是 Drive 普通文件同步通道，适合附件、图片、PDF、PPTX、Drive 原生 Markdown 等。",
      "  - lark-cli drive +sync 会跳过在线 docx/sheet/slides，不替代 Doc/Wiki/Sheet 结构化同步。",
      "  - 默认 --on-conflict keep-both，避免双边变化时覆盖任何一侧。",
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
    folderToken: "",
    localDir: "",
    onConflict: "keep-both",
    onDuplicateRemote: "fail",
    as: "user",
    dryRun: false,
    quick: false,
  };
  const valueOptions = new Set([
    "--folder-token",
    "--local-dir",
    "--on-conflict",
    "--on-duplicate-remote",
    "--as",
  ]);
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--quick") {
      options.quick = true;
      continue;
    }
    const optionName = [...valueOptions].find((name) => arg === name || arg.startsWith(`${name}=`));
    if (!optionName) throw new Error(`未知参数: ${arg}`);
    const { value, nextIndex } = readOptionValue(argv, i, arg, optionName);
    const key = optionName.replace(/^--/, "").replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    options[key] = value;
    i = nextIndex;
  }
  if (options.command !== "sync") throw new Error(`未知命令: ${options.command}`);
  if (!options.folderToken) throw new Error("必须提供 --folder-token");
  if (!options.localDir) throw new Error("必须提供 --local-dir");
  if (!["keep-both", "local-wins", "remote-wins", "ask"].includes(options.onConflict)) {
    throw new Error("--on-conflict 只能是 keep-both|local-wins|remote-wins|ask");
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const version = assertMinimumLarkCliVersion();
  const args = [
    "drive",
    "+sync",
    "--folder-token",
    options.folderToken,
    "--local-dir",
    toCliRelativePath(options.localDir),
    "--on-conflict",
    options.onConflict,
    "--on-duplicate-remote",
    options.onDuplicateRemote,
    "--as",
    options.as,
  ];
  if (options.dryRun) args.push("--dry-run");
  if (options.quick) args.push("--quick");
  const result = runLark(args);
  printJson({
    ok: true,
    larkCliVersion: version,
    mode: "drive-file-sync",
    onlineDocumentBoundary: "drive +sync skips online docx/sheet/slides; use feishu_sync.cjs for structured content sync.",
    result,
  });
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
}
