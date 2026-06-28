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

// ─── SQLite memory digest ────────────────────────────────────────────

async function latestMemoryDigest(root: string, maxChars: number): Promise<string> {
  try {
    const d = await getDatabase({ worktree: root } as ToolContext)
    const stmt = d.prepare("SELECT type, title, substr(problem || ' ' || context || ' ' || solution, 1, 200) AS excerpt FROM memories ORDER BY created_at DESC LIMIT 8")
    const lines: string[] = ["## Recent Memory Entries (top 8)"]
    while (stmt.step()) {
      const r = stmt.getAsObject() as { type: string; title: string; excerpt: string }
      lines.push(`- [${r.type}] ${r.title}`)
      if (r.excerpt) lines.push(`  ${r.excerpt.slice(0, 120)}`)
    }
    stmt.free()
    const text = lines.join("\n")
    return text.length > maxChars ? text.slice(0, maxChars) + "…" : text
  } catch {
    return "## Recent Memory Entries\n(none yet — use memory_add to build the database)"
  }
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

export const MemoryLifecyclePlugin: Plugin = async ({ directory, client }) => {
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
      if (!cfg.remindOnSessionCreated) return
      const sessionID = getSessionID(input)
      const digest = await latestMemoryDigest(root, cfg.maxSnapshotChars)
      await appendAudit(root, `session.created ${sessionID || "unknown"}; sqlite digest prepared`)

      const reminder = [
        "[MEMORY-FIRST REMINDER] (SQLite)",
        "Before changing code, run memory_search for similar errors, commands, packages, and past successful fixes.",
        "After a verified fix, call memory_add type=success. After a failed attempt, call memory_add type=failure.",
        digest ? `\n${digest}` : "",
      ].join("\n")

      try {
        const anyClient: any = client
        if (sessionID && anyClient?.session?.chat) {
          await anyClient.session.chat({ path: { id: sessionID }, body: { parts: [{ type: "text", text: reminder }] } })
        }
      } catch (error) {
        await appendAudit(root, `session.created reminder skipped: ${(error as Error).message}`)
      }
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
