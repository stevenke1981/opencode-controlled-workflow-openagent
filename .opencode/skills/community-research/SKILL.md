# Community Research Skill

Use this skill to search non-official sources safely when official documentation is incomplete or the error is ecosystem-specific.

## Allowed Community Sources

- GitHub Issues / Discussions / Pull Requests.
- Stack Overflow or Stack Exchange.
- Maintainer blogs and release notes.
- Framework Discord/forum archives or public mirrors.
- Reddit, Hacker News, personal blogs: only for hints, never as sole proof for risky changes.

## Rules

1. Never paste secrets, tokens, private code, private stack traces, or proprietary logs into external searches.
2. Reduce private errors to a minimal public-safe signature.
3. Prefer recent posts only when the topic is version-sensitive.
4. Treat community suggestions as hypotheses until reproduced locally.
5. When multiple answers conflict, prefer official docs, source code, maintainer comments, then reproducible examples.

## Community Evidence Score

- **A**: maintainer answer, merged PR, official migration note.
- **B**: multiple independent reports with same fix and same version.
- **C**: one Stack Overflow answer or blog that matches the error.
- **D**: anecdotal post; use only to inspire a controlled experiment.

## Output

```markdown
## Community Findings
- Source / date / version:
- Proposed cause:
- Proposed fix:
- Evidence score:
- Local experiment:
- Risk:
```
