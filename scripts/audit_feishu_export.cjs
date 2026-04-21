const fs = require("fs");
const path = require("path");

function printUsage() {
  console.error(
    [
      "用法:",
      "  node scripts/audit_feishu_export.cjs <export_root>",
      "",
      "可用环境变量:",
      "  FEISHU_EXPORT_ROOT",
    ].join("\n"),
  );
}

const exportRootArg = process.argv[2] || process.env.FEISHU_EXPORT_ROOT || "";
if (!exportRootArg || exportRootArg === "--help") {
  printUsage();
  if (!exportRootArg || exportRootArg === "--help") {
    process.exit(exportRootArg === "--help" ? 0 : 1);
  }
}

const exportRoot = path.resolve(exportRootArg);

function walk(dir, fileList = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function rel(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

function analyzeMarkdown(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return {
    filePath,
    imagePlaceholders: countMatches(text, /\[图片资源(?: token: [^\]]+|未导出)\]/g),
    localImages: countMatches(text, /!\[[^\]]*\]\((?!https?:\/\/)[^)]+\)/g),
    embeddedSheetPlaceholders: countMatches(text, /\[嵌入表格(?: token: [^\]]+|未导出)\]/g),
    embeddedSheetCsvLinks: countMatches(text, /\[嵌入表格 CSV\]\((?!https?:\/\/)[^)]+\)/g),
    whiteboardLinkPlaceholders: countMatches(
      text,
      /\[白板(?:内容未导出|: [^\]]+)\](?:\([^)]+\))?/g,
    ),
    codepenLinks: countMatches(
      text,
      /\[嵌入链接\]\((https?:\/\/(?:www\.)?codepen\.io\/[^)\s]+)\)/g,
    ),
    rawMermaidFences: countMatches(text, /```mermaid/g),
    normalizedMermaidBlocks: countMatches(text, /```text\r?\nmermaid/g),
    larkTables: countMatches(text, /<lark-table\b/g),
    unresolvedAddons: countMatches(text, /<add-ons\b/g),
    unresolvedWhiteboards: countMatches(text, /<whiteboard\b/g),
  };
}

function analyzeSheetDirs(allFiles) {
  const metadataFiles = allFiles.filter((file) => path.basename(file) === "metadata.json");
  const results = [];

  for (const metadataFile of metadataFiles) {
    const raw = fs.readFileSync(metadataFile, "utf8");
    let metadata;
    try {
      metadata = JSON.parse(raw);
    } catch (error) {
      continue;
    }
    if (metadata.obj_type !== "sheet") {
      continue;
    }

    const metadataDir = path.dirname(metadataFile);
    const dir = path.basename(metadataDir).endsWith(".assets")
      ? path.dirname(metadataDir)
      : metadataDir;
    const csvFiles = walk(dir)
      .filter((file) => file.toLowerCase().endsWith(".csv"))
      .map((file) => path.relative(dir, file).replace(/\\/g, "/"));

    results.push({
      dir,
      title: metadata.title,
      csvFiles,
    });
  }

  return results;
}

