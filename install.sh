#!/usr/bin/env bash
set -euo pipefail

PROJECT_PATH="${1:-.}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$(cd "$PROJECT_PATH" && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

echo "Installing OpenCode Controlled Workflow to $TARGET_DIR"

if [ -d "$TARGET_DIR/.opencode" ]; then
  echo "Backing up existing .opencode to $TARGET_DIR/.opencode.backup-$TIMESTAMP"
  cp -a "$TARGET_DIR/.opencode" "$TARGET_DIR/.opencode.backup-$TIMESTAMP"
fi

cp -a "$SOURCE_DIR/.opencode" "$TARGET_DIR/"
cp "$SOURCE_DIR/AGENTS.md" "$TARGET_DIR/AGENTS.md"

# Merge opencode.jsonc: add controlled-workflow plugins if missing
TARGET_CONFIG="$TARGET_DIR/opencode.jsonc"
SOURCE_CONFIG="$SOURCE_DIR/opencode.jsonc"

if [ -f "$TARGET_CONFIG" ]; then
  # Use node to safely manipulate JSON (available on most dev machines)
  if command -v node &> /dev/null; then
    node -e "
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync('$SOURCE_CONFIG', 'utf8');
const tgt = fs.readFileSync('$TARGET_CONFIG', 'utf8');
// Remove comments for JSON parse
const strip = (s) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const srcJson = JSON.parse(strip(src));
const tgtJson = JSON.parse(strip(tgt));
// Merge plugins (deduplicate)
const pluginSet = new Set(tgtJson.plugin || []);
['$SOURCE_DIR/.opencode/plugins/memory-lifecycle.plugin.ts', '$SOURCE_DIR/.opencode/plugins/research-learn-loop.plugin.ts'].forEach(p => {
  // Convert absolute source path to relative target path
  const rel = '.opencode/plugins/' + path.basename(p);
  if (![...pluginSet].some(x => x.endsWith(path.basename(p)))) {
    pluginSet.add(rel);
  }
});
tgtJson.plugin = [...pluginSet];
// Write back preserving original formatting style
const out = JSON.stringify(tgtJson, null, 2) + '\n';
fs.writeFileSync('$TARGET_CONFIG', out, 'utf8');
console.log('Merged plugins into opencode.jsonc');
"
  else
    # Fallback: copy source config
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
if [ -f "$HOME/.config/opencode/tools/memory-db.ts" ] || [ -f "$HOME/.config/opencode/tools/memory.ts" ]; then
  echo ""
  echo "⚠️  NOTE: OpenCode also loads .ts files from ~/.config/opencode/tools/."
  echo "   If you previously copied memory*.ts files there, they may cause"
  echo "   'Cannot find package sql.js' errors. To fix:"
  echo "     rm ~/.config/opencode/tools/memory-db.ts ~/.config/opencode/tools/memory.ts"
  echo "   The correct files are in this project's .opencode/tools/ and .opencode/lib/."
fi
