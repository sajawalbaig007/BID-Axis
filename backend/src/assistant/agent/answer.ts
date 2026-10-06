import { ollamaChat } from "../ollama";
import { buildMemoryBlock } from "./memory";
import type { ChatTurn } from "../intent";
import { CRM_BOUNDARY, looksLikeWorldKnowledge } from "../scope";

const ANSWER_SYSTEM = `${CRM_BOUNDARY}

Write the final answer to the CEO from CRM tool JSON only.

Hard rules:
- Every name, code, email, phone, date, status, hour, and money figure MUST appear in the tool JSON. If it is not there, say it is not in the returned CRM data.
- Never invent, round-up, or carry facts from training data or from earlier chat that are not in this JSON.
- Never merge two people or two clients.
- When they ask for a client, lead, or project, list every field in the tool JSON. Do not shorten a client file to one line. Do not add clients that are not in the JSON.
- If they asked overdue jobs + related clients + last payments:
  - If overdue count is 0 / no project has overdue=true: say there are 0 overdue projects, so there are no overdue-project clients or last payments to report. Do not list on-time projects.
  - If overdue jobs exist, list only those. Client names and last payments must come from getProjectStatus/getClientHistory JSON. If those tools were not called, say the client/payment link is not in the returned data — do not guess.
- If tool JSON is a person/staff snapshot, never say “no client found”. Give their role, projects, and contact from that JSON.
- For accounts reports: never reply with a bare number. Always include the month label and PKR lines (revenue, cost, payroll, OPEX, profit/loss).
- If several matches, ask which one. Do not pick silently.
- If tool JSON has compose:true and a to-address, say the composer is opening with the draft. Never say it was sent.
- If they asked to email someone but compose is not true, do not say a draft is ready. Say the real block (need pick / no email on file / not found).
- English, short lines. You may use **bold** for names. No greeting, no “based on the tools”, no JSON in the reply.`;

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function slimResults(results: unknown[]): unknown[] {
  return results.map(raw => {
    const r = asRecord(raw);
    const data = r.data;
    return {
      tool: r.tool,
      ok: r.ok,
      error: r.error,
      args: r.args,
      data,
    };
  });
}

export function looksLikeModelAnswer(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  if (t.startsWith("{") || t.startsWith("[")) return false;
  if (/<tool_call>|```(?:json|tool)/i.test(t)) return false;
  return true;
}

export function sanitizeModelAnswer(text: string): string | null {
  let t = text.trim();
  t = t.replace(/^```(?:markdown|text|md)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!looksLikeModelAnswer(t)) return null;
  return t;
}

export async function generateGroundedAnswer(opts: {
  message: string;
  history: ChatTurn[];
  results: unknown[];
}): Promise<string | null> {
  if (!opts.results.length) return null;
  const memory = buildMemoryBlock(opts.message, opts.history);
  const payload = JSON.stringify(slimResults(opts.results)).slice(0, 12_000);
  const drafted = await ollamaChat({
    temperature: 0.1,
    numPredict: 900,
    timeoutMs: 8_000,
    messages: [
      { role: "system", content: ANSWER_SYSTEM },
      {
        role: "user",
        content: [
          memory.block,
          "",
          `CEO asked:\n${opts.message}`,
          "",
          "Live CRM tool results (only source of truth):",
          payload,
        ].join("\n"),
      },
    ],
  });
  const text = sanitizeModelAnswer(drafted?.content || "");
  if (!text || looksLikeWorldKnowledge(text)) return null;
  return text;
}
