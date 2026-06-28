# Research Discovery Skill

Use this skill when a task is blocked, unfamiliar, version-sensitive, or has repeated failures. The goal is to discover multiple credible solution paths before editing more code.

## Trigger

Load this skill when any of these happen:

- Build, test, install, runtime, compiler, or linker error is not obvious after local inspection.
- The issue involves an external API, framework, CLI, model, MCP server, package manager, OS, or OpenCode behavior.
- A previous attempt failed twice.
- The user asks to search the web, community, GitHub issues, docs, MCP, or skills.
- The task may benefit from prior success/failure records.

## Research Ladder

Search in this order, stopping when there is enough evidence for 2-5 candidate fixes:

1. **Local success ledger**: `memory_search type=success` for verified fixes.
2. **Local failure ledger**: `memory_search type=failure` to avoid repeating bad attempts.
3. **Repo evidence**: README, docs, tests, lockfiles, CI config, examples, source code, comments.
4. **Installed tool help**: `--help`, `--version`, manpages, local package docs.
5. **Official docs**: vendor docs, API docs, release notes, migration guides.
6. **Source and tracker**: upstream source, changelog, GitHub issues, discussions, PRs.
7. **Community**: Stack Overflow, Reddit, Discord/forum mirrors, blog posts, examples. Treat these as lower confidence unless reproduced.
8. **MCP/skills registry**: inspect available MCP servers and skills only when they can materially reduce uncertainty.

## Search Query Pattern

For each error, create an error signature:

```text
<tool/framework> <version/platform> "exact error substring" <relevant file/function>
```

Also search a broader query without the exact error:

```text
<framework> <task> <symptom> <platform> fix
```

## Evidence Requirements

Each candidate fix must include:

- Source type: local / official / upstream issue / community / inference.
- Confidence: High / Medium / Low.
- Why it may apply to this repo.
- Smallest safe experiment to try.
- Rollback method.

## Output

Return:

```markdown
## Research Summary
- Error signature:
- Local evidence:
- External evidence:

## Candidate Fixes
1. Method A
   - Source:
   - Confidence:
   - Experiment:
   - Rollback:
2. Method B
...

## Recommended Trial Order
1. ...
2. ...

## Do Not Repeat
- Failed methods from ledger or this session.
```
