# Changelog

## 2026-06-28 — OpenAgent Controlled Workflow Integration

- Added 11 clean-room rewritten OpenCode agents based on oh-my-openagent public roles.
- Added Controlled Workflow gates in `AGENTS.md`.
- Added lightweight auto-continue hook reference adapter.
- Added promise-loop command using `<promise>DONE</promise>`.
- Added slash commands for planning, review, verify, fix, ultrawork, and ralph-loop.
- Added safety boundaries and least-privilege permissions.
- Added Windows and Unix install scripts.

## 2026-06-28 — Research Try Learn Self-Improvement Layer

- Added Research → Try → Learn workflow.
- Added skills for research discovery, community research, MCP/skill scouting, solution trials, experience ledgers, and self-improvement.
- Added project memory ledgers for success, failure, decisions, patterns, research sources, and solution index.
- Added slash commands: `/research-fix`, `/learned-fix`, `/mcp-scout`, `/try-solutions`, `/retrospective`, `/knowledge-sync`.
- Added reference plugin `research-learn-loop.plugin.ts` to extend auto-continue with memory-first research and learning records.
- Added docs for MCP/skill safety and self-improvement boundaries.
- Added helper scripts for appending learning entries.

## 2026-06-28 — Persistent Memory Tools and Lifecycle Plugin

- Added OpenCode custom tools in `.opencode/tools/memory.ts`:
  - `memory_add`
  - `memory_search`
  - `memory_read`
  - `memory_list`
- Added lifecycle plugin `.opencode/plugins/memory-lifecycle.plugin.ts` for memory-first reminders, memory tool audit, idle snapshots, and compaction notes.
- Added `.opencode/plugins/memory-lifecycle.config.jsonc`.
- Added `persistent-memory` skill.
- Added commands: `/memory-add`, `/memory-search`, `/memory-read`, `/memory-first`.
- Added docs: `docs/memory-tools-and-plugins.md`.
- Added template: `templates/memory-entry.md`.
