/**
 * Shared SQLite database module for OpenCode memory system.
 * Used by the one-time Markdown migration helper.
 *
 * This file stays under lib/ because OpenCode treats every tools/*.ts export
 * as a custom tool. Bun SQLite is part of the OpenCode runtime and requires no
 * npm dependency.
 */
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { Database } from "bun:sqlite"

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

let db: Database | null = null
let dbRoot = ""

export function getMemoryRoot(ctx?: ToolContext): string {
  const root = ctx?.worktree || ctx?.directory || process.cwd()
  return path.join(root, MEMORY_ROOT)
}

export function getDbPath(root: string): string {
  return path.join(root, DB_FILE)
}

export async function getDatabase(ctx?: ToolContext): Promise<Database> {
  const root = getMemoryRoot(ctx)
  if (db && dbRoot === root) return db

  await mkdir(root, { recursive: true })
  const dbf = getDbPath(root)
  db = new Database(dbf, { create: true })
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;")
  db.exec(SCHEMA)
  dbRoot = root
  return db
}

export async function saveDatabase(): Promise<void> {
  // Bun SQLite persists each committed statement immediately. Retained as a
  // compatibility no-op for migrate-to-sqlite.ts.
}

export function nowIso(): string {
  return new Date().toISOString()
}
