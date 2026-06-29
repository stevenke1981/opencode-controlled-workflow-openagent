/*
  OpenCode Controlled Workflow: Lite Auto Continue Hook

  This is a clean-room reference adapter inspired by the public behavior of
  oh-my-openagent's todo-continuation-enforcer and ralph-loop. It intentionally
  does not copy upstream implementation code.

  IMPORTANT:
  - OpenCode plugin APIs can change. Treat this as a starting adapter.
  - Verify method names against your installed OpenCode/plugin SDK.
  - Keep destructive commands denied in opencode.jsonc.
*/

type Todo = {
  id?: string
  title?: string
  content?: string
  status?: string
}

type Message = {
  role?: string
  text?: string
  content?: string
  agent?: string
  model?: string
  tools?: unknown
}

type HookConfig = {
  enabled: boolean
  cooldownMs: number
  maxStagnationCount: number
  maxConsecutiveFailures: number
  maxIterations: number
  completionPromise: string
  source: string
  skipAgents: string[]
  stopPatterns: string[]
}

const DEFAULT_CONFIG: HookConfig = {
  enabled: true,
  cooldownMs: 5000,
  maxStagnationCount: 3,
  maxConsecutiveFailures: 5,
  maxIterations: 30,
  completionPromise: '<promise>DONE</promise>',
  source: 'opencode-controlled-workflow-lite-auto-continue',
  skipAgents: ['explore', 'librarian', 'merlin', 'multimodal-looker', 'solomon', 'athena'],
  stopPatterns: ['BLOCKED:', 'WAITING_FOR_USER:', 'PERMISSION_REQUIRED:', 'AUTH_ERROR:', 'TOKEN_LIMIT:', 'USER_CANCELLED'],
}

const loopState = new Map<string, {
  lastAt: number
  iteration: number
  lastFingerprint: string
  stagnation: number
  failures: number
}>()

export default function liteAutoContinuePlugin(ctx: any) {
  const config: HookConfig = { ...DEFAULT_CONFIG, ...(ctx.config?.liteAutoContinue ?? {}) }

  ctx.events?.on?.('session.idle', async (event: any) => {
    if (!config.enabled) return

    const sessionID = event?.sessionID ?? event?.session?.id ?? event?.id
    if (!sessionID) return

    const state = getState(sessionID)
    if (state.iteration >= config.maxIterations) return
    if (Date.now() - state.lastAt < config.cooldownMs) return

    let todos: Todo[] = []
    let messages: Message[] = []

    try {
      todos = await readTodos(ctx.client, sessionID)
      messages = await readMessages(ctx.client, sessionID)
    } catch (err) {
      state.failures += 1
      return
    }

    const latestText = textOf(messages[messages.length - 1])
    if (hasStopPattern(latestText, config.stopPatterns)) return
    if (isProbablyWaitingForUser(latestText)) return

    const incomplete = todos.filter(t => !['completed', 'cancelled', 'canceled', 'done'].includes(String(t.status ?? '').toLowerCase()))
    const hasPromise = messages.some(m => textOf(m).includes(config.completionPromise))

    if (incomplete.length === 0 && hasPromise) return
    if (incomplete.length === 0 && !hasPromise) {
      // Ralph-style loop: no open todo, but completion marker is missing.
      // Continue only if this session appears to have opted into promise completion.
      if (!messages.some(m => textOf(m).includes('promise') || textOf(m).includes('/ralph-loop'))) return
    }

    const fingerprint = fingerprintTodos(incomplete)
    if (fingerprint === state.lastFingerprint) state.stagnation += 1
    else state.stagnation = 0
    state.lastFingerprint = fingerprint
    if (state.stagnation > config.maxStagnationCount) return
    if (state.failures > config.maxConsecutiveFailures) return

    const run = lastRunInfo(messages)
    if (run.agent && config.skipAgents.includes(run.agent)) return

    const prompt = buildContinuationPrompt(incomplete, config.completionPromise)

    try {
      state.lastAt = Date.now()
      state.iteration += 1
      await injectPrompt(ctx.client, sessionID, {
        agent: run.agent ?? 'odin',
        model: run.model,
        tools: run.tools,
        source: config.source,
        parts: [{ type: 'text', text: prompt }],
      })
      state.failures = 0
    } catch (err) {
      state.failures += 1
      ctx.logger?.warn?.({ err, sessionID }, 'lite auto-continue injection failed')
    }
  })
}

function getState(sessionID: string) {
  if (!loopState.has(sessionID)) {
    loopState.set(sessionID, { lastAt: 0, iteration: 0, lastFingerprint: '', stagnation: 0, failures: 0 })
  }
  return loopState.get(sessionID)!
}

async function readTodos(client: any, sessionID: string): Promise<Todo[]> {
  if (client?.session?.todo) return await client.session.todo({ path: { id: sessionID } })
  if (client?.session?.todos) return await client.session.todos({ path: { id: sessionID } })
  return []
}

async function readMessages(client: any, sessionID: string): Promise<Message[]> {
  if (client?.session?.messages) return await client.session.messages({ path: { id: sessionID } })
  if (client?.session?.message?.list) return await client.session.message.list({ path: { id: sessionID } })
  return []
}

async function injectPrompt(client: any, sessionID: string, body: any) {
  // Try common shapes. Keep only one in your real adapter after checking your SDK.
  if (client?.session?.promptAsync) {
    return await client.session.promptAsync({ path: { id: sessionID }, body })
  }
  if (client?.session?.prompt?.async) {
    return await client.session.prompt.async({ path: { id: sessionID }, body })
  }
  if (client?.session?.prompt) {
    return await client.session.prompt({ path: { id: sessionID }, body: { ...body, mode: 'async' } })
  }
  throw new Error('No compatible prompt async method found')
}

function textOf(message?: Message): string {
  if (!message) return ''
  return String(message.text ?? message.content ?? '')
}

function hasStopPattern(text: string, patterns: string[]): boolean {
  return patterns.some(p => text.includes(p))
}

function isProbablyWaitingForUser(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('waiting for user') || lower.includes('need your confirmation') || lower.includes('please confirm') || lower.includes('請確認') || lower.includes('需要你確認')
}

function fingerprintTodos(todos: Todo[]): string {
  return todos.map(t => `${t.id ?? ''}:${t.status ?? ''}:${t.title ?? t.content ?? ''}`).join('|')
}

function lastRunInfo(messages: Message[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.agent || m.model || m.tools) return { agent: m.agent, model: m.model, tools: m.tools }
  }
  return { agent: 'odin', model: undefined, tools: undefined }
}

function buildContinuationPrompt(incomplete: Todo[], promise: string): string {
  const todoLines = incomplete.slice(0, 12).map((t, i) => `${i + 1}. [${t.status ?? 'pending'}] ${t.title ?? t.content ?? t.id ?? 'untitled todo'}`).join('\n')
  return `[SYSTEM DIRECTIVE - CONTROLLED AUTO CONTINUE]\n` +
    `Incomplete work remains. Continue the next pending or in-progress task.\n` +
    `Do not ask the user unless blocked by missing requirements, dangerous operation, or permission requirement.\n` +
    `Run relevant verification before marking any task complete.\n` +
    `Stop only when all todos are completed/cancelled or a real blocker exists.\n` +
    `If using promise-loop mode, output ${promise} only after verification evidence exists.\n\n` +
    `Current incomplete todos:\n${todoLines || '(no todo list available; continue toward the requested goal)'}`
}
