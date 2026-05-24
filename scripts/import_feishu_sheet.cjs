#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SKILL_VERSION = "1.7.0";
const MIN_LARK_CLI_VERSION = "1.0.39";
const DEFAULT_LARK_CLI = path.join(
  process.env.APPDATA || "",
  "npm",
  "node_modules",
  "@larksuite",
  "cli",
  "scripts",
  "run.js",
);
const NODE_BIN = process.env.NODE_BINARY || process.execPath || "node";

function printUsage() {
  console.error(
    [
      "用法:",
      "  node scripts/import_feishu_sheet.cjs --url <sheet_url> --sheet-id <sheet_id> --range <A1:C3> --input <file.csv|file.json> [--mode write|append]",
      "  node scripts/import_feishu_sheet.cjs --spreadsheet-token <token> --sheet-id <sheet_id> --range <A1:C3> --values '[[\"A\",\"B\"]]' [--mode write|append]",
      "  node scripts/import_feishu_sheet.cjs --url <sheet_url> --sheet-id <sheet_id> --range <A1:C3> --style-json <style.json> [--dry-run]",
      "  node scripts/import_feishu_sheet.cjs --url <sheet_url> --batch-style-json <batch-style.json> [--dry-run]",
      "  node scripts/import_feishu_sheet.cjs --url <sheet_url> --sheet-id <sheet_id> --image <image.png> --cell <A1> [--dry-run]",
      "  node scripts/import_feishu_sheet.cjs --url <sheet_url> --sheet-id <sheet_id> --filter-view-json <filter-view.json> [--dry-run]",
      "",
      "说明:",
      "  - 必须显式提供 --range，避免误覆盖整表。",
      "  - --mode write 使用 sheets +write 覆盖指定 range；--mode append 使用 sheets +append 追加行。",
      "  - 写入后会自动 sheets +read 回读校验。",
      "",
      "可用环境变量:",
      "  LARK_CLI_PATH",
    ].join("\n"),
  );
}

function readOptionValue(args, index, currentArg, optionName) {
  const prefix = `${optionName}=`;
  if (currentArg.startsWith(prefix)) {
    return { value: currentArg.slice(prefix.length), nextIndex: index };
  }
  if (index + 1 >= args.length) {
    throw new Error(`${optionName} 需要一个值`);
  }
  return { value: args[index + 1], nextIndex: index + 1 };
}

