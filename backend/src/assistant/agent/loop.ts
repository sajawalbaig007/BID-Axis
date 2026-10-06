import type { AssistantActor } from "../permissions";
import { TOOL_HANDLERS, type ToolName } from "../tools";
import { ollamaChat, type OllamaMessage, type OllamaToolCall } from "../ollama";
import { AGENT_SYSTEM, OLLAMA_TOOLS, SEND_TOOL_BLOCKED, TOOL_KIND } from "./catalog";
import { resolveEntity } from "./entities";
import { buildMemoryBlock } from "./memory";
import type { ChatTurn } from "../intent";
import { reviewTaskCoverage, type PlannedCall } from "./coverage";
import { lastEntityKind, parseEmail, extractEmailPurpose } from "../intent";
import { normalizeLookupText } from "../scope";

export type AgentRun = {
  results: unknown[];
  clarification: string;
  usedOllama: true;
};

const MAX_ROUNDS = 1;
const MAX_RESULTS = 8;

function asStringArgs(raw: unknown): Record<string, string> {
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return {};
    try {
      return asStringArgs(JSON.parse(t));
    } catch {
      return { query: t };
    }
  }
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null || v === "") continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

function parseEmbeddedToolCalls(content: string): OllamaToolCall[] {
  if (!content) return [];
  const chunks = [
    ...content.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi),
    ...content.matchAll(/```(?:json|tool_call)?\s*([\s\S]*?)```/gi),
  ];
  const found: OllamaToolCall[] = [];
  const tryParse = (raw: string) => {
    try {
      const data = JSON.parse(raw) as { name?: string; arguments?: unknown; function?: { name?: string; arguments?: unknown } };
      const name = String(data.function?.name || data.name || "").trim();
      if (!name) return;
      found.push({ function: { name, arguments: data.function?.arguments ?? data.arguments } });
    } catch {
      /* ignore */
    }
  };
  for (const m of chunks) tryParse(m[1] ?? "");
  if (!found.length) {
    const brace = content.match(/\{[\s\S]*"name"\s*:\s*"[^"]+"[\s\S]*\}/);
    if (brace) tryParse(brace[0]);
  }
  return found;
}

async function runTool(
  actor: AssistantActor,
  name: string,
  args: Record<string, string>,
): Promise<{ tool: string; args: Record<string, string>; ok: boolean; data?: unknown; error?: string; kind: string }> {
  if (name === SEND_TOOL_BLOCKED || name.toLowerCase().includes("sendmail") || name === "sendEmail") {
    return {
      tool: name,
      args,
      ok: false,
      error: "Sending email is not allowed as a tool. Draft with prepareClientEmail; the CEO confirms send in the composer.",
      kind: "write",
    };
  }
  if (name === "resolveEntity") {
    const out = await resolveEntity(actor, args);
    return { tool: name, args, kind: TOOL_KIND.resolveEntity, ...out };
  }
  const fn = TOOL_HANDLERS[name as ToolName];
  if (!fn) {
    return { tool: name, args, ok: false, error: `Unknown tool: ${name}`, kind: "read" };
  }
  const kind = TOOL_KIND[name as ToolName] ?? "read";
  const out = await (fn as (actor: AssistantActor, args: Record<string, string>) => ReturnType<typeof fn>)(
    actor,
    args,
  );
  return { tool: name, args, kind, ...out };
}

function looksLikeClarification(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("which") ||
    t.includes("who do you mean") ||
    t.includes("specify") ||
    t.includes("more than one") ||
    t.includes("kis") ||
    t.includes("kaun") ||
    t.includes("kaunsa") ||
    t.includes("which one")
  );
}

