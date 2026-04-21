const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const DEFAULT_LARK_CLI = path.join(
  process.env.APPDATA || "",
  "npm",
  "node_modules",
  "@larksuite",
  "cli",
  "scripts",
  "run.js",
);
const BOOLEAN_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const BOOLEAN_FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function printUsage() {
  console.error(
    [
      "用法:",
      "  node scripts/export_feishu_wiki.cjs <wiki_token> [output_root] [--base-url <https://your-tenant.feishu.cn>]",
      "",
      "可用环境变量:",
      "  FEISHU_WIKI_TOKEN",
      "  FEISHU_OUTPUT_ROOT",
      "  FEISHU_BASE_URL",
      "  FEISHU_INCLUDE_SENSITIVE_METADATA=false",
      "  FEISHU_KEEP_SENSITIVE_PLACEHOLDERS=false",
      "  LARK_CLI_PATH",
    ].join("\n"),
  );
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (BOOLEAN_FALSE_VALUES.has(normalized)) {
    return false;
  }

  throw new Error(`无法解析布尔值: ${value}`);
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (!text) {
    return "";
  }
  if (!/^https?:\/\//i.test(text)) {
    throw new Error(`FEISHU_BASE_URL 格式无效: ${value}`);
  }
  return text;
}

function readOptionValue(args, index, currentArg, optionName) {
  const prefix = `${optionName}=`;
  if (currentArg.startsWith(prefix)) {
    return {
      value: currentArg.slice(prefix.length),
      nextIndex: index,
    };
  }

  if (index + 1 >= args.length) {
    throw new Error(`${optionName} 需要一个值`);
  }

  return {
    value: args[index + 1],
    nextIndex: index + 1,
  };
}

function parseArgs(argv) {
  const options = {
    wikiToken: process.env.FEISHU_WIKI_TOKEN || "",
    outputRoot: process.env.FEISHU_OUTPUT_ROOT || "",
    baseUrl: process.env.FEISHU_BASE_URL || "",
    includeSensitiveMetadata: parseBoolean(
      process.env.FEISHU_INCLUDE_SENSITIVE_METADATA,
      false,
    ),
    keepSensitivePlaceholders: parseBoolean(
      process.env.FEISHU_KEEP_SENSITIVE_PLACEHOLDERS,
      false,
    ),
    larkCliPath: process.env.LARK_CLI_PATH || DEFAULT_LARK_CLI,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    if (arg === "--help") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--include-sensitive-metadata") {
      options.includeSensitiveMetadata = true;
      continue;
    }
    if (arg.startsWith("--include-sensitive-metadata=")) {
      options.includeSensitiveMetadata = parseBoolean(
        arg.split("=", 2)[1],
        options.includeSensitiveMetadata,
      );
      continue;
    }

    if (arg === "--keep-sensitive-placeholders") {
      options.keepSensitivePlaceholders = true;
      continue;
    }
    if (arg.startsWith("--keep-sensitive-placeholders=")) {
      options.keepSensitivePlaceholders = parseBoolean(
        arg.split("=", 2)[1],
        options.keepSensitivePlaceholders,
      );
      continue;
    }

    if (
      arg === "--wiki-token" ||
      arg.startsWith("--wiki-token=") ||
      arg === "--output" ||
      arg.startsWith("--output=") ||
      arg === "--base-url" ||
      arg.startsWith("--base-url=") ||
      arg === "--lark-cli" ||
      arg.startsWith("--lark-cli=")
    ) {
      const optionName = arg.includes("=") ? arg.split("=", 1)[0] : arg;
      const { value, nextIndex } = readOptionValue(argv, i, arg, optionName);
      if (optionName === "--wiki-token") {
        options.wikiToken = value;
      } else if (optionName === "--output") {
        options.outputRoot = value;
      } else if (optionName === "--base-url") {
        options.baseUrl = value;
      } else if (optionName === "--lark-cli") {
        options.larkCliPath = value;
      }
      i = nextIndex;
      continue;
    }

    throw new Error(`未知参数: ${arg}`);
  }

  if (!options.wikiToken && positional[0]) {
    options.wikiToken = positional[0];
  }
  if (!options.outputRoot && positional[1]) {
    options.outputRoot = positional[1];
  }

  options.baseUrl = normalizeBaseUrl(options.baseUrl);

  if (!options.wikiToken) {
    printUsage();
    throw new Error("缺少 wiki token，请通过命令行参数或 FEISHU_WIKI_TOKEN 提供。");
  }
  if (!options.baseUrl) {
    printUsage();
    throw new Error("缺少 FEISHU_BASE_URL，请通过 --base-url 或环境变量提供租户域名。");
  }

  if (!options.outputRoot) {
    options.outputRoot = path.join(
      process.cwd(),
      "exports",
      "feishu-wiki",
    );
  }

  return {
    ...options,
    wikiToken: String(options.wikiToken).trim(),
    outputRoot: path.resolve(options.outputRoot),
    larkCliPath: path.resolve(options.larkCliPath),
  };
}

