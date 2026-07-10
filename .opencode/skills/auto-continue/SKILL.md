---
name: auto-continue
description: Use when OpenCode session.idle should safely continue incomplete todos or a promise-based loop with cooldown, stagnation, abort, and blocker guards.
---

# Auto Continue Skill

This skill defines the lightweight continuation policy used by `lite-auto-continue.plugin.ts`.

## Trigger
When OpenCode emits a session idle event and there are unfinished todos or a missing completion promise.

## Continue only if
- At least one todo is pending or in progress.
- The latest assistant message is not asking the user for a required decision.
- No background command is still running.
- Cooldown has elapsed.
- The same todo fingerprint has not stagnated too many times.
- Consecutive failures are below the configured limit.

## Stop if
- All todos are completed or cancelled.
- The user asked to stop/cancel.
- A dangerous/destructive action needs explicit approval.
- Authentication, permission, or token-limit errors prevent progress.
- The loop reaches max iterations.

## Continuation Prompt Contract
The injected prompt should be short and directive:

```text
[SYSTEM DIRECTIVE - CONTROLLED AUTO CONTINUE]
Incomplete todos remain. Continue the next pending task.
Use the current agent/model/tools unless unsafe.
Do not ask the user unless blocked by missing requirements or dangerous operation.
Run verification before marking work complete.
Stop only when all todos are completed/cancelled or a real blocker exists.
```
