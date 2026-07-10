import { createHash } from "node:crypto"
import { cp, lstat, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

export type EvolutionContext = {
  directory?: string
  worktree?: string
  agent?: string
}

export type AssetKind = "skill" | "mcp" | "plugin" | "hook"

export interface AssetInfo {
  kind: AssetKind
  name: string
  path: string
  size: number
  sha256: string
}

const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SUPPORT_DIRS = new Set(["references", "templates", "scripts", "assets"])
const MAX_SUPPORT_BYTES = 1024 * 1024
const MAX_SKILL_CHARS = 100_000

function stripJsonc(input: string): string {
  let output = "", inString = false, escaped = false, line = false, block = false
  for (let index = 0; index < input.length; index += 1) {
    const current = input[index], next = input[index + 1]
    if (line) { if (current === "\n") { line = false; output += current }; continue }
    if (block) { if (current === "*" && next === "/") { block = false; index += 1 }; continue }
    if (inString) {
      output += current
      if (escaped) escaped = false
      else if (current === "\\") escaped = true
      else if (current === '"') inString = false
      continue
    }
    if (current === '"') { inString = true; output += current }
    else if (current === "/" && next === "/") { line = true; index += 1 }
    else if (current === "/" && next === "*") { block = true; index += 1 }
    else output += current
  }
  return output
}

async function evolutionPolicy(root: string): Promise<{ allowMcpWrites: boolean; allowExecutableWrites: boolean }> {
  const policy = { allowMcpWrites: true, allowExecutableWrites: false }
  const configRoot = process.env.OPENCODE_CONFIG_DIR || path.join(homedir(), ".config", "opencode")
  for (const file of [
    path.join(configRoot, "plugins", "hermes-self-evolution.config.jsonc"),
    path.join(root, ".opencode", "plugins", "hermes-self-evolution.config.jsonc"),
  ]) {
    try {
      const value = JSON.parse(stripJsonc(await readFile(file, "utf8")))
      if (typeof value.allowMcpWrites === "boolean") policy.allowMcpWrites = value.allowMcpWrites
      if (typeof value.allowExecutableWrites === "boolean") policy.allowExecutableWrites = value.allowExecutableWrites
    } catch {
      // Missing or invalid policy cannot relax executable writes.
    }
  }
  return policy
}

function workspace(ctx?: EvolutionContext): string {
  return path.resolve(ctx?.worktree || ctx?.directory || process.cwd())
}

function assertName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new Error("Invalid name: expected ^[a-z0-9][a-z0-9._-]{0,63}$")
  }
}

function resolveInside(root: string, ...parts: string[]): string {
  const target = path.resolve(root, ...parts)
  const rel = path.relative(root, target)
  if (rel === "" || (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))) {
    return target
  }
  throw new Error("Path traversal is not allowed")
}

async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file)
    return true
  } catch (error: any) {
    if (error?.code === "ENOENT") return false
    throw error
  }
}

/** Reject every existing symlink/junction component before reading or writing. */
async function assertNoLinks(root: string, target: string): Promise<void> {
  const rel = path.relative(root, target)
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    throw new Error("Path traversal is not allowed")
  }

  let cursor = root
  const segments = rel ? rel.split(path.sep) : []
  for (const segment of segments) {
    cursor = path.join(cursor, segment)
    try {
      const info = await lstat(cursor)
      if (info.isSymbolicLink()) throw new Error(`Symlink or junction is not allowed: ${cursor}`)
    } catch (error: any) {
      if (error?.code === "ENOENT") break
      throw error
    }
  }
}

export function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex")
}

async function readHashed(file: string): Promise<{ content: string; sha256: string; size: number }> {
  const data = await readFile(file)
  return { content: data.toString("utf8"), sha256: sha256(data), size: data.byteLength }
}

