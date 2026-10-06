import { ollamaChat, ollamaIsUp } from "./ollama";
import { draftClientMail } from "../utils/clientMail";

export type RewriteMode = "enhance" | "add" | "write" | "paraphrase" | "rephrase" | "edit";

function greetWho(client: string) {
  const first = (client || "there").trim().split(/\s+/)[0] || "there";
  return first.length > 18 ? "there" : first;
}

function stripSignOff(body: string) {
  return body
    .replace(/\n*(Thanks|Thank you|Best regards|Kind regards|Warm regards|Regards),?\s*\n[\s\S]*$/i, "")
    .trim();
}

function innerText(body: string) {
  return stripSignOff(body)
    .replace(/^Hi [^,]*,\s*/i, "")
    .replace(/^Hello [^,]*,\s*/i, "")
    .replace(/^Dear [^,]*,\s*/i, "")
    .trim();
}

/** Meta commands in the hint box are not the email purpose. */
export function interpretInstruction(mode: string, instruction: string): { mode: RewriteMode; purpose: string } {
  const raw = instruction.trim();
  const h = raw.toLowerCase().replace(/\s+/g, " ");
  const clicked: RewriteMode =
    mode === "add" || mode === "more" || mode === "expand" ? "add"
    : mode === "write" || mode === "compose" || mode === "draft" ? "write"
    : mode === "paraphrase" ? "paraphrase"
    : mode === "rephrase" ? "rephrase"
    : mode === "edit" || mode === "apply" || mode === "change" ? "edit"
    : "enhance";
  if (!h) return { mode: clicked, purpose: "" };

  const paraphraseCmd = /\b(paraphrase|rephrase|re-phrase|dobara likh|alfaz badal|same meaning|isi ko dusre alfaz)\b/.test(h);
  const enhanceCmd = /\b(enhance|polish|improve|rewrite|professional|isse enhance|isay enhance|is ko enhance|sahi kar|theek kar|behtar)\b/.test(h);
  const addCmd = /\b(add more|mazeed|zyada|or add|add kr|add kar|extra (para|line|detail))\b/.test(h);
  const onlyCmd = h.length <= 56 && !/\b(project|payment|invoice|ready|quote|call|meeting|drawing|takeoff|revision)\b/.test(h);

  if (paraphraseCmd && (onlyCmd || clicked === "write" || clicked === "edit")) {
    return { mode: /\brephrase/.test(h) ? "rephrase" : "paraphrase", purpose: "" };
  }
  if (enhanceCmd && (onlyCmd || clicked === "write")) return { mode: "enhance", purpose: "" };
  if (addCmd && (onlyCmd || clicked === "write")) {
    const purpose = raw.replace(/\b(mazeed|zyada|add more|isse|isay|is ko|add krdo|add karo|add kr|please|kro|karo)\b/gi, " ").replace(/\s+/g, " ").trim();
    return { mode: "add", purpose };
  }
  if (clicked === "write") return { mode: "write", purpose: raw };
  if (clicked === "edit") return { mode: "edit", purpose: raw };
  return { mode: clicked, purpose: raw };
}

function polishExisting(who: string, subject: string, body: string): { subject: string; body: string } {
  const core = innerText(body);
  const nextSubject = subject && !/^subject$/i.test(subject) ? subject : "Update on your project";
  if (!core) {
    return {
      subject: nextSubject,
      body:
        `Hi ${who},\n\nI hope you're well. I wanted to send a clear update on your project.\n\nPlease take a look when you have a moment and let me know if you need anything from our side.`,
    };
  }
  const cleaned = core
    .replace(/\bI wanted to share a quick update on your project\./i, "I wanted to send a clear update on your project.")
    .replace(/\bI wanted to update you on the revision\./i, "I'm writing with a clear update on the revision.")
    .replace(/\bPlease let me know if you have any questions or want to hop on a call\./i, "")
    .replace(/\bPlease review and tell me if anything still needs to change\./i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    subject: nextSubject,
    body:
      `Hi ${who},\n\nI hope you're well.\n\n${cleaned}\n\nPlease take a look when you have a moment. If anything needs to change, reply here and I'll take care of it right away.`,
  };
}

function parseJsonEmail(raw: string): { subject: string; body: string } | null {
  if (!raw) return null;
  const fenced = raw.match(/\{[\s\S]*\}/);
  if (fenced) {
    try {
      const data = JSON.parse(fenced[0]) as { subject?: unknown; body?: unknown };
      const subject = String(data.subject ?? "").trim();
      const body = String(data.body ?? "").trim();
      if (subject || body) return { subject, body: stripSignOff(body) };
    } catch {
      /* fall through */
    }
  }
  return null;
}

