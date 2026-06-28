import { tool } from "@opencode-ai/plugin"
import { mkdir, readFile, readdir, stat, writeFile, appendFile } from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"

type ToolContext = {
  directory?: string
  worktree?: string
  sessionID?: string
  messageID?: string
  agent?: string
}

type MemoryType = "success" | "failure" | "pattern" | "decision" | "research" | "note"

type MemoryFile = {
  relative: string
  absolute: string
  text: string
}

const MEMORY_ROOT = ".opencode/memory"
const VALID_TYPES = ["success", "failure", "pattern", "decision", "research", "note"] as const
const LEDGER_BY_TYPE: Record<MemoryType, string> = {
  success: "success-ledger.md",
  failure: "failure-ledger.md",
  pattern: "patterns.md",
  decision: "decision-log.md",
  research: "research-sources.md",
  note: "solution-index.md",
}

function projectRoot(context?: ToolContext): string {
  return context?.worktree || context?.directory || process.cwd()
}

function memoryRoot(context?: ToolContext): string {
  return path.join(projectRoot(context), MEMORY_ROOT)
}

function nowIso(): string {
  return new Date().toISOString()
}

function monthKey(): string {
  return new Date().toISOString().slice(0, 7)
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "memory"
}

function safeRelPath(input: string): string {
  const normalized = path.normalize(input).replace(/^([/\\])+/, "")
  if (normalized.includes("..")) throw new Error("Path traversal is not allowed")
  return normalized
}

function clip(input: string | undefined, max = 1200): string {
  if (!input) return ""
  const text = input.trim()
  return text.length > max ? text.slice(0, max) + "…" : text
}

async function ensureMemoryLayout(root: string) {
  await mkdir(root, { recursive: true })
  await mkdir(path.join(root, "entries"), { recursive: true })
  const seedFiles: Record<string, string> = {
    "README.md": "# OpenCode Memory\n\nUse `memory_add`, `memory_search`, and `memory_read` to persist reusable project experience.\n",
    "success-ledger.md": "# Success Ledger\n\nReusable fixes that were verified.\n",
    "failure-ledger.md": "# Failure Ledger\n\nFailed attempts and anti-patterns. Check this before retrying similar solutions.\n",
    "solution-index.md": "# Solution Index\n\nShort index of searchable memories.\n",
    "decision-log.md": "# Decision Log\n\nImportant decisions, assumptions, and tradeoffs.\n",
    "patterns.md": "# Patterns\n\nGeneralized rules learned from repeated work.\n",
    "research-sources.md": "# Research Sources\n\nExternal docs, issues, discussions, MCPs, and skill sources consulted.\n",
    "tool-audit.md": "# Memory Tool Audit\n\nAuto-appended records of memory tool activity.\n",
  }
  for (const [file, body] of Object.entries(seedFiles)) {
    const target = path.join(root, file)
    try {
      await stat(target)
    } catch {
      await writeFile(target, body, "utf8")
    }
  }
}

function entryMarkdown(args: {
  id: string
  type: MemoryType
  title: string
  problem?: string
  context?: string
  solution?: string
  evidence?: string
  tags?: string[]
  source?: string
  status?: string
  sessionID?: string
  agent?: string
}) {
  const tags = (args.tags || []).map((t) => t.trim()).filter(Boolean)
  return [
    `## ${args.title}`,
    "",
    `- id: ${args.id}`,
    `- type: ${args.type}`,
    `- status: ${args.status || "recorded"}`,
    `- created: ${nowIso()}`,
    args.sessionID ? `- session: ${args.sessionID}` : "",
    args.agent ? `- agent: ${args.agent}` : "",
    tags.length ? `- tags: ${tags.join(", ")}` : "- tags:",
    args.source ? `- source: ${args.source}` : "",
    "",
    args.problem ? `### Problem\n${clip(args.problem, 2000)}\n` : "",
    args.context ? `### Context\n${clip(args.context, 2000)}\n` : "",
    args.solution ? `### Solution / Attempt\n${clip(args.solution, 4000)}\n` : "",
    args.evidence ? `### Evidence\n${clip(args.evidence, 3000)}\n` : "",
    "---",
    "",
  ].filter(Boolean).join("\n")
}

async function listMarkdownFiles(root: string, dir = root): Promise<MemoryFile[]> {
  const out: MemoryFile[] = []
  let entries: string[] = []
  try {
    entries = await readdir(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const abs = path.join(dir, name)
    const st = await stat(abs)
    if (st.isDirectory()) {
      out.push(...await listMarkdownFiles(root, abs))
      continue
    }
    if (!name.endsWith(".md")) continue
    const text = await readFile(abs, "utf8")
    out.push({ absolute: abs, relative: path.relative(root, abs).replace(/\\/g, "/"), text })
  }
  return out
}

function scoreText(text: string, terms: string[]): number {
  const lower = text.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (!term) continue
    const needle = term.toLowerCase()
    const count = lower.split(needle).length - 1
    score += count * Math.max(1, needle.length / 4)
  }
  return score
}

function excerpt(text: string, terms: string[], max = 700): string {
  const lower = text.toLowerCase()
  let idx = -1
  for (const term of terms) {
    idx = lower.indexOf(term.toLowerCase())
    if (idx >= 0) break
  }
  if (idx < 0) idx = 0
  const start = Math.max(0, idx - 160)
  return text.slice(start, start + max).replace(/\n{3,}/g, "\n\n")
}