async function guardedWrite(file: string, content: string, expectedHash?: string): Promise<AssetInfo | null> {
  const currentExists = await exists(file)
  if (currentExists) {
    if (!expectedHash) throw new Error("expectedHash is required when updating an existing file")
    const current = await readFile(file)
    if (sha256(current) !== expectedHash.toLowerCase()) {
      throw new Error("Hash guard rejected the write: expectedHash does not match current content")
    }
  }
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content, { encoding: "utf8", flag: currentExists ? "w" : "wx" })
  return null
}

function yamlScalar(value: string | number | boolean): string {
  if (typeof value === "string") return JSON.stringify(value)
  return String(value)
}

function yamlLines(value: Record<string, unknown>, indent = ""): string[] {
  const lines: string[] = []
  for (const [key, item] of Object.entries(value)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(key)) throw new Error(`Invalid frontmatter key: ${key}`)
    if (item === undefined || item === null) continue
    if (["string", "number", "boolean"].includes(typeof item)) {
      lines.push(`${indent}${key}: ${yamlScalar(item as string | number | boolean)}`)
    } else if (Array.isArray(item) && item.every((entry) => ["string", "number", "boolean"].includes(typeof entry))) {
      lines.push(`${indent}${key}: [${item.map((entry) => yamlScalar(entry)).join(", ")}]`)
    } else if (typeof item === "object" && !Array.isArray(item)) {
      lines.push(`${indent}${key}:`)
      lines.push(...yamlLines(item as Record<string, unknown>, indent + "  "))
    } else {
      throw new Error(`Unsupported frontmatter value: ${key}`)
    }
  }
  return lines
}

export function parseFrontmatter(content: string): { raw: string; fields: Record<string, string> } {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  if (!normalized.startsWith("---\n")) throw new Error("SKILL.md must begin with YAML frontmatter")
  const end = normalized.indexOf("\n---\n", 4)
  if (end < 0) throw new Error("SKILL.md frontmatter is not closed")
  const raw = normalized.slice(4, end)
  const fields: Record<string, string> = {}
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*?)\s*$/)
    if (!match || !match[2]) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      try { value = JSON.parse(value) } catch { value = value.slice(1, -1) }
    }
    fields[match[1]] = String(value)
  }
  return { raw, fields }
}

export function validateSkillContent(content: string, expectedName?: string): void {
  if (content.length > MAX_SKILL_CHARS) throw new Error(`SKILL.md exceeds ${MAX_SKILL_CHARS} characters`)
  const { fields } = parseFrontmatter(content)
  const name = fields.name
  if (!name) throw new Error("SKILL.md frontmatter requires name")
  assertName(name)
  if (expectedName && name !== expectedName) throw new Error("Frontmatter name must match the skill directory")
  if (!fields.description) throw new Error("SKILL.md frontmatter requires description")
  if (fields.description.length > 1024) throw new Error("Skill description exceeds 1024 characters")
}

export function buildSkillContent(input: {
  name: string
  description: string
  body: string
  createdBy?: string
  metadata?: Record<string, unknown>
}): string {
  assertName(input.name)
  if (!input.description.trim() || input.description.length > 1024) {
    throw new Error("Skill description must contain 1-1024 characters")
  }
  const frontmatter: Record<string, unknown> = {
    name: input.name,
    description: input.description,
    ...((input.createdBy || input.metadata) ? {
      metadata: {
        ...(input.metadata || {}),
        ...(input.createdBy ? { created_by: input.createdBy } : {}),
      },
    } : {}),
  }
  const content = `---\n${yamlLines(frontmatter).join("\n")}\n---\n${input.body.startsWith("\n") ? "" : "\n"}${input.body}`
  validateSkillContent(content, input.name)
  return content
}

