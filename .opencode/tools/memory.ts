import { tool } from "@opencode-ai/plugin"
import crypto from "node:crypto"
import { getDatabase, saveDatabase, getMemoryRoot, DB_FILE, type ToolContext } from "./memory-db"

// ─── Types ────────────────────────────────────────────────────────────

const VALID_TYPES = ["success", "failure", "pattern", "decision", "research", "note"] as const
type MemoryType = (typeof VALID_TYPES)[number]

function escapeLike(s: string): string {
  return s.replace(/[%_]/g, "\\$&")
}

// ─── Tools ────────────────────────────────────────────────────────────

export const add = tool({
  description: "Add a persistent project memory entry (SQLite). Use for verified successes, failed attempts, decisions, reusable patterns, research sources, and notes.",
  args: {
    type: tool.schema.enum(VALID_TYPES).describe("Memory category: success, failure, pattern, decision, research, or note"),
    title: tool.schema.string().describe("Short searchable title"),
    problem: tool.schema.string().optional().describe("Problem, error, or task this memory relates to"),
    context: tool.schema.string().optional().describe("Relevant environment, files, commands, versions, or constraints"),
    solution: tool.schema.string().optional().describe("Solution, attempt, decision, or reusable rule"),
    evidence: tool.schema.string().optional().describe("Verification output, test result, source URL summary, or failure evidence"),
    tags: tool.schema.array(tool.schema.string()).optional().describe("Search tags such as rust, cmake, windows, opencode, mcp"),
    source: tool.schema.string().optional().describe("Optional source path, URL, MCP name, issue, discussion, or command"),
    status: tool.schema.string().optional().describe("Status such as verified, failed, partial, deprecated, candidate"),
  },
  async execute(args, ctx: ToolContext) {
    const d = await getDatabase(ctx)
    const id = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`
    const now = new Date().toISOString()
    const tags = (args.tags || []).map((t: string) => t.trim()).filter(Boolean).join(",")
    const type = args.type as MemoryType

    d.run(
      `INSERT INTO memories (id, type, title, problem, context, solution, evidence, tags, source, status, session_id, agent, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, type, args.title.trim(),
        args.problem || "", args.context || "", args.solution || "", args.evidence || "",
        tags, args.source || "", args.status || "recorded",
        ctx?.sessionID || "", ctx?.agent || "", now, now,
      ],
    )
    await saveDatabase()

    return [
      `Memory added: ${id}`,
      `Type: ${type}`,
      `Title: ${args.title.trim()}`,
      `Tags: ${tags || "(none)"}`,
      `Database: ${getMemoryRoot(ctx)}${path.sep}${DB_FILE}`,
    ].join("\n")
  },
})

export const search = tool({
  description: "Search persistent project memory (SQLite). Returns matching entries by keyword, type, or tags.",
  args: {
    query: tool.schema.string().describe("Keywords, error text, package name, command, or concept to search"),
    type: tool.schema.enum(VALID_TYPES).optional().describe("Optional category filter"),
    tags: tool.schema.array(tool.schema.string()).optional().describe("Optional tag filters; results match any of the provided tags"),
    limit: tool.schema.number().optional().describe("Maximum results to return; default 8"),
  },
  async execute(args, ctx: ToolContext) {
    const d = await getDatabase(ctx)
    const terms = args.query.split(/\s+/).filter(Boolean)
    const tagFilters = (args.tags || []).filter(Boolean)
    const limit = Math.max(1, Math.min(50, Number(args.limit || 8)))

    const wheres: string[] = []
    const params: string[] = []

    if (args.type) {
      wheres.push("type = ?")
      params.push(args.type)
    }

    if (terms.length > 0) {
      const likes = terms.map(() =>
        `(title LIKE ? OR problem LIKE ? OR context LIKE ? OR solution LIKE ? OR evidence LIKE ? OR tags LIKE ? OR source LIKE ?)`,
      )
      wheres.push(`(${likes.join(" AND ")})`)
      for (const t of terms) {
        const p = `%${escapeLike(t)}%`
        params.push(p, p, p, p, p, p, p)
      }
    }

    for (const tag of tagFilters) {
      wheres.push("tags LIKE ?")
      params.push(`%${escapeLike(tag)}%`)
    }

    const where = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : ""
    const sql = `SELECT id, type, title, substr(problem || ' ' || context || ' ' || solution, 1, 400) AS excerpt,
                        tags, status, source, created_at
                 FROM memories ${where} ORDER BY created_at DESC LIMIT ?`
    params.push(String(limit))

    const stmt = d.prepare(sql)
    stmt.bind(params)
    const rows: string[] = []

    while (stmt.step()) {
      const r = stmt.getAsObject() as {
        id: string; type: string; title: string; excerpt: string
        tags: string; status: string; source: string; created_at: string
      }
      rows.push([
        `### ${r.title}`,
        `  id: ${r.id} | type: ${r.type} | status: ${r.status}`,
        `  tags: ${r.tags || "(none)"}`,
        `  ${(r.excerpt || "").slice(0, 300)}`,
      ].join("\n"))
    }
    stmt.free()

    if (rows.length === 0) return `No SQLite memory results for: ${args.query}`
    return `Found ${rows.length} result(s):\n\n${rows.join("\n\n---\n\n")}`
  },
})

