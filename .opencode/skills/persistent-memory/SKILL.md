# Persistent Memory Skill

Use this skill whenever the task can benefit from previous project experience, especially build failures, dependency errors, OpenCode/Codex/OpenAgent workflow issues, MCP setup, Windows command problems, or repeated debugging loops.

## Memory-first rule

Before trying a fix:

1. Call `memory_search` with the exact error text, package name, command, file path, or concept.
2. Read the most relevant result with `memory_read`.
3. Prefer verified entries (`type=success`) and reusable rules (`type=pattern`).
4. Check failure entries (`type=failure`) to avoid repeating failed attempts.

## Recording rule

After each meaningful attempt:

- If it worked and was verified, call `memory_add` with `type=success` and include evidence.
- If it failed, call `memory_add` with `type=failure` and include the command, error, and why it failed.
- If it produced a reusable rule, call `memory_add` with `type=pattern`.
- If it came from official docs, GitHub issues, Discord, Reddit, StackOverflow, MCP, or a skill, call `memory_add` with `type=research` and include the source.
- If a tradeoff was chosen, call `memory_add` with `type=decision`.

## Minimum evidence for success

A success memory must include one of:

- test/build/lint/typecheck output,
- before/after behavior,
- exact command result,
- file diff summary plus verification,
- source citation or local document path for configuration decisions.

## Do not store

Do not store API keys, private tokens, passwords, exact private URLs, personal identifiers, or confidential logs. Redact secrets before calling `memory_add`.
