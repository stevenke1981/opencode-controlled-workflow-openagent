/**
 * OpenCode Memory Lifecycle Plugin
 *
 * Self-contained: no static or dynamic dependency on memory-db.ts or sql.js.
 * The plugin only logs lifecycle events to the audit file.
 * Memory database initialization is handled lazily by tools/memory.ts.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { appendFile, readFile } from "node:fs/promises"
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
  if (!cfg.enabled) return {}

  const root = path.join(directory, MEMORY_ROOT)
  await appendAudit(root, "plugin.initialized (db init deferred to tools/memory.ts)")

  return {
    "session.created": async (input: any) => {
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
      await appendAudit(root, `session.idle ${sessionID || "unknown"}; further actions: check todos, run memory_search before retry`)
    },

    "session.compacted": async (input: any) => {
      const sessionID = getSessionID(input)
      await appendAudit(root, `session.compacted ${sessionID || "unknown"}; preserve important facts with memory_add`)
    },
  }
}