const CONFIG = parseArgs(process.argv.slice(2));
const ROOT_TOKEN = CONFIG.wikiToken;
const OUTPUT_ROOT = CONFIG.outputRoot;
const BASE_URL = CONFIG.baseUrl;
const LARK_CLI = CONFIG.larkCliPath;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

function toCliRelativePath(filePath) {
  const relative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  if (!relative || relative.startsWith("..")) {
    throw new Error(`飞书 CLI 输出路径必须位于当前目录下: ${filePath}`);
  }
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function sanitizeSegment(name) {
  const cleaned = (name || "untitled")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
  return cleaned || "untitled";
}

function tokenFileSuffix(token) {
  const text = String(token || "").trim();
  if (!text) {
    return "unknown";
  }
  if (CONFIG.includeSensitiveMetadata) {
    return text.slice(0, 8);
  }
  return crypto.createHash("md5").update(text).digest("hex").slice(0, 12);
}

function buildTenantUrl(kind, token) {
  return `${BASE_URL}/${kind}/${token}`;
}

function buildWikiUrl(token) {
  return buildTenantUrl("wiki", token);
}

function buildDocUrl(token) {
  return buildTenantUrl("docx", token);
}

function buildWhiteboardUrl(token) {
  return buildTenantUrl("whiteboard", token);
}

function getReferenceLabel(type) {
  return type === "wiki" ? "飞书知识库链接" : "飞书文档链接";
}

function formatMentionReference(token, type, label) {
  const cleanLabel = stripInlineTags(label).trim() || (
    CONFIG.includeSensitiveMetadata ? token : getReferenceLabel(type)
  );
  if (!CONFIG.includeSensitiveMetadata) {
    return cleanLabel;
  }

  const href = type === "wiki" ? buildWikiUrl(token) : buildDocUrl(token);
  return `[${cleanLabel}](${href})`;
}

function formatImageFallback(token) {
  if (CONFIG.keepSensitivePlaceholders) {
    return `\n\n[图片资源 token: ${token}]\n\n`;
  }
  return "\n\n[图片资源未导出]\n\n";
}

function formatEmbeddedSheetFallback(token) {
  if (CONFIG.keepSensitivePlaceholders) {
    return `\n\n[嵌入表格 token: ${token}]\n\n`;
  }
  return "\n\n[嵌入表格未导出]\n\n";
}

function formatWhiteboardFallback(token) {
  if (CONFIG.keepSensitivePlaceholders) {
    return `\n\n[白板: ${token}](${buildWhiteboardUrl(token)})\n\n`;
  }
  return "\n\n[白板内容未导出]\n\n";
}

function buildMetadata(node) {
  const metadata = {
    title: node.title,
    node_type: node.node_type,
    obj_type: node.obj_type,
    has_child: !!node.has_child,
  };

  if (CONFIG.includeSensitiveMetadata) {
    metadata.node_token = node.node_token;
    metadata.obj_token = node.obj_token;
    metadata.space_id = node.space_id;
    metadata.parent_node_token = node.parent_node_token || null;
    metadata.source_url = buildWikiUrl(node.node_token);
  } else {
    metadata.sensitive_fields_redacted = true;
  }

  return metadata;
}

function runLark(rawArgs, options = {}) {
  const result = spawnSync("node", [LARK_CLI, ...rawArgs], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    cwd: process.cwd(),
  });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const combined = [stdout, stderr].filter(Boolean).join("\n");

  const jsonText = extractJson(combined);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      if (result.status === 0) {
        return parsed;
      }
      if (options.allowFailure) {
        return parsed;
      }
      throw new Error(JSON.stringify(parsed, null, 2));
    } catch (error) {
      if (!options.allowFailure) {
        throw new Error(`无法解析 lark-cli 输出: ${combined}`);
      }
    }
  }

  if (result.status === 0) {
    return combined.trim();
  }

  if (options.allowFailure) {
    return {
      ok: false,
      error: {
        type: "process_error",
        message: combined.trim() || `exit code ${result.status}`,
      },
    };
  }

  throw new Error(combined.trim() || `lark-cli 执行失败: ${result.status}`);
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function getNode(token) {
  return runLark([
    "wiki",
    "spaces",
    "get_node",
    "--params",
    JSON.stringify({ token }),
    "--as",
    "user",
    "--format",
    "json",
  ]);
}

