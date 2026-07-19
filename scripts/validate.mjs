#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || ".");
const errors = [];
const warnings = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}
function requireFile(rel) {
  if (!exists(rel)) errors.push(`Missing required file: ${rel}`);
}
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8").replace(/^\uFEFF/, "");
}
function frontmatter(rel) {
  const content = read(rel).replace(/\r\n/g, "\n");
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.+?)\s*$/);
    if (field) fields[field[1]] = field[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return fields;
}
function stripJSONC(input) {
  let out = "", inString = false, line = false, block = false, escaped = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i], next = input[i + 1];
    if (line) { if (ch === "\n") { line = false; out += ch; } continue; }
    if (block) { if (ch === "*" && next === "/") { block = false; i++; } continue; }
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; }
    else if (ch === "/" && next === "/") { line = true; i++; }
    else if (ch === "/" && next === "*") { block = true; i++; }
    else out += ch;
  }
  return out;
}

[
  "README.md", "AGENTS.md", "opencode.jsonc", "install.sh", "install.ps1",
  ".opencode/tools/memory.ts",
  ".opencode/tools/evolution.ts",
  ".opencode/lib/memory-db.ts",
  ".opencode/lib/migrate-to-sqlite.ts",
  ".opencode/lib/evolution-core.ts",
  ".opencode/plugins/memory-lifecycle.plugin.ts",
  ".opencode/plugins/research-learn-loop.plugin.ts",
  ".opencode/plugins/hermes-self-evolution.plugin.ts",
  ".opencode/plugins/model-audit.plugin.ts",
  ".opencode/plugins/hermes-self-evolution.config.jsonc",
  ".opencode/agent/hermes-reviewer.md",
  ".opencode/command/learn.md",
  ".opencode/command/hermes-curate.md",
  "tests/evolution-core.test.ts",
  "tests/installers.test.ts",
  "tests/memory-db.test.ts",
  "tests/plugin-lifecycle.test.ts",
].forEach(requireFile);

const configPath = path.join(root, "opencode.jsonc");
if (exists("opencode.jsonc")) {
  try {
    const config = JSON.parse(stripJSONC(fs.readFileSync(configPath, "utf8")));
    if (!config.default_agent) warnings.push("opencode.jsonc has no default_agent.");
    if (config.autoupdate !== false) errors.push("opencode.jsonc autoupdate must be false for a controlled, version-pinned workflow.");
    const plugins = Array.isArray(config.plugin) ? config.plugin : [];
    for (const entry of plugins) {
      const spec = Array.isArray(entry) ? entry[0] : entry;
      if (typeof spec === "string" && /(?:^|[\\/])\.opencode[\\/]plugins[\\/].+\.[cm]?[jt]s$/i.test(spec)) {
        errors.push(`Local plugin is both explicit and auto-discovered: ${spec}`);
      }
    }
    if (!config.mcp || typeof config.mcp !== "object" || Array.isArray(config.mcp)) errors.push("opencode.jsonc mcp must be an object.");
  } catch (error) {
    errors.push(`Invalid opencode.jsonc: ${error.message}`);
  }
}

for (const dir of [".opencode/agent", ".opencode/skills", ".opencode/commands"]) {
  if (!exists(dir)) errors.push(`Missing required directory: ${dir}`);
}

if (exists(".opencode/skills")) {
  for (const entry of fs.readdirSync(path.join(root, ".opencode/skills"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rel = `.opencode/skills/${entry.name}/SKILL.md`;
    if (!exists(rel)) { errors.push(`Skill directory lacks SKILL.md: ${entry.name}`); continue; }
    const meta = frontmatter(rel);
    if (!meta) { errors.push(`Skill lacks YAML frontmatter: ${rel}`); continue; }
    if (meta.name !== entry.name) errors.push(`Skill name must match directory: ${rel}`);
    if (!meta.description) errors.push(`Skill description missing: ${rel}`);
  }
}

for (const rel of [
  ".opencode/plugins/memory-lifecycle.plugin.ts",
  ".opencode/plugins/research-learn-loop.plugin.ts",
  ".opencode/plugins/hermes-self-evolution.plugin.ts",
  ".opencode/plugins/model-audit.plugin.ts",
]) {
  if (!exists(rel)) continue;
  const source = read(rel);
  if (!/export\s+default\b/.test(source)) errors.push(`Plugin has no default export: ${rel}`);
  if (/^[ \t]*["']session\.(?:created|idle|compacted)["']\s*:/m.test(source)) {
    errors.push(`Plugin uses obsolete top-level session event hook instead of event(): ${rel}`);
  }
}

for (const dir of [".opencode/command", ".opencode/commands"]) {
  if (!exists(dir)) continue;
  for (const name of fs.readdirSync(path.join(root, dir))) {
    if (!name.endsWith(".md")) continue;
    const rel = `${dir}/${name}`;
    const source = read(rel);
    if (/\b(?:Oracle|Momus)\b/.test(source)) {
      errors.push(`Command references retired agent names Oracle/Momus: ${rel}`);
    }
  }
}

if (exists(".opencode/agent/hermes-reviewer.md")) {
  const source = read(".opencode/agent/hermes-reviewer.md");
  const meta = frontmatter(".opencode/agent/hermes-reviewer.md");
  if (meta?.temperature !== undefined || /^temperature\s*:/m.test(source)) {
    errors.push("hermes-reviewer must not set temperature for a thinking model.");
  }
}

if (exists(".opencode/plugins/model-audit.plugin.ts")) {
  const source = read(".opencode/plugins/model-audit.plugin.ts");
  for (const required of ['"chat.params"', "session:", "agent:", "provider:", "model:", "effort:"]) {
    if (!source.includes(required)) errors.push(`model-audit.plugin.ts is missing required audit field/hook: ${required}`);
  }
  if (!source.includes("model-audit.jsonl")) errors.push("model-audit.plugin.ts must write the model-audit.jsonl runtime log.");
}

const optionalUpstream = "optional/oh-my-openagent/oh-my-openagent-controlled.jsonc";
if (exists(optionalUpstream)) {
  try {
    const parsed = JSON.parse(stripJSONC(read(optionalUpstream)));
    if (parsed["oh-my-openagent"]) errors.push("Optional upstream config must use direct schema keys, not an oh-my-openagent wrapper.");
    if (parsed.teamMode || parsed.ralphLoop) errors.push("Optional upstream config must use snake_case keys.");
    if (!parsed.ralph_loop || !parsed.team_mode) errors.push("Optional upstream config must declare team_mode and ralph_loop.");
  } catch (error) {
    errors.push(`Invalid optional upstream JSONC: ${error.message}`);
  }
}

if (exists(".opencode/tools/memory.ts") && !read(".opencode/tools/memory.ts").includes('import("bun:sqlite")')) {
  errors.push("memory.ts must use the zero-dependency Bun SQLite backend.");
}

if (exists(".opencode/command") && exists(".opencode/commands")) {
  for (const name of fs.readdirSync(path.join(root, ".opencode/command"))) {
    const canonical = `.opencode/command/${name}`;
    const legacy = `.opencode/commands/${name}`;
    if (exists(legacy) && read(canonical) !== read(legacy)) {
      errors.push(`Command compatibility copies differ: ${canonical} vs ${legacy}`);
    }
  }
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log(`Validation passed (${warnings.length} warning${warnings.length === 1 ? "" : "s"}).`);
