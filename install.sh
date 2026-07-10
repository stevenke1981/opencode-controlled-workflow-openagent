#!/usr/bin/env bash
set -euo pipefail

scope="project"
project_path="."
config_path="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      scope="${2:-}"
      shift 2
      ;;
    --project-path)
      project_path="${2:-}"
      shift 2
      ;;
    --config-path)
      config_path="${2:-}"
      shift 2
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    -h|--help)
      echo "Usage: ./install.sh [--scope project|global] [--project-path PATH] [--config-path PATH] [--dry-run]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "$scope" != "project" && "$scope" != "global" ]]; then
  echo "--scope must be project or global" >&2
  exit 2
fi

source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_opencode="$source_root/.opencode"
timestamp="$(date +%Y%m%d-%H%M%S)"

if [[ "$scope" == "global" ]]; then
  target_root="$config_path"
  target_opencode="$target_root"
else
  target_root="$(cd "$project_path" && pwd)"
  target_opencode="$target_root/.opencode"
fi
backup_root="$target_root/.controlled-workflow-backups/$timestamp"

is_runtime_artifact() {
  local rel="${1//\\//}"
  [[ "$rel" =~ ^memory/memory\.db(-shm|-wal)?$ \
    || "$rel" == "memory/memory-fallback.json" \
    || "$rel" == memory/.runtime/* \
    || "$rel" == "memory/tool-audit.md" \
    || "$rel" =~ ^memory\.db(-shm|-wal)?$ \
    || "$rel" == tantivy/* \
    || "$rel" == "vectors.usearch" \
    || "$rel" == "status-footer/state.json" \
    || "$rel" == evolution/backups/* \
    || "$rel" == evolution/reviews/* \
    || "$rel" == evolution/archive/* \
    || "$rel" == "evolution/state.json" \
    || "$rel" == "evolution/usage.json" ]]
}

is_package_asset() {
  local rel="${1//\\//}"
  [[ "$rel" =~ ^(agent|command|commands|hooks|lib|plugins|skills|tools|memory)/ ]]
}

copy_asset() {
  local src="$1" dst="$2" backup_rel="$3"
  if [[ -f "$dst" ]]; then
    if [[ $dry_run -eq 1 ]]; then
      echo "WOULD BACK UP $dst -> $backup_root/$backup_rel"
    else
      mkdir -p "$(dirname "$backup_root/$backup_rel")"
      cp -p "$dst" "$backup_root/$backup_rel"
    fi
  fi
  if [[ $dry_run -eq 1 ]]; then
    echo "WOULD INSTALL $src -> $dst"
  else
    mkdir -p "$(dirname "$dst")"
    cp -p "$src" "$dst"
  fi
}

echo "Installing OpenCode Controlled Workflow ($scope scope) to $target_root"

source_abs="$(cd "$source_opencode" && pwd)"
target_abs="$(cd "$(dirname "$target_opencode")" && pwd)/$(basename "$target_opencode")"
if [[ "$source_abs" != "$target_abs" ]]; then
  while IFS= read -r -d '' file; do
    rel="${file#"$source_opencode"/}"
    if is_package_asset "$rel" && ! is_runtime_artifact "$rel"; then
      copy_asset "$file" "$target_opencode/$rel" "opencode/$rel"
    fi
  done < <(find "$source_opencode" -type f -print0)
else
  echo "Source and target OpenCode directories are identical; package copy skipped."
fi

if [[ "$scope" == "project" ]]; then
  if [[ "$source_root" != "$target_root" ]]; then
    copy_asset "$source_root/AGENTS.md" "$target_root/AGENTS.md" "AGENTS.md"
  fi
  if [[ ! -f "$target_root/opencode.jsonc" ]]; then
    copy_asset "$source_root/opencode.jsonc" "$target_root/opencode.jsonc" "opencode.jsonc"
  else
    echo "Preserved existing opencode.jsonc; local plugins are auto-discovered."
  fi
else
  echo "Preserved global AGENTS.md and opencode.jsonc; installed additive auto-discovered assets only."
fi

if [[ $dry_run -eq 1 ]]; then
  echo "Dry-run complete; no files changed."
  exit 0
fi

required=(
  "tools/memory.ts"
  "tools/evolution.ts"
  "lib/evolution-core.ts"
  "plugins/memory-lifecycle.plugin.ts"
  "plugins/research-learn-loop.plugin.ts"
  "plugins/hermes-self-evolution.plugin.ts"
  "agent/hermes-reviewer.md"
  "skills/self-improvement/SKILL.md"
  "command/learn.md"
)
for rel in "${required[@]}"; do
  [[ -f "$target_opencode/$rel" ]] || { echo "Installation incomplete; missing $rel" >&2; exit 1; }
done

echo "Installed and verified required tools, skills, agents, plugins, hooks, and commands."
[[ -d "$backup_root" ]] && echo "Backups: $backup_root"
echo "Restart OpenCode, then run: opencode debug skill"
