import { tool } from "@opencode-ai/plugin"
import {
  curateSkills,
  inspectAsset,
  listAssets,
  registerMcp,
  writeIntegration,
  writeSkill,
  writeSupportFile,
  type EvolutionContext,
  type McpConfig,
} from "../lib/evolution-core"

export const inspect = tool({
  description: "List controlled evolution assets with SHA-256, or inspect one relative asset file.",
  args: {
    kind: tool.schema.enum(["skill", "mcp", "plugin", "hook"] as const).optional(),
    name: tool.schema.string().optional(),
    live: tool.schema.boolean().optional(),
  },
  async execute(args, ctx: EvolutionContext) {
    if (!args.kind && !args.name) return JSON.stringify(await listAssets(ctx), null, 2)
    if (!args.kind || !args.name) throw new Error("kind and name must be provided together")
    return JSON.stringify(await inspectAsset({ kind: args.kind, name: args.name, live: args.live }, ctx), null, 2)
  },
})

export const skill = tool({
  description: "Create or update a validated OpenCode skill. Existing SKILL.md files require expectedHash.",
  args: {
    name: tool.schema.string(),
    description: tool.schema.string().optional(),
    body: tool.schema.string().optional(),
    content: tool.schema.string().optional(),
    createdBy: tool.schema.string().optional(),
    expectedHash: tool.schema.string().optional(),
  },
  async execute(args, ctx: EvolutionContext) {
    return JSON.stringify(await writeSkill(args, ctx), null, 2)
  },
})

export const support = tool({
  description: "Write a <=1 MiB skill support file under references, templates, scripts, or assets.",
  args: {
    skill: tool.schema.string(),
    directory: tool.schema.enum(["references", "templates", "scripts", "assets"] as const),
    file: tool.schema.string(),
    content: tool.schema.string(),
    expectedHash: tool.schema.string().optional(),
  },
  async execute(args, ctx: EvolutionContext) {
    return JSON.stringify(await writeSupportFile(args, ctx), null, 2)
  },
})

export const integration = tool({
  description: "Register a policy-approved disabled MCP fragment or propose/write a plugin or hook. Live executable writes require both the caller flag and allowExecutableWrites policy.",
  args: {
    kind: tool.schema.enum(["mcp", "plugin", "hook"] as const),
    name: tool.schema.string(),
    config: tool.schema.record(tool.schema.string(), tool.schema.any()).optional(),
    content: tool.schema.string().optional(),
    allowExecutableWrites: tool.schema.boolean().optional(),
    expectedHash: tool.schema.string().optional(),
  },
  async execute(args, ctx: EvolutionContext) {
    if (args.kind === "mcp") {
      if (!args.config) throw new Error("MCP integration requires config")
      return JSON.stringify(await registerMcp({ name: args.name, config: args.config as unknown as McpConfig, expectedHash: args.expectedHash }, ctx), null, 2)
    }
    if (args.content === undefined) throw new Error("Plugin/hook integration requires content")
    return JSON.stringify(await writeIntegration({
      kind: args.kind,
      name: args.name,
      content: args.content,
      allowExecutableWrites: args.allowExecutableWrites,
      expectedHash: args.expectedHash,
    }, ctx), null, 2)
  },
})

export const curate = tool({
  description: "Dry-run or apply archival of skills created_by hermes-review. Apply backs up every eligible skill first.",
  args: {
    mode: tool.schema.enum(["dry-run", "apply"] as const),
    names: tool.schema.array(tool.schema.string()).optional(),
    staleAfterDays: tool.schema.number().optional(),
    archiveAfterDays: tool.schema.number().optional(),
  },
  async execute(args, ctx: EvolutionContext) {
    return JSON.stringify(await curateSkills(args, ctx), null, 2)
  },
})
