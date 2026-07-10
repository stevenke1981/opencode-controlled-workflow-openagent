/**
 * Safe Research -> Try -> Learn continuation hook.
 *
 * This adapter follows OpenCode's current `event` hook and normalizes SDK
 * `{ data, error }` responses. It deliberately stops on cancellation, token
 * limits, pending questions/tools, child sessions, stagnation, and repeated
 * dispatch failures.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

type Todo = { id?: string; content?: string; title?: string; status?: string }
type LoopConfig = {
  enabled: boolean
  cooldownMs: number
  maxStagnantRounds: number
  maxFailures: number
  failureResetMs: number
  searchMemoryFirst: boolean
  requireRollbackPlan: boolean
  recordSuccess: boolean
  recordFailure: boolean
  skills: string[]
  memoryTools: string[]
}

type LoopState = {
  inFlight: boolean
  lastSignature?: string
  stagnantCount: number
  failureCount: number
  lastRunAt: number
  lastFailureAt: number
  cancelled: boolean
  tokenLimited: boolean
  skipIdleOnce: boolean
}

const DEFAULT_CONFIG: LoopConfig = {
  enabled: true,
  cooldownMs: 10_000,
  maxStagnantRounds: 3,
  maxFailures: 5,
  failureResetMs: 300_000,
  searchMemoryFirst: true,
  requireRollbackPlan: true,
  recordSuccess: true,
  recordFailure: true,
  skills: [
    "experience-ledger",
    "research-discovery",
    "mcp-skill-scout",
    "community-research",
    "solution-trial-loop",
    "self-improvement",
  ],
  memoryTools: ["memory_search", "memory_add", "memory_read", "memory_list"],
}

const SHARED_KEY = Symbol.for("opencode-controlled-workflow.research-learn-loop")
const shared = ((globalThis as any)[SHARED_KEY] ??= {
  directories: new Set<string>(),
  sessions: new Map<string, LoopState>(),
}) as { directories: Set<string>; sessions: Map<string, LoopState> }

function stripJsonc(input: string): string {
  let output = "", inString = false, escaped = false, line = false, block = false
  for (let index = 0; index < input.length; index += 1) {
    const current = input[index], next = input[index + 1]
    if (line) {
      if (current === "\n") { line = false; output += current }
      continue
    }
    if (block) {
      if (current === "*" && next === "/") { block = false; index += 1 }
      continue
    }
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

async function readConfig(directory: string): Promise<LoopConfig> {
  const roots = [
    path.join(homedir(), ".config", "opencode", "plugins", "research-learn-loop.config.jsonc"),
    path.join(directory, ".opencode", "plugins", "research-learn-loop.config.jsonc"),
  ]
  let result = { ...DEFAULT_CONFIG }
  for (const file of roots) {
    try {
      const value = JSON.parse(stripJsonc(await readFile(file, "utf8")))
      result = { ...result, ...value }
    } catch {
      // Missing or invalid optional override: retain the safe defaults.
    }
  }
  return result
}

function normalize<T>(response: any, fallback: T): T {
  let value = response
  for (let depth = 0; depth < 12; depth += 1) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !("data" in value) || value.data === undefined || value.data === value) break
    value = value.data
  }
  return (value ?? fallback) as T
}

function normalizeArray<T>(response: any, fallback: T[]): T[] {
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

function getState(sessionID: string): LoopState {
  const existing = shared.sessions.get(sessionID)
  if (existing) return existing
  const created: LoopState = {
    inFlight: false,
    stagnantCount: 0,
    failureCount: 0,
    lastRunAt: 0,
    lastFailureAt: 0,
    cancelled: false,
    tokenLimited: false,
    skipIdleOnce: false,
  }
  shared.sessions.set(sessionID, created)
  return created
}

function eventSessionID(event: any): string | undefined {
  const props = event?.properties ?? {}
  return props.sessionID || props.session?.id || props.id || event?.sessionID
}

function incompleteTodos(todos: Todo[]): Todo[] {
  return todos.filter((todo) => !["completed", "cancelled", "canceled", "done"].includes(String(todo.status ?? "").toLowerCase()))
}

function todoSignature(todos: Todo[]): string {
  return incompleteTodos(todos).map((todo) => `${todo.id ?? ""}:${todo.status ?? ""}:${todo.content ?? todo.title ?? ""}`).join("|")
}

function textOf(message: any): string {
  const parts = message?.parts ?? message?.data?.parts ?? []
  if (Array.isArray(parts)) {
    const text = parts.filter((part: any) => part?.type === "text").map((part: any) => part?.text || "").join("\n")
    if (text) return text
  }
  return String(message?.text || message?.content || "")
}

function hasPendingTool(message: any): boolean {
  const parts = message?.parts ?? message?.data?.parts ?? []
  return Array.isArray(parts) && parts.some((part: any) => {
    if (part?.type !== "tool") return false
    const status = String(part?.state?.status ?? part?.status ?? "").toLowerCase()
    return status === "pending" || status === "running"
  })
}

function hasPendingQuestion(messages: any[]): boolean {
  const latest = [...messages].reverse().find((message) => textOf(message))
  const text = textOf(latest).toLowerCase()
  return /waiting for user|need your confirmation|please confirm|請確認|需要你確認|等待使用者/.test(text)
}

function hasStopPattern(messages: any[]): boolean {
  const text = textOf(messages[messages.length - 1])
  return /BLOCKED:|WAITING_FOR_USER:|PERMISSION_REQUIRED:|AUTH_ERROR:|TOKEN_LIMIT:|USER_CANCELLED:/.test(text)
}

function buildPrompt(todos: Todo[], signature: string, config: LoopConfig): string {
  const remaining = incompleteTodos(todos)
    .map((todo, index) => `${index + 1}. [${todo.status ?? "pending"}] ${todo.content ?? todo.title ?? todo.id ?? "untitled"}`)
    .join("\n")
  return `[SYSTEM DIRECTIVE - RESEARCH TRY LEARN CONTINUATION]

Incomplete work remains. Continue the next pending or in-progress todo. Do not ask the user unless blocked by missing requirements, dangerous operations, credentials, permissions, or external mutation.

Required loop:
${config.searchMemoryFirst ? "1. Call memory_search first and memory_read for a relevant hit." : "1. Inspect the current local evidence."}
2. Load only the relevant skills from: ${config.skills.join(", ")}.
3. Use local code and official/original sources before community candidates.
4. Try one method at a time${config.requireRollbackPlan ? " with a baseline, rollback, and verification" : " with verification"}.
${config.recordFailure ? "5. Record failed attempts with memory_add type=failure." : "5. Preserve exact failure evidence."}
${config.recordSuccess ? "6. Record verified success with memory_add type=success." : "6. Preserve verification evidence."}
7. Stop only when all todos are complete/cancelled or a real blocker is reached.

Todo signature: ${signature}
${remaining}`
}

async function handleIdle(ctx: any, sessionID: string, config: LoopConfig): Promise<void> {
  const state = getState(sessionID)
  if (state.cancelled || state.tokenLimited || state.inFlight) return
  if (state.skipIdleOnce) { state.skipIdleOnce = false; return }

  if (state.failureCount >= config.maxFailures && Date.now() - state.lastFailureAt >= config.failureResetMs) {
    state.failureCount = 0
  }
  if (state.failureCount >= config.maxFailures) return
  const effectiveCooldown = config.cooldownMs * 2 ** Math.min(state.failureCount, 5)
  if (Date.now() - state.lastRunAt < effectiveCooldown) return

  const sessionResponse = await ctx.client.session.get({ sessionID, directory: ctx.directory }).catch(() => undefined)
  const session = normalize<any>(sessionResponse, {})
  if (session?.parentID || String(session?.title || "").startsWith("[hermes-review]")) return

  const messageResponse = await ctx.client.session.messages({ sessionID, directory: ctx.directory })
  const messages = normalizeArray<any>(messageResponse, [])
  if (!Array.isArray(messages) || messages.length === 0) return
  if (hasStopPattern(messages) || hasPendingQuestion(messages) || hasPendingTool(messages[messages.length - 1])) return

  const todoResponse = await ctx.client.session.todo({ sessionID, directory: ctx.directory })
  const todos = normalizeArray<Todo>(todoResponse, [])
  if (!Array.isArray(todos)) return
  const remaining = incompleteTodos(todos)
  if (remaining.length === 0) {
    state.lastSignature = undefined
    state.stagnantCount = 0
    return
  }

  const signature = todoSignature(todos)
  state.stagnantCount = signature === state.lastSignature ? state.stagnantCount + 1 : 0
  state.lastSignature = signature
  if (state.stagnantCount >= config.maxStagnantRounds) return

  const lastInfo = [...messages].reverse().map((message: any) => message?.info ?? message).find((info: any) => info?.agent || info?.model) ?? {}
  state.inFlight = true
  state.lastRunAt = Date.now()
  try {
    await ctx.client.session.promptAsync({
      sessionID,
      directory: ctx.directory,
      agent: lastInfo.agent || "odin",
      ...(lastInfo.model ? { model: lastInfo.model } : {}),
      parts: [{ type: "text", text: buildPrompt(todos, signature, config) }],
    })
    state.failureCount = 0
  } catch {
    state.failureCount += 1
    state.lastFailureAt = Date.now()
  } finally {
    state.inFlight = false
  }
}

const ResearchLearnLoopPlugin = (async (ctx: any) => {
  if (shared.directories.has(ctx.directory)) return {}
  shared.directories.add(ctx.directory)
  const config = await readConfig(ctx.directory)
  if (!config.enabled) return {}

  return {
    event: async (input: any) => {
      const event = input?.event ?? input
      const sessionID = eventSessionID(event)
      if (!sessionID) return
      const state = getState(sessionID)

      if (event.type === "session.error") {
        const errorText = JSON.stringify(event.properties?.error ?? "")
        if (/MessageAbortedError|AbortError/i.test(errorText)) state.cancelled = true
        if (/token.{0,12}limit|context.{0,12}(overflow|length)|maximum context/i.test(errorText)) state.tokenLimited = true
        return
      }
      if (event.type === "session.compacted") {
        state.skipIdleOnce = true
        return
      }
      if (event.type === "session.deleted") {
        shared.sessions.delete(sessionID)
        return
      }
      if (event.type === "session.idle") await handleIdle(ctx, sessionID, config)
    },
  }
}) satisfies Plugin

export default ResearchLearnLoopPlugin
