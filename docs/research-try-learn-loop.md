# Research → Try → Learn Loop

This workflow adds a self-improving troubleshooting layer to the controlled workflow.

## Mental Model

```text
Problem / error
  ↓
Local memory lookup
  ↓
Repo inspection
  ↓
Official docs / source / release notes
  ↓
Issues / discussions / community hints
  ↓
MCP + skill discovery when useful
  ↓
Candidate methods
  ↓
One-at-a-time experiments
  ↓
Verification
  ↓
Success/failure ledger update
```

## Why This Exists

Agents often fail by repeating the same guess. This loop forces the team to:

- Search prior working solutions first.
- Search prior failed attempts and avoid them.
- Discover several methods before editing.
- Try only one method at a time.
- Keep rollback possible.
- Record what happened so the next session starts smarter.

## Evidence Priority

1. Local repository evidence and reproducible test results.
2. Official documentation, source code, release notes, migration guides.
3. Maintainer comments, merged PRs, confirmed issues.
4. Multiple independent community reports with matching version/platform.
5. Blogs, Reddit, forum posts, AI-generated suggestions.

## Required Records (SQLite)

Use `memory_add` with the appropriate type:

- `type=success`: what worked and when to reuse it (include verification evidence).
- `type=failure`: what failed and when not to repeat it (include error + root cause).
- `type=pattern`: generalized process improvements.
- `type=decision`: chronological attempt history.
- `type=research`: external sources found.
- `type=note`: searchable tags and pointers.

## Good Candidate Fix

A candidate fix is acceptable when it has:

- Evidence source.
- Confidence level.
- Minimal experiment.
- Verification command.
- Rollback method.
- Risk note.

## Bad Candidate Fix

Reject or delay fixes that:

- Require deleting files or resetting Git without approval.
- Depend on secrets or private external services without explicit authorization.
- Expand the task beyond user intent.
- Combine many unrelated changes before testing.
- Come only from low-confidence community posts and cannot be reproduced.