function asData(raw: unknown): Record<string, unknown> {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const data = r.data;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function needsPick(results: unknown[]): boolean {
  const d = asData(results[results.length - 1]);
  return d.needPick === true || (Array.isArray(d.matches) && d.matches.length > 1);
}

function callKey(name: string, args: Record<string, string>) {
  return `${name}:${JSON.stringify(args)}`;
}

function alreadyRan(results: unknown[], name: string, args: Record<string, string>) {
  const key = callKey(name, args);
  return results.some(raw => {
    const r = raw as { tool?: string; args?: Record<string, string> };
    return callKey(String(r.tool || ""), r.args || {}) === key;
  });
}

function fillArgs(
  name: string,
  args: Record<string, string>,
  opts: { message: string; focus: string },
) {
  const personTools = name === "getPersonSnapshot" || name === "resolveEntity";
  if (!args.query && opts.focus && personTools) args.query = opts.focus;
  if (name === "prepareClientEmail") {
    const email = parseEmail(opts.message);
    if (email) {
      args.query = email;
      args.email = email;
    } else if (!args.query && opts.focus) {
      args.query = opts.focus;
    }
    args.intent = extractEmailPurpose(opts.message) || args.intent || opts.message;
  }
  if (args.query) args.query = normalizeLookupText(args.query);
  if (args.email) args.email = normalizeLookupText(args.email);
  if (!args.intent && name === "getPersonSnapshot") {
    args.intent = opts.message;
  }
  return args;
}

async function executeCalls(
  actor: AssistantActor,
  calls: Array<{ name: string; arguments: unknown }>,
  results: unknown[],
  messages: OllamaMessage[],
  ctx: { message: string; focus: string; kind: string },
) {
  const planned: Array<{ name: string; args: Record<string, string> }> = [];
  for (const call of calls.slice(0, 3)) {
    if (results.length + planned.length >= MAX_RESULTS) break;
    let name = call.name;
    const args = fillArgs(name, asStringArgs(call.arguments), ctx);
    if (
      ctx.kind === "person"
      && (name === "getClientHistory" || name === "searchClients" || name === "getClientDetails")
      && !args.email
      && !parseEmail(ctx.message)
      && !parseEmail(args.query || "")
    ) {
      name = "getPersonSnapshot";
      if (!args.query && ctx.focus) args.query = ctx.focus;
    }
    if (!args.query && !args.projectCode && !args.phone && !args.email && name !== "getStaffRoster" && name !== "getCrmStatistics" && name !== "getCsrDesk" && name !== "getTechnicalOverview" && name !== "getPaymentsSnapshot" && name !== "getAccountsMonth") {
      continue;
    }
    if (alreadyRan(results, name, args) || planned.some(p => callKey(p.name, p.args) === callKey(name, args))) continue;
    planned.push({ name, args });
  }
  const outs = await Promise.all(planned.map(p => runTool(actor, p.name, p.args)));
  planned.forEach((p, i) => {
    const out = outs[i]!;
    results.push(out);
    messages.push({
      role: "tool",
      tool_name: p.name,
      content: JSON.stringify(out).slice(0, 8_000),
    });
  });
}

export async function runAgentLoop(opts: {
  actor: AssistantActor;
  message: string;
  history: ChatTurn[];
}): Promise<AgentRun | null> {
  const memory = buildMemoryBlock(opts.message, opts.history);
  const original = normalizeLookupText(opts.message.trim());
  const ctx = { message: original, focus: memory.focus, kind: lastEntityKind(opts.history) };
  const messages: OllamaMessage[] = [
    {
      role: "system",
      content: `${AGENT_SYSTEM}\n\nSigned-in role: ${opts.actor.role}. ${
        opts.actor.role === "admin"
          ? "This is the CEO. Return every stored detail they ask for."
          : opts.actor.role === "csr"
            ? "This is a CSR. Only their own clients. If a tool blocks another client, say: You can only see clients on your own dashboard."
            : "Stay inside this role's dashboard data."
      }`,
    },
    {
      role: "user",
      content: `${memory.block}\n\nORIGINAL REQUEST (every part must be satisfied before you stop):\n${original}`,
    },
  ];

  const results: unknown[] = [];
  let lastContent = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const turn = await ollamaChat({
      messages,
      tools: [...OLLAMA_TOOLS],
      temperature: 0.05,
      numPredict: 220,
      timeoutMs: 8_000,
    });
    if (!turn) return round === 0 ? null : { results, clarification: lastContent, usedOllama: true };

    lastContent = turn.content;
    const toolCalls = turn.toolCalls.length ? turn.toolCalls : parseEmbeddedToolCalls(turn.content);

    if (toolCalls.length) {
      messages.push({
        role: "assistant",
        content: turn.content || "",
        tool_calls: toolCalls,
      });
      await executeCalls(
        opts.actor,
        toolCalls.map(c => ({ name: c.function.name, arguments: c.function.arguments })),
        results,
        messages,
        ctx,
      );
    } else if (!results.length) {
      break;
    } else {
      messages.push({
        role: "assistant",
        content: turn.content || "Checking whether the original request is fully covered.",
      });
    }

    if (!results.length) break;
    if (needsPick(results)) break;

    const coverage = await reviewTaskCoverage({ message: original, results });
    if (coverage.complete) break;

    if (coverage.calls.length) {
      const before = results.length;
      await executeCalls(
        opts.actor,
        coverage.calls.map((c: PlannedCall) => ({ name: c.name, arguments: c.arguments })),
        results,
        messages,
        ctx,
      );
      if (results.length > before) {
        const again = await reviewTaskCoverage({ message: original, results });
        if (again.complete || needsPick(results)) break;
      }
    }

    messages.push({
      role: "user",
      content: [
        `ORIGINAL REQUEST (still active): ${original}`,
        coverage.reason ? `Unsatisfied: ${coverage.reason}` : "Parts of the original request are still unanswered.",
        "Call the next tool now. getPersonSnapshot is not enough for client last payments. If overdue is 0, do not call more tools.",
        "Do not use a staff member's name as a client query. Use overdue project codes.",
      ].join("\n"),
    });
  }

  if (!results.length && lastContent && !looksLikeClarification(lastContent)) {
    return null;
  }

  return { results, clarification: lastContent, usedOllama: true };
}