function listChildren(spaceId, parentNodeToken) {
  const result = runLark([
    "wiki",
    "nodes",
    "list",
    "--params",
    JSON.stringify({
      space_id: spaceId,
      parent_node_token: parentNodeToken,
      page_size: 50,
    }),
    "--as",
    "user",
    "--format",
    "json",
  ]);
  return result.data?.items || [];
}

function fetchDocMarkdown(nodeToken) {
  const result = runLark([
    "docs",
    "+fetch",
    "--doc",
    buildWikiUrl(nodeToken),
    "--as",
    "user",
    "--format",
    "json",
  ]);
  return {
    title: result.data?.title || "",
    markdown: result.data?.markdown || "",
    raw: result,
  };
}

function queryWhiteboard(token, outputAs) {
  const result = runLark(
    [
      "whiteboard",
      "+query",
      "--whiteboard-token",
      token,
      "--output_as",
      outputAs,
      "--as",
      "user",
      "--format",
      "json",
    ],
    { allowFailure: true },
  );

  if (result && result.ok === false) {
    return null;
  }

  return result || null;
}

function getWhiteboardExport(token) {
  const codeResult = queryWhiteboard(token, "code");
  const codeText =
    typeof codeResult === "string"
      ? codeResult.trim()
      : typeof codeResult?.data?.code === "string"
        ? codeResult.data.code.trim()
        : "";
  if (codeText) {
    return {
      mode: "code",
      code: codeText,
    };
  }

  const rawResult = queryWhiteboard(token, "raw");
  const nodes = Array.isArray(rawResult?.data?.nodes) ? rawResult.data.nodes : null;
  if (nodes && nodes.length) {
    return {
      mode: "raw",
      nodes,
    };
  }

  return null;
}