export async function writeSkill(input: {
  name: string
  description?: string
  body?: string
  content?: string
  createdBy?: string
  metadata?: Record<string, unknown>
  expectedHash?: string
}, ctx?: EvolutionContext): Promise<AssetInfo> {
  assertName(input.name)
  const root = workspace(ctx)
  const file = resolveInside(root, ".opencode", "skills", input.name, "SKILL.md")
  await assertNoLinks(root, file)
  const currentExists = await exists(file)
  const reviewAgent = /hermes-review/i.test(ctx?.agent || "")
  const createdBy = !currentExists && reviewAgent ? "hermes-review" : input.createdBy
  const content = input.content ?? buildSkillContent({
    name: input.name,
    description: input.description || "",
    body: input.body || "",
    createdBy,
    metadata: input.metadata,
  })
  validateSkillContent(content, input.name)
  if (!currentExists && reviewAgent && !isHermesReviewSkill(content)) {
    throw new Error("New background-review skills must declare metadata.created_by: hermes-review")
  }
  await guardedWrite(file, content, input.expectedHash)
  const result = await readHashed(file)
  return { kind: "skill", name: input.name, path: file, size: result.size, sha256: result.sha256 }
}

export async function writeSupportFile(input: {
  skill: string
  directory: "references" | "templates" | "scripts" | "assets"
  file: string
  content: string
  expectedHash?: string
}, ctx?: EvolutionContext): Promise<AssetInfo> {
  assertName(input.skill)
  if (!SUPPORT_DIRS.has(input.directory)) throw new Error("Unsupported support directory")
  if (!input.file || path.isAbsolute(input.file)) throw new Error("Support file must be a relative path")
  const bytes = Buffer.byteLength(input.content, "utf8")
  if (bytes > MAX_SUPPORT_BYTES) throw new Error("Support file exceeds 1 MiB")
  const root = workspace(ctx)
  const supportRoot = resolveInside(root, ".opencode", "skills", input.skill, input.directory)
  const file = resolveInside(supportRoot, input.file)
  await assertNoLinks(root, file)
  await guardedWrite(file, input.content, input.expectedHash)
  const result = await readHashed(file)
  return { kind: "skill", name: `${input.skill}/${input.directory}/${input.file.replaceAll("\\", "/")}`, path: file, size: result.size, sha256: result.sha256 }
}

function isSecretPlaceholder(value: string): boolean {
  return /^\{env:[A-Z_][A-Z0-9_]*\}$/.test(value)
}

function assertNoPlaintextSecrets(value: unknown, key = ""): void {
  if (typeof value === "string") {
    const secretKey = /(?:secret|token|password|passwd|api[-_]?key|authorization|cookie|private[-_]?key)/i.test(key)
    const secretValue = /(?:^|\s)(?:sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{20,}|bearer\s+\S{8,})/i.test(value)
    if ((secretKey && value && !isSecretPlaceholder(value)) || secretValue) {
      throw new Error(`Plaintext secret-like value is not allowed at ${key || "value"}; use an environment placeholder`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPlaintextSecrets(entry, `${key}[${index}]`))
    return
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      assertNoPlaintextSecrets(child, key ? `${key}.${childKey}` : childKey)
    }
  }
}

export type McpConfig =
  | { type: "local"; command: string[]; environment?: Record<string, string>; enabled?: boolean }
  | { type: "remote"; url: string; headers?: Record<string, string>; enabled?: boolean }

function validateMcp(config: McpConfig): McpConfig {
  if (!config || typeof config !== "object") throw new Error("MCP config must be an object")
  if (config.type === "local") {
    if (!Array.isArray(config.command) || config.command.length === 0 || !config.command.every((part) => typeof part === "string" && part.length > 0)) {
      throw new Error("Local MCP requires a non-empty command string array")
    }
    if (config.environment && (typeof config.environment !== "object" || Array.isArray(config.environment))) {
      throw new Error("Local MCP environment must be a string map")
    }
    if (config.environment && !Object.values(config.environment).every((value) => typeof value === "string")) {
      throw new Error("Local MCP environment must be a string map")
    }
    const commandText = config.command.join(" ")
    if (/(?:curl|wget|\biwr\b|\birm\b).*(?:\||\biex\b|\bsh\b)|\brm\s+-rf\b|\bgit\s+reset\s+--hard\b/i.test(commandText)) {
      throw new Error("Network-to-shell or destructive MCP commands are not allowed")
    }
  } else if (config.type === "remote") {
    let url: URL
    try { url = new URL(config.url) } catch { throw new Error("Remote MCP requires a valid URL") }
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    if (!(url.protocol === "https:" || localHttp) || url.username || url.password) {
      throw new Error("Remote MCP URL must use HTTPS (or localhost HTTP) without embedded credentials")
    }
    if (config.headers && (typeof config.headers !== "object" || Array.isArray(config.headers) || !Object.values(config.headers).every((value) => typeof value === "string"))) {
      throw new Error("Remote MCP headers must be a string map")
    }
  } else {
    throw new Error("MCP type must be local or remote")
  }
  if (config.enabled !== undefined && typeof config.enabled !== "boolean") throw new Error("MCP enabled must be boolean")
  assertNoPlaintextSecrets(config)
  return { ...config, enabled: false }
}

