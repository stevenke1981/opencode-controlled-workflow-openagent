/**
 * Migration script: Markdown memory entries → SQLite database
 *
 * Usage:
 *   bun -e "import { migrate } from './.opencode/lib/migrate-to-sqlite.ts'; await migrate()"
 *
 * Scans .opencode/memory/entries/*.md, success-ledger.md, failure-ledger.md,
 * patterns.md, decision-log.md, research-sources.md, and solution-index.md
 * for existing entries, then inserts them into memory.db.
 */

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { getDatabase, saveDatabase, getMemoryRoot, nowIso } from "./memory-db"

const LEDGER_FILES = [
  "success-ledger.md",
  "failure-ledger.md",
  "patterns.md",
  "decision-log.md",
  "research-sources.md",
  "solution-index.md",
]

const TYPE_MAP: Record<string, string> = {
  "success-ledger": "success",
  "failure-ledger": "failure",
  "patterns": "pattern",
  "decision-log": "decision",
  "research-sources": "research",
  "solution-index": "note",
}

/**
 * Parse a Markdown entry section.
 * Format:
 *   ## Title
 *   - id: xxx
 *   - type: success
 *   ...
 *   ### Problem
 *   content
 *   ### Context
 *   content
 *   ---
 */
function parseEntries(text: string, defaultType?: string): Array<Record<string, string>> {
  const results: Array<Record<string, string>> = []
  // Split on "## " headings (top-level entries)
  const sections = text.split(/\n(?=## )/).slice(1) // skip document title

  for (const section of sections) {
    const entry: Record<string, string> = { type: defaultType || "note" }
    const lines = section.split("\n")

    // First line is "## Title"
    const titleMatch = lines[0]?.match(/^##\s+(.+)/)
    if (titleMatch) entry.title = titleMatch[1].trim()

    // Parse key-value lines (- key: value)
    let i = 1
    for (; i < lines.length; i++) {
      const kv = lines[i].match(/^-\s*(\w+)\s*:\s*(.*)/)
      if (!kv) break
      const key = kv[1].toLowerCase()
      const val = kv[2].trim()
      if (key === "id") entry.id = val
      else if (key === "type") entry.type = val
      else if (key === "status") entry.status = val
      else if (key === "tags") entry.tags = val
      else if (key === "source") entry.source = val
      else if (key === "session") entry.session_id = val
      else if (key === "agent") entry.agent = val
      else if (key === "created") entry.created_at = val
    }

    // Parse ### subsection content
    let currentSection = ""
    for (; i < lines.length; i++) {
      const header = lines[i].match(/^###\s+(.+)/)
      if (header) {
        currentSection = header[1].toLowerCase().replace(/ \/ .*$/, "").replace(/[^a-z0-9]/g, "_").replace(/_+$/, "")
        if (currentSection === "solution" || currentSection === "attempt") currentSection = "solution"
      } else if (currentSection && lines[i].trim() && !lines[i].match(/^---\s*$/)) {
        entry[currentSection] = (entry[currentSection] || "") + lines[i].trim() + "\n"
      }
    }

    // Strip trailing newlines
    for (const k of ["problem", "context", "solution", "evidence"]) {
      if (entry[k]) entry[k] = entry[k].trim()
    }

    if (entry.title) results.push(entry)
  }

  return results
}

async function migrateFromFile(root: string, filePath: string, defaultType?: string): Promise<number> {
  try {
    const text = await readFile(filePath, "utf8")
    const entries = parseEntries(text, defaultType)
    if (entries.length === 0) return 0

    const db = await getDatabase()
    let count = 0
    for (const entry of entries) {
      const id = entry.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      // Check if already migrated
      const existing = db.query("SELECT id FROM memories WHERE id = ?").get(id)
      if (existing) continue

      db.query(
        `INSERT OR IGNORE INTO memories (id, type, title, problem, context, solution, evidence, tags, source, status, session_id, agent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
          id,
          entry.type || defaultType || "note",
          entry.title || "untitled",
          entry.problem || "",
          entry.context || "",
          entry.solution || "",
          entry.evidence || "",
          entry.tags || "",
          entry.source || "",
          entry.status || "migrated",
          entry.session_id || "",
          entry.agent || "",
          entry.created_at || nowIso(),
          nowIso(),
      )
      count++
    }
    return count
  } catch (error) {
    return 0
  }
}

export async function migrate() {
  const root = getMemoryRoot()
  try {
    await readFile(path.join(root, "memory.db"))
  } catch {
    // first run: database will be created by getDatabase
  }

  await getDatabase()
  let total = 0

  const entriesDir = path.join(root, "entries")
  try {
    const files = await readdir(entriesDir)
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort()
    for (const f of mdFiles) {
      const c = await migrateFromFile(root, path.join(entriesDir, f))
      if (c > 0) total += c
    }
  } catch {
    // entries directory not found, skip
  }

  for (const ledger of LEDGER_FILES) {
    const fp = path.join(root, ledger)
    const type = TYPE_MAP[ledger.replace(/\.md$/, "")]
    const c = await migrateFromFile(root, fp, type)
    if (c > 0) total += c
  }

  await saveDatabase()
}
