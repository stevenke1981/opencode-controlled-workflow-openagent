import type { Plugin } from "@opencode-ai/plugin"
import { mkdir, appendFile, readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"

const MEMORY_ROOT = ".opencode/memory"
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

function stripJsonc(input: string) {
  return input
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
}

async function readConfig(directory: string): Promise<Cfg> {
  try {
    const raw = await readFile(path.join(directory, CONFIG_PATH), "utf8")
    return { ...DEFAULT_CFG, ...JSON.parse(stripJsonc(raw)) }
  } catch {
    return DEFAULT_CFG
  }
}

async function ensure(root: string) {
  await mkdir(root, { recursive: true })
  await mkdir(path.join(root, "entries"), { recursive: true })
}

function now() {
  return new Date().toISOString()
}

async function latestMemoryDigest(root: string, maxChars: number) {
  const files = ["solution-index.md", "success-ledger.md", "failure-ledger.md", "patterns.md"]
  const chunks: string[] = []
  for (const file of files) {
    try {
      const text = await readFile(path.join(root, file), "utf8")
      chunks.push(`## ${file}\n${text.slice(Math.max(0, text.length - Math.floor(maxChars / files.length)))}`)
    } catch {
      // ignore missing files
    }
  }
  return chunks.join("\n\n").slice(-maxChars)
}

async function appendAudit(root: string, message: string) {
  await appendFile(path.join(root, "tool-audit.md"), `\n- ${now()} ${message}\n`, "utf8")
}

function getSessionID(input: any): string | undefined {
  return input?.sessionID || input?.session?.id || input?.id || input?.message?.sessionID
}

export const MemoryLifecyclePlugin: Plugin = async ({ directory, client }) => {
  const cfg = await readConfig(directory)
  const root = path.join(directory, MEMORY_ROOT)
  if (!cfg.enabled) return {}
  await ensure(root)

  return {
    "session.created": async (input: any) => {
      if (!cfg.remindOnSessionCreated) return
      const sessionID = getSessionID(input)
      const digest = await latestMemoryDigest(root, cfg.maxSnapshotChars)
      await appendAudit(root, `session.created ${sessionID || "unknown"}; memory digest prepared`)

      // Defensive reference implementation: OpenCode SDK method names can vary by version.
      // If your local SDK supports client.session.chat or promptAsync, this can inject a reminder.
      const reminder = [
        "[MEMORY-FIRST REMINDER]",
        "Before changing code, call memory_search for similar errors, commands, packages, and past successful fixes.",
        "After a verified fix, call memory_add type=success. After a failed attempt, call memory_add type=failure.",
        digest ? `\nRecent memory digest:\n${digest}` : "",
      ].join("\n")

      try {
        const anyClient: any = client as any
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
      await appendFile(
        path.join(root, "decision-log.md"),
        `\n## Idle Snapshot ${now()}\n\n- session: ${sessionID || "unknown"}\n- next action: If todos remain, run memory_search before trying another solution.\n\n---\n`,
        "utf8",
      )
    },

    "session.compacted": async (input: any) => {
      const sessionID = getSessionID(input)
      await appendFile(
        path.join(root, "decision-log.md"),
        `\n## Context Compacted ${now()}\n\n- session: ${sessionID || "unknown"}\n- action: Preserve important facts with memory_add if not already captured.\n\n---\n`,
        "utf8",
      )
    },
  }
}
