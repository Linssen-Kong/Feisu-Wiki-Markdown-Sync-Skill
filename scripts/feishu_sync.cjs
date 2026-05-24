const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const MANIFEST_VERSION = 1;
const TEXT_EXTENSIONS = new Set([".md", ".xml", ".json", ".csv", ".mmd"]);
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
const SCRIPT_DIR = __dirname;

function printUsage() {
  console.error(
    [
      "用法:",
      "  node scripts/feishu_sync.cjs status --root <export_root>",
      "  node scripts/feishu_sync.cjs plan --root <export_root>",
      "  node scripts/feishu_sync.cjs pull --wiki-token <token> --base-url <url> [--root <export_root>]",
      "  node scripts/feishu_sync.cjs push --root <export_root> [--apply]",
      "",
      "说明:",
      "  - Git commit 不属于同步流程；本脚本只更新/检查本地工作区。",
      "  - push 默认只生成计划；传 --apply 才调用底层回写脚本。",
      "  - pull 可传 --include-sensitive-metadata，把可写绑定信息写入本地验证目录。",
      "  - Sheet CSV 数据默认可写回；样式/图片/筛选器写回需使用 import_feishu_sheet.cjs 的显式格式参数。",
      "  - 双边变化或无法证明安全的三方合并会生成 .tmp/sync-conflict-*.md。",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  if (!argv.length || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    process.exit(0);
  }
  const command = argv[0] || "status";
  const options = {
    command,
    root: process.env.FEISHU_OUTPUT_ROOT || path.join(process.cwd(), "exports", "feishu-wiki"),
    wikiToken: process.env.FEISHU_WIKI_TOKEN || "",
    baseUrl: process.env.FEISHU_BASE_URL || "",
    apply: false,
    includeSensitiveMetadata: false,
    includeSheetFormat: false,
  };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--include-sensitive-metadata") {
      options.includeSensitiveMetadata = true;
      continue;
    }
    if (arg === "--include-sheet-format") {
      options.includeSheetFormat = true;
      continue;
    }
    const readValue = (name) => {
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
      if (i + 1 >= argv.length) throw new Error(`${name} 需要一个值`);
      i += 1;
      return argv[i];
    };
    if (arg === "--root" || arg.startsWith("--root=")) {
      options.root = readValue("--root");
    } else if (arg === "--wiki-token" || arg.startsWith("--wiki-token=")) {
      options.wikiToken = readValue("--wiki-token");
    } else if (arg === "--base-url" || arg.startsWith("--base-url=")) {
      options.baseUrl = readValue("--base-url");
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return {
    ...options,
    root: path.resolve(options.root),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function walk(dir, files = []) {
  if (!fileExists(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === ".feishu-sync" ||
        entry.name === ".git" ||
        entry.name === ".tmp" ||
        entry.name === "node_modules"
      ) {
        continue;
      }
      walk(fullPath, files);
    } else {
      if (entry.name === "roundtrip-audit.md") {
        continue;
      }
      files.push(fullPath);
    }
  }
  return files;
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function manifestPath(root) {
  return path.join(root, ".feishu-sync", "manifest.json");
}

function loadManifest(root) {
  return readJson(manifestPath(root), {
    version: MANIFEST_VERSION,
    root,
    updatedAt: null,
    files: {},
    objects: {},
  });
}

function saveManifest(root, manifest) {
  ensureDir(path.dirname(manifestPath(root)));
  fs.writeFileSync(
    manifestPath(root),
    `${JSON.stringify({ ...manifest, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

function classifyFile(filePath) {
  const name = path.basename(filePath);
  if (name === "metadata.json") return "metadata";
  if (name === "format-map.json") return "format-map";
  if (name === "sheet-format.json") return "sheet-format";
  if (/\.format\.xml$/i.test(name)) return "doc-format";
  if (/\.preview\.md$/i.test(name)) return "preview";
  if (/\.raw\.json$/i.test(name)) return "raw";
  if (/\.csv$/i.test(name)) return "sheet-data";
  if (/\.md$/i.test(name)) return "editable";
  return "asset";
}

function scanWorkspace(root) {
  const files = {};
  for (const filePath of walk(root)) {
    const relative = rel(root, filePath);
    if (relative.startsWith(".feishu-sync/")) continue;
    files[relative] = {
      path: relative,
      hash: sha256File(filePath),
      size: fs.statSync(filePath).size,
      kind: classifyFile(filePath),
    };
  }
  return files;
}

function buildManifestFromWorkspace(root) {
  const files = scanWorkspace(root);
  const objects = {};
  for (const [relative, file] of Object.entries(files)) {
    if (path.basename(relative) !== "metadata.json") continue;
    const metadata = readJson(path.join(root, relative), null);
    if (!metadata) continue;
    const objectDir = path.dirname(path.dirname(relative));
    const formatMap = readJson(path.join(root, objectDir, `${path.basename(objectDir)}.assets`, "format-map.json"), null);
    const assetsDir = path.join(root, objectDir, `${path.basename(objectDir)}.assets`);
    const formatXmlName = fs.existsSync(assetsDir)
      ? fs.readdirSync(assetsDir).find((name) => /\.format\.xml$/i.test(name))
      : null;
    const sheetFormat = readJson(path.join(root, objectDir, "sheet-format.json"), null);
    objects[objectDir] = {
      title: metadata.title || path.basename(objectDir),
      objType: metadata.obj_type || "unknown",
      nodeType: metadata.node_type || null,
      objToken: metadata.obj_token || null,
      sourceUrl: metadata.source_url || null,
      lastRemoteRevision: formatMap?.revisionId || null,
      formatMap: formatMap ? path.join(objectDir, `${path.basename(objectDir)}.assets`, "format-map.json").replace(/\\/g, "/") : null,
      formatXml: formatXmlName ? path.join(objectDir, `${path.basename(objectDir)}.assets`, formatXmlName).replace(/\\/g, "/") : null,
      sheetFormat: sheetFormat ? path.join(objectDir, "sheet-format.json").replace(/\\/g, "/") : null,
      files: Object.keys(files).filter((candidate) => candidate.startsWith(`${objectDir}/`)),
    };
  }
  return {
    version: MANIFEST_VERSION,
    root,
    updatedAt: new Date().toISOString(),
    files,
    objects,
  };
}

function compareToManifest(root, manifest) {
  const current = scanWorkspace(root);
  const rows = [];
  const allPaths = new Set([...Object.keys(manifest.files || {}), ...Object.keys(current)]);
  for (const filePath of Array.from(allPaths).sort()) {
    const base = manifest.files?.[filePath] || null;
    const now = current[filePath] || null;
    let state = "clean";
    if (!base && now) state = "local-added";
    else if (base && !now) state = "local-deleted";
    else if (base.hash !== now.hash) state = "local-modified";
    rows.push({
      path: filePath,
      state,
      kind: now?.kind || base?.kind || "unknown",
    });
  }
  return rows;
}

function readabilityIssues(root) {
  const files = scanWorkspace(root);
  const issues = [];
  const exportMarkdownDirs = new Set(
    Object.keys(files)
      .filter((relative) => path.basename(relative) === "metadata.json")
      .map((relative) => path.dirname(path.dirname(relative))),
  );
  for (const [relative, file] of Object.entries(files)) {
    if (file.kind === "raw") {
      const preview = relative.replace(/\.raw\.json$/i, ".preview.md");
      if (!files[preview]) {
        issues.push({ path: relative, issue: "raw-only resource without preview" });
      }
    }
    if (file.kind === "editable" && !/\.preview\.md$/i.test(relative)) {
      const markdownDir = path.dirname(relative);
      if (![...exportMarkdownDirs].some((dir) => markdownDir === dir || markdownDir.startsWith(`${dir}/`))) {
        continue;
      }
      const text = fs.readFileSync(path.join(root, relative), "utf8");
      if (/<(add-ons|whiteboard|sheet|iframe)\b/i.test(text)) {
        issues.push({ path: relative, issue: "raw Feishu XML-like block remains in Markdown" });
      }
    }
  }
  return issues;
}

function writeConflictReport(root, title, items) {
  ensureDir(path.join(process.cwd(), ".tmp"));
  const reportPath = path.join(
    process.cwd(),
    ".tmp",
    `sync-conflict-${Date.now()}.md`,
  );
  const lines = [
    `# ${title}`,
    "",
    `- 时间: ${new Date().toISOString()}`,
    `- 同步目录: ${root}`,
    "",
    "## 冲突项",
    "",
  ];
  for (const item of items) {
    lines.push(`- \`${item.path}\`: ${item.reason}`);
  }
  lines.push("");
  lines.push("## 建议");
  lines.push("");
  lines.push("- 先 pull 到临时目录比对远端变化。");
  lines.push("- 人工合并 Markdown/CSV 与 format 文件后，再刷新 manifest。");
  lines.push("- 不要在存在 both-changed 状态时执行覆盖写回。");
  lines.push("");
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  return reportPath;
}

function runNodeScript(script, args, options = {}) {
  const scriptPath = path.join(SCRIPT_DIR, script);
  const result = spawnSync(NODE_BIN, [scriptPath, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    cwd: options.cwd || process.cwd(),
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${script} failed`);
  }
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

function pullExportContext(root) {
  const outputRoot = path.resolve(root);
  const cwd = path.dirname(outputRoot);
  const outputArg = path.basename(outputRoot);
  if (!outputArg || cwd === outputRoot) {
    return { cwd: process.cwd(), outputArg: outputRoot };
  }
  return { cwd, outputArg };
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}

function runLark(rawArgs) {
  const result = spawnSync(NODE_BIN, [process.env.LARK_CLI_PATH || DEFAULT_LARK_CLI, ...rawArgs], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    cwd: process.cwd(),
  });
  const combined = [result.stdout || "", result.stderr || ""].filter(Boolean).join("\n");
  const jsonText = extractJson(combined);
  if (jsonText) {
    const parsed = JSON.parse(jsonText);
    if (result.status === 0) return parsed;
    throw new Error(JSON.stringify(parsed, null, 2));
  }
  if (result.status !== 0) {
    throw new Error(combined.trim() || `lark-cli failed: ${result.status}`);
  }
  return combined.trim();
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractFormatAttrs(attrs) {
  const result = {};
  const attrRegex = /\b([a-zA-Z][\w-]*)="([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(attrs || ""))) {
    const key = match[1];
    if (key === "id") continue;
    if (
      /^(align|background-color|border-color|text-color|vertical-align|width|height|caption|type|view-type|done|seq|href|name|token|sheet-id)$/i.test(
        key,
      )
    ) {
      result[key] = match[2];
    }
  }
  return result;
}

function extractXmlBlocks(xml) {
  const blocks = [];
  const blockRegex = /<([a-zA-Z][\w-]*)([^>]*)\bid="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z][\w-]*)([^>]*)\bid="([^"]+)"([^>]*)\/>/g;
  let match;
  while ((match = blockRegex.exec(xml || ""))) {
    const tag = match[1] || match[6];
    const attrs = `${match[2] || ""}${match[4] || ""}${match[7] || ""}${match[9] || ""}`;
    const id = match[3] || match[8];
    const content = match[5] || "";
    blocks.push({
      id,
      tag,
      type: tag,
      textFingerprint: normalizeWhitespace(content.replace(/<[^>]+>/g, " ")).slice(0, 120),
      formatAttrs: extractFormatAttrs(attrs),
    });
  }
  return blocks;
}

function fetchRemoteDocRevision(target) {
  const result = runLark([
    "docs",
    "+fetch",
    "--api-version",
    "v2",
    "--doc",
    target,
    "--doc-format",
    "xml",
    "--detail",
    "full",
    "--as",
    "user",
    "--format",
    "json",
  ]);
  return result?.data?.document?.revision_id || result?.data?.revision_id || null;
}

function updateLocalFormatSnapshot(root, objectRef, formatXmlPath, compiledPath, updateResult) {
  fs.copyFileSync(compiledPath, formatXmlPath);
  if (!objectRef.object.formatMap) {
    return;
  }
  const formatMapPath = path.join(root, objectRef.object.formatMap);
  const formatMap = readJson(formatMapPath, null);
  if (!formatMap) {
    return;
  }
  const compiledXml = fs.readFileSync(compiledPath, "utf8");
  formatMap.revisionId = updateResult?.data?.document?.revision_id || formatMap.revisionId;
  formatMap.blocks = extractXmlBlocks(compiledXml);
  fs.writeFileSync(formatMapPath, `${JSON.stringify(formatMap, null, 2)}\n`, "utf8");
}

function findObjectForPath(manifest, filePath) {
  let best = null;
  for (const [objectDir, object] of Object.entries(manifest.objects || {})) {
    if (filePath.startsWith(`${objectDir}/`) && (!best || objectDir.length > best.objectDir.length)) {
      best = { objectDir, object };
    }
  }
  return best;
}

function isPrimaryMarkdown(root, relativePath) {
  if (path.extname(relativePath).toLowerCase() !== ".md") return false;
  if (/\.preview\.md$/i.test(relativePath)) return false;
  const dir = path.dirname(relativePath);
  const basename = path.basename(relativePath, ".md");
  return basename === path.basename(dir);
}

function resolveFormatXmlPath(root, objectRef) {
  if (objectRef.object.formatXml) {
    return path.join(root, objectRef.object.formatXml);
  }
  const assetsDir = path.join(root, objectRef.objectDir, `${path.basename(objectRef.objectDir)}.assets`);
  if (!fs.existsSync(assetsDir)) {
    return "";
  }
  const formatXmlName = fs.readdirSync(assetsDir).find((name) => /\.format\.xml$/i.test(name));
  return formatXmlName ? path.join(assetsDir, formatXmlName) : "";
}

function applyMarkdownPush(root, row, objectRef) {
  const target = objectRef.object.sourceUrl || objectRef.object.objToken;
  if (!target) {
    throw new Error(`缺少 ${row.path} 的 source_url/obj_token；需要用 --include-sensitive-metadata 重新 pull 建立可写绑定。`);
  }
  const formatMap = objectRef.object.formatMap
    ? readJson(path.join(root, objectRef.object.formatMap), null)
    : null;
  const richBlocks = (formatMap?.blocks || []).filter((block) =>
    ["callout", "grid", "table", "checkbox", "whiteboard", "sheet", "button", "time", "bookmark", "latex"].includes(block.type),
  );
  if (richBlocks.length) {
    const formatXmlPath = resolveFormatXmlPath(root, objectRef);
    if (!formatXmlPath) {
      throw new Error(`检测到富格式块(${richBlocks.map((block) => block.type).join(", ")})，但缺少 .assets/*.format.xml，无法合并 Markdown 正文和 XML 格式。`);
    }
    const compiledPath = path.join(
      root,
      ".tmp",
      `${path.basename(row.path, ".md")}.compiled.${Date.now()}.xml`,
    );
    runNodeScript("compile_feishu_doc_xml.cjs", [
      "--markdown",
      path.join(root, row.path),
      "--format-xml",
      formatXmlPath,
      "--out",
      compiledPath,
    ]);
    const relativeCompiledPath = path.relative(process.cwd(), compiledPath).replace(/\\/g, "/");
    const updateResult = runLark([
      "docs",
      "+update",
      "--api-version",
      "v2",
      "--doc",
      target,
      "--command",
      "overwrite",
      "--doc-format",
      "xml",
      "--content",
      `@${relativeCompiledPath}`,
      "--revision-id",
      String(objectRef.object.lastRemoteRevision || -1),
      "--as",
      "user",
    ]);
    updateLocalFormatSnapshot(root, objectRef, formatXmlPath, compiledPath, updateResult);
    return updateResult;
  }
  return runNodeScript("import_feishu_markdown.cjs", [
    path.join(root, row.path),
    target,
    objectRef.object.title || "",
  ]);
}

function checkRemoteBase(row, objectRef) {
  if (!["doc", "docx"].includes(objectRef.object.objType)) {
    return null;
  }
  const target = objectRef.object.sourceUrl || objectRef.object.objToken;
  if (!target || !objectRef.object.lastRemoteRevision) {
    return null;
  }
  const currentRevision = fetchRemoteDocRevision(target);
  if (
    currentRevision !== null &&
    String(currentRevision) !== String(objectRef.object.lastRemoteRevision)
  ) {
    return {
      path: row.path,
      reason: `远端 revision 已从 ${objectRef.object.lastRemoteRevision} 变为 ${currentRevision}，需要先 pull/merge。`,
    };
  }
  return null;
}

function applySheetPush(root, row, objectRef) {
  const sheetFormatPath = objectRef.object.sheetFormat
    ? path.join(root, objectRef.object.sheetFormat)
    : path.join(root, objectRef.objectDir, "sheet-format.json");
  const sheetFormat = readJson(sheetFormatPath, null);
  if (!sheetFormat) {
    throw new Error(`缺少 sheet-format.json，无法确定 ${row.path} 的 sheet id/range。`);
  }
  const sheet = (sheetFormat.sheets || []).find((item) => item.csv === path.relative(path.join(objectRef.objectDir), row.path).replace(/\\/g, "/") || row.path.endsWith(item.csv));
  if (!sheet?.sheetId || !sheet?.defaultRange) {
    throw new Error(`缺少 ${row.path} 的 sheetId/defaultRange。请重新 pull 生成 sheet-format.json。`);
  }
  const token = sheetFormat.spreadsheetToken || objectRef.object.objToken;
  if (!token) {
    throw new Error(`缺少 ${row.path} 的 spreadsheet token；需要用 --include-sensitive-metadata 重新 pull 建立可写绑定。`);
  }
  return runNodeScript("import_feishu_sheet.cjs", [
    "--spreadsheet-token",
    token,
    "--sheet-id",
    sheet.sheetId,
    "--range",
    sheet.defaultRange,
    "--input",
    path.join(root, row.path),
  ]);
}

function commandStatus(options) {
  const manifest = loadManifest(options.root);
  const rows = compareToManifest(options.root, manifest);
  const issues = readabilityIssues(options.root);
  const changed = rows.filter((row) => row.state !== "clean");
  console.log(JSON.stringify({ ok: true, root: options.root, changed, readabilityIssues: issues }, null, 2));
  return changed.length || issues.length ? 1 : 0;
}

function commandPlan(options) {
  const manifest = loadManifest(options.root);
  const rows = compareToManifest(options.root, manifest);
  const localChanges = rows.filter((row) => row.state !== "clean");
  const operations = localChanges.map((row) => ({
    action: row.kind === "sheet-data" ? "sheet-write-back-candidate" : "doc-or-asset-review",
    path: row.path,
    state: row.state,
  }));
  console.log(JSON.stringify({ ok: true, root: options.root, operations, readabilityIssues: readabilityIssues(options.root) }, null, 2));
}

function commandPull(options) {
  if (!options.wikiToken || !options.baseUrl) {
    throw new Error("pull 需要 --wiki-token 和 --base-url，或设置 FEISHU_WIKI_TOKEN/FEISHU_BASE_URL");
  }
  const exportContext = pullExportContext(options.root);
  ensureDir(exportContext.cwd);
  runNodeScript("export_feishu_wiki.cjs", [
    options.wikiToken,
    exportContext.outputArg,
    "--base-url",
    options.baseUrl,
    ...(options.includeSensitiveMetadata ? ["--include-sensitive-metadata"] : []),
  ], { cwd: exportContext.cwd });
  const manifest = buildManifestFromWorkspace(options.root);
  manifest.lastSyncDirection = "pull";
  saveManifest(options.root, manifest);
  console.log(JSON.stringify({ ok: true, action: "pull", root: options.root, files: Object.keys(manifest.files).length }, null, 2));
}

function commandPush(options) {
  const manifest = loadManifest(options.root);
  const rows = compareToManifest(options.root, manifest);
  const localChanges = rows.filter((row) => row.state !== "clean");
  const risky = localChanges.filter((row) => ["raw", "doc-format", "format-map", "sheet-format"].includes(row.kind));
  if (risky.length) {
    const report = writeConflictReport(
      options.root,
      "Feishu Sync Format Conflict",
      risky.map((row) => ({
        path: row.path,
        reason: "格式保真层被本地修改，需要人工确认后再写回。",
      })),
    );
    throw new Error(`检测到格式层冲突，已生成报告: ${report}`);
  }
  if (!options.apply) {
    console.log(JSON.stringify({ ok: true, dryRun: true, localChanges, hint: "pass --apply to run write-back where supported" }, null, 2));
    return;
  }
  const applied = [];
  const blocked = [];
  for (const row of localChanges) {
    const objectRef = findObjectForPath(manifest, row.path);
    if (!objectRef) {
      blocked.push({ path: row.path, reason: "无法匹配到 manifest object" });
      continue;
    }
    const remoteConflict = checkRemoteBase(row, objectRef);
    if (remoteConflict) {
      blocked.push(remoteConflict);
      continue;
    }
    try {
      if (row.kind === "sheet-data") {
        applied.push({ path: row.path, result: applySheetPush(options.root, row, objectRef) });
      } else if (isPrimaryMarkdown(options.root, row.path)) {
        applied.push({ path: row.path, result: applyMarkdownPush(options.root, row, objectRef) });
      } else {
        blocked.push({ path: row.path, reason: `暂不支持自动写回 ${row.kind}` });
      }
    } catch (error) {
      blocked.push({ path: row.path, reason: error.message || String(error) });
    }
  }
  if (blocked.length) {
    const report = writeConflictReport(options.root, "Feishu Sync Push Blocked", blocked);
    throw new Error(`部分文件未能安全写回，已生成报告: ${report}`);
  }
  const refreshed = buildManifestFromWorkspace(options.root);
  refreshed.lastSyncDirection = "push";
  saveManifest(options.root, refreshed);
  console.log(JSON.stringify({ ok: true, applied: applied.map((item) => item.path) }, null, 2));
}

function commandRefresh(options) {
  const manifest = buildManifestFromWorkspace(options.root);
  manifest.lastSyncDirection = "refresh";
  saveManifest(options.root, manifest);
  console.log(JSON.stringify({ ok: true, action: "refresh", root: options.root, files: Object.keys(manifest.files).length }, null, 2));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "status") {
    process.exitCode = commandStatus(options);
  } else if (options.command === "plan") {
    commandPlan(options);
  } else if (options.command === "pull") {
    commandPull(options);
  } else if (options.command === "push") {
    commandPush(options);
  } else if (options.command === "refresh") {
    commandRefresh(options);
  } else {
    printUsage();
    throw new Error(`未知命令: ${options.command}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
}
