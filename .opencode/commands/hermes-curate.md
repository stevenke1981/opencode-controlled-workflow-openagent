---
description: Audit Hermes-created skills for stale, overlapping, or archivable content; defaults to a reversible dry-run.
agent: odin
---

# /hermes-curate — Skill Lifecycle Review

Arguments: $ARGUMENTS

Run `evolution_curate` in dry-run mode unless the arguments explicitly request
`apply`. Before apply, show the planned affected skills and confirm the backup
destination. Only skills marked `metadata.created_by: hermes-review` are in
scope; never archive user-authored, bundled, or external skills.
