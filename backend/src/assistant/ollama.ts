import { CRM_BOUNDARY } from "./scope";

const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = (process.env.OLLAMA_MODEL ?? "qwen2.5").trim() || "qwen2.5";
const OLLAMA_TIMEOUT_MS = Math.min(
  20_000,
  Math.max(3_000, Number(process.env.OLLAMA_TIMEOUT_MS) || 10_000),
);

const OPENROUTER_BASE = (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
const OPENROUTER_MODEL = (process.env.OPENROUTER_MODEL ?? "google/gemma-3-27b-it").trim() || "google/gemma-3-27b-it";
const OPENROUTER_TIMEOUT_MS = Math.min(
  20_000,
  Math.max(4_000, Number(process.env.OPENROUTER_TIMEOUT_MS) || 8_000),
);

export type OllamaToolCall = {
  id?: string;
  type?: string;
  function: { name: string; arguments?: unknown };
};

export type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
};

function openRouterKey() {
  return (process.env.OPENROUTER_API_KEY ?? "").trim();
}

export function ollamaModel() {
  return openRouterKey() ? OPENROUTER_MODEL : OLLAMA_MODEL;
}

let upCache: { at: number; up: boolean } | null = null;
let ollamaCache: { at: number; up: boolean } | null = null;

function markUp(up: boolean) {
  upCache = { at: Date.now(), up };
}

async function ollamaDaemonUp(): Promise<boolean> {
  if (ollamaCache && Date.now() - ollamaCache.at < 12_000) return ollamaCache.up;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 700);
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal });
    ollamaCache = { at: Date.now(), up: res.ok };
  } catch {
    ollamaCache = { at: Date.now(), up: false };
  } finally {
    clearTimeout(timer);
  }
  return ollamaCache.up;
}

/** Fast probe — OpenRouter key means production AI is available; else ping local Ollama. */
export async function ollamaIsUp(): Promise<boolean> {
  if (openRouterKey()) {
    if (upCache && Date.now() - upCache.at < 12_000 && !upCache.up) return false;
    return true;
  }
  return ollamaDaemonUp();
}

function parseToolCalls(raw: unknown): OllamaToolCall[] {
  if (!Array.isArray(raw)) return [];
  const out: OllamaToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { id?: string; type?: string; function?: { name?: string; arguments?: unknown } };
    const name = String(rec.function?.name ?? "").trim();
    if (!name) continue;
    out.push({
      id: rec.id ? String(rec.id) : undefined,
      type: rec.type ? String(rec.type) : "function",
      function: { name, arguments: rec.function?.arguments },
    });
  }
  return out;
}

function argsToJson(raw: unknown): string {
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw ?? {});
  } catch {
    return "{}";
  }
}

function toolsAsPrompt(tools: unknown[]): string {
  if (!Array.isArray(tools) || !tools.length) return "";
  const lines = tools
    .map((item) => {
      const fn = (item as { function?: { name?: string; description?: string; parameters?: unknown } }).function;
      if (!fn?.name) return "";
      return `- ${fn.name}: ${fn.description || ""}\n  args JSON: ${JSON.stringify(fn.parameters ?? {})}`;
    })
    .filter(Boolean);
  if (!lines.length) return "";
  return [
    CRM_BOUNDARY,
    "When you need live CRM data, output one or more tool calls and nothing else:",
    "<tool_call>",
    '{"name":"toolName","arguments":{"query":"..."}}',
    "</tool_call>",
    "Do not write the final CEO answer until tool JSON has been returned.",
    "If the question is outside this CRM, do not call tools. Reply that you only answer CRM questions.",
    "Available CRM tools:",
    lines.join("\n"),
  ].join("\n");
}

type OpenAiMsg = {
  role: string;
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

function toOpenAiMessages(messages: OllamaMessage[], toolHint: string, nativeTools: boolean): OpenAiMsg[] {
  const out: OpenAiMsg[] = [];
  let hinted = false;
  let toolSeq = 0;
  for (const m of messages) {
    if (m.role === "system") {
      const content = !hinted
        ? `${CRM_BOUNDARY}\n\n${m.content}${toolHint ? `\n\n${toolHint}` : ""}`
        : m.content;
      hinted = true;
      out.push({ role: "system", content });
      continue;
    }
    if (m.role === "tool") {
      if (nativeTools) {
        out.push({
          role: "tool",
          name: m.tool_name,
          tool_call_id: m.tool_name ? `call_${m.tool_name}_${toolSeq++}` : `call_${toolSeq++}`,
          content: m.content,
        });
      } else {
        out.push({
          role: "user",
          content: `TOOL RESULT (${m.tool_name || "tool"}):\n${m.content}\n\nIf the original request is not fully covered, call the next tool. Otherwise stop calling tools.`,
        });
      }
      continue;
    }
    if (nativeTools && m.tool_calls?.length) {
      out.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.tool_calls.map((c, i) => ({
          id: c.id || `call_${c.function.name}_${i}`,
          type: "function",
          function: { name: c.function.name, arguments: argsToJson(c.function.arguments) },
        })),
      });
      continue;
    }
    out.push({ role: m.role, content: m.content || "" });
  }
  return out;
}

