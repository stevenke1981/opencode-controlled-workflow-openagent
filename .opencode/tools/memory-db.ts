/**
 * Shared SQLite database module for OpenCode memory system.
 * Used by tools/memory.ts and plugins/memory-lifecycle.plugin.ts
 */
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js"

export type ToolContext = {
  directory?: string
  worktree?: string
  sessionID?: string
  messageID?: string
  agent?: string
}

export const MEMORY_ROOT = ".opencode/memory"
export const DB_FILE = "memory.db"

export const SCHEMA = `
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

let sqlPromise: ReturnType<typeof initSqlJs> | null = null
let db: SqlJsDatabase | null = null
let dbRoot = ""

export function getMemoryRoot(ctx?: ToolContext): string {
  const root = ctx?.worktree || ctx?.directory || process.cwd()
  return path.join(root, MEMORY_ROOT)
}

export function getDbPath(root: string): string {
  return path.join(root, DB_FILE)
}

export async function getDatabase(ctx?: ToolContext): Promise<SqlJsDatabase> {
  const root = getMemoryRoot(ctx)
  if (db && dbRoot === root) return db

  await mkdir(root, { recursive: true })
  const SQL = sqlPromise || (sqlPromise = initSqlJs())
  const sql = await SQL
  const dbf = getDbPath(root)

  try {
    const buffer = await readFile(dbf)
    db = new sql.Database(buffer)
  } catch {
    db = new sql.Database()
    db.run(SCHEMA)
  }
  db.run(SCHEMA) // Ensure schema on existing DBs
  dbRoot = root
  return db
}

export async function saveDatabase(): Promise<void> {
  if (!db) return
  const data = db.export()
  await writeFile(getDbPath(dbRoot), Buffer.from(data))
}

export function nowIso(): string {
  return new Date().toISOString()
}
