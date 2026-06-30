#!/usr/bin/env bash
set -euo pipefail
TYPE="${1:?type required: success|failure|pattern|decision|research|note}"
TITLE="${2:?title required}"
TAGS="${3:-}"
BODY="${4:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOL_DIR="$ROOT/.opencode/tools"

# Preferred: insert into SQLite via node (memory-db.ts is in .opencode/lib/)
if command -v npx &>/dev/null && command -v node &>/dev/null; then
  npx tsx -e "
const { getDatabase, saveDatabase, nowIso } = require('$ROOT/.opencode/lib/memory-db.ts');
const crypto = require('crypto');
(async () => {
  const db = await getDatabase();
  const id = Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
  const now = nowIso();
  db.run('INSERT INTO memories (id,type,title,problem,context,solution,evidence,tags,source,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, '$TYPE', '$TITLE', '', '', '$BODY', '', '$TAGS', '', 'recorded', now, now]);
  await saveDatabase();
  console.log('Added ' + '$TYPE' + ' entry: ' + id + ' - ' + '$TITLE');
})()
" 2>/dev/null && exit 0
fi

# Fallback: append to Markdown ledger
MEMORY="$ROOT/.opencode/memory"
mkdir -p "$MEMORY"
DATE="$(date '+%Y-%m-%d %H:%M')"
case "$TYPE" in
  success) FILE="$MEMORY/success-ledger.md" ;;
  failure) FILE="$MEMORY/failure-ledger.md" ;;
  pattern) FILE="$MEMORY/patterns.md" ;;
  decision) FILE="$MEMORY/decision-log.md" ;;
  research) FILE="$MEMORY/research-sources.md" ;;
  note) FILE="$MEMORY/solution-index.md" ;;
  *) echo "unknown type: $TYPE" >&2; exit 2 ;;
esac
cat >> "$FILE" <<EOF

## $DATE — $TITLE
- Tags: $TAGS
$BODY
EOF
echo "Added $TYPE entry to $FILE"
