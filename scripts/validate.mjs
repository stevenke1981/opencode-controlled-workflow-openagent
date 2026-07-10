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
  ".opencode/lib/memory-db.ts",
  ".opencode/lib/migrate-to-sqlite.ts",
  ".opencode/plugins/memory-lifecycle.plugin.ts",
  ".opencode/plugins/research-learn-loop.plugin.ts",
].forEach(requireFile);

const configPath = path.join(root, "opencode.jsonc");
if (exists("opencode.jsonc")) {
  try {
    const config = JSON.parse(stripJSONC(fs.readFileSync(configPath, "utf8")));
    if (!config.default_agent) warnings.push("opencode.jsonc has no default_agent.");
    const plugins = Array.isArray(config.plugin) ? config.plugin : [];
    for (const required of [
      ".opencode/plugins/memory-lifecycle.plugin.ts",
      ".opencode/plugins/research-learn-loop.plugin.ts",
    ]) {
      if (!plugins.some((p) => path.basename(String(p)) === path.basename(required))) {
        errors.push(`Plugin not enabled: ${required}`);
      }
    }
  } catch (error) {
    errors.push(`Invalid opencode.jsonc: ${error.message}`);
  }
}

for (const dir of [".opencode/agent", ".opencode/skills", ".opencode/commands"]) {
  if (!exists(dir)) errors.push(`Missing required directory: ${dir}`);
}

if (exists(".opencode/command") && exists(".opencode/commands")) {
  warnings.push("Both command/ and commands/ exist; keep them synchronized or remove the legacy directory in a future major release.");
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log(`Validation passed (${warnings.length} warning${warnings.length === 1 ? "" : "s"}).`);