function downloadMedia(token, outputBasePath) {
  const cliOutputPath = toCliRelativePath(outputBasePath);
  const result = runLark(
    [
      "docs",
      "+media-download",
      "--token",
      token,
      "--output",
      cliOutputPath,
      "--overwrite",
      "--as",
      "user",
    ],
    { allowFailure: true },
  );

  if (result && result.ok === false) {
    return null;
  }

  const savedPath = result?.data?.saved_path || result?.saved_path || null;
  if (savedPath && fileExists(savedPath)) {
    return savedPath;
  }

  const parentDir = path.dirname(outputBasePath);
  const baseName = path.basename(outputBasePath);
  if (fileExists(outputBasePath)) {
    return outputBasePath;
  }
  const candidates = fs
    .readdirSync(parentDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(baseName))
    .map((entry) => path.join(parentDir, entry.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] || null;
}

function tryGetSheetInfo(nodeToken) {
  const result = runLark(
    [
      "sheets",
      "+info",
      "--url",
      buildWikiUrl(nodeToken),
      "--as",
      "user",
    ],
    { allowFailure: true },
  );
  return result;
}

function exportSheetCsvFromWikiNode(nodeToken, sheetId, outputPath) {
  const cliOutputPath = toCliRelativePath(outputPath);
  return runLark(
    [
      "sheets",
      "+export",
      "--url",
      buildWikiUrl(nodeToken),
      "--as",
      "user",
      "--file-extension",
      "csv",
      "--sheet-id",
      sheetId,
      "--output-path",
      cliOutputPath,
    ],
    { allowFailure: true },
  );
}

function exportSheetCsvFromSpreadsheetToken(spreadsheetToken, sheetId, outputPath) {
  const cliOutputPath = toCliRelativePath(outputPath);
  return runLark(
    [
      "sheets",
      "+export",
      "--spreadsheet-token",
      spreadsheetToken,
      "--as",
      "user",
      "--file-extension",
      "csv",
      "--sheet-id",
      sheetId,
      "--output-path",
      cliOutputPath,
    ],
    { allowFailure: true },
  );
}

function exportSheetXlsx(spreadsheetToken, outputPath) {
  const cliOutputPath = toCliRelativePath(outputPath);
  return runLark(
    [
      "sheets",
      "+export",
      "--spreadsheet-token",
      spreadsheetToken,
      "--as",
      "user",
      "--file-extension",
      "xlsx",
      "--output-path",
      cliOutputPath,
    ],
    { allowFailure: true },
  );
}

function convertXlsxToCsvs(xlsxPath, outputDir) {
  ensureDir(outputDir);
  const pythonCode = `
import csv, os, re, sys
from openpyxl import load_workbook

xlsx_path = sys.argv[1]
output_dir = sys.argv[2]
wb = load_workbook(xlsx_path, data_only=True)
for ws in wb.worksheets:
    safe = re.sub(r'[<>:"/\\\\|?*\\x00-\\x1f]', '_', ws.title).strip() or 'Sheet'
    out_path = os.path.join(output_dir, safe + '.csv')
    with open(out_path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        for row in ws.iter_rows(values_only=True):
            values = ["" if cell is None else str(cell) for cell in row]
            writer.writerow(values)
`;
  const result = spawnSync("py", ["-c", pythonCode, xlsxPath, outputDir], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    cwd: process.cwd(),
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "xlsx 转 csv 失败");
  }
  return fs
    .readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => path.join(outputDir, entry.name))
    .sort();
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
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function csvToMarkdownTable(csvText, maxRows = 8, maxCols = 8) {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => String(cell).trim() !== ""));
  if (!rows.length) {
    return "_CSV 为空_";
  }
  const normalized = rows
    .slice(0, maxRows)
    .map((row) => row.slice(0, maxCols).map((cell) => String(cell).replace(/\|/g, "\\|")));
  const colCount = Math.max(...normalized.map((row) => row.length));
  for (const row of normalized) {
    while (row.length < colCount) {
      row.push("");
    }
  }
  const header = normalized[0];
  const body = normalized.slice(1);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  for (const row of body) {
    lines.push(`| ${row.join(" | ")} |`);
  }
  if (rows.length > maxRows) {
    lines.push("");
    lines.push(`_预览仅展示前 ${maxRows} 行，完整数据见旁边 CSV 文件。_`);
  }
  return lines.join("\n");
}

function parseEmbeddedSheetToken(token) {
  const match = String(token || "").match(/^([A-Za-z0-9]{27})_([A-Za-z0-9]+)$/);
  if (!match) {
    return null;
  }
  return {
    spreadsheetToken: match[1],
    sheetId: match[2],
  };
}

