---
description: Learn a reusable OpenCode skill, memory, MCP definition, plugin proposal, or hook proposal from a directory, URL, notes, or the current conversation.
agent: odin
---

# /learn — Controlled Hermes Learning

Learning source: $ARGUMENTS

1. Classify the result as memory, skill, MCP, plugin, or hook.
2. Search `memory_search` and inspect existing skills/integrations first.
3. For a skill, update an umbrella when possible and use the SHA-256
   read-before-write guard.
4. For a URL or external repository, prefer original/official sources and
   record the source with `memory_add type=research`.
5. MCP definitions must contain no secrets and start disabled.
6. Plugin/hook executable code must be created as a proposal. Ask for explicit
   foreground approval before promotion to a live directory.
7. Run the narrowest applicable validation and record verified success or
   failure in memory.

Finish with: learned asset, destination, verification, and activation required.