function parseArgs(argv) {
  const options = {
    mode: "write",
    url: "",
    spreadsheetToken: "",
    sheetId: "",
    range: "",
    input: "",
    values: "",
    styleJson: "",
    batchStyleJson: "",
    image: "",
    cell: "",
    filterViewJson: "",
    dryRun: false,
    larkCliPath: process.env.LARK_CLI_PATH || DEFAULT_LARK_CLI,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    const supported = [
      "--mode",
      "--url",
      "--spreadsheet-token",
      "--sheet-id",
      "--range",
      "--input",
      "--values",
      "--style-json",
      "--batch-style-json",
      "--image",
      "--cell",
      "--filter-view-json",
      "--lark-cli",
    ];
    const optionName = supported.find(
      (name) => arg === name || arg.startsWith(`${name}=`),
    );
    if (!optionName) {
      throw new Error(`未知参数: ${arg}`);
    }

    const { value, nextIndex } = readOptionValue(argv, i, arg, optionName);
    if (optionName === "--mode") {
      options.mode = value;
    } else if (optionName === "--url") {
      options.url = value;
    } else if (optionName === "--spreadsheet-token") {
      options.spreadsheetToken = value;
    } else if (optionName === "--sheet-id") {
      options.sheetId = value;
    } else if (optionName === "--range") {
      options.range = value;
    } else if (optionName === "--input") {
      options.input = value;
    } else if (optionName === "--values") {
      options.values = value;
    } else if (optionName === "--style-json") {
      options.styleJson = value;
    } else if (optionName === "--batch-style-json") {
      options.batchStyleJson = value;
    } else if (optionName === "--image") {
      options.image = value;
    } else if (optionName === "--cell") {
      options.cell = value;
    } else if (optionName === "--filter-view-json") {
      options.filterViewJson = value;
    } else if (optionName === "--lark-cli") {
      options.larkCliPath = value;
    }
    i = nextIndex;
  }

  if (!["write", "append"].includes(options.mode)) {
    throw new Error("--mode 只能是 write 或 append");
  }
  if (!options.url && !options.spreadsheetToken) {
    throw new Error("必须提供 --url 或 --spreadsheet-token");
  }
  const hasDataWrite = !!(options.input || options.values);
  const hasFormatWrite = !!(options.styleJson || options.batchStyleJson || options.image || options.filterViewJson);
  if (!options.sheetId && !options.batchStyleJson) {
    throw new Error("必须提供 --sheet-id");
  }
  if (hasDataWrite && !options.range) {
    throw new Error("必须提供 --range，禁止隐式整表写入");
  }
  if (options.styleJson && !options.range) {
    throw new Error("--style-json 必须同时提供 --range");
  }
  if (options.image && !options.cell) {
    throw new Error("--image 必须同时提供 --cell");
  }
  if (!hasDataWrite && !hasFormatWrite) {
    throw new Error("必须提供 --input、--values 或格式写回参数");
  }
  if (options.input && options.values) {
    throw new Error("--input 和 --values 只能二选一");
  }

  return {
    ...options,
    larkCliPath: path.resolve(options.larkCliPath),
  };
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function runLark(larkCliPath, rawArgs, options = {}) {
  const result = spawnSync(NODE_BIN, [larkCliPath, ...rawArgs], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    cwd: process.cwd(),
  });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
  const jsonText = extractJson(combined);

  if (jsonText) {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`无法解析 lark-cli 输出: ${combined}`);
    }
    if (result.status === 0 || options.allowFailure) {
      return parsed;
    }
    throw new Error(JSON.stringify(parsed, null, 2));
  }

  if (result.status === 0) {
    return combined;
  }

  if (options.allowFailure) {
    return {
      ok: false,
      error: {
        type: "process_error",
        message: combined || `exit code ${result.status}`,
      },
    };
  }

  throw new Error(combined || `lark-cli 执行失败: ${result.status}`);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runLarkWithRetry(larkCliPath, rawArgs, options = {}) {
  const attempts = options.attempts || 3;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return runLark(larkCliPath, rawArgs);
    } catch (error) {
      lastError = error;
      const message = String(error.message || error);
      const retriable = /EOF|ECONNRESET|ETIMEDOUT|timeout|socket/i.test(message);
      if (!retriable || attempt === attempts) {
        throw error;
      }
      sleep(500 * attempt);
    }
  }
  throw lastError;
}