async function openRouterChat(opts: {
  messages: OllamaMessage[];
  tools?: unknown[];
  temperature?: number;
  numPredict?: number;
  timeoutMs?: number;
  nativeTools: boolean;
}): Promise<{ content: string; toolCalls: OllamaToolCall[] } | null> {
  const key = openRouterKey();
  if (!key) return null;
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? OPENROUTER_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const hint = opts.nativeTools ? "" : toolsAsPrompt(opts.tools ?? []);
  const body: Record<string, unknown> = {
    model: OPENROUTER_MODEL,
    temperature: opts.temperature ?? 0.1,
    max_tokens: opts.numPredict ?? 280,
    messages: toOpenAiMessages(opts.messages, hint, opts.nativeTools),
  };
  if (opts.nativeTools && opts.tools?.length) body.tools = opts.tools;
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": (process.env.FRONTEND_URL ?? "https://bemcons.com").replace(/\/$/, ""),
        "X-Title": "Nexa CRM",
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[nexa/openrouter]", res.status, errText.slice(0, 400));
      if (res.status === 401 || res.status === 402 || res.status === 403) markUp(false);
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: unknown } }>;
    };
    const msg = data.choices?.[0]?.message;
    const content = String(msg?.content ?? "").trim();
    markUp(true);
    return { content, toolCalls: parseToolCalls(msg?.tool_calls) };
  } catch (err) {
    console.warn("[nexa/openrouter]", err instanceof Error ? err.message : "request failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function ollamaChat(opts: {
  messages: OllamaMessage[];
  tools?: unknown[];
  temperature?: number;
  numPredict?: number;
  timeoutMs?: number;
}): Promise<{ content: string; toolCalls: OllamaToolCall[] } | null> {
  if (openRouterKey()) {
    const gemma = OPENROUTER_MODEL.toLowerCase().includes("gemma");
    const wantTools = Boolean(opts.tools?.length);
    let out = await openRouterChat({ ...opts, nativeTools: wantTools && !gemma });
    if (!out && wantTools && !gemma) out = await openRouterChat({ ...opts, nativeTools: false });
    if (out) return out;
  }

  if (!(await ollamaDaemonUp())) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? OLLAMA_TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = {
      model: OLLAMA_MODEL,
      stream: false,
      keep_alive: "30m",
      options: {
        temperature: opts.temperature ?? 0.1,
        num_predict: opts.numPredict ?? 280,
        num_ctx: 4096,
      },
      messages: opts.messages,
    };
    if (opts.tools?.length) body.tools = opts.tools;
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (!openRouterKey()) markUp(false);
      return null;
    }
    const data = (await res.json()) as {
      message?: { content?: string; tool_calls?: unknown };
    };
    const content = String(data.message?.content ?? "").trim();
    return { content, toolCalls: parseToolCalls(data.message?.tool_calls) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function ollamaSummarize(opts: {
  userMessage: string;
  toolResults: unknown;
}): Promise<string | null> {
  const drafted = await ollamaChat({
    temperature: 0.1,
    numPredict: 280,
    messages: [
      {
        role: "system",
        content:
          "You are Nexa, the CEO’s CRM AI. Answer ONLY the question that was asked. Do not greet. Do not add extra clients, extra stats, or extra advice. If they asked one number, reply with that number and stop. If they asked contact info, give email/phone only. Never invent numbers. Never merge different people. English, short lines. If tools found nothing, say so and stop. Use the CRM data JSON as the only source of truth.",
      },
      {
        role: "user",
        content: `Question:\n${opts.userMessage}\n\nCRM data:\n${JSON.stringify(opts.toolResults).slice(0, 12_000)}`,
      },
    ],
  });
  return drafted?.content || null;
}
