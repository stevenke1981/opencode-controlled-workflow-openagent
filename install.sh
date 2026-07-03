#!/usr/bin/env bash
set -euo pipefail

PROJECT_PATH="${1:-.}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$(cd "$PROJECT_PATH" && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

echo "Installing OpenCode Controlled Workflow to $TARGET_DIR"

# Self-install guard: if source == target, the repo already has .opencode/ in git
if [ "$SOURCE_DIR" = "$TARGET_DIR" ]; then
  echo "ℹ️  Source and target are the same directory — skipping file copy."
  echo "   The .opencode/ directory is already present from git clone."
else
  if [ -d "$TARGET_DIR/.opencode" ]; then
    echo "Backing up existing .opencode to $TARGET_DIR/.opencode.backup-$TIMESTAMP"
    cp -a "$TARGET_DIR/.opencode" "$TARGET_DIR/.opencode.backup-$TIMESTAMP"
  fi

  cp -a "$SOURCE_DIR/.opencode" "$TARGET_DIR/"
  cp "$SOURCE_DIR/AGENTS.md" "$TARGET_DIR/AGENTS.md"
fi

# Merge opencode.jsonc: add controlled-workflow plugins if missing
TARGET_CONFIG="$TARGET_DIR/opencode.jsonc"
SOURCE_CONFIG="$SOURCE_DIR/opencode.jsonc"

merge_jsonc() {
  node "$TMP_MERGE_SCRIPT" "$SOURCE_CONFIG" "$TARGET_CONFIG"
}

if [ -f "$TARGET_CONFIG" ]; then
  if command -v node &> /dev/null; then
    # Write merge script to temp file to avoid quoting issues
    TMP_MERGE_SCRIPT=$(mktemp /tmp/opencode-merge-XXXXXX.js)
    cat > "$TMP_MERGE_SCRIPT" << 'JSEOF'
const fs = require('fs');
const path = require('path');

const [,, sourcePath, targetPath] = process.argv;

/*
 * Strip JSONC comments (single-line and block) while respecting strings.
 * Uses a state machine to avoid false matches like "https://" inside strings.
 */
function stripJSONC(s) {
  let out = '';
  let inStr = false;
  let inBlock = false;
  let i = 0;
  while (i < s.length) {
    if (inBlock) {
      if (s[i] === '*' && s[i + 1] === '/') { inBlock = false; i += 2; }
      else { i++; }
    } else if (inStr) {
      if (s[i] === '\\' && (s[i + 1] === '"' || s[i + 1] === '\\' || s[i + 1] === '/')) {
        out += s[i] + s[i + 1]; i += 2;
      } else if (s[i] === '"') { inStr = false; out += s[i]; i++; }
      else { out += s[i]; i++; }
    } else {
      if (s[i] === '/' && s[i + 1] === '/') { i += 2; while (i < s.length && s[i] !== '\n') i++; }
      else if (s[i] === '/' && s[i + 1] === '*') { i += 2; inBlock = true; }
      else if (s[i] === '"') { inStr = true; out += s[i]; i++; }
      else { out += s[i]; i++; }
    }
  }
  return out;
}

const src = fs.readFileSync(sourcePath, 'utf8');
const tgt = fs.readFileSync(targetPath, 'utf8');

const srcJson = JSON.parse(stripJSONC(src));
const tgtJson = JSON.parse(stripJSONC(tgt));

// Merge plugins (deduplicate by basename)
const pluginSet = new Set(tgtJson.plugin || []);
const pluginFiles = [
  '.opencode/plugins/memory-lifecycle.plugin.ts',
  '.opencode/plugins/research-learn-loop.plugin.ts',
];
pluginFiles.forEach(rel => {
  if (![...pluginSet].some(x => x.endsWith(path.basename(rel)))) {
    pluginSet.add(rel);
  }
});
tgtJson.plugin = [...pluginSet];

// Write back
const out = JSON.stringify(tgtJson, null, 2) + '\n';
fs.writeFileSync(targetPath, out, 'utf8');
console.log('✓ Merged plugins into opencode.jsonc');
JSEOF

    merge_jsonc
    rm -f "$TMP_MERGE_SCRIPT"
  else
    echo "⚠️  node not found, copying source config as fallback"
    cp "$SOURCE_CONFIG" "$TARGET_CONFIG"
  fi
else
  cp "$SOURCE_CONFIG" "$TARGET_CONFIG"
fi

# Verify essential files
TOOLS_DIR="$TARGET_DIR/.opencode/tools"
LIB_DIR="$TARGET_DIR/.opencode/lib"
MISSING=""
for f in "memory.ts"; do
  if [ ! -f "$TOOLS_DIR/$f" ]; then MISSING="$MISSING TOOL:$f"; fi
done
for f in "memory-db.ts" "migrate-to-sqlite.ts"; do
  if [ ! -f "$LIB_DIR/$f" ]; then MISSING="$MISSING LIB:$f"; fi
done
if [ -n "$MISSING" ]; then
  echo "WARNING: Missing files:$MISSING"
else
  echo "✓ Tool: memory.ts (self-contained, SQLite/JSON fallback)"
  echo "✓ Lib:  memory-db.ts, migrate-to-sqlite.ts (in .opencode/lib/, not scanned as tools)"
fi

echo ""
echo "✓ Plugins auto-enabled:"
echo "  - .opencode/plugins/memory-lifecycle.plugin.ts"
echo "  - .opencode/plugins/research-learn-loop.plugin.ts"
echo "  Remove entries from opencode.jsonc plugin array to disable."
echo ""
echo "Done. Try: opencode run '/controlled-workflow review this repo'"

# Warn about global tools directory contamination
if [ -f "$HOME/.config/opencode/tools/memory-db.ts" ] || [ -f "$HOME/.config/opencode/tools/memory.ts" ] || [ -f "$HOME/.config/opencode/tools/migrate-to-sqlite.ts" ]; then
  echo ""
  echo "⚠️  NOTE: OpenCode also loads .ts files from ~/.config/opencode/tools/."
  echo "   If you previously copied memory*.ts files there, they may cause"
  echo "   'Cannot find package sql.js' errors or import resolution failures."
  echo "   To fix:"
  echo "     rm -f ~/.config/opencode/tools/memory-db.ts ~/.config/opencode/tools/memory.ts ~/.config/opencode/tools/migrate-to-sqlite.ts"
  echo "   The correct files are in this project's .opencode/tools/ and .opencode/lib/."
fi
