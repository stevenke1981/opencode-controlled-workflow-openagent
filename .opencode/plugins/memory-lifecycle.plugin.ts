/**
 * OpenCode Memory Lifecycle Plugin
 *
 * Self-contained: no dependency on the migration-only memory-db.ts helper.
 * The plugin only logs lifecycle events to the audit file.
 * Memory database initialization is handled lazily by tools/memory.ts.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { appendFile, mkdir, readFile } from "node:fs/promises"
import path from "node:path"

// ─── Constants ────────────────────────────────────────────────────────

const MEMORY_ROOT = ".opencode/memory"
const CONFIG_PATH = ".opencode/plugins/memory-lifecycle.config.jsonc"

// ─── Types ────────────────────────────────────────────────────────────

type Cfg = {
  enabled: boolean
  remindOnSessionCreated: boolean
  auditToolUsage: boolean
  idleSnapshot: boolean
  maxSnapshotChars: number
}

const DEFAULT_CFG: Cfg = {
  enabled: true,
  remindOnSessionCreated: true,
  auditToolUsage: true,
  idleSnapshot: false,
  maxSnapshotChars: 1800,
}

// ─── Helpers ──────────────────────────────────────────────────────────

function stripJsonc(input: string): string {
  return input.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
}

async function readConfig(directory: string): Promise<Cfg> {
  try {
    const raw = await readFile(path.join(directory, CONFIG_PATH), "utf8")
    return { ...DEFAULT_CFG, ...JSON.parse(stripJsonc(raw)) }
  } catch {
    return DEFAULT_CFG
  }
}

function now(): string {
  return new Date().toISOString()
}

async function appendAudit(root: string, event: string, details: Record<string, unknown> = {}) {
  try {
    const auditRoot = path.join(root, ".runtime")
    await mkdir(auditRoot, { recursive: true })
    await appendFile(
      path.join(auditRoot, "lifecycle.jsonl"),
      `${JSON.stringify({ at: now(), event, ...details })}\n`,
      "utf8",
    )
  } catch {
    // Ignore audit failures
  }
}

function getSessionID(input: any): string | undefined {
  return input?.sessionID || input?.session?.id || input?.id || input?.message?.sessionID
}

// ─── Plugin ───────────────────────────────────────────────────────────

export const MemoryLifecyclePlugin: Plugin = async ({ directory }) => {
  const cfg = await readConfig(directory)
  if (!cfg.enabled) return {}

  const root = path.join(directory, MEMORY_ROOT)

  return {
    "tool.execute.after": async (input: any, output: any) => {
      if (!cfg.auditToolUsage) return
      const toolName = input?.tool || input?.name || "unknown"
      if (!String(toolName).startsWith("memory")) return
      await appendAudit(root, "tool.execute.after", {
        tool: toolName,
        status: output?.error ? "error" : "ok",
      })
    },

    event: async (input: any) => {
      const event = input?.event ?? input
      const sessionID = getSessionID(event?.properties ?? event)
      if (event?.type === "session.created" && cfg.remindOnSessionCreated) {
        await appendAudit(root, "session.created", { sessionID: sessionID || "unknown" })
      }
      if (event?.type === "session.idle" && cfg.idleSnapshot) {
        await appendAudit(root, "session.idle", {
          sessionID: sessionID || "unknown",
          reminder: "check todos and run memory_search before retry",
        })
      }
      if (event?.type === "session.compacted") {
        await appendAudit(root, "session.compacted", {
          sessionID: sessionID || "unknown",
          reminder: "preserve durable facts with memory_add",
        })
      }
    },
  }
}

export default MemoryLifecyclePlugin
