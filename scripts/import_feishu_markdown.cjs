const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SKILL_VERSION = "1.0.16";
const MIN_LARK_CLI_VERSION = "1.0.16";
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown"]);

const inputPath = process.argv[2];
const targetDoc = process.argv[3];
const titleArg = process.argv[4] || "";

if (!inputPath || !targetDoc) {
  console.error(
    "用法: node scripts/import_feishu_markdown.cjs <markdown文件> <目标doc/docx链接或token> [文档标题]",
  );
  process.exit(1);
}

const LARK_CLI = path.join(
  process.env.APPDATA || "",
  "npm",
  "node_modules",
  "@larksuite",
  "cli",
  "scripts",
  "run.js",
);

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

function ensureOk(result, label) {
  if (result && result.ok === false) {
    throw new Error(`${label}失败: ${result.error?.message || "未知错误"}`);
  }
  return result;
}

function escapeAttribute(value) {
  return String(value).replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toCliRelativePath(filePath) {
  const relative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  if (!relative || relative.startsWith("..")) {
    throw new Error(`飞书 CLI 文件路径必须位于当前目录下: ${filePath}`);
  }
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function parseSemver(versionText) {
  const match = String(versionText || "").match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return match.slice(1).map(Number);
}

function compareSemver(left, right) {
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const leftPart = left[i] || 0;
    const rightPart = right[i] || 0;
    if (leftPart > rightPart) {
      return 1;
    }
    if (leftPart < rightPart) {
      return -1;
    }
  }
  return 0;
}

function getLarkCliVersion() {
  const result = spawnSync("node", [LARK_CLI, "--version"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    cwd: process.cwd(),
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "无法获取 lark-cli 版本");
  }

  const version = String(result.stdout || result.stderr || "").trim();
  if (!version) {
    throw new Error("无法获取 lark-cli 版本");
  }
  return version;
}

function assertMinimumLarkCliVersion() {
  const currentVersion = getLarkCliVersion();
  const currentParts = parseSemver(currentVersion);
  const minParts = parseSemver(MIN_LARK_CLI_VERSION);

  if (!currentParts || !minParts) {
    throw new Error(
      `无法解析 lark-cli 版本。当前: ${currentVersion}，要求至少: ${MIN_LARK_CLI_VERSION}`,
    );
  }

  if (compareSemver(currentParts, minParts) < 0) {
    throw new Error(
      `当前 lark-cli 版本为 ${currentVersion}，该 skill v${SKILL_VERSION} 需要 >= ${MIN_LARK_CLI_VERSION}`,
    );
  }
}

function extractDocId(value) {
  const text = String(value || "").trim();
  const urlMatch = text.match(/\/docx\/([A-Za-z0-9]+)/i);
  if (urlMatch) {
    return urlMatch[1];
  }
  return text;
}

function resolveDocId(result, fallback) {
  return (
    result?.data?.doc_id ||
    result?.doc_id ||
    result?.data?.document_id ||
    result?.document_id ||
    extractDocId(fallback)
  );
}

function isLocalReference(target) {
  const value = String(target || "").trim();
  if (!value) {
    return false;
  }
  return !/^(https?:\/\/|mailto:)/i.test(value) && !value.startsWith("#");
}

function resolveLocalReference(target, inputDir) {
  if (!isLocalReference(target)) {
    return null;
  }
  return path.resolve(inputDir, target);
}

function isImagePath(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isMarkdownPath(filePath) {
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isCsvPath(filePath) {
  return path.extname(filePath).toLowerCase() === ".csv";
}

function isWhiteboardRawJsonPath(filePath) {
  return /\.raw\.json$/i.test(path.basename(filePath));
}

function convertCodePenLinks(markdown) {
  let output = markdown;

  output = output.replace(
    /^\s*## CodePen Links[\s\S]*$/m,
    "",
  );

  output = output.replace(
    /\[嵌入链接\]\((https?:\/\/(?:www\.)?codepen\.io\/[^)\s]+)\)/g,
    (_, url) => `<iframe url="${escapeAttribute(url)}" type="11"/>`,
  );

  output = output.replace(
    /\[([^\]]+)\]\((https?:\/\/(?:www\.)?codepen\.io\/[^)\s]+)\)/g,
    (_, label, url) => {
      if (label === "嵌入链接") {
        return `<iframe url="${escapeAttribute(url)}" type="11"/>`;
      }
      return `[${label}](${url})`;
    },
  );

  return output.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function normalizeMermaidCodeBlocks(markdown) {
  return markdown.replace(
    /```mermaid\r?\n([\s\S]*?)\r?\n```/g,
    (_, code) => `\`\`\`text\nmermaid\n${String(code).replace(/\r/g, "").trimEnd()}\n\`\`\``,
  );
}

function normalizeResidualLocalLinks(markdown) {
  return markdown.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (match, label, target) => {
      if (!isLocalReference(target)) {
        return match;
      }
      return `${label}: \`${target}\``;
    },
  );
}

