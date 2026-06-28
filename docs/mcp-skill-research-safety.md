# MCP, Skill, and Web/Social Research Safety

## MCP Usage

OpenCode can expose local and remote MCP tools to the agent. Treat every MCP server as a capability boundary:

- Read-only documentation/search MCP: usually low risk.
- File-modifying MCP: requires edit approval.
- External system MCP such as GitHub, Gmail, cloud, ticketing, database: requires explicit task-specific approval.
- Unknown third-party MCP: inspect purpose and permissions before use.

## Skills Usage

Skills should be loaded on demand, not pasted into every prompt. Keep skill instructions focused and searchable.

## Web and Community Research

Use web/community sources when official sources are incomplete, errors are version-specific, or local attempts repeatedly fail.

Never disclose:

- API keys, tokens, credentials, cookies.
- private URLs, customer data, private logs.
- proprietary code snippets larger than the minimum public-safe error signature.

## Public-Safe Error Signature

Convert this:

```text
C:\Users\Name\PrivateProject\secret\file.ts:123 TOKEN=abc... error ABC
```

Into this:

```text
Windows TypeScript error ABC in file.ts around typed API call
```

## Recording External Sources

Add useful sources to `.opencode/memory/research-sources.md` with date checked and version context.
