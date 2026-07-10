/**
 * OpenCode Persistent Memory Tool
 *
 * Dual-mode backend:
 *   1. SQLite via OpenCode's Bun runtime (primary, zero dependencies)
 *   2. JSON file fallback (zero dependencies, always works)
 *
 * If Bun SQLite is unavailable, the tool degrades gracefully to JSON storage.
 * The tool always returns empty strings to avoid cluttering the OpenCode UI.
 */
import { tool } from "@opencode-ai/plugin"
import crypto from "node:crypto"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import fs from "node:fs"

// ─── Types ────────────────────────────────────────────────────────────

export type ToolContext = {
  directory?: string
  worktree?: string
  sessionID?: string
  messageID?: string
  agent?: string
}

interface MemoryRow {
  id: string
  type: string
  title: string
  problem: string
  context: string
  solution: string
  evidence: string
  tags: string
  source: string
  status: string
  session_id: string
  agent: string
  created_at: string
  updated_at: string
}

const VALID_TYPES = ["success", "failure", "pattern", "decision", "research", "note"] as const
type MemoryType = (typeof VALID_TYPES)[number]
const MEMORY_ROOT = ".opencode/memory"
const DB_FILE = "memory.db"
const FALLBACK_FILE = "memory-fallback.json"

function getMemoryRoot(ctx?: ToolContext): string {
  const root = ctx?.worktree || ctx?.directory || process.cwd()
  return path.join(root, MEMORY_ROOT)
}

function escapeLike(s: string): string {
  return s.replace(/[%_]/g, "\\$&")
}

// ─── Backend abstraction ──────────────────────────────────────────────

interface Backend {
  insert(row: MemoryRow): Promise<void>
  search(params: {
    type?: string
    terms: string[]
    tags: string[]
    limit: number
  }): Promise<{ id: string; type: string; title: string; excerpt: string; tags: string; status: string; source: string; created_at: string }[]>
  readById(id: string): Promise<MemoryRow | null>
  listAll(limit: number): Promise<{ id: string; type: string; title: string; status: string; tags: string; created_at: string }[]>
  countByType(): Promise<{ type: string; count: number }[]>
  totalCount(): Promise<number>
}

// ─── SQLite backend (primary) ─────────────────────────────────────────