function parseSemver(versionText) {
  const match = String(versionText || "").match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function compareSemver(left, right) {
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const leftPart = left[i] || 0;
    const rightPart = right[i] || 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
}

function assertMinimumLarkCliVersion(larkCliPath) {
  const versionText = runLark(larkCliPath, ["--version"]);
  const currentParts = parseSemver(versionText);
  const minParts = parseSemver(MIN_LARK_CLI_VERSION);
  if (!currentParts || !minParts) {
    throw new Error(
      `无法解析 lark-cli 版本。当前: ${versionText}，要求至少: ${MIN_LARK_CLI_VERSION}`,
    );
  }
  if (compareSemver(currentParts, minParts) < 0) {
    throw new Error(
      `当前 lark-cli 版本为 ${versionText}，该 skill v${SKILL_VERSION} 需要 >= ${MIN_LARK_CLI_VERSION}`,
    );
  }
  return versionText;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  row.push(cell);
  if (row.length > 1 || row[0] !== "" || text.endsWith(",")) {
    rows.push(row);
  }
  return rows;
}

function parseInput(options) {
  if (options.values) {
    return parseValuesJson(options.values);
  }

  const inputPath = path.resolve(options.input);
  const text = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
  if (inputPath.toLowerCase().endsWith(".json")) {
    return parseValuesJson(text);
  }
  return parseCsv(text);
}

function parseValuesJson(text) {
  let values;
  try {
    values = JSON.parse(text);
  } catch (error) {
    throw new Error(`无法解析二维数组 JSON: ${error.message}`);
  }
  if (!Array.isArray(values) || values.some((row) => !Array.isArray(row))) {
    throw new Error("写入数据必须是二维数组 JSON");
  }
  return values;
}

function normalizeCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function normalizeRows(rows) {
  return rows.map((row) => row.map(normalizeCell));
}

function extractReadValues(result) {
  const candidates = [
    result?.data?.valueRange?.values,
    result?.data?.value_range?.values,
    result?.data?.values,
    result?.valueRange?.values,
    result?.value_range?.values,
    result?.values,
  ];
  return candidates.find((value) => Array.isArray(value)) || [];
}

function buildTargetArgs(options) {
  const target = [];
  if (options.url) {
    target.push("--url", options.url);
  } else {
    target.push("--spreadsheet-token", options.spreadsheetToken);
  }
  target.push("--sheet-id", options.sheetId, "--range", options.range, "--as", "user");
  return target;
}

function buildSheetIdentityArgs(options) {
  const target = [];
  if (options.url) {
    target.push("--url", options.url);
  } else {
    target.push("--spreadsheet-token", options.spreadsheetToken);
  }
  if (options.sheetId) target.push("--sheet-id", options.sheetId);
  target.push("--as", "user");
  return target;
}

function readJsonFile(filePath, label) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} 文件不存在: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function applySheetFormatWrites(options) {
  const results = [];
  const identityArgs = buildSheetIdentityArgs(options);
  const qualifyRange = (range) => {
    if (!range) return range;
    if (String(range).includes("!") || !options.sheetId) return range;
    return `${options.sheetId}!${range}`;
  };
  if (options.styleJson) {
    const style = readJsonFile(options.styleJson, "--style-json");
    const args = [
      "sheets",
      "+set-style",
      ...identityArgs,
      "--range",
      options.range,
      "--style",
      JSON.stringify(style),
    ];
    if (options.dryRun) args.push("--dry-run");
    results.push({ type: "style", result: runLark(options.larkCliPath, args) });
  }
  if (options.batchStyleJson) {
    const data = readJsonFile(options.batchStyleJson, "--batch-style-json");
    const args = [
      "sheets",
      "+batch-set-style",
      ...buildSheetIdentityArgs({ ...options, sheetId: "" }),
      "--data",
      JSON.stringify(data),
    ];
    if (options.dryRun) args.push("--dry-run");
    results.push({ type: "batch-style", result: runLark(options.larkCliPath, args) });
  }
  if (options.image) {
    if (!fs.existsSync(path.resolve(options.image))) {
      throw new Error(`图片不存在: ${options.image}`);
    }
    const args = [
      "sheets",
      "+write-image",
      ...identityArgs,
      "--range",
      options.cell,
      "--image",
      path.relative(process.cwd(), path.resolve(options.image)).replace(/\\/g, "/"),
    ];
    if (options.dryRun) args.push("--dry-run");
    results.push({ type: "image", result: runLark(options.larkCliPath, args) });
  }
  if (options.filterViewJson) {
    const spec = readJsonFile(options.filterViewJson, "--filter-view-json");
    const createArgs = [
      "sheets",
      "+create-filter-view",
      ...identityArgs,
      "--range",
      qualifyRange(spec.range || options.range),
      "--filter-view-name",
      spec.name || spec.filterViewName || "Feishu Markdown Sync Filter",
    ];
    if (spec.filterViewId) createArgs.push("--filter-view-id", spec.filterViewId);
    if (options.dryRun) createArgs.push("--dry-run");
    const createResult = runLark(options.larkCliPath, createArgs);
    results.push({ type: "filter-view", result: createResult });
    const filterViewId =
      spec.filterViewId ||
      createResult?.data?.filter_view_id ||
      createResult?.data?.filter_view?.filter_view_id ||
      createResult?.data?.filterViewId ||
      createResult?.filter_view_id;
    for (const condition of spec.conditions || []) {
      if (!filterViewId) break;
      const conditionArgs = [
        "sheets",
        "+create-filter-view-condition",
        ...identityArgs,
        "--filter-view-id",
        filterViewId,
        "--condition-id",
        condition.conditionId || condition.column || condition.condition_id,
        "--filter-type",
        condition.filterType || condition.filter_type,
        "--compare-type",
        condition.compareType || condition.compare_type,
        "--expected",
        JSON.stringify(condition.expected || []),
      ];
      if (options.dryRun) conditionArgs.push("--dry-run");
      results.push({ type: "filter-condition", result: runLark(options.larkCliPath, conditionArgs) });
    }
  }
  return results;
}