function stripInlineTags(text) {
  return text
    .replace(/<text\b[^>]*>/g, "")
    .replace(/<\/text>/g, "")
    .replace(/<mention-doc\b[^>]*token="([^"]+)"[^>]*type="([^"]+)"[^>]*>([\s\S]*?)<\/mention-doc>/g, (_, token, type, label) => {
      return formatMentionReference(token, type, label);
    })
    .replace(/\s*\{align="[^"]+"\}/g, "")
    .replace(/&nbsp;| /g, " ")
    .trim();
}

function decodeRecordJson(recordValue) {
  try {
    return JSON.parse(recordValue.replace(/\\"/g, '"'));
  } catch (error) {
    return null;
  }
}

function unwrapNode(nodeOrWrapper) {
  if (nodeOrWrapper && nodeOrWrapper.data && nodeOrWrapper.data.node) {
    return nodeOrWrapper.data.node;
  }
  return nodeOrWrapper;
}

function toMermaidCodeBlock(code) {
  const normalized = String(code || "")
    .replace(/\r/g, "")
    .trimEnd();
  return `\`\`\`text\nmermaid\n${normalized}\n\`\`\``;
}

function summarizeWhiteboardNodes(nodes) {
  const typeCounts = new Map();
  const labels = [];

  for (const node of nodes || []) {
    const type = node?.type || "unknown";
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);

    const text = normalizeWhitespace(String(node?.text?.text || ""));
    if (text && !labels.includes(text)) {
      labels.push(text);
    }
  }

  const topTypes = Array.from(typeCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([type, count]) => `${type} x ${count}`);

  return {
    nodeCount: Array.isArray(nodes) ? nodes.length : 0,
    topTypes,
    labels: labels.slice(0, 8),
  };
}

function formatWhiteboardRawFallback(token, nodes, context, index) {
  const summary = summarizeWhiteboardNodes(nodes);
  const assetName = `whiteboard-${String(index).padStart(2, "0")}-${tokenFileSuffix(token)}.raw.json`;
  const assetPath = path.join(context.assetsDir, assetName);
  writeFile(assetPath, `${JSON.stringify({ nodes }, null, 2)}\n`);

  const relative = path.relative(context.nodeDir, assetPath).replace(/\\/g, "/");
  const lines = [];
  lines.push("> 白板未命中 code 导出，已自动回退为 raw 节点导出。");
  lines.push(`> 节点数: ${summary.nodeCount}`);
  if (summary.topTypes.length) {
    lines.push(`> 主要类型: ${summary.topTypes.join(", ")}`);
  }
  if (summary.labels.length) {
    lines.push(`> 可见文本: ${summary.labels.join(" / ")}`);
  }

  return `\n\n${lines.join("\n")}\n\n[白板原始节点 JSON](./${relative})\n\n`;
}

function convertLarkTable(tableContent) {
  const rows = [];
  const rowRegex = /<lark-tr>([\s\S]*?)<\/lark-tr>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tableContent))) {
    const cells = [];
    const cellRegex = /<lark-td\b[^>]*>([\s\S]*?)<\/lark-td>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const cellText = normalizeWhitespace(stripInlineTags(cellMatch[1]));
      cells.push(cellText);
    }
    if (cells.length) {
      rows.push(cells);
    }
  }

  if (!rows.length) {
    return tableContent;
  }

  const colCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => {
    const copy = [...row];
    while (copy.length < colCount) {
      copy.push("");
    }
    return copy;
  });

  const header = normalizedRows[0];
  const body = normalizedRows.slice(1);
  const lines = [];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);
  for (const row of body) {
    lines.push(`| ${row.join(" | ")} |`);
  }
  return lines.join("\n");
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeMarkdownOutsideCodeBlocks(text) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        return part;
      }
      return part
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
    })
    .join("")
    .trim();
}