function imagePlaceholderToken(index) {
  return `IMG_BLOCK_PLACEHOLDER_${String(index).padStart(2, "0")}`;
}

function filePlaceholderToken(index) {
  return `FILE_BLOCK_PLACEHOLDER_${String(index).padStart(2, "0")}`;
}

function extractAppendixImages(markdown, inputDir) {
  const output = {
    markdown,
    images: [],
  };

  const appendixMatch = markdown.match(/^## 附图[\s\S]*?(?=\n## CodePen Links|\n# |\n$)/m);
  if (appendixMatch) {
    const appendix = appendixMatch[0];
    const regex = /###\s+图片\s+(\d+)[\s\S]*?!\[[^\]]*\]\(([^)]+)\)/g;
    let match;
    while ((match = regex.exec(appendix))) {
      const index = Number(match[1]);
      const imagePath = match[2];
      output.images.push({
        index,
        alt: `图片 ${index}`,
        resolvedPath: path.resolve(inputDir, imagePath),
      });
    }
    output.markdown = markdown.replace(appendixMatch[0], "");
  }

  output.images.sort((a, b) => a.index - b.index);
  return output;
}

function replaceImagePlaceholders(markdown, images) {
  let output = markdown;
  output = output.replace(/<a id="doc-image-\d+-ref"><\/a>/g, "");
  output = output.replace(/<a id="doc-image-\d+"><\/a>/g, "");
  output = output.replace(/\[返回文中\]\(#doc-image-\d+-ref\)/g, "");

  for (const image of images) {
    output = output.replace(
      new RegExp(`\\[图片\\s+${image.index}（跳转文末查看）\\]\\(#doc-image-\\d+\\)`, "g"),
      `\n\n${image.placeholder}\n\n`,
    );
    output = output.replace(
      new RegExp(`<<IMG_PLACEHOLDER_${String(image.index).padStart(2, "0")}>>`, "g"),
      `\n\n${image.placeholder}\n\n`,
    );
    output = output.replace(
      new RegExp(`###\\s+图片\\s+${image.index}\\s*`, "g"),
      "",
    );
  }

  return output.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function extractLocalMedia(markdown, inputDir) {
  const appendix = extractAppendixImages(markdown, inputDir);
  const images = appendix.images.map((image) => ({
    ...image,
    kind: "image",
    placeholder: imagePlaceholderToken(image.index),
    order: image.index,
  }));
  const files = [];

  let nextImageIndex = images.reduce((max, image) => Math.max(max, image.index), 0);
  let nextFileIndex = 0;
  let nextOrder = images.reduce((max, image) => Math.max(max, image.order), 0);
  let output = appendix.markdown;

  output = output.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (match, alt, target) => {
      if (!isLocalReference(target)) {
        return match;
      }

      const resolvedPath = resolveLocalReference(target, inputDir);
      if (!resolvedPath || !fs.existsSync(resolvedPath) || !isImagePath(resolvedPath)) {
        return match;
      }

      nextImageIndex += 1;
      nextOrder += 1;
      const placeholder = imagePlaceholderToken(nextImageIndex);
      images.push({
        kind: "image",
        index: nextImageIndex,
        alt: alt || `图片 ${nextImageIndex}`,
        resolvedPath,
        placeholder,
        order: nextOrder,
      });
      return placeholder;
    },
  );

  output = output.replace(
    /^[ \t]*(?:[-*+]\s+)?\[([^\]]+)\]\(([^)]+)\)\s*$/gm,
    (match, label, target) => {
      if (!isLocalReference(target)) {
        return match;
      }

      const resolvedPath = resolveLocalReference(target, inputDir);
      if (!resolvedPath || !fs.existsSync(resolvedPath)) {
        return match;
      }
      if (isCsvPath(resolvedPath)) {
        return "";
      }
      if (
        isImagePath(resolvedPath) ||
        isMarkdownPath(resolvedPath) ||
        isWhiteboardRawJsonPath(resolvedPath)
      ) {
        return `${label}: \`${target}\``;
      }

      nextFileIndex += 1;
      nextOrder += 1;
      const placeholder = filePlaceholderToken(nextFileIndex);
      files.push({
        kind: "file",
        index: nextFileIndex,
        label,
        resolvedPath,
        placeholder,
        order: nextOrder,
      });
      return placeholder;
    },
  );

  output = replaceImagePlaceholders(output, images);
  output = normalizeResidualLocalLinks(output);
  output = output.replace(/\n{3,}/g, "\n\n").trim() + "\n";

  const media = [...images, ...files].sort((left, right) => left.order - right.order);
  return {
    markdown: output,
    images,
    files,
    media,
  };
}

function insertMediaAtPlaceholder(docId, media) {
  const args = [
    "docs",
    "+media-insert",
    "--doc",
    docId,
    "--file",
    toCliRelativePath(media.resolvedPath),
    "--selection-with-ellipsis",
    media.placeholder,
    "--as",
    "user",
  ];

  if (media.kind === "file") {
    args.push("--type", "file");
  }

  ensureOk(runLark(args), media.kind === "image" ? "插入图片" : "插入文件");

  ensureOk(
    runLark([
      "docs",
      "+update",
      "--doc",
      docId,
      "--mode",
      "delete_range",
      "--selection-with-ellipsis",
      media.placeholder,
      "--as",
      "user",
    ]),
    "删除媒体占位块",
  );
}

function insertMediaInPlace(docId, mediaItems) {
  for (const media of mediaItems) {
    if (!fs.existsSync(media.resolvedPath)) {
      continue;
    }
    insertMediaAtPlaceholder(docId, media);
  }
}

function removeFileQuietly(filePath) {
  if (!filePath) {
    return;
  }
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    // Best-effort cleanup only.
  }
}