async function audit(root: string, action: string, line: string) {
  await appendFile(path.join(root, "tool-audit.md"), `\n- ${nowIso()} ${action}: ${line}\n`, "utf8")
}

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
  async execute(args, context: ToolContext) {
    const root = memoryRoot(context)
    await ensureMemoryLayout(root)
    const type = args.type as MemoryType
    const id = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`
    const title = args.title.trim()
    const body = entryMarkdown({
      id,
      type,
      title,
      problem: args.problem,
      context: args.context,
      solution: args.solution,
      evidence: args.evidence,
      tags: args.tags,
      source: args.source,
      status: args.status,
      sessionID: context?.sessionID,
      agent: context?.agent,
    })
    const monthly = path.join(root, "entries", `${monthKey()}.md`)
    const ledger = path.join(root, LEDGER_BY_TYPE[type])
    await appendFile(monthly, body, "utf8")
    await appendFile(ledger, body, "utf8")
    await appendFile(path.join(root, "solution-index.md"), `\n- ${nowIso()} [${type}] ${title} — id: ${id}; tags: ${(args.tags || []).join(", ")}\n`, "utf8")
    await audit(root, "add", `${type} ${id} ${title}`)
    return `Memory added: ${id}\nType: ${type}\nFiles updated: entries/${monthKey()}.md, ${LEDGER_BY_TYPE[type]}, solution-index.md`
  },
})

export const search = tool({
  description: "Search persistent project memory before trying fixes. Returns matching memory IDs, files, and excerpts.",
  args: {
    query: tool.schema.string().describe("Keywords, error text, package name, command, or concept to search"),
    type: tool.schema.enum(VALID_TYPES).optional().describe("Optional category filter"),
    tags: tool.schema.array(tool.schema.string()).optional().describe("Optional tag filters; all provided tags should appear"),
    limit: tool.schema.number().optional().describe("Maximum results to return; default 8"),
  },
  async execute(args, context: ToolContext) {
    const root = memoryRoot(context)
    await ensureMemoryLayout(root)
    const terms = args.query.split(/\s+/).map((s) => s.trim()).filter(Boolean)
    const tagTerms = (args.tags || []).map((s: string) => s.toLowerCase())
    const files = await listMarkdownFiles(root)
    const results = files
      .filter((file) => {
        const lower = file.text.toLowerCase()
        if (args.type && !lower.includes(`type: ${args.type}`)) return false
        return tagTerms.every((tag: string) => lower.includes(tag))
      })
      .map((file) => ({
        file,
        score: scoreText(file.text, terms) + scoreText(file.relative, terms) * 2,
      }))
      .filter((item) => item.score > 0 || terms.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(20, Number(args.limit || 8))))

    await audit(root, "search", `${args.query} -> ${results.length} results`)
    if (!results.length) return `No memory results for: ${args.query}`
    return results.map((item, idx) => {
      const id = item.file.text.match(/- id:\s*([^\n]+)/)?.[1] || "n/a"
      return [
        `### ${idx + 1}. ${item.file.relative}`,
        `score: ${item.score.toFixed(2)} | id: ${id}`,
        excerpt(item.file.text, terms),
      ].join("\n")
    }).join("\n\n---\n\n")
  },
})

export const read = tool({
  description: "Read a memory file or a specific memory entry by ID. Use after memory_search to inspect the full entry.",
  args: {
    id: tool.schema.string().optional().describe("Memory entry ID returned by memory_add or memory_search"),
    file: tool.schema.string().optional().describe("Relative path under .opencode/memory, for example success-ledger.md or entries/2026-06.md"),
    maxChars: tool.schema.number().optional().describe("Maximum characters to return; default 12000"),
  },
  async execute(args, context: ToolContext) {
    const root = memoryRoot(context)
    await ensureMemoryLayout(root)
    const maxChars = Math.max(1000, Math.min(50000, Number(args.maxChars || 12000)))
    if (!args.id && !args.file) {
      const files = await listMarkdownFiles(root)
      return `Memory files:\n${files.map((f) => `- ${f.relative}`).join("\n")}`
    }
    if (args.file) {
      const rel = safeRelPath(args.file)
      const abs = path.join(root, rel)
      const text = await readFile(abs, "utf8")
      await audit(root, "read", rel)
      return text.slice(0, maxChars)
    }
    const files = await listMarkdownFiles(root)
    const needle = `- id: ${args.id}`
    for (const file of files) {
      const idx = file.text.indexOf(needle)
      if (idx < 0) continue
      const next = file.text.indexOf("\n---", idx)
      const start = Math.max(0, file.text.lastIndexOf("\n## ", idx))
      const end = next >= 0 ? next + 5 : file.text.length
      await audit(root, "read", `id ${args.id} in ${file.relative}`)
      return `File: ${file.relative}\n\n${file.text.slice(start, end).slice(0, maxChars)}`
    }
    return `Memory id not found: ${args.id}`
  },
})

export const list = tool({
  description: "List available memory files and the newest entry file. Use for orientation when memory_search is too broad.",
  args: {},
  async execute(_args, context: ToolContext) {
    const root = memoryRoot(context)
    await ensureMemoryLayout(root)
    const files = await listMarkdownFiles(root)
    await audit(root, "list", `${files.length} files`)
    return files.map((f) => `- ${f.relative}`).join("\n")
  },
})