function compareWrite(expectedRows, actualRows) {
  const expected = normalizeRows(expectedRows);
  const actual = normalizeRows(actualRows).slice(0, expected.length);
  const mismatches = [];
  for (let r = 0; r < expected.length; r += 1) {
    for (let c = 0; c < expected[r].length; c += 1) {
      if ((actual[r] || [])[c] !== expected[r][c]) {
        mismatches.push({
          row: r + 1,
          col: c + 1,
          expected: expected[r][c],
          actual: (actual[r] || [])[c] ?? "",
        });
      }
    }
  }
  return mismatches;
}

function rowsEndWith(actualRows, expectedRows) {
  const actual = normalizeRows(actualRows);
  const expected = normalizeRows(expectedRows);
  if (actual.length < expected.length) {
    return false;
  }
  const tail = actual.slice(actual.length - expected.length);
  return compareWrite(expected, tail).length === 0;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(options.larkCliPath)) {
    throw new Error(`未找到 lark-cli: ${options.larkCliPath}`);
  }

  const versionText = assertMinimumLarkCliVersion(options.larkCliPath);
  const formatResults = applySheetFormatWrites(options);
  const hasDataWrite = !!(options.input || options.values);
  if (!hasDataWrite) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skillVersion: SKILL_VERSION,
          larkCliVersion: String(versionText).trim(),
          formatResults,
          dryRun: options.dryRun,
        },
        null,
        2,
      ),
    );
    return;
  }

  const values = parseInput(options);
  if (values.length === 0) {
    throw new Error("写入数据为空");
  }

  const targetArgs = buildTargetArgs(options);
  const writeCommand = options.mode === "append" ? "+append" : "+write";
  const writeArgs = [
    "sheets",
    writeCommand,
    ...targetArgs,
    "--values",
    JSON.stringify(values),
  ];
  if (options.dryRun) {
    writeArgs.push("--dry-run");
  }

  const writeResult = runLark(options.larkCliPath, writeArgs);
  if (options.dryRun) {
    console.log(JSON.stringify({ dryRun: true, formatResults, writeResult }, null, 2));
    return;
  }

  const readResult = runLarkWithRetry(options.larkCliPath, [
    "sheets",
    "+read",
    ...targetArgs,
    "--value-render-option",
    "ToString",
  ]);
  const readValues = extractReadValues(readResult);
  const mismatches =
    options.mode === "append"
      ? rowsEndWith(readValues, values)
        ? []
        : [{ message: "回读范围末尾未匹配追加数据，请检查 --range 是否覆盖追加结果。" }]
      : compareWrite(values, readValues);

  if (mismatches.length) {
    throw new Error(
      [
        "Sheet 写回后回读校验失败:",
        JSON.stringify(mismatches.slice(0, 20), null, 2),
      ].join("\n"),
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        skillVersion: SKILL_VERSION,
        larkCliVersion: String(versionText).trim(),
        mode: options.mode,
        range: options.range,
        rowsWritten: values.length,
        columnsWritten: Math.max(...values.map((row) => row.length)),
        formatResults,
        writeResult,
        readBackRows: readValues.length,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
}
