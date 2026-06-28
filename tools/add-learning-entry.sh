#!/usr/bin/env bash
set -euo pipefail
TYPE="${1:?type required: success|failure|pattern|decision}"
TITLE="${2:?title required}"
TAGS="${3:-}"
BODY="${4:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEMORY="$ROOT/.opencode/memory"
mkdir -p "$MEMORY"
DATE="$(date '+%Y-%m-%d %H:%M')"
case "$TYPE" in
  success) FILE="$MEMORY/success-ledger.md" ;;
  failure) FILE="$MEMORY/failure-ledger.md" ;;
  pattern) FILE="$MEMORY/patterns.md" ;;
  decision) FILE="$MEMORY/decision-log.md" ;;
  *) echo "unknown type: $TYPE" >&2; exit 2 ;;
esac
cat >> "$FILE" <<EOF

## $DATE — $TITLE
- Tags: $TAGS
$BODY
EOF
echo "Added $TYPE entry to $FILE"