function removeDirIfEmptyQuietly(dirPath) {
  if (!dirPath) {
    return;
  }
  try {
    if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length === 0) {
      fs.rmdirSync(dirPath);
    }
  } catch (error) {
    // Best-effort cleanup only.
  }
}

function main() {
  if (!fs.existsSync(LARK_CLI)) {
    throw new Error(`未找到 lark-cli: ${LARK_CLI}`);
  }

  assertMinimumLarkCliVersion();

  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`输入文件不存在: ${resolvedInput}`);
  }

  const rawMarkdown = fs.readFileSync(resolvedInput, "utf8");
  const inputDir = path.dirname(resolvedInput);
  const codepenConverted = convertCodePenLinks(rawMarkdown);
  const withNormalizedMermaid = normalizeMermaidCodeBlocks(codepenConverted);
  const extracted = extractLocalMedia(withNormalizedMermaid, inputDir);

  let tempPath = "";
  try {
    tempPath = path.join(
      process.cwd(),
      ".tmp",
      `import-${Date.now()}.md`,
    );
    const tempRelativePath = `.${path.sep}.tmp${path.sep}${path.basename(tempPath)}`;
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    fs.writeFileSync(tempPath, extracted.markdown, "utf8");

    const args = [
      "docs",
      "+update",
      "--doc",
      targetDoc,
      "--mode",
      "overwrite",
      "--markdown",
      `@${tempRelativePath}`,
      "--as",
      "user",
    ];

    if (titleArg) {
      args.splice(6, 0, "--new-title", titleArg);
    }

    const result = ensureOk(runLark(args), "回导正文");
    const docId = resolveDocId(result, targetDoc);

    insertMediaInPlace(docId, extracted.media);

    console.log(JSON.stringify(result, null, 2));
    console.log(`\n已回导: ${resolvedInput}`);
    console.log(`目标文档: ${targetDoc}`);
    console.log(`文档 ID: ${docId}`);
    console.log(`Skill 版本: ${SKILL_VERSION}`);
    if (extracted.images.length) {
      console.log(`已处理图片数: ${extracted.images.length}`);
    }
    if (extracted.files.length) {
      console.log(`已处理文件数: ${extracted.files.length}`);
    }
  } finally {
    removeFileQuietly(tempPath);
    removeDirIfEmptyQuietly(path.join(process.cwd(), ".tmp"));
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
}
