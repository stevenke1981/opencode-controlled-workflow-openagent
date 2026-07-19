import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import HermesPlugin from "../.opencode/plugins/hermes-self-evolution.plugin"
import ModelAuditPlugin from "../.opencode/plugins/model-audit.plugin"
import ResearchPlugin from "../.opencode/plugins/research-learn-loop.plugin"

const roots: string[] = []

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "opencode-plugin-lifecycle-"))
  roots.push(root)
  await mkdir(path.join(root, ".opencode", "plugins"), { recursive: true })
  return root
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for plugin event")
    await Bun.sleep(10)
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("OpenCode 1.17 flat SDK lifecycle", () => {
  test("MCP config hook forces manually supplied fragments disabled", async () => {
    const root = await fixture()
    const mcpRoot = path.join(root, ".opencode", "evolution", "mcp")
    await mkdir(mcpRoot, { recursive: true })
    await writeFile(path.join(mcpRoot, "manual.json"), JSON.stringify({
      type: "remote",
      url: "https://example.test/mcp",
      enabled: true,
    }))
    const hooks: any = await HermesPlugin({ directory: root, client: { session: {} } } as any)
    const config: any = { mcp: {} }
    hooks.config(config)
    expect(config.mcp.manual.enabled).toBe(false)
  })

  test("model audit records resolved provider, model, effort, agent, and session", async () => {
    const root = await fixture()
    const hooks: any = await ModelAuditPlugin({ directory: root, client: {} } as any)
    await hooks["chat.params"]({
      sessionID: "session-audit-1",
      agent: "hephaestus",
      model: { providerID: "opencode-go", id: "deepseek-v4-flash" },
      provider: { info: { id: "opencode-go" }, options: {} },
      message: {
        agent: "hephaestus",
        model: {
          providerID: "opencode-go",
          modelID: "deepseek-v4-flash",
          variant: "max",
        },
      },
    }, {
      temperature: 0,
      topP: 1,
      topK: 0,
      maxOutputTokens: 4096,
      options: { reasoningEffort: "max", apiKey: "must-not-be-written" },
    })

    const audit = await readFile(path.join(root, ".opencode", "memory", ".runtime", "model-audit.jsonl"), "utf8")
    const entry = JSON.parse(audit.trim())
    expect(entry).toMatchObject({
      event: "model.resolved",
      session: "session-audit-1",
      agent: "hephaestus",
      provider: "opencode-go",
      model: "deepseek-v4-flash",
      effort: "max",
      effortSource: "options.reasoningEffort",
      variant: "max",
    })
    expect(audit).not.toContain("must-not-be-written")
  })

  test("Hermes review dispatches once, finalizes child, then permits the next review", async () => {
    const root = await fixture()
    await writeFile(path.join(root, ".opencode", "plugins", "hermes-self-evolution.config.jsonc"), JSON.stringify({
      enabled: true,
      reviewOnIdle: true,
      triggerMode: "always",
      cooldownMs: 0,
      minMessages: 1,
      curator: { enabled: false },
    }))

    const parentMessages: any[] = [
      { info: { role: "user" }, parts: [{ type: "text", text: "Fix and verify the skill workflow." }] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "Verified." }] },
    ]
    const childMessages = [{ info: { role: "assistant" }, parts: [{ type: "text", text: "Saved one durable lesson." }] }]
    const creates: any[] = []
    const prompts: any[] = []
    const client = {
      session: {
        get: async (input: any) => ({ data: { data: { id: input.sessionID, title: "parent" } } }),
        messages: async (input: any) => ({ data: { data: { data: { data: { messages: input.sessionID === "child-1" ? childMessages : parentMessages } } } } }),
        create: async (input: any) => {
          creates.push(input)
          return { data: { data: { id: `child-${creates.length}` } } }
        },
        promptAsync: async (input: any) => { prompts.push(input); return { data: true } },
      },
      tui: { showToast: async () => ({ data: true }) },
    }
    const hooks: any = await HermesPlugin({ directory: root, client } as any)

    await hooks.event({ event: { type: "session.idle", properties: { sessionID: "parent-1" } } })
    await waitFor(() => prompts.length === 1)
    expect(creates[0]).toMatchObject({ parentID: "parent-1", directory: root })
    expect(creates[0].path).toBeUndefined()
    expect(prompts[0]).toMatchObject({ sessionID: "child-1", directory: root, agent: "hermes-reviewer" })
    expect(prompts[0].body).toBeUndefined()

    parentMessages.push({ info: { role: "user" }, parts: [{ type: "text", text: "Another durable signal." }] })
    await hooks.event({ event: { type: "session.idle", properties: { sessionID: "parent-1" } } })
    await Bun.sleep(30)
    expect(creates.length).toBe(1)

    await hooks.event({ event: { type: "session.idle", properties: { sessionID: "child-1" } } })
    const audit = await readFile(path.join(root, ".opencode", "evolution", "reviews", "index.jsonl"), "utf8")
    expect(audit).toContain('"event":"review.started"')
    expect(audit).toContain('"event":"review.completed"')

    parentMessages.push({ info: { role: "assistant" }, parts: [{ type: "text", text: "Second review ready." }] })
    await hooks.event({ event: { type: "session.idle", properties: { sessionID: "parent-1" } } })
    await waitFor(() => creates.length === 2)
  })

  test("research continuation uses flat get/messages/todo/promptAsync parameters", async () => {
    const root = await fixture()
    await writeFile(path.join(root, ".opencode", "plugins", "research-learn-loop.config.jsonc"), JSON.stringify({
      enabled: true,
      cooldownMs: 0,
    }))
    const calls: Record<string, any[]> = { get: [], messages: [], todo: [], promptAsync: [] }
    const client = {
      session: {
        get: async (input: any) => { calls.get.push(input); return { data: { data: { id: input.sessionID } } } },
        messages: async (input: any) => {
          calls.messages.push(input)
          return { data: { data: { data: { messages: [{ info: { role: "assistant", agent: "odin" }, parts: [{ type: "text", text: "Work remains." }] }] } } } }
        },
        todo: async (input: any) => { calls.todo.push(input); return { data: { data: { items: [{ id: "1", status: "pending", content: "verify" }] } } } },
        promptAsync: async (input: any) => { calls.promptAsync.push(input); return { data: true } },
      },
    }
    const hooks: any = await ResearchPlugin({ directory: root, client } as any)
    await hooks.event({ event: { type: "session.idle", properties: { sessionID: "parent-2" } } })

    for (const name of ["get", "messages", "todo", "promptAsync"]) {
      expect(calls[name][0]).toMatchObject({ sessionID: "parent-2", directory: root })
      expect(calls[name][0].path).toBeUndefined()
      expect(calls[name][0].query).toBeUndefined()
      expect(calls[name][0].body).toBeUndefined()
    }
  })
})