export const read = tool({
  description: "Read a memory entry by ID, or list all entries. Use after memory_search to inspect full details.",
  args: {
    id: tool.schema.string().optional().describe("Memory entry ID returned by memory_add or memory_search"),
    maxChars: tool.schema.number().optional().describe("Maximum characters to return; default 12000"),
  },
  async execute(args, ctx: ToolContext) {
    const d = await getDatabase(ctx)
    const maxChars = Math.max(1000, Math.min(50000, Number(args.maxChars || 12000)))

    if (!args.id) {
      const stmt = d.prepare("SELECT id, type, title, status, tags, created_at FROM memories ORDER BY created_at DESC LIMIT 50")
      const rows: string[] = []
      while (stmt.step()) {
        const r = stmt.getAsObject() as { id: string; type: string; title: string; status: string; tags: string; created_at: string }
        rows.push(`- ${r.id} [${r.type}] ${r.title} (${r.status}) tags:${r.tags || "-"}`)
      }
      stmt.free()
      if (rows.length === 0) return "No memory entries yet."
      return `Memory entries (${rows.length} shown):\n\n${rows.join("\n")}`
    }

    const stmt = d.prepare("SELECT * FROM memories WHERE id = ?")
    stmt.bind([args.id])
    if (!stmt.step()) {
      stmt.free()
      return `Memory id not found: ${args.id}`
    }
    const r = stmt.getAsObject() as Record<string, string>
    stmt.free()

    const fields = ["id", "type", "title", "problem", "context", "solution", "evidence", "tags", "source", "status", "session_id", "agent", "created_at", "updated_at"]
    const lines = fields
      .filter((f) => r[f])
      .map((f) => {
        const val = r[f].length > maxChars ? r[f].slice(0, maxChars) + "…" : r[f]
        return `### ${f}\n${val}`
      })
    return lines.join("\n\n")
  },
})

export const list = tool({
  description: "List memory summary: entry count by type, total entries, and database info.",
  args: {},
  async execute(_args, ctx: ToolContext) {
    const d = await getDatabase(ctx)
    const lines: string[] = []

    let stmt = d.prepare("SELECT COUNT(*) AS cnt FROM memories")
    stmt.step()
    const total = (stmt.getAsObject() as { cnt: number }).cnt
    stmt.free()
    lines.push(`Total entries: ${total}`)

    stmt = d.prepare("SELECT type, COUNT(*) AS cnt FROM memories GROUP BY type ORDER BY cnt DESC")
    while (stmt.step()) {
      const r = stmt.getAsObject() as { type: string; cnt: number }
      lines.push(`  ${r.type}: ${r.cnt}`)
    }
    stmt.free()

    stmt = d.prepare("SELECT id, type, title, created_at FROM memories ORDER BY created_at DESC LIMIT 5")
    const recent: string[] = []
    while (stmt.step()) {
      const r = stmt.getAsObject() as { id: string; type: string; title: string; created_at: string }
      recent.push(`  - ${r.id}: [${r.type}] ${r.title} (${r.created_at.slice(0, 10)})`)
    }
    stmt.free()
    if (recent.length > 0) {
      lines.push("")
      lines.push("Recent 5 entries:")
      lines.push(...recent)
    }

    const dbSize = d.export().length
    lines.push("")
    lines.push(`Database: ${DB_FILE} (${(dbSize / 1024).toFixed(1)} KB)`)
    lines.push(`Location: ${getMemoryRoot(ctx)}${path.sep}${DB_FILE}`)

    return lines.join("\n")
  },
})