export async function registerMcp(input: {
  name: string
  config: McpConfig
  expectedHash?: string
}, ctx?: EvolutionContext): Promise<AssetInfo> {
  assertName(input.name)
  const root = workspace(ctx)
  if (!(await evolutionPolicy(root)).allowMcpWrites) {
    throw new Error("MCP evolution writes are disabled by policy")
  }
  const file = resolveInside(root, ".opencode", "evolution", "mcp", `${input.name}.json`)
  await assertNoLinks(root, file)
  const config = validateMcp(input.config)
  await guardedWrite(file, JSON.stringify(config, null, 2) + "\n", input.expectedHash)
  const result = await readHashed(file)
  return { kind: "mcp", name: input.name, path: file, size: result.size, sha256: result.sha256 }
}

export async function writeIntegration(input: {
  kind: "plugin" | "hook"
  name: string
  content: string
  allowExecutableWrites?: boolean
  expectedHash?: string
}, ctx?: EvolutionContext): Promise<AssetInfo & { live: boolean }> {
  assertName(input.name)
  const root = workspace(ctx)
  const reviewAgent = /hermes-review/i.test(ctx?.agent || "")
  const policy = await evolutionPolicy(root)
  const live = input.allowExecutableWrites === true && policy.allowExecutableWrites && !reviewAgent
  const file = live
    ? resolveInside(root, ".opencode", "plugins", `${input.name}.${input.kind}.ts`)
    : resolveInside(root, ".opencode", "evolution", "proposals", `${input.kind}s`, `${input.name}.ts`)
  await assertNoLinks(root, file)
  await guardedWrite(file, input.content, input.expectedHash)
  const result = await readHashed(file)
  return { kind: input.kind, name: input.name, path: file, size: result.size, sha256: result.sha256, live }
}