function transformMarkdown(rawMarkdown, context = {}) {
  let markdown = rawMarkdown || "";
  const codepenLinks = [];
  const whiteboards = [];
  const assetsDir = context.assetsDir || path.join(process.cwd(), ".tmp");
  ensureDir(assetsDir);
  let imageIndex = 0;
  let embeddedSheetIndex = 0;
  let whiteboardIndex = 0;

  markdown = markdown.replace(
    /<mention-doc\b[^>]*token="([^"]+)"[^>]*type="([^"]+)"[^>]*>([\s\S]*?)<\/mention-doc>/g,
    (_, token, type, label) => {
      return formatMentionReference(token, type, label);
    },
  );

  markdown = markdown.replace(/<lark-table\b[^>]*>([\s\S]*?)<\/lark-table>/g, (_, tableInner) => {
    return `\n\n${convertLarkTable(tableInner)}\n\n`;
  });

  markdown = markdown.replace(
    /<add-ons\b[^>]*record="({[\s\S]*?})"[^>]*\/>/g,
    (_, recordValue) => {
      const record = decodeRecordJson(recordValue);
      if (!record || !record.data) {
        return "\n\n<!-- 未能解析飞书文本绘图 -->\n\n";
      }
      return `\n\n${toMermaidCodeBlock(record.data)}\n\n`;
    },
  );

  markdown = markdown.replace(
    /<iframe\b[^>]*url="([^"]+)"[^>]*\/>/g,
    (_, url) => {
      codepenLinks.push(url);
      return `\n\n[嵌入链接](${url})\n\n`;
    },
  );

  markdown = markdown.replace(
    /<whiteboard\b[^>]*token="([^"]+)"[^>]*\/?>[\s\S]*?(?:<\/whiteboard>)?/g,
    (_, token) => {
      whiteboardIndex += 1;
      const exported = getWhiteboardExport(token);
      if (exported?.mode === "code") {
        whiteboards.push({ token, mode: "code" });
        return `\n\n${toMermaidCodeBlock(exported.code)}\n\n`;
      }
      if (exported?.mode === "raw") {
        whiteboards.push({ token, mode: "raw", nodeCount: exported.nodes.length });
        return formatWhiteboardRawFallback(token, exported.nodes, context, whiteboardIndex);
      }
      return formatWhiteboardFallback(token);
    },
  );

  markdown = markdown.replace(
    /<image\b[^>]*token="([^"]+)"[^>]*\/>/g,
    (_, token) => {
      imageIndex += 1;
      const base = path.join(
        assetsDir,
        `image-${String(imageIndex).padStart(2, "0")}-${tokenFileSuffix(token)}`,
      );
      const savedPath = downloadMedia(token, base);
      if (!savedPath) {
        return formatImageFallback(token);
      }
      const relative = path.relative(context.nodeDir, savedPath).replace(/\\/g, "/");
      return `\n\n![图片 ${imageIndex}](${relative})\n\n`;
    },
  );

  markdown = markdown.replace(
    /<sheet\b[^>]*token="([^"]+)"[^>]*\/>/g,
    (_, token) => {
      embeddedSheetIndex += 1;
      const parsed = parseEmbeddedSheetToken(token);
      if (!parsed) {
        return formatEmbeddedSheetFallback(token);
      }
      const csvPath = path.join(
        assetsDir,
        `embedded-sheet-${String(embeddedSheetIndex).padStart(2, "0")}-${tokenFileSuffix(token)}.csv`,
      );
      const exported = exportSheetCsvFromSpreadsheetToken(
        parsed.spreadsheetToken,
        parsed.sheetId,
        csvPath,
      );
      if (exported && exported.ok === false) {
        return formatEmbeddedSheetFallback(token);
      }
      const csvText = fs.readFileSync(csvPath, "utf8");
      const relative = path.relative(context.nodeDir, csvPath).replace(/\\/g, "/");
      const preview = csvToMarkdownTable(csvText);
      return `\n\n[嵌入表格 CSV](./${relative})\n\n${preview}\n\n`;
    },
  );

  markdown = markdown.replace(/<text\b[^>]*>/g, "");
  markdown = markdown.replace(/<\/text>/g, "");
  markdown = markdown.replace(/\s*\{align="[^"]+"\}/g, "");
  markdown = markdown.replace(/&nbsp;| /g, " ");
  markdown = normalizeMarkdownOutsideCodeBlocks(markdown);

  return {
    markdown: `${markdown.trimEnd()}\n`,
    codepenLinks: Array.from(new Set(codepenLinks)),
    whiteboards,
  };
}

