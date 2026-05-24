#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const { SKILL_VERSION, MIN_LARK_CLI_VERSION, assertMinimumLarkCliVersion, printJson } = require("./lib/lark_cli.cjs");

const SKILL_NAME = "feishu-markdown-sync";
const ROOT = path.resolve(__dirname, "..");
const COPY_ENTRIES = ["SKILL.md", "README.md", "README.zh.md", "docs", "scripts", "agents"];

function printUsage() {
  console.error(
    [
      "用法:",
      "  feishu-markdown-sync doctor",
      "  feishu-markdown-sync install --target codex|claude|both [--scope user|project] [--force]",
      "",
      "说明:",
      "  - install 只复制 skill 文件，不写入凭据、不自动登录飞书。",
      "  - user scope: ~/.codex/skills 或 ~/.claude/skills。",
      "  - project scope: 当前项目 .codex/skills 或 .claude/skills。",
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
    target: "",
    scope: "user",
    force: false,
  };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = (name) => {
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
      if (i + 1 >= argv.length) throw new Error(`${name} 需要一个值`);
      i += 1;
      return argv[i];
    };
    if (arg === "--force") options.force = true;
    else if (arg === "--target" || arg.startsWith("--target=")) options.target = readValue("--target");
    else if (arg === "--scope" || arg.startsWith("--scope=")) options.scope = readValue("--scope");
    else throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function targetRoots(scope) {
  if (!["user", "project"].includes(scope)) throw new Error("--scope 只能是 user 或 project");
  const home = os.homedir();
  return {
    codex: scope === "user" ? path.join(home, ".codex", "skills") : path.join(process.cwd(), ".codex", "skills"),
    claude: scope === "user" ? path.join(home, ".claude", "skills") : path.join(process.cwd(), ".claude", "skills"),
  };
}

function copySkill(targetDir, force) {
  if (fs.existsSync(targetDir)) {
    if (!force) {
      throw new Error(`目标目录已存在: ${targetDir}。如需覆盖请传 --force。`);
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of COPY_ENTRIES) {
    const source = path.join(ROOT, entry);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(targetDir, entry), { recursive: true });
  }
  const claudeSource = path.join(ROOT, ".claude", "skills", SKILL_NAME, "SKILL.md");
  if (targetDir.includes(`${path.sep}.claude${path.sep}`) && fs.existsSync(claudeSource)) {
    fs.copyFileSync(claudeSource, path.join(targetDir, "SKILL.md"));
  }
}

function install(options) {
  if (!["codex", "claude", "both"].includes(options.target)) {
    throw new Error("install 必须提供 --target codex|claude|both");
  }
  const roots = targetRoots(options.scope);
  const targets = options.target === "both" ? ["codex", "claude"] : [options.target];
  const installed = [];
  for (const target of targets) {
    const dir = path.join(roots[target], SKILL_NAME);
    copySkill(dir, options.force);
    installed.push({ target, dir });
  }
  printJson({ ok: true, skillVersion: SKILL_VERSION, installed });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "doctor") {
    const version = assertMinimumLarkCliVersion();
    printJson({ ok: true, skillVersion: SKILL_VERSION, minimumLarkCliVersion: MIN_LARK_CLI_VERSION, larkCliVersion: version });
    return;
  }
  if (options.command === "install") {
    install(options);
    return;
  }
  throw new Error(`未知命令: ${options.command}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
}
