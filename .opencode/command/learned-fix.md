---
description: Fix an issue by consulting prior successful and failed records before making changes.
agent: odin
---

Goal: $ARGUMENTS

Start by running `memory_search` with the error and related terms across all types.
Reuse a prior success only if the context matches. Explicitly list failed approaches that should not be repeated. Then implement the smallest verified fix and call `memory_add type=success` with verification evidence.
