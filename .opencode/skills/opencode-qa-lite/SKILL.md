---
name: opencode-qa-lite
description: Use when creating, reviewing, installing, or validating OpenCode agents, commands, skills, plugins, hooks, MCP configuration, permissions, or local workflow packages.
---

# OpenCode QA Lite Skill

Use this skill to keep local OpenCode team configuration healthy.

## Check list
- `.opencode/agent/*.md` frontmatter parses.
- `opencode.jsonc` is valid JSONC.
- Agents use least privilege permissions.
- Destructive commands are denied by default.
- Commands describe clear workflow, not vague motivational prompts.
- Hook template has cooldown, stagnation, failure, and stop guards.

## Suggested local checks
```powershell
Get-ChildItem .opencode -Recurse
opencode run "/controlled-workflow review this repo configuration"
```
