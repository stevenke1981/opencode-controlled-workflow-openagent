/**
 * Hermes-style self-evolution for OpenCode.
 *
 * Meaningful completed turns spawn a separate child session. The child is
 * restricted to memory, skill inspection, and the guarded evolution tools.
 * It cannot run shell commands, edit arbitrary files, ask questions, or spawn
 * more agents. MCP fragments are merged through the config hook; executable
 * plugin/hook changes stay proposals unless promoted by a foreground agent.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { appendFile, mkdir, readFile, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

type CuratorConfig = {
  enabled: boolean
  intervalHours: number
  staleAfterDays: number
  archiveAfterDays: number
  applyAutomatically: boolean
}

type EvolutionConfig = {
  enabled: boolean
  reviewOnIdle: boolean
  triggerMode: "always" | "signals"
  cooldownMs: number
  minMessages: number
  maxTranscriptChars: number
  allowMcpWrites: boolean
  allowExecutableWrites: boolean
  curator: CuratorConfig
}

type ReviewState = {
  inFlight: boolean
  lastRunAt: number
  lastMessageCount: number
}

type SharedState = {
  initializedDirectories: Set<string>
  sessions: Map<string, ReviewState>
  reviewChildren: Map<string, { parentID: string; root: string }>
  lastCuratorRun: Map<string, number>
}

const DEFAULT_CONFIG: EvolutionConfig = {
  enabled: true,
  reviewOnIdle: true,
  triggerMode: "signals",
  cooldownMs: 60_000,
  minMessages: 2,
  maxTranscriptChars: 18_000,
  allowMcpWrites: true,
  allowExecutableWrites: false,
  curator: {
    enabled: true,
    intervalHours: 168,
    staleAfterDays: 30,
    archiveAfterDays: 90,
    applyAutomatically: false,
  },
}

const SHARED_KEY = Symbol.for("opencode-controlled-workflow.hermes-evolution")
const shared = ((globalThis as any)[SHARED_KEY] ??= {
  initializedDirectories: new Set<string>(),
  sessions: new Map<string, ReviewState>(),
  reviewChildren: new Map<string, { parentID: string; root: string }>(),
  lastCuratorRun: new Map<string, number>(),
}) as SharedState

const REVIEW_TOOLS = {
  memory_search: true,
  memory_read: true,
  memory_add: true,
  memory_list: true,
  evolution_inspect: true,
  evolution_skill: true,
  evolution_support: true,
  evolution_integration: true,
  evolution_curate: true,
  skill: true,
  bash: false,
  edit: false,
  write: false,
  task: false,
  question: false,
  webfetch: false,
}

const REVIEW_PERMISSION = [
  { permission: "*", pattern: "*", action: "deny" as const },
  ...Object.entries(REVIEW_TOOLS)
    .filter(([, allowed]) => allowed)
    .map(([permission]) => ({ permission, pattern: "*", action: "allow" as const })),
]

function stripJsonc(input: string): string {
  let output = ""
  let inString = false
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index]
    const next = input[index + 1]
    if (lineComment) {
      if (current === "\n") {
        lineComment = false
        output += current
      }
      continue
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false
        index += 1
      }
      continue
    }
    if (inString) {
      output += current
      if (escaped) escaped = false
      else if (current === "\\") escaped = true
      else if (current === '"') inString = false
      continue
    }
    if (current === '"') {
      inString = true
      output += current
    } else if (current === "/" && next === "/") {
      lineComment = true
      index += 1
    } else if (current === "/" && next === "*") {
      blockComment = true
      index += 1
    } else {
      output += current
    }
  }
  return output
}

async function readJsonc(file: string): Promise<any | undefined> {
  try {
    return JSON.parse(stripJsonc(await readFile(file, "utf8")))
  } catch {
    return undefined
  }
}

function configRoot(): string {
  return process.env.OPENCODE_CONFIG_DIR || path.join(homedir(), ".config", "opencode")
}

function mergeConfig(base: EvolutionConfig, value: any): EvolutionConfig {
  return {
    ...base,
    ...(value && typeof value === "object" ? value : {}),
    curator: {
      ...base.curator,
      ...(value?.curator && typeof value.curator === "object" ? value.curator : {}),
    },
  }
}

async function loadConfig(directory: string): Promise<EvolutionConfig> {
  const globalConfig = await readJsonc(path.join(configRoot(), "plugins", "hermes-self-evolution.config.jsonc"))
  const projectConfig = await readJsonc(path.join(directory, ".opencode", "plugins", "hermes-self-evolution.config.jsonc"))
  return mergeConfig(mergeConfig(DEFAULT_CONFIG, globalConfig), projectConfig)
}

function validMcpFragment(value: any): boolean {
  if (!value || typeof value !== "object") return false
  if (value.type === "local") {
    return Array.isArray(value.command) && value.command.length > 0 && value.command.every((part: unknown) => typeof part === "string")
  }
  if (value.type === "remote") return typeof value.url === "string" && /^https:\/\//i.test(value.url)
  return value.enabled === false && Object.keys(value).length === 1
}

async function loadMcpFragments(directory: string): Promise<Record<string, any>> {
  const result: Record<string, any> = {}
  const roots = [
    path.join(configRoot(), "evolution", "mcp"),
    path.join(directory, ".opencode", "evolution", "mcp"),
  ]
  for (const root of roots) {
    let names: string[] = []
    try {
      names = await readdir(root)
    } catch {
      continue
    }
    for (const name of names.sort()) {
      if (!/\.jsonc?$/i.test(name)) continue
      const fragment = await readJsonc(path.join(root, name))
      const key = path.basename(name).replace(/\.jsonc?$/i, "")
      if (validMcpFragment(fragment)) result[key] = { ...fragment, enabled: false }
    }
  }
  return result
}

function normalizeData<T>(response: any, fallback: T): T {
  let value = response
  for (let depth = 0; depth < 12; depth += 1) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !("data" in value) || value.data === undefined || value.data === value) break
    value = value.data
  }
  return (value ?? fallback) as T
}

function normalizeArrayData<T>(response: any, fallback: T[]): T[] {
  const queue: any[] = [response]
  const seen = new Set<any>()
  for (let visited = 0; queue.length > 0 && visited < 24; visited += 1) {
    const value = queue.shift()
    if (Array.isArray(value)) return value as T[]
    if (!value || typeof value !== "object" || seen.has(value)) continue
    seen.add(value)
    for (const key of ["data", "messages", "items", "results"]) {
      if (key in value && value[key] !== value) queue.push(value[key])
    }
  }
  return fallback
}

function sessionIDFromEvent(event: any): string | undefined {
  const properties = event?.properties ?? {}
  return properties.sessionID || properties.session?.id || properties.id || event?.sessionID
}

function messageText(message: any): string {
  const parts = message?.parts ?? message?.data?.parts ?? []
  const partText = Array.isArray(parts)
    ? parts.filter((part: any) => part?.type === "text" && typeof part?.text === "string").map((part: any) => part.text).join("\n")
    : ""
  return String(partText || message?.text || message?.content || "")
}

function messageRole(message: any): string {
  return String(message?.info?.role || message?.role || message?.data?.info?.role || "unknown")
}

function redact(text: string): string {
  return text
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs])-[-A-Za-z0-9_]{12,}\b/g, "[REDACTED_TOKEN]")
    .replace(/((?:api[_-]?key|token|password|authorization)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{12,}/gi, "Bearer [REDACTED]")
}

function transcript(messages: any[], maxChars: number): string {
  const rendered = messages.map((message) => `${messageRole(message)}: ${messageText(message)}`).join("\n\n")
  return redact(rendered.slice(Math.max(0, rendered.length - maxChars)))
}

function hasReviewSignal(text: string): boolean {
  return /\b(remember|learn(?:ed|ing)?|preference|correct(?:ed|ion)?|failed|failure|error|workaround|root cause|verified|verification|regression|skill|hook|plugin|mcp)\b|記住|學到|偏好|修正|錯誤|失敗|成功|驗證|根因|技能|外掛|鉤子|記憶/i.test(text)
}

function curatorDue(directory: string, config: EvolutionConfig): boolean {
  if (!config.curator.enabled) return false
  const last = shared.lastCuratorRun.get(directory) ?? 0
  return Date.now() - last >= config.curator.intervalHours * 60 * 60 * 1000
}

async function audit(root: string, entry: Record<string, unknown>): Promise<void> {
  const reviewRoot = path.join(root, ".opencode", "evolution", "reviews")
  await mkdir(reviewRoot, { recursive: true })
  await appendFile(path.join(reviewRoot, "index.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8")
}

function reviewPrompt(snapshot: string, config: EvolutionConfig, shouldCurate: boolean): string {
  return `You are the isolated Hermes self-improvement reviewer for an OpenCode project.

Review the transcript below only for durable, non-sensitive learning. Do not continue the user's product task.

Required order:
1. Use memory_search before writing anything; use memory_read on relevant hits.
2. Separate declarative project facts (memory_add) from repeatable procedures (skills).
3. Before changing a skill, use evolution_inspect and pass its SHA-256 as expectedHash to evolution_skill.
4. Prefer updating an existing umbrella skill. Create a new class-level skill only when no umbrella fits.
5. MCP registrations must be secret-free and disabled by default.
6. Plugin/hook code must remain a proposal. You are never allowed to activate executable integration code.
7. Do not store tokens, credentials, private URLs, cookies, personal data, or full private logs.
8. If nothing is durable, make no writes and answer "Nothing durable to save."
${shouldCurate ? `9. Run evolution_curate in dry-run mode using staleAfterDays=${config.curator.staleAfterDays} and archiveAfterDays=${config.curator.archiveAfterDays}; never apply from background review.` : ""}

Allowed outputs are memory entries, guarded skill updates/support files, disabled MCP fragments, and executable proposals.

TRANSCRIPT (redacted and bounded):
---
${snapshot}
---`
}

async function finalizeReview(client: any, sessionID: string, info: { parentID: string; root: string }): Promise<void> {
  try {
    const response = await client.session.messages({ sessionID, directory: info.root })
    const messages = normalizeArrayData<any>(response, [])
    const summary = [...messages].reverse().map(messageText).find(Boolean)?.slice(0, 1200) || "Review completed without a text summary."
    await audit(info.root, { event: "review.completed", parentID: info.parentID, reviewSessionID: sessionID, summary: redact(summary) })
    await client.tui?.showToast?.({ body: { title: "Hermes self-review", message: summary.slice(0, 220), variant: "info", duration: 5000 } }).catch(() => {})
  } finally {
    shared.reviewChildren.delete(sessionID)
    const parent = shared.sessions.get(info.parentID)
    if (parent) parent.inFlight = false
  }
}

async function failReview(sessionID: string, info: { parentID: string; root: string }, error: unknown): Promise<void> {
  await audit(info.root, {
    event: "review.failed",
    parentID: info.parentID,
    reviewSessionID: sessionID,
    error: redact(String(error)),
  })
  shared.reviewChildren.delete(sessionID)
  const parent = shared.sessions.get(info.parentID)
  if (parent) {
    parent.inFlight = false
    parent.lastRunAt = 0
  }
}

async function spawnReview(ctx: any, parentID: string, config: EvolutionConfig): Promise<void> {
  const current = shared.sessions.get(parentID) ?? { inFlight: false, lastRunAt: 0, lastMessageCount: 0 }
  shared.sessions.set(parentID, current)
  if (current.inFlight || Date.now() - current.lastRunAt < config.cooldownMs) return

  const sessionResponse = await ctx.client.session.get({ sessionID: parentID, directory: ctx.directory }).catch(() => undefined)
  const session = normalizeData<any>(sessionResponse, {})
  if (session?.parentID || String(session?.title || "").startsWith("[hermes-review]")) return

  const messagesResponse = await ctx.client.session.messages({ sessionID: parentID, directory: ctx.directory })
  const messages = normalizeArrayData<any>(messagesResponse, [])
  if (messages.length < config.minMessages || messages.length <= current.lastMessageCount) return

  const snapshot = transcript(messages, config.maxTranscriptChars)
  if (config.triggerMode === "signals" && !hasReviewSignal(snapshot)) {
    current.lastMessageCount = messages.length
    return
  }

  current.inFlight = true
  current.lastRunAt = Date.now()
  const shouldCurate = curatorDue(ctx.directory, config)
  let childID: string | undefined
  try {
    const createResponse = await ctx.client.session.create({
      parentID,
      title: `[hermes-review] ${parentID}`,
      permission: REVIEW_PERMISSION,
      directory: ctx.directory,
    })
    const child = normalizeData<any>(createResponse, {})
    if (!child?.id) throw new Error("OpenCode did not return a review child session ID")
    childID = child.id

    shared.reviewChildren.set(childID, { parentID, root: ctx.directory })
    current.lastMessageCount = messages.length
    if (shouldCurate) {
      shared.lastCuratorRun.set(ctx.directory, Date.now())
    }
    await audit(ctx.directory, { event: "review.started", parentID, reviewSessionID: childID, messageCount: messages.length, curatorDue: shouldCurate })

    await ctx.client.session.promptAsync({
      sessionID: childID,
      directory: ctx.directory,
      agent: "hermes-reviewer",
      tools: REVIEW_TOOLS,
      parts: [{ type: "text", text: reviewPrompt(snapshot, config, shouldCurate) }],
    })
  } catch (error) {
    if (childID) await failReview(childID, { parentID, root: ctx.directory }, error)
    else {
      current.lastRunAt = 0
      await audit(ctx.directory, { event: "review.failed", parentID, error: redact(String(error)) })
    }
    current.inFlight = false
  }
}

const HermesSelfEvolutionPlugin = (async (ctx: any) => {
  if (shared.initializedDirectories.has(ctx.directory)) return {}
  shared.initializedDirectories.add(ctx.directory)

  const config = await loadConfig(ctx.directory)
  if (!config.enabled) return {}
  const mcpFragments = config.allowMcpWrites ? await loadMcpFragments(ctx.directory) : {}

  return {
    config: (liveConfig: any) => {
      liveConfig.mcp = { ...(liveConfig.mcp || {}), ...mcpFragments }
    },
    event: async (input: any) => {
      const event = input?.event ?? input
      const sessionID = sessionIDFromEvent(event)
      if (!sessionID) return

      const child = shared.reviewChildren.get(sessionID)
      if (child) {
        if (event?.type === "session.idle") await finalizeReview(ctx.client, sessionID, child)
        else if (event?.type === "session.error" || event?.type === "session.deleted") {
          await failReview(sessionID, child, event?.properties?.error || event?.type)
        }
        return
      }
      if (event?.type !== "session.idle") return
      if (!config.reviewOnIdle) return
      void spawnReview(ctx, sessionID, config)
    },
  }
}) satisfies Plugin

export default HermesSelfEvolutionPlugin
