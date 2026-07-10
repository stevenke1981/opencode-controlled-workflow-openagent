---
name: experience-ledger
description: Use at the beginning and end of non-trivial tasks to search persistent project memory and record verified successes, failures, decisions, research, and patterns.
---

# Experience Ledger (SQLite)

Use this skill at the beginning and end of every non-trivial task.

## Start-of-Task Lookup

Before researching or editing, call `memory_search` with:

- repo name or module
- language/framework/tool name
- exact error substring
- platform, compiler, runtime, package manager
- prior working commands

Filter by type when relevant:

- `memory_search query="..." type=success` — verified fixes
- `memory_search query="..." type=failure` — failed attempts to avoid
- `memory_search query="..." type=pattern` — reusable rules
- `memory_search query="..." type=decision` — past tradeoffs
- `memory_search query="..." type=research` — external sources

## End-of-Task Recording

After each meaningful task, record experience with `memory_add`:

- Successes → `memory_add type=success` (include verification evidence)
- Failures → `memory_add type=failure` (include error and why it failed)
- Reusable lessons → `memory_add type=pattern`
- Attempt chronology → `memory_add type=decision`
- Searchable entry → `memory_add type=research` (include source)

## Quality Bar

A record is useful only if a future agent can search it (via `memory_search`) and decide whether to reuse or avoid the method.