async function localRewrite(opts: {
  mode: RewriteMode;
  subject: string;
  body: string;
  purpose: string;
  clientName?: string;
  company?: string;
}): Promise<{ subject: string; body: string }> {
  const who = greetWho(opts.clientName || "");
  const core = stripSignOff(opts.body);

  if (opts.mode === "write") {
    const intent = opts.purpose.trim() || "a short professional project update";
    const draft = await draftClientMail({
      fromName: "",
      fromEmail: "",
      to: "draft@local",
      clientName: opts.clientName,
      company: opts.company,
      intent,
    });
    return { subject: draft.subject, body: stripSignOff(draft.body) };
  }

  if (opts.mode === "add") {
    let extra = "I can also send supporting files or jump on a short call this week — just tell me what works best for you.";
    if (opts.purpose) {
      const draft = await draftClientMail({
        fromName: "",
        fromEmail: "",
        to: "draft@local",
        clientName: opts.clientName,
        company: opts.company,
        intent: opts.purpose,
      });
      extra = innerText(draft.body).split(/\n\n/)[0] || extra;
    }
    const base = core || `Hi ${who},\n\nI wanted to share a quick update on your project.`;
    const next = base.includes(extra) ? `${base}\n\nLooking forward to your reply.` : `${base}\n\n${extra}`;
    return { subject: opts.subject || "Quick update on your project", body: next };
  }

  if (opts.mode === "edit" && opts.purpose) {
    const extra = opts.purpose.trim();
    const base = core || `Hi ${who},\n\nI wanted to send a clear update on your project.`;
    if (!base.toLowerCase().includes(extra.toLowerCase())) {
      return {
        subject: opts.subject || "Update on your project",
        body: `${base}\n\n${extra}`,
      };
    }
  }

  if (opts.mode === "paraphrase" || opts.mode === "rephrase") {
    const polished = polishExisting(who, opts.subject, core);
    if (opts.mode === "rephrase") {
      polished.body = polished.body
        .replace("I hope you're well.", "Hope you're doing well.")
        .replace("Please take a look when you have a moment.", "Whenever you get a chance, please have a look.");
    }
    return polished;
  }

  return polishExisting(who, opts.subject, core);
}

export async function rewriteClientEmail(opts: {
  mode: string;
  subject?: string;
  body?: string;
  instruction?: string;
  clientName?: string;
  company?: string;
}): Promise<{ subject: string; body: string; source: "ollama" | "template"; mode: RewriteMode }> {
  const interpreted = interpretInstruction(opts.mode, opts.instruction || "");
  const mode = interpreted.mode;
  const purpose = interpreted.purpose;
  const subject = (opts.subject || "").trim();
  const body = stripSignOff(opts.body || "");
  const fallback = await localRewrite({
    mode,
    subject,
    body,
    purpose,
    clientName: opts.clientName,
    company: opts.company,
  });

  if (!(await ollamaIsUp())) {
    return { ...fallback, source: "template", mode };
  }

  const task =
    mode === "add"
      ? "Keep the existing email. Add one extra professional paragraph. Do not delete the current points. English only."
      : mode === "write"
        ? "Write a NEW short professional email from the purpose only. Ignore the old draft unless the purpose is empty. English only. Do not paste Roman Urdu."
      : mode === "edit"
        ? `Apply this change to the CURRENT email and keep everything else: ${purpose || "make the requested edit"}. Same client and facts. English only. Body MUST reflect the change.`
      : mode === "rephrase"
        ? "REPHRASE the current email. Same meaning and facts, different sentence structure. English only. Body MUST be different."
      : mode === "paraphrase"
        ? "PARAPHRASE the current email. Same meaning and facts, smoother wording. English only. Body MUST be different."
        : "REWRITE the current draft so it is more polished and professional. Keep the same meaning and facts. Do not switch topics. English only. The body MUST be different from the current draft.";

  const drafted = await ollamaChat({
    temperature: 0.25,
    numPredict: 280,
    timeoutMs: 20_000,
    messages: [
      {
        role: "system",
        content:
          "You write outbound CRM client emails as the sender. Output JSON only: {\"subject\":\"...\",\"body\":\"...\"}. Body is plain text, no markdown, no signature. Greeting like Hi {first name}. Stay on this client's project/email only. Do not add other CRM records, other clients, or anything outside this email.",
      },
      {
        role: "user",
        content: [
          `Task: ${task}`,
          `Client: ${greetWho(opts.clientName || "")}${opts.company ? ` (${opts.company})` : ""}`,
          purpose ? `Purpose: ${purpose}` : "",
          subject ? `Current subject: ${subject}` : "",
          body ? `Current body:\n${body}` : "Current body is empty.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  const parsed = parseJsonEmail(drafted?.content || "");
  if (parsed?.body && parsed.body !== body) {
    return {
      subject: parsed.subject || fallback.subject,
      body: parsed.body,
      source: "ollama",
      mode,
    };
  }

  return { ...fallback, source: "template", mode };
}
