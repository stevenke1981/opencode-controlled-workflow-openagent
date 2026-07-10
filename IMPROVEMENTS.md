# Reliability and Validation Improvements

## Changes

- Replaced regex-based PowerShell JSONC stripping with a string-aware state machine.
- The Bash installer no longer overwrites an existing config when Node.js is absent.
- Both installers back up `opencode.jsonc` before mutation and restore it on parse failure.
- Both installers verify tools, libraries, and plugins instead of reporting success with missing files.
- Added `scripts/validate.mjs` for repository structure, plugin configuration, and JSONC validation.
- Added a GitHub Actions workflow that runs the validator and checks Bash syntax.
- Added Bun tests for evolution path, hash, secret, proposal, curator ownership,
  backup, and symlink/junction guards.
- Added global additive installation with per-file backups and dry-run support.
- Added live OpenCode catalog checks to the release verification procedure.

## Recommended next steps

1. Add schema-versioned SQLite migrations and concurrent-process stress tests.
2. Consolidate `.opencode/command` and `.opencode/commands` in a future major release.
3. Add a long-running real-server smoke test for background child-session completion.
4. Re-verify the optional upstream config whenever the pinned upstream commit changes.