function relativeMarkdownLink(fromPath, toPath) {
  return path.relative(path.dirname(fromPath), toPath).replace(/\\/g, "/");
}

function buildTree(node, depth = 0) {
  const current = unwrapNode(node);
  const line = `${"  ".repeat(depth)}- ${current.title} [${current.obj_type}]`;
  const children = (current.children || []).flatMap((child) => buildTree(child, depth + 1));
  return [line, ...children];
}

function walkTree(nodeInfo) {
  const node = nodeInfo.data.node;
  const children = node.has_child ? listChildren(node.space_id, node.node_token) : [];
  node.children = children.map((child) => {
    if (child.has_child) {
      const childNode = getNode(child.node_token);
      return walkTree(childNode);
    }
    return { data: { node: child } };
  });
  return nodeInfo;
}

function exportNode(node, parentDir, collected) {
  const safeTitle = sanitizeSegment(node.title);
  const folderName = safeTitle;
  const nodeDir = path.join(parentDir, folderName);
  ensureDir(nodeDir);

  const assetsDir = path.join(nodeDir, `${safeTitle}.assets`);
  ensureDir(assetsDir);
  const metadata = buildMetadata(node);
  writeFile(path.join(assetsDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);

  let indexLines = [];
  indexLines.push(`# ${node.title}`);
  indexLines.push("");
  indexLines.push(`- 节点类型: ${node.obj_type}`);
  if (CONFIG.includeSensitiveMetadata) {
    indexLines.push(`- 原始链接: ${buildWikiUrl(node.node_token)}`);
    indexLines.push(`- 飞书节点 Token: \`${node.node_token}\``);
  }
  indexLines.push("");

  if (node.obj_type === "docx" || node.obj_type === "doc") {
    const fetched = fetchDocMarkdown(node.node_token);
    const transformed = transformMarkdown(fetched.markdown, {
      nodeDir,
      assetsDir,
      node,
    });
    indexLines.push(transformed.markdown.trimEnd());
    indexLines.push("");

    if (transformed.codepenLinks.length) {
      indexLines.push("## CodePen Links");
      indexLines.push("");
      for (const link of transformed.codepenLinks) {
        indexLines.push(`- ${link}`);
        collected.codepen.push({
          title: node.title,
          url: link,
          node_token: node.node_token,
        });
      }
      indexLines.push("");
    }
  } else if (node.obj_type === "sheet") {
    const xlsxPath = path.join(nodeDir, `${sanitizeSegment(node.title)}.xlsx`);
    const workbookExport = exportSheetXlsx(node.obj_token, xlsxPath);
    if (workbookExport && workbookExport.ok === false) {
      indexLines.push(`- 当前状态: 未能读取表格内容`);
      indexLines.push(`- 原因: ${workbookExport.error?.message || "未知错误"}`);
      indexLines.push("");
      indexLines.push("> 需要检查该表格 token 是否可导出。");
      indexLines.push("");
    } else {
      const csvOutputDir = path.join(nodeDir, "csv");
      const csvFiles = convertXlsxToCsvs(xlsxPath, csvOutputDir);
      indexLines.push("## 表格导出");
      indexLines.push("");
      if (CONFIG.includeSensitiveMetadata) {
        indexLines.push(`- Wiki 链接: ${buildWikiUrl(node.node_token)}`);
      }
      indexLines.push(`- 已导出工作簿: [${path.basename(xlsxPath)}](./${path.basename(xlsxPath)})`);
      indexLines.push(`- 工作表数量: ${csvFiles.length}`);
      indexLines.push("");
      indexLines.push("### 工作表");
      indexLines.push("");
      for (const csvFile of csvFiles) {
        const csvName = path.basename(csvFile);
        const csvRelative = path.relative(nodeDir, csvFile).replace(/\\/g, "/");
        const csvText = fs.readFileSync(csvFile, "utf8");
        const previewName = csvName.replace(/\.csv$/i, ".preview.md");
        const previewPath = path.join(nodeDir, previewName);
        const previewContent = [
          `# ${csvName}`,
          "",
          `- CSV 文件: [${csvName}](./${csvRelative})`,
          "",
          "## 预览",
          "",
          csvToMarkdownTable(csvText, 20, 12),
          "",
        ].join("\n");
        writeFile(previewPath, `${previewContent}\n`);
        indexLines.push(`- [${csvName}](./${csvRelative})`);
        indexLines.push(`- [${previewName}](./${previewName})`);
        indexLines.push("");
        indexLines.push(csvToMarkdownTable(csvText, 6, 8));
        indexLines.push("");
      }
      const readmePath = path.join(nodeDir, "README.md");
      writeFile(readmePath, `${indexLines.join("\n").trimEnd()}\n`);
    }
  } else {
    indexLines.push("> 当前脚本未对该对象类型做正文导出，保留了来源链接和元数据。");
    indexLines.push("");
  }

  if (node.children && node.children.length) {
    indexLines.push("## 子节点");
    indexLines.push("");
    for (const child of node.children) {
      const childNode = unwrapNode(child);
      const childSafeTitle = sanitizeSegment(childNode.title);
      const childFolder = childSafeTitle;
      indexLines.push(`- [${childNode.title}](./${childFolder}/${childSafeTitle}.md)`);
    }
    indexLines.push("");
  }

  writeFile(path.join(nodeDir, `${safeTitle}.md`), `${indexLines.join("\n").trimEnd()}\n`);
  if (node.obj_type === "sheet") {
    writeFile(path.join(nodeDir, "README.md"), `${indexLines.join("\n").trimEnd()}\n`);
  }

  if (node.children) {
    for (const child of node.children) {
      const childNode = unwrapNode(child);
      exportNode(childNode, nodeDir, collected);
    }
  }

  return nodeDir;
}

function main() {
  if (!fs.existsSync(LARK_CLI)) {
    throw new Error(`未找到 lark-cli: ${LARK_CLI}`);
  }

  ensureDir(OUTPUT_ROOT);
  const rootNodeInfo = walkTree(getNode(ROOT_TOKEN));
  const rootNode = rootNodeInfo.data.node;
  const collected = { codepen: [] };
  const rootExportDir = exportNode(rootNode, OUTPUT_ROOT, collected);

  const treeLines = buildTree(rootNode);
  writeFile(path.join(OUTPUT_ROOT, "tree.txt"), `${treeLines.join("\n")}\n`);

  const codepenLines = ["# CodePen Links", ""];
  if (collected.codepen.length) {
    for (const item of collected.codepen) {
      codepenLines.push(`- ${item.title}: ${item.url}`);
    }
  } else {
    codepenLines.push("当前没有发现 CodePen 链接。");
  }
  codepenLines.push("");
  writeFile(path.join(OUTPUT_ROOT, "codepen-links.md"), codepenLines.join("\n"));

  const readmePath = path.join(OUTPUT_ROOT, "README.md");
  const readmeLines = [
    "# Feishu Wiki Export",
    "",
    `- 根节点: ${rootNode.title}`,
    `- 导出时间: ${new Date().toISOString()}`,
    "",
    "## 目录树",
    "",
    "```text",
    ...treeLines,
    "```",
    "",
    "## 入口",
    "",
    `- [根节点导出](./${path.relative(OUTPUT_ROOT, path.join(rootExportDir, `${sanitizeSegment(rootNode.title)}.md`)).replace(/\\/g, "/")})`,
    `- [CodePen 汇总](./${path.basename(path.join(OUTPUT_ROOT, "codepen-links.md"))})`,
    "",
  ];
  if (CONFIG.includeSensitiveMetadata) {
    readmeLines.splice(3, 0, `- 根目录链接: ${buildWikiUrl(ROOT_TOKEN)}`);
  }
  writeFile(readmePath, readmeLines.join("\n"));
}

try {
  main();
  console.log(`导出完成: ${OUTPUT_ROOT}`);
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
}