function buildReport(markdownResults, sheetResults) {
  const imageRiskFiles = markdownResults.filter((item) => item.imagePlaceholders > 0);
  const localizedImageFiles = markdownResults.filter((item) => item.localImages > 0);
  const embeddedSheetFiles = markdownResults.filter(
    (item) => item.embeddedSheetPlaceholders > 0,
  );
  const expandedEmbeddedSheetFiles = markdownResults.filter(
    (item) => item.embeddedSheetCsvLinks > 0,
  );
  const whiteboardLinkFiles = markdownResults.filter(
    (item) => item.whiteboardLinkPlaceholders > 0,
  );
  const unresolvedAddonFiles = markdownResults.filter(
    (item) => item.unresolvedAddons > 0,
  );
  const rawMermaidFiles = markdownResults.filter((item) => item.rawMermaidFences > 0);
  const codepenFiles = markdownResults.filter((item) => item.codepenLinks > 0);
  const sheetDirsWithoutCsv = sheetResults.filter((item) => item.csvFiles.length === 0);

  const lines = [];
  lines.push("# Feishu Export Roundtrip Audit");
  lines.push("");
  lines.push(`- 审计时间: ${new Date().toISOString()}`);
  lines.push(`- 审计目录: \`${rel(exportRoot)}\``);
  lines.push(`- Markdown 文件数: ${markdownResults.length}`);
  lines.push(`- Sheet 节点数: ${sheetResults.length}`);
  lines.push("");
  lines.push("## 总结");
  lines.push("");
  lines.push(
    `- 可直接保真的块: 普通 Markdown 文本/标题/列表、CodePen 链接、绝大多数 \`<lark-table>\`。`,
  );
  lines.push(
    `- 自动降级保真的块: Mermaid 当前建议按普通代码块保存，不再尝试回导为文本绘图组件。`,
  );
  lines.push(
    `- 已经本地化的块: ${localizedImageFiles.length} 个文档含正文内联图片，${expandedEmbeddedSheetFiles.length} 个文档含嵌入表格 CSV 展开。`,
  );
  lines.push(
    `- 当前仍会丢失或无法自动回导的块: 仍残留的图片 token 占位、仍未展开的嵌入表格 token、未导出的 sheet 节点。图片回导已可通过底层 docx block API 原位插图。`,
  );
  lines.push("");
  lines.push("## 必须修订");
  lines.push("");

  if (!imageRiskFiles.length && !embeddedSheetFiles.length && !sheetDirsWithoutCsv.length) {
    lines.push("- 当前未发现必须修订项。");
  } else {
    for (const item of imageRiskFiles) {
      lines.push(
        `- [${path.basename(path.dirname(item.filePath))}/index.md](${rel(item.filePath)}): 含 ${item.imagePlaceholders} 个图片 token 占位，当前回导脚本不会恢复图片。`,
      );
    }
    for (const item of embeddedSheetFiles) {
      lines.push(
        `- [${path.basename(path.dirname(item.filePath))}/index.md](${rel(item.filePath)}): 含 ${item.embeddedSheetPlaceholders} 个嵌入表格 token 占位，当前回导脚本不会恢复内嵌 sheet。`,
      );
    }
    for (const item of sheetDirsWithoutCsv) {
      lines.push(
        `- [${path.basename(item.dir)}](${rel(item.dir)}): 这是一个 sheet 节点，但目录下没有任何 CSV 导出文件；需要补开导出权限后重新导出。`,
      );
    }
  }

  lines.push("");
  lines.push("## 建议修订");
  lines.push("");
  if (!whiteboardLinkFiles.length && !unresolvedAddonFiles.length && !localizedImageFiles.length) {
    lines.push("- 当前未发现建议修订项。");
  } else {
    for (const item of whiteboardLinkFiles) {
      lines.push(
        `- [${path.basename(path.dirname(item.filePath))}/index.md](${rel(item.filePath)}): 含 ${item.whiteboardLinkPlaceholders} 个白板链接占位，建议改存为普通代码块或补抓取代码。`,
      );
    }
    for (const item of unresolvedAddonFiles) {
      lines.push(
        `- [${path.basename(path.dirname(item.filePath))}/index.md](${rel(item.filePath)}): 仍残留 ${item.unresolvedAddons} 个 add-ons 块；当前飞书 CLI 回导会跳过。`,
      );
    }
    for (const item of localizedImageFiles) {
      lines.push(
        `- [${path.basename(path.dirname(item.filePath))}/index.md](${rel(item.filePath)}): 已有 ${item.localImages} 张正文内联图片；如需回导到飞书，现已支持通过底层 docx block API 原位插图。`,
      );
    }
  }

  lines.push("");
  lines.push("## 自动处理");
  lines.push("");
  if (!rawMermaidFiles.length && !codepenFiles.length && !expandedEmbeddedSheetFiles.length) {
    lines.push("- 当前没有命中自动处理项。");
  } else {
    for (const item of rawMermaidFiles) {
      lines.push(
        `- [${path.basename(path.dirname(item.filePath))}/index.md](${rel(item.filePath)}): 含 ${item.rawMermaidFences} 个 \`\`\`mermaid 代码块；导入脚本会自动转成普通代码块，不需要手工改。`,
      );
    }
    for (const item of codepenFiles) {
      lines.push(
        `- [${path.basename(path.dirname(item.filePath))}/index.md](${rel(item.filePath)}): 含 ${item.codepenLinks} 个 CodePen 链接；导入脚本会自动转成飞书 iframe。`,
      );
    }
    for (const item of expandedEmbeddedSheetFiles) {
      lines.push(
        `- [${path.basename(path.dirname(item.filePath))}/index.md](${rel(item.filePath)}): 含 ${item.embeddedSheetCsvLinks} 个嵌入表格 CSV；本地阅读可直接看表，不必再跳回飞书。`,
      );
    }
  }

  lines.push("");
  lines.push("## 保真矩阵");
  lines.push("");
  lines.push("| 块类型 | 导出表示 | 回导状态 | 说明 |");
  lines.push("| --- | --- | --- | --- |");
  lines.push("| 普通文本/标题/列表 | Markdown | 保真 | 可直接回导 |");
  lines.push("| Markdown 表格 | Markdown / lark-table | 大体保真 | 复杂表格建议人工抽检 |");
  lines.push("| Mermaid 图 | 普通代码块 | 保真为文本 | 不再尝试回导为文本绘图组件 |");
  lines.push("| CodePen | Markdown 链接 | 保真 | 导入脚本自动转 iframe |");
  lines.push("| 图片 | 本地图片文件 + Markdown 正文内联图片 | 保真 | 导出为正文内联图片，回导脚本已支持通过底层 docx block API 原位插图 |");
  lines.push("| 嵌入表格 | CSV 文件 + Markdown 预览表格 | 保真为数据 | 本地可直接阅读，回导时保留预览表格文本 |");
  lines.push("| sheet 节点 | xlsx + csv 目录 | 大体保真 | 本地完整保留，回导为文档时以文本/附件策略为主 |");
  lines.push("| add-ons 文本绘图 | 已转代码块 | 保真为文本 | 当前飞书 CLI 不支持回写 add-ons |");
  lines.push("");
  lines.push("## 后续建议");
  lines.push("");
  lines.push("- 对含大量图片的需求文档，回导前仍建议做一次抽样比对，确认图片与上下文位置一致。");
  lines.push("- 如需批量回导，建议先选一个小目录做试运行，再整批执行。");
  lines.push("");

  return lines.join("\n");
}

function main() {
  if (!fs.existsSync(exportRoot)) {
    throw new Error(`导出目录不存在: ${exportRoot}`);
  }

  const allFiles = walk(exportRoot);
  const markdownFiles = allFiles.filter(
    (file) =>
      path.extname(file).toLowerCase() === ".md" &&
      !file.endsWith("roundtrip-audit.md"),
  );
  const markdownResults = markdownFiles.map(analyzeMarkdown);
  const sheetResults = analyzeSheetDirs(allFiles);
  const report = buildReport(markdownResults, sheetResults);
  const reportPath = path.join(exportRoot, "roundtrip-audit.md");
  fs.writeFileSync(reportPath, `${report}\n`, "utf8");
  console.log(reportPath);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
}
