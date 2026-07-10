import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getDatabase, saveDatabase } from "../.opencode/lib/memory-db"

test("Bun SQLite memory helper creates WAL database without npm dependencies", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opencode-memory-db-"))
  try {
    const db = await getDatabase({ directory: root })
    db.query(`INSERT INTO memories
      (id, type, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`)
      .run("test-id", "success", "verified", new Date().toISOString(), new Date().toISOString())
    expect(db.query("SELECT title FROM memories WHERE id = ?").get("test-id")).toEqual({ title: "verified" })
    expect(String((db.query("PRAGMA journal_mode").get() as any).journal_mode).toLowerCase()).toBe("wal")
    await saveDatabase()
    db.close()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
