# Reliability and Validation Improvements

## Changes

- Replaced regex-based PowerShell JSONC stripping with a string-aware state machine.
- The Bash installer no longer overwrites an existing config when Node.js is absent.
- Both installers back up `opencode.jsonc` before mutation and restore it on parse failure.
- Both installers verify tools, libraries, and plugins instead of reporting success with missing files.
- Added `scripts/validate.mjs` for repository structure, plugin configuration, and JSONC validation.
- Added a GitHub Actions workflow that runs the validator and checks Bash syntax.

## Recommended next steps

1. Add unit tests for the memory JSON fallback and SQLite backend.
2. Add a schema/version field to memory storage and explicit migrations.
3. Consolidate `.opencode/command` and `.opencode/commands` in a future major release.
4. Pin and document supported OpenCode/plugin API versions.
5. Add integration tests that install into a temporary project containing comments and URL strings in JSONC.