async function collectFiles(root: string, current: string, kind: AssetKind, prefix = ""): Promise<AssetInfo[]> {
  if (!(await exists(current))) return []
  await assertNoLinks(root, current)
  const entries = await readdir(current, { withFileTypes: true })
  const output: AssetInfo[] = []
  for (const entry of entries) {
    const file = path.join(current, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Symlink or junction is not allowed: ${file}`)
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) output.push(...await collectFiles(root, file, kind, name))
    else if (entry.isFile()) {
      const result = await readHashed(file)
      output.push({ kind, name: name.replaceAll("\\", "/"), path: file, size: result.size, sha256: result.sha256 })
    }
  }
  return output
}

export async function listAssets(ctx?: EvolutionContext): Promise<AssetInfo[]> {
  const root = workspace(ctx)
  const groups: Array<[AssetKind, string]> = [
    ["skill", resolveInside(root, ".opencode", "skills")],
    ["mcp", resolveInside(root, ".opencode", "evolution", "mcp")],
    ["plugin", resolveInside(root, ".opencode", "evolution", "proposals", "plugins")],
    ["hook", resolveInside(root, ".opencode", "evolution", "proposals", "hooks")],
  ]
  return (await Promise.all(groups.map(([kind, folder]) => collectFiles(root, folder, kind)))).flat()
}

export async function inspectAsset(input: { kind: AssetKind; name: string; live?: boolean }, ctx?: EvolutionContext): Promise<AssetInfo & { content: string }> {
  if (!input.name || path.isAbsolute(input.name)) throw new Error("Asset name must be relative")
  const root = workspace(ctx)
  const bases: Record<AssetKind, string> = {
    skill: resolveInside(root, ".opencode", "skills"),
    mcp: resolveInside(root, ".opencode", "evolution", "mcp"),
    plugin: resolveInside(root, ".opencode", "evolution", "proposals", "plugins"),
    hook: resolveInside(root, ".opencode", "evolution", "proposals", "hooks"),
  }
  const base = input.live && (input.kind === "plugin" || input.kind === "hook")
    ? resolveInside(root, ".opencode", "plugins")
    : bases[input.kind]
  const file = resolveInside(base, input.name)
  await assertNoLinks(root, file)
  const result = await readHashed(file)
  return { kind: input.kind, name: input.name, path: file, ...result }
}

function isHermesReviewSkill(content: string): boolean {
  const { raw } = parseFrontmatter(content)
  return /^\s*created_by\s*:\s*["']?hermes-review["']?\s*$/mi.test(raw)
}

async function assertTreeHasNoLinks(root: string, folder: string): Promise<void> {
  await assertNoLinks(root, folder)
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const child = path.join(folder, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Symlink or junction is not allowed: ${child}`)
    if (entry.isDirectory()) await assertTreeHasNoLinks(root, child)
  }
}

export async function curateSkills(input: {
  mode: "dry-run" | "apply"
  names?: string[]
  staleAfterDays?: number
  archiveAfterDays?: number
}, ctx?: EvolutionContext): Promise<{ mode: "dry-run" | "apply"; eligible: string[]; stale: string[]; skipped: string[]; backup?: string; archived: string[] }> {
  const root = workspace(ctx)
  const staleAfterDays = input.staleAfterDays ?? 30
  const archiveAfterDays = input.archiveAfterDays ?? 90
  if (staleAfterDays < 1 || archiveAfterDays < staleAfterDays) {
    throw new Error("Curator requires archiveAfterDays >= staleAfterDays >= 1")
  }
  const skillsRoot = resolveInside(root, ".opencode", "skills")
  const requested = input.names?.length
    ? input.names
    : (await exists(skillsRoot) ? (await readdir(skillsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name) : [])
  const eligible: string[] = []
  const stale: string[] = []
  const skipped: string[] = []
  for (const name of requested) {
    assertName(name)
    const folder = resolveInside(skillsRoot, name)
    const file = resolveInside(folder, "SKILL.md")
    if (!(await exists(file))) { skipped.push(name); continue }
    await assertTreeHasNoLinks(root, folder)
    const content = await readFile(file, "utf8")
    if (!isHermesReviewSkill(content)) { skipped.push(name); continue }
    const ageDays = (Date.now() - (await stat(file)).mtimeMs) / 86_400_000
    if (ageDays >= archiveAfterDays) eligible.push(name)
    else if (ageDays >= staleAfterDays) stale.push(name)
    else skipped.push(name)
  }
  if (input.mode === "dry-run" || eligible.length === 0) {
    return { mode: input.mode, eligible, stale, skipped, archived: [] }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backup = resolveInside(root, ".opencode", "evolution", "backups", stamp, "skills")
  const archive = resolveInside(root, ".opencode", "evolution", "archive", "skills", stamp)
  await assertNoLinks(root, backup)
  await assertNoLinks(root, archive)
  await mkdir(backup, { recursive: true })
  await mkdir(archive, { recursive: true })
  for (const name of eligible) {
    const source = resolveInside(skillsRoot, name)
    await cp(source, resolveInside(backup, name), { recursive: true, errorOnExist: true, force: false })
  }
  const archived: string[] = []
  for (const name of eligible) {
    await rename(resolveInside(skillsRoot, name), resolveInside(archive, name))
    archived.push(name)
  }
  return { mode: input.mode, eligible, stale, skipped, backup, archived }
}
