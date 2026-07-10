---
name: self-improvement
description: Use after corrections, failures, verified fixes, or substantial tasks to convert durable lessons into the smallest safe memory, skill, MCP proposal, plugin proposal, hook proposal, or curator action.
---

# Self-Improvement Skill

Use this skill to convert experience into better future behavior without changing the user's requirements.

## Principle

Self-improvement means improving the workflow, checklists, commands, and local knowledge. It does not mean inventing new scope or silently changing project architecture.

## When to Improve

Improve records or workflow when:

- The same failure appears twice.
- A command frequently needs a Windows/Linux variant.
- A verification step catches a bug that the plan missed.
- A prior success applies to the current repo.
- The agent wasted time due to missing context or poor search terms.

## Improvement Targets

- SQLite memory: `memory_add type=pattern` for generalized lessons.
- SQLite memory: `memory_add type=note` for searchable index and tags.
- `AGENTS.md`: only if a permanent rule is broadly useful.
- `.opencode/skills/*/SKILL.md`: use `evolution_inspect` followed by a
  SHA-256 guarded `evolution_skill` update when a repeatable workflow changed.
- `.opencode/evolution/mcp/*.json`: secret-free MCP fragments, disabled first.
- `.opencode/evolution/proposals/`: executable plugin/hook ideas pending an
  explicit foreground review and activation.
- `docs/project-notes.md`: optional project-specific quirks.

## Guardrails

- Do not edit workflow rules in the middle of risky implementation unless necessary.
- Do not hide failures; record them.
- Do not overwrite history; append dated entries.
- Do not treat one lucky success as a universal rule.
- Background review may never activate executable plugin or hook code.
- Curator apply is limited to skills marked `created_by: hermes-review` and
  must create a backup before archival.

## Output

```markdown
## Retrospective
- What worked:
- What failed:
- What should be reused:
- What should be avoided:
- Records updated:
```
