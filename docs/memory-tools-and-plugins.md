# Memory Tools and Plugins

This package adds persistent project memory through OpenCode custom tools and lifecycle plugins. The primary backend is OpenCode's built-in Bun SQLite runtime, so no npm dependency is required.

## Custom tools

OpenCode custom tools live in `.opencode/tools/`. The filename becomes the tool namespace; multiple exports in `memory.ts` become:

- `memory_add`
- `memory_search`
- `memory_read`
- `memory_list`

### `memory_add`

Use it to persist a reusable lesson.

Recommended categories:

- `success`: verified fix that worked.
- `failure`: failed attempt or anti-pattern.
- `pattern`: generalized rule.
- `decision`: selected tradeoff or design choice.
- `research`: source found from official docs, GitHub, social/community, MCP, or skills.
- `note`: lightweight index note.

### `memory_search`

Use before trying a fix. Search exact error text, package names, command names, file paths, and tags.

### `memory_read`

Use after search to read a full memory entry by `id`.

### `memory_list`

Lists memory summary: total entries, count by type, and recent entries.

## Lifecycle plugin

`.opencode/plugins/memory-lifecycle.plugin.ts` adds memory-first lifecycle behavior:

- `session.created`: reminds the agent to search memory before editing.
- `tool.execute.after`: audits memory tool usage.
- `session.idle`: can write an idle snapshot when enabled.
- `session.compacted`: records that context was compacted and memory should preserve critical facts.

Lifecycle events use OpenCode's `event` hook. Runtime audit is written under
`.opencode/memory/.runtime/` (gitignored) so read-only diagnostics do not modify
the tracked human-readable ledgers.

## Recommended loop

```text
memory_search exact error
  ↓
memory_read best result
  ↓
try one solution
  ↓
verify
  ↓
memory_add success/failure/pattern/research/decision
```

## Safety

Never write secrets, tokens, passwords, private logs, or private customer data into memory. Redact sensitive content first.

`memory_add` performs an additional secret-like content scan and returns the
stored entry ID. SQLite uses WAL plus a busy timeout; nevertheless, run separate
OpenCode CLI diagnostics sequentially because multiple processes can still
contend on OpenCode's own databases.
