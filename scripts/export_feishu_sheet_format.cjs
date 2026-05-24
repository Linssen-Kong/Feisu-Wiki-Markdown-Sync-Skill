#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
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
      "  node scripts/export_feishu_sheet_format.cjs --url <sheet_url> --sheet-id <sheet_id> --out <sheet-format.json>",
      "  node scripts/export_feishu_sheet_format.cjs --spreadsheet-token <token> --sheet-id <sheet_id> --out <sheet-format.json>",
      "",
      "说明:",
      "  - 导出 Sheet 的筛选视图、筛选条件、样式/图片占位元数据。",
      "  - 当前 lark-cli 暴露的是筛选视图读接口；样式和图片快照保留 schema，写回由 import_feishu_sheet.cjs 显式执行。",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const options = {
    url: "",
    spreadsheetToken: "",
    sheetId: "",
    out: "",
    as: "user",
    dryRun: false,
  };
  const valueOptions = new Set(["--url", "--spreadsheet-token", "--sheet-id", "--out", "--as"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    const optionName = [...valueOptions].find((name) => arg === name || arg.startsWith(`${name}=`));
    if (!optionName) throw new Error(`未知参数: ${arg}`);
    const { value, nextIndex } = readOptionValue(argv, i, arg, optionName);
    const key = optionName.replace(/^--/, "").replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    options[key] = value;
    i = nextIndex;
  }
  if (!options.url && !options.spreadsheetToken) throw new Error("必须提供 --url 或 --spreadsheet-token");
  if (!options.sheetId) throw new Error("必须提供 --sheet-id");
  if (!options.out) throw new Error("必须提供 --out");
  return options;
}

function targetArgs(options) {
  const args = [];
  if (options.url) args.push("--url", options.url);
  if (options.spreadsheetToken) args.push("--spreadsheet-token", options.spreadsheetToken);
  args.push("--sheet-id", options.sheetId, "--as", options.as);
  if (options.dryRun) args.push("--dry-run");
  return args;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  assertMinimumLarkCliVersion();
  const base = targetArgs(options);
  const filterViewsResult = runLark(["sheets", "+list-filter-views", ...base]);
  const filterViews =
    filterViewsResult?.data?.items ||
    filterViewsResult?.data?.filter_views ||
    filterViewsResult?.data?.filterViews ||
    [];
  const filterConditions = [];
  for (const view of Array.isArray(filterViews) ? filterViews : []) {
    const filterViewId = view.filter_view_id || view.filterViewId || view.id;
    if (!filterViewId) continue;
    const conditionResult = runLark([
      "sheets",
      "+list-filter-view-conditions",
      ...base,
      "--filter-view-id",
      filterViewId,
    ]);
    filterConditions.push({
      filterViewId,
      conditions:
        conditionResult?.data?.items ||
        conditionResult?.data?.conditions ||
        conditionResult?.data?.filter_conditions ||
        [],
    });
  }

  const snapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sheetId: options.sheetId,
    source: options.url || null,
    spreadsheetTokenRedacted: !options.spreadsheetToken,
    spreadsheetToken: options.spreadsheetToken || null,
    filterViews: Array.isArray(filterViews) ? filterViews : [],
    filterConditions,
    styles: [],
    images: [],
    notes: [
      "styles/images are write-back schemas in v1.7.0; lark-cli currently exposes direct write shortcuts but not a complete style/image read snapshot.",
    ],
  };

  const outPath = path.resolve(options.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  printJson({ ok: true, out: toCliRelativePath(outPath), snapshot });
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
}
