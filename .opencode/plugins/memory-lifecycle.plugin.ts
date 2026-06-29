import type { Plugin } from "@opencode-ai/plugin"
import { appendFile, readFile } from "node:fs/promises"
import path from "node:path"
import { getDatabase, MEMORY_ROOT } from "../tools/memory-db"
import type { ToolContext } from "../tools/memory-db"

// ─── Config ───────────────────────────────────────────────────────────

const CONFIG_PATH = ".opencode/plugins/memory-lifecycle.config.jsonc"

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

async function appendAudit(root: string, message: string) {
  try {
    await appendFile(path.join(root, "tool-audit.md"), `\n- ${now()} ${message}\n`, "utf8")
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
  const root = path.join(directory, MEMORY_ROOT)
  if (!cfg.enabled) return {}

  // Initialize SQLite database on first load
  try {
    await getDatabase({ worktree: directory } as ToolContext)
    await appendAudit(root, "plugin.initialized sqlite ready")
  } catch (error) {
    await appendAudit(root, `plugin.initialization error: ${(error as Error).message}`)
  }

  return {
    "session.created": async (input: any) => {
      // Memory-first reminder is already in agent prompts.
      // Only log to audit file for traceability.
      const sessionID = getSessionID(input)
      await appendAudit(root, `session.created ${sessionID || "unknown"}; reminder in agent prompt`)
    },

    "tool.execute.after": async (input: any, output: any) => {
      if (!cfg.auditToolUsage) return
      const toolName = input?.tool || input?.name || "unknown"
      if (!String(toolName).startsWith("memory")) return
      await appendAudit(root, `tool.execute.after ${toolName}; status=${output?.error ? "error" : "ok"}`)
    },

    "session.idle": async (input: any) => {
      const sessionID = getSessionID(input)
      if (!cfg.idleSnapshot) {
        await appendAudit(root, `session.idle ${sessionID || "unknown"}; snapshot disabled`)
        return
      }
      // Idle snapshot writes to audit log for record
      await appendAudit(root, `session.idle ${sessionID || "unknown"}; further actions: check todos, run memory_search before retry`)
    },

    "session.compacted": async (input: any) => {
      const sessionID = getSessionID(input)
      await appendAudit(root, `session.compacted ${sessionID || "unknown"}; preserve important facts with memory_add`)
    },
  }
}
