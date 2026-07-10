#!/usr/bin/env bash
set -euo pipefail

PROJECT_PATH="${1:-.}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$(cd "$PROJECT_PATH" && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_CONFIG="$TARGET_DIR/opencode.jsonc"
SOURCE_CONFIG="$SOURCE_DIR/opencode.jsonc"
TMP_MERGE_SCRIPT=""

cleanup() {
  if [ -n "${TMP_MERGE_SCRIPT:-}" ] && [ -f "$TMP_MERGE_SCRIPT" ]; then
    rm -f "$TMP_MERGE_SCRIPT"
  fi
}
trap cleanup EXIT

echo "Installing OpenCode Controlled Workflow to $TARGET_DIR"

if [ "$SOURCE_DIR" = "$TARGET_DIR" ]; then
  echo "ℹ️  Source and target are the same directory — skipping file copy."
else
  if [ -d "$TARGET_DIR/.opencode" ]; then
    BACKUP="$TARGET_DIR/.opencode.backup-$TIMESTAMP"
    echo "Backing up existing .opencode to $BACKUP"
    cp -a "$TARGET_DIR/.opencode" "$BACKUP"
  fi

  cp -a "$SOURCE_DIR/.opencode" "$TARGET_DIR/"
  cp "$SOURCE_DIR/AGENTS.md" "$TARGET_DIR/AGENTS.md"
fi

if [ -f "$TARGET_CONFIG" ]; then
  CONFIG_BACKUP="$TARGET_CONFIG.backup-$TIMESTAMP"
  cp "$TARGET_CONFIG" "$CONFIG_BACKUP"
  echo "Backed up existing config to $CONFIG_BACKUP"

  if ! command -v node >/dev/null 2>&1; then
    echo "⚠️  node is required to safely merge JSONC."
    echo "   Existing config was preserved; add these plugins manually:"
    echo "   - .opencode/plugins/memory-lifecycle.plugin.ts"
    echo "   - .opencode/plugins/research-learn-loop.plugin.ts"
  else
    TMP_MERGE_SCRIPT="$(mktemp "${TMPDIR:-/tmp}/opencode-merge-XXXXXX.js")"
    cat > "$TMP_MERGE_SCRIPT" <<'JSEOF'
const fs = require("node:fs");
const path = require("node:path");

const [,, targetPath] = process.argv;

function stripJSONC(input) {
  let out = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
    } else if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
    } else {
      out += ch;
    }
  }
  return out;
}

const desired = [
  ".opencode/plugins/memory-lifecycle.plugin.ts",
  ".opencode/plugins/research-learn-loop.plugin.ts",
];

const raw = fs.readFileSync(targetPath, "utf8");
const config = JSON.parse(stripJSONC(raw));
const plugins = Array.isArray(config.plugin) ? config.plugin.map(String) : [];

for (const plugin of desired) {
  const basename = path.basename(plugin);
  if (!plugins.some((entry) => path.basename(entry) === basename)) plugins.push(plugin);
}

config.plugin = plugins;
const tempPath = `${targetPath}.tmp-${process.pid}`;
fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + "\n", "utf8");
fs.renameSync(tempPath, targetPath);
console.log("✓ Safely merged plugins into opencode.jsonc");
JSEOF

    if ! node "$TMP_MERGE_SCRIPT" "$TARGET_CONFIG"; then
      cp "$CONFIG_BACKUP" "$TARGET_CONFIG"
      echo "ERROR: Existing opencode.jsonc could not be parsed safely." >&2
      echo "The original file has been restored. Fix the JSONC and rerun." >&2
      exit 1
    fi
  fi
else
  cp "$SOURCE_CONFIG" "$TARGET_CONFIG"
fi

MISSING=()
for f in \
  "$TARGET_DIR/.opencode/tools/memory.ts" \
  "$TARGET_DIR/.opencode/lib/memory-db.ts" \
  "$TARGET_DIR/.opencode/lib/migrate-to-sqlite.ts" \
  "$TARGET_DIR/.opencode/plugins/memory-lifecycle.plugin.ts" \
  "$TARGET_DIR/.opencode/plugins/research-learn-loop.plugin.ts"; do
  [ -f "$f" ] || MISSING+=("${f#$TARGET_DIR/}")
done

if [ "${#MISSING[@]}" -gt 0 ]; then
  printf 'ERROR: Missing required files:\n' >&2
  printf '  - %s\n' "${MISSING[@]}" >&2
  exit 1
fi

echo "✓ Required tools, libraries, and plugins verified."
echo "Done. Try: opencode run '/controlled-workflow review this repo'"