async function createSqliteBackend(root: string): Promise<Backend | null> {
  try {
    const { Database } = await import("bun:sqlite")
    const dbf = path.join(root, DB_FILE)
    const db = new Database(dbf, { create: true })

    const SCHEMA = `
      CREATE TABLE IF NOT EXISTS memories (
        id          TEXT PRIMARY KEY,
        type        TEXT NOT NULL CHECK(type IN ('success','failure','pattern','decision','research','note')),
        title       TEXT NOT NULL,
        problem     TEXT DEFAULT '',
        context     TEXT DEFAULT '',
        solution    TEXT DEFAULT '',
        evidence    TEXT DEFAULT '',
        tags        TEXT DEFAULT '',
        source      TEXT DEFAULT '',
        status      TEXT DEFAULT 'recorded',
        session_id  TEXT DEFAULT '',
        agent       TEXT DEFAULT '',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
    `
    db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;")
    db.exec(SCHEMA)

    return {
      async insert(row) {
        db.query(
          `INSERT INTO memories (id, type, title, problem, context, solution, evidence, tags, source, status, session_id, agent, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(row.id, row.type, row.title, row.problem, row.context, row.solution, row.evidence,
          row.tags, row.source, row.status, row.session_id, row.agent, row.created_at, row.updated_at)
      },

      async search({ type, terms, tags, limit }) {
        const wheres: string[] = []
        const params: string[] = []

        if (type) {
          wheres.push("type = ?")
          params.push(type)
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

        for (const tag of tags) {
          wheres.push("tags LIKE ?")
          params.push(`%${escapeLike(tag)}%`)
        }

        const where = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : ""
        const sql = `SELECT id, type, title,
                            substr(problem || ' ' || context || ' ' || solution, 1, 400) AS excerpt,
                            tags, status, source, created_at
                     FROM memories ${where} ORDER BY created_at DESC LIMIT ?`
        params.push(String(limit))
        return db.query(sql).all(...params) as any[]
      },

      async readById(id) {
        return (db.query("SELECT * FROM memories WHERE id = ?").get(id) as MemoryRow | null) ?? null
      },

      async listAll(limit) {
        return db.query("SELECT id, type, title, status, tags, created_at FROM memories ORDER BY created_at DESC LIMIT ?").all(limit) as any[]
      },

      async countByType() {
        return db.query("SELECT type, count(*) as count FROM memories GROUP BY type").all() as { type: string; count: number }[]
      },

      async totalCount() {
        return Number((db.query("SELECT count(*) as c FROM memories").get() as { c?: number } | null)?.c ?? 0)
      },
    }
  } catch {
    return null
  }
}

// ─── JSON file backend (fallback) ─────────────────────────────────────

function createJsonBackend(root: string): Backend {
  const storeFile = path.join(root, FALLBACK_FILE)
  let store: MemoryRow[] = []

  function load(): void {
    try {
      const data = fs.readFileSync(storeFile, "utf8")
      store = JSON.parse(data)
    } catch {
      store = []
    }
  }

  function save(): void {
    try {
      fs.mkdirSync(root, { recursive: true })
    } catch { /* ignore */ }
    fs.writeFileSync(storeFile, JSON.stringify(store, null, 2), "utf8")
  }

  load()

  return {
    async insert(row) {
      store.push(row)
      save()
    },

    async search({ type, terms, tags, limit }) {
      let results = [...store]

      if (type) {
        results = results.filter((r) => r.type === type)
      }

      if (terms.length > 0) {
        results = results.filter((r) => {
          const haystack = [r.title, r.problem, r.context, r.solution, r.evidence, r.tags, r.source]
            .filter(Boolean).join(" ").toLowerCase()
          return terms.every((t) => haystack.includes(t.toLowerCase()))
        })
      }

      for (const tag of tags) {
        results = results.filter((r) => r.tags.toLowerCase().includes(tag.toLowerCase()))
      }

      results.sort((a, b) => b.created_at.localeCompare(a.created_at))
      results = results.slice(0, limit)

      return results.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        excerpt: [r.problem, r.context, r.solution].filter(Boolean).join(" ").slice(0, 400),
        tags: r.tags,
        status: r.status,
        source: r.source,
        created_at: r.created_at,
      }))
    },

    async readById(id) {
      return store.find((r) => r.id === id) || null
    },

    async listAll(limit) {
      return store
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit)
        .map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          status: r.status,
          tags: r.tags,
          created_at: r.created_at,
        }))
    },

    async countByType() {
      const map = new Map<string, number>()
      for (const r of store) {
        map.set(r.type, (map.get(r.type) || 0) + 1)
      }
      return [...map.entries()].map(([type, count]) => ({ type, count }))
    },

    async totalCount() {
      return store.length
    },
  }
}

// ─── Backend initialisation ───────────────────────────────────────────

let cachedBackend: Backend | null = null
let cachedRoot = ""

async function getBackend(ctx?: ToolContext): Promise<Backend> {
  const root = getMemoryRoot(ctx)

  // Reuse cached backend when root hasn't changed
  if (cachedBackend && cachedRoot === root) return cachedBackend

  await mkdir(root, { recursive: true }).catch(() => {})

  // Try SQLite first
  const sqlite = await createSqliteBackend(root)
  if (sqlite) {
    cachedBackend = sqlite
    cachedRoot = root
    return sqlite
  }

  // Fallback to JSON
  cachedBackend = createJsonBackend(root)
  cachedRoot = root
  return cachedBackend
}

// ─── Helper ───────────────────────────────────────────────────────────

function buildRow(args: any, ctx?: ToolContext, type?: MemoryType): MemoryRow {
  const now = new Date().toISOString()
  const id = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`
  const tags = (args.tags || []).map((t: string) => t.trim()).filter(Boolean).join(",")
  const row = {
    id,
    type: type || args.type as string,
    title: args.title.trim(),
    problem: args.problem || "",
    context: args.context || "",
    solution: args.solution || "",
    evidence: args.evidence || "",
    tags,
    source: args.source || "",
    status: args.status || "recorded",
    session_id: ctx?.sessionID || "",
    agent: ctx?.agent || "",
    created_at: now,
    updated_at: now,
  }
  const searchable = Object.entries(row)
    .filter(([key]) => !["id", "created_at", "updated_at"].includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
  if (/\b(?:sk|ghp|github_pat|xox[baprs])-[-A-Za-z0-9_]{12,}\b|Bearer\s+[A-Za-z0-9._~+\/-]{12,}|(?:api[_-]?key|token|password|authorization)\s*[:=]\s*(?!\$\{|\{env:)[^\s,;]+/i.test(searchable)) {
    throw new Error("Memory entry rejected: secret-like content must be redacted")
  }
  return row
}

// ─── Tools ────────────────────────────────────────────────────────────

export const add = tool({
  description: "Add a persistent project memory entry. Use for verified successes, failed attempts, decisions, reusable patterns, research sources, and notes.",
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
    const backend = await getBackend(ctx)
    const row = buildRow(args, ctx, args.type as MemoryType)
    await backend.insert(row)
    return `memory_add: stored ${row.id} [${row.type}] ${row.title}`
  },
})

export const search = tool({
  description: "Search persistent project memory. Returns matching entries by keyword, type, or tags.",
  args: {
    query: tool.schema.string().describe("Keywords, error text, package name, command, or concept to search"),
    type: tool.schema.enum(VALID_TYPES).optional().describe("Optional category filter"),
    tags: tool.schema.array(tool.schema.string()).optional().describe("Optional tag filters; results match any of the provided tags"),
    limit: tool.schema.number().optional().describe("Maximum results to return; default 8"),
  },
  async execute(args, ctx: ToolContext) {
    const backend = await getBackend(ctx)
    const terms = args.query.split(/\s+/).filter(Boolean)
    const tagFilters = (args.tags || []).filter(Boolean)
    const limit = Math.max(1, Math.min(50, Number(args.limit || 8)))

    const rows = await backend.search({ type: args.type, terms, tags: tagFilters, limit })

    if (rows.length === 0) return ""
    return `memory_search: ${rows.length} results\n${rows.map((r) => `- [${r.type}] ${r.title}  (${r.id})`).join("\n")}`
  },
})

export const read = tool({
  description: "Read a memory entry by ID, or list all entries. Use after memory_search to inspect full details.",
  args: {
    id: tool.schema.string().optional().describe("Memory entry ID returned by memory_add or memory_search"),
    maxChars: tool.schema.number().optional().describe("Maximum characters to return; default 12000"),
  },
  async execute(args, ctx: ToolContext) {
    const backend = await getBackend(ctx)
    const maxChars = Math.max(1000, Math.min(50000, Number(args.maxChars || 12000)))

    if (!args.id) {
      const rows = await backend.listAll(50)
      if (rows.length === 0) return ""
      return `memory_read: ${rows.length} entries\n${rows.map((r) =>
        `- ${r.id} [${r.type}] ${r.title} (${r.status}) tags:${r.tags || "-"}`).join("\n")}`
    }

    const row = await backend.readById(args.id)
    if (!row) return ""

    const fields = ["id", "type", "title", "problem", "context", "solution", "evidence", "tags", "source", "status", "session_id", "agent", "created_at", "updated_at"]
    const lines = fields
      .filter((f) => (row as any)[f])
      .map((f) => {
        const val = String((row as any)[f])
        return `${f}: ${val.length > maxChars ? val.slice(0, maxChars) + "…" : val}`
      })
    return lines.join("\n")
  },
})

export const list = tool({
  description: "List memory summary: entry count by type, total entries, and database info.",
  args: {},
  async execute(_args, ctx: ToolContext) {
    const backend = await getBackend(ctx)
    const [total, counts, recent] = await Promise.all([
      backend.totalCount(),
      backend.countByType(),
      backend.listAll(5),
    ])
    const countText = counts.length ? counts.map((item) => `${item.type}=${item.count}`).join(", ") : "empty"
    const recentText = recent.length ? `\n${recent.map((item) => `- ${item.id} [${item.type}] ${item.title}`).join("\n")}` : ""
    return `memory_list: total=${total}; ${countText}${recentText}`
  },
})
