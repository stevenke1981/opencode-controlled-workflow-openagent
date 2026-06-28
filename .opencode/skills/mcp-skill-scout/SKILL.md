# MCP + Skill Scout

Use this skill when a task may be solved faster by available MCP tools, reusable OpenCode skills, local docs, or external tool integrations.

## Discovery Order

1. List local project skills under `.opencode/skills/*/SKILL.md`.
2. List global skills if the environment exposes them.
3. Inspect `opencode.jsonc` for configured MCP servers.
4. If allowed, run harmless discovery commands:
   - `opencode mcp list` or equivalent, if available.
   - `opencode agent list` or equivalent, if available.
   - `opencode --version`.
5. Check whether a discovered MCP/tool is read-only, write-capable, networked, or credentialed.

## MCP Safety

- Do not send secrets to MCP tools unless the user explicitly authorized that integration.
- Prefer read-only MCP calls for discovery.
- Treat third-party MCP servers as untrusted until their scope is understood.
- If a tool can mutate files, external systems, email, cloud resources, tickets, or GitHub, require explicit user approval.

## Tool Selection

Use MCP/skills only when one of these is true:

- It provides authoritative docs or repo-specific context.
- It can reproduce an error better than shell commands.
- It can search code/indexes faster than local grep.
- It provides a controlled API for a required external system.

## Output

```markdown
## Available Capabilities
| Name | Type | Scope | Risk | Use For |
|---|---|---|---|---|

## Recommended Tools
1. ...

## Tools Avoided
- Tool: reason.
```
