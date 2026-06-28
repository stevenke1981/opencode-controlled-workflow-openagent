---
description: Research official/community/MCP sources, propose candidate fixes, then try them one by one with evidence.
agent: sisyphus
---

Use the Research Discovery, MCP + Skill Scout, Community Research, Solution Trial Loop, and Experience Ledger skills.

Goal: $ARGUMENTS

Required process:
1. Search local memory with `memory_search` first (success, failure, pattern types).
2. Inspect repo context and reproduce or summarize the failure.
3. Search official docs/source first, then issues/discussions/community when needed.
4. Produce 2-5 candidate methods with confidence, risk, experiment, and rollback.
5. Try one method at a time.
6. Record failed attempts with `memory_add type=failure` and the winning method with `memory_add type=success`.
7. Finish with verification evidence and updated memory entries.
