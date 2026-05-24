const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SKILL_VERSION = "1.7.0";
const MIN_LARK_CLI_VERSION = "1.0.39";
const NODE_BIN = process.env.NODE_BINARY || process.execPath || "node";
const DEFAULT_LARK_CLI = path.join(
  process.env.APPDATA || "",
  "npm",
  "node_modules",
  "@larksuite",
  "cli",
  "scripts",
  "run.js",
);

function getLarkCliPath(explicitPath) {
  return explicitPath || process.env.LARK_CLI_PATH || DEFAULT_LARK_CLI;
}

function buildLarkCommand(larkCliPath = getLarkCliPath()) {
  if (fs.existsSync(larkCliPath)) {
    return {
      command: NODE_BIN,
      argsPrefix: [larkCliPath],
      path: larkCliPath,
    };
  }
  if (!process.env.LARK_CLI_PATH && larkCliPath === DEFAULT_LARK_CLI) {
    return {
      command: "lark-cli",
      argsPrefix: [],
      path: "lark-cli",
    };
  }
  return {
    command: larkCliPath || "lark-cli",
    argsPrefix: [],
    path: larkCliPath || "lark-cli",
  };
}

function extractJson(text) {
  const start = String(text || "").indexOf("{");
  const end = String(text || "").lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return String(text).slice(start, end + 1);
}

function parseLarkOutput(result, options = {}) {
  if (result.error) {
    throw result.error;
  }
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
    const error = new Error(JSON.stringify(parsed, null, 2));
    error.exitCode = result.status;
    error.output = parsed;
    throw error;
  }

  if (result.status === 0 || options.allowFailure) {
    return combined;
  }

  const error = new Error(combined || `lark-cli 执行失败: ${result.status}`);
  error.exitCode = result.status;
  throw error;
}

function runLark(rawArgs, options = {}) {
  const cli = buildLarkCommand(options.larkCliPath);
  const result = spawnSync(cli.command, [...cli.argsPrefix, ...rawArgs], {
    encoding: "utf8",
    maxBuffer: options.maxBuffer || 32 * 1024 * 1024,
    cwd: options.cwd || process.cwd(),
  });
  return parseLarkOutput(result, options);
}

function runLarkWithRetry(rawArgs, options = {}) {
  const attempts = options.attempts || 3;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return runLark(rawArgs, options);
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

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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

function getLarkCliVersion(options = {}) {
  return String(runLark(["--version"], options)).trim();
}

function assertMinimumLarkCliVersion(options = {}) {
  const minimum = options.minimum || MIN_LARK_CLI_VERSION;
  const versionText = getLarkCliVersion(options);
  const currentParts = parseSemver(versionText);
  const minParts = parseSemver(minimum);
  if (!currentParts || !minParts) {
    throw new Error(`无法解析 lark-cli 版本。当前: ${versionText}，要求至少: ${minimum}`);
  }
  if (compareSemver(currentParts, minParts) < 0) {
    throw new Error(`当前 lark-cli 版本为 ${versionText}，该 skill v${SKILL_VERSION} 需要 >= ${minimum}`);
  }
  return versionText;
}

function toCliRelativePath(filePath, cwd = process.cwd()) {
  const relative = path.relative(cwd, path.resolve(filePath)).replace(/\\/g, "/");
  if (!relative || relative.startsWith("..")) {
    throw new Error(`飞书 CLI 文件路径必须位于当前目录下: ${filePath}`);
  }
  return relative.startsWith(".") ? relative : `./${relative}`;
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

function printJson(value) {
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

function ensureMarkdownFile(filePath) {
  const ext = path.extname(filePath || "").toLowerCase();
  if (![".md", ".markdown", ".mdown"].includes(ext)) {
    throw new Error(`必须提供 Markdown 文件: ${filePath}`);
  }
}

module.exports = {
  DEFAULT_LARK_CLI,
  MIN_LARK_CLI_VERSION,
  NODE_BIN,
  SKILL_VERSION,
  assertMinimumLarkCliVersion,
  buildLarkCommand,
  ensureMarkdownFile,
  extractJson,
  getLarkCliPath,
  getLarkCliVersion,
  parseLarkOutput,
  printJson,
  readOptionValue,
  runLark,
  runLarkWithRetry,
  toCliRelativePath,
};
