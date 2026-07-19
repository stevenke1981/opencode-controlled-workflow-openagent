/**
 * Record the model configuration that OpenCode resolved immediately before each
 * LLM request. The audit is intentionally metadata-only: prompts, responses,
 * provider credentials, headers, and arbitrary model options are never stored.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"

type AuditEntry = {
  timestamp: string
  event: "model.resolved"
  session: string
  agent: string
  provider: string
  model: string
  effort: string
  effortSource: string
  variant?: string
}

type SharedState = {
  directories: Set<string>
  writes: Map<string, Promise<void>>
}

const SHARED_KEY = Symbol.for("opencode-controlled-workflow.model-audit")
const shared = ((globalThis as any)[SHARED_KEY] ??= {
  directories: new Set<string>(),
  writes: new Map<string, Promise<void>>(),
}) as SharedState

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return undefined
}

function resolvedEffort(input: any, output: any): { effort: string; source: string } {
  const candidates: Array<[string, unknown]> = [
    ["options.reasoningEffort", output?.options?.reasoningEffort],
    ["options.reasoning_effort", output?.options?.reasoning_effort],
    ["provider.options.reasoningEffort", input?.provider?.options?.reasoningEffort],
    ["provider.options.reasoning_effort", input?.provider?.options?.reasoning_effort],
    ["message.model.variant", input?.message?.model?.variant],
  ]
  for (const [source, value] of candidates) {
    const effort = firstString(value)
    if (effort) return { effort, source }
  }
  return { effort: "default", source: "provider-default" }
}

async function appendQueued(file: string, entry: AuditEntry): Promise<void> {
  const previous = shared.writes.get(file) ?? Promise.resolve()
  const current = previous
    .catch(() => undefined)
    .then(async () => {
      await mkdir(path.dirname(file), { recursive: true })
      await appendFile(file, `${JSON.stringify(entry)}\n`, "utf8")
    })
  shared.writes.set(file, current)
  try {
    await current
  } finally {
    if (shared.writes.get(file) === current) shared.writes.delete(file)
  }
}

const ModelAuditPlugin = (async (ctx: any) => {
  const root = path.resolve(ctx.worktree || ctx.directory || process.cwd())
  if (shared.directories.has(root)) return {}
  shared.directories.add(root)

  const auditFile = path.join(root, ".opencode", "memory", ".runtime", "model-audit.jsonl")

  return {
    "chat.params": async (input: any, output: any) => {
      const effort = resolvedEffort(input, output)
      const variant = firstString(input?.message?.model?.variant)
      const entry: AuditEntry = {
        timestamp: new Date().toISOString(),
        event: "model.resolved",
        session: firstString(input?.sessionID) ?? "unknown",
        agent: firstString(input?.agent, input?.message?.agent) ?? "unknown",
        provider: firstString(
          input?.model?.providerID,
          input?.message?.model?.providerID,
          input?.provider?.info?.id,
          input?.provider?.info?.name,
        ) ?? "unknown",
        model: firstString(
          input?.model?.id,
          input?.model?.modelID,
          input?.message?.model?.modelID,
        ) ?? "unknown",
        effort: effort.effort,
        effortSource: effort.source,
        ...(variant ? { variant } : {}),
      }

      try {
        await appendQueued(auditFile, entry)
      } catch (error: any) {
        await ctx.client?.app?.log?.({
          body: {
            service: "model-audit",
            level: "warn",
            message: "Unable to append model audit entry",
            extra: { error: String(error?.message || error) },
          },
        }).catch(() => undefined)
      }
    },
  }
}) satisfies Plugin

export default ModelAuditPlugin
