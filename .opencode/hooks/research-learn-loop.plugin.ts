/**
 * research-learn-loop.plugin.ts
 *
 * Reference OpenCode plugin adapter for a Research -> Try -> Learn loop.
 *
 * This file is intentionally conservative and may need small API adjustments for
 * your installed OpenCode SDK version. OpenCode plugins are the correct extension
 * point for event hooks and integrations; keep dangerous operations gated by
 * OpenCode permissions.
 */

type Todo = { id?: string; content?: string; title?: string; status?: string };

type LiteState = {
  inFlight: boolean;
  lastSignature?: string;
  stagnantCount: number;
  failureCount: number;
  lastRunAt: number;
};

const state = new Map<string, LiteState>();

const CONFIG = {
  cooldownMs: 10_000,
  maxStagnantRounds: 3,
  maxFailures: 5,
  memoryFiles: [
    '.opencode/memory/solution-index.md',
    '.opencode/memory/success-ledger.md',
    '.opencode/memory/failure-ledger.md',
    '.opencode/memory/patterns.md',
  ],
};

function getSessionState(sessionID: string): LiteState {
  const current = state.get(sessionID) ?? {
    inFlight: false,
    stagnantCount: 0,
    failureCount: 0,
    lastRunAt: 0,
  };
  state.set(sessionID, current);
  return current;
}

function incompleteTodos(todos: Todo[]): Todo[] {
  return todos.filter((t) => !['completed', 'cancelled', 'canceled'].includes(String(t.status ?? '').toLowerCase()));
}

function todoSignature(todos: Todo[]): string {
  return incompleteTodos(todos)
    .map((t) => `${t.id ?? ''}:${t.status ?? ''}:${t.content ?? t.title ?? ''}`)
    .join('|');
}

function buildResearchContinuationPrompt(todos: Todo[], signature: string): string {
  const remaining = incompleteTodos(todos)
    .map((t, i) => `${i + 1}. [${t.status ?? 'pending'}] ${t.content ?? t.title ?? t.id ?? 'untitled'}`)
    .join('\n');

  return `
[SYSTEM DIRECTIVE - RESEARCH TRY LEARN CONTINUATION]

Incomplete work remains. Continue without asking the user unless blocked by missing requirements, dangerous operations, credentials, or external mutation.

Required loop:
1. Search local experience memory first:
   - ${CONFIG.memoryFiles.join('\n   - ')}
2. If blocked or repeatedly failing, load these skills:
   - research-discovery
   - mcp-skill-scout
   - community-research
   - solution-trial-loop
   - experience-ledger
   - self-improvement
3. Discover multiple methods from local code, official docs, upstream issues/discussions, community sources, MCP, and skills.
4. Try one method at a time with baseline, smallest experiment, verification, and rollback.
5. Record failed attempts in .opencode/memory/failure-ledger.md and decision-log.md.
6. Record successful methods in .opencode/memory/success-ledger.md and solution-index.md.
7. Stop only when all todos are completed/cancelled, or a real blocker is reached.

Current incomplete todo signature:
${signature}

Remaining todos:
${remaining}
`;
}

/**
 * Pseudocode shape. Adapt `client` calls to your installed OpenCode plugin API.
 */
export default async function ResearchLearnLoopPlugin(ctx: any) {
  return {
    async event(input: any) {
      const eventName = input?.event?.type ?? input?.type ?? '';
      if (eventName !== 'session.idle') return;

      const sessionID = input?.sessionID ?? input?.properties?.sessionID ?? input?.session?.id;
      if (!sessionID) return;

      const s = getSessionState(sessionID);
      const now = Date.now();
      if (s.inFlight || now - s.lastRunAt < CONFIG.cooldownMs) return;

      // Replace these calls with the concrete SDK helpers for your OpenCode version.
      const todos: Todo[] = await ctx.client.session.todo({ path: { id: sessionID } });
      const remaining = incompleteTodos(todos);
      if (remaining.length === 0) return;

      const signature = todoSignature(todos);
      if (signature === s.lastSignature) s.stagnantCount += 1;
      else s.stagnantCount = 0;
      s.lastSignature = signature;

      if (s.stagnantCount >= CONFIG.maxStagnantRounds) return;
      if (s.failureCount >= CONFIG.maxFailures) return;

      s.inFlight = true;
      s.lastRunAt = now;
      try {
        const messages = await ctx.client.session.messages({ path: { id: sessionID } });
        const last = [...messages].reverse().find((m: any) => m.agent || m.model || m.tools) ?? {};
        const prompt = buildResearchContinuationPrompt(todos, signature);

        await ctx.client.session.promptAsync({
          path: { id: sessionID },
          body: {
            agent: last.agent ?? 'sisyphus',
            model: last.model,
            tools: last.tools,
            parts: [{ type: 'text', text: prompt }],
          },
        });
      } catch (err) {
        s.failureCount += 1;
        throw err;
      } finally {
        s.inFlight = false;
      }
    },
  };
}
