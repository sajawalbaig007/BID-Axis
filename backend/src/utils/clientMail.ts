import nodemailer from "nodemailer";
import {
  getMailSignature,
  resolveMailBrand,
  signatureLabel,
  stripMailSignOff,
  type MailSignature,
} from "./mailSignatures";

export type MailSenderPublic = {
  id: string;
  email: string;
  name: string;
  signatureBrand: ReturnType<typeof resolveMailBrand>;
  signatureLabel: string | null;
};

type MailSender = {
  id: string;
  email: string;
  name: string;
  pass: string;
  host?: string;
  port?: number;
  secure?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

function emailDomain(email: string): string {
  return (email.split("@")[1] ?? "").trim().toLowerCase();
}

function isGmailAddress(email: string): boolean {
  return GMAIL_DOMAINS.has(emailDomain(email));
}

function readOptionalPort(raw: string): number | undefined {
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function readSlot(n: 1 | 2 | 3 | 4): MailSender | null {
  const email = (process.env[`CRM_FROM_EMAIL_${n}`] ?? "").trim();
  const rawPass = (process.env[`CRM_FROM_PASS_${n}`] ?? "").trim();
  const pass = rawPass.replace(/\s/g, "");
  const name = (process.env[`CRM_FROM_NAME_${n}`] ?? "").trim() || email;
  if (!email || !pass || !isValidEmail(email)) return null;
  const host = (process.env[`CRM_FROM_HOST_${n}`] ?? "").trim() || undefined;
  const port = readOptionalPort(process.env[`CRM_FROM_PORT_${n}`] ?? "");
  const secureRaw = (process.env[`CRM_FROM_SECURE_${n}`] ?? "").trim().toLowerCase();
  const secure = secureRaw === "true" ? true : secureRaw === "false" ? false : undefined;
  return { id: String(n), email, name, pass, host, port, secure };
}

function passwordVariants(pass: string): string[] {
  const spaced = pass.trim();
  const compact = spaced.replace(/\s/g, "");
  const swapped =
    compact.startsWith("I") ? `l${compact.slice(1)}`
    : compact.startsWith("l") ? `I${compact.slice(1)}`
    : "";
  const seeds = [compact, compact.toLowerCase(), swapped, swapped.toLowerCase(), spaced];
  const out: string[] = [];
  for (const s of seeds) {
    if (!s) continue;
    out.push(s, s.replace(/-/g, ""));
  }
  return [...new Set(out)];
}


function smtpHosts(sender: MailSender): string[] {
  const envHost = (process.env.CRM_SMTP_HOST ?? "").trim();
  return [...new Set([sender.host, envHost, "smtp.hostinger.com"].filter((h): h is string => !!h))];
}

function smtpPorts(sender: MailSender): Array<{ port: number; secure: boolean; requireTLS?: boolean }> {
  const envPort = readOptionalPort(process.env.CRM_SMTP_PORT ?? "");
  const envSecureRaw = (process.env.CRM_SMTP_SECURE ?? "").trim().toLowerCase();
  const envSecure = envSecureRaw === "true" ? true : envSecureRaw === "false" ? false : undefined;
  const primaryPort = sender.port ?? envPort ?? 465;
  const primarySecure = sender.secure ?? envSecure ?? primaryPort === 465;
  const list = [
    { port: primaryPort, secure: primarySecure, requireTLS: !primarySecure ? true : undefined },
    { port: 465, secure: true },
    { port: 587, secure: false, requireTLS: true },
  ];
  const seen = new Set<string>();
  return list.filter(p => {
    const key = `${p.port}:${p.secure}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function listConfiguredSenders(): MailSender[] {
  return [1, 2, 3, 4].map(n => readSlot(n as 1 | 2 | 3 | 4)).filter((s): s is MailSender => !!s);
}

export function publicSenders(): MailSenderPublic[] {
  return listConfiguredSenders().map(({ id, email, name }) => ({
    id,
    email,
    name,
    signatureBrand: resolveMailBrand(email, name),
    signatureLabel: signatureLabel(email, name),
  }));
}

export function findSender(id: string): MailSender | null {
  return listConfiguredSenders().find(s => s.id === id) ?? null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendClientMail(opts: {
  sender: MailSender;
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const signature = getMailSignature(opts.sender.email, opts.sender.name);
  const bodyText = signature ? stripMailSignOff(opts.body) : opts.body;
  const htmlBody = escapeHtml(bodyText).replace(/\r\n|\n|\r/g, "<br>");
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111">${htmlBody}</div>`,
    signature
      ? `<div style="margin-top:22px;padding-top:8px">${signature.html}</div>`
      : "",
  ].join("");
  const mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    attachments?: MailSignature["attachments"];
  } = {
    from: `"${opts.sender.name.replace(/"/g, "")}" <${opts.sender.email}>`,
    to: opts.to.trim(),
    subject: opts.subject.trim(),
    text: bodyText,
    html,
  };
  if (signature?.attachments.length) mail.attachments = signature.attachments;

  if (isGmailAddress(opts.sender.email) && !opts.sender.host) {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: opts.sender.email, pass: opts.sender.pass.replace(/\s/g, "") },
    });
    await transporter.sendMail(mail);
    return;
  }

  let lastErr: unknown;
  const passwords = passwordVariants(opts.sender.pass);
  const hosts = smtpHosts(opts.sender);
  const ports = smtpPorts(opts.sender);

  passLoop: for (const pass of passwords) {
    for (const host of hosts) {
      for (const port of ports) {
        try {
          const transporter = nodemailer.createTransport({
            host,
            port: port.port,
            secure: port.secure,
            requireTLS: port.requireTLS,
            auth: { user: opts.sender.email, pass },
            authMethod: "LOGIN",
            connectionTimeout: 12_000,
            greetingTimeout: 12_000,
            socketTimeout: 20_000,
            tls: { minVersion: "TLSv1.2" },
          });
          await transporter.sendMail(mail);
          console.info(`[mail/send] smtp=${host}:${port.port} from=${opts.sender.email}`);
          return;
        } catch (err) {
          lastErr = err;
          const code = (err as { code?: string }).code ?? "";
          if (code === "EAUTH") {
            continue passLoop;
          }
          if (code !== "ESOCKET" && code !== "ETIMEDOUT" && code !== "ECONNECTION") {
            throw err;
          }
        }
      }
    }
  }
  throw lastErr;
}

function greetName(clientName: string): string {
  const raw = clientName.trim();
  if (!raw || /^the client$/i.test(raw)) return "there";
  const first = raw.split(/\s+/)[0] ?? raw;
  if (first.length > 18) return "there";
  return first;
}

const DONE_RE =
  /\b(ready|done|complete|completed|finished|finish|hogya|hogaya|hogai|hogayi|ho\s*gaya|ho\s*gya|tayar|tayyar|kia|kiya|kardiya|krdiya|kar\s*diya|kar\s*di|krdi)\b/;

function looksRomanUrdu(text: string): boolean {
  return /\b(hogya|hogaya|hogai|hogayi|ho\s*gaya|ho\s*gya|tayar|tayyar|tmhara|tmhari|tmhare|tumhara|tumhari|tumhare|apka|apki|apna|apko|bhej|bhejo|kro|karo|krdo|krdiya|kardiya|kia|kiya|mjhy|mujhe|iski|isse|dekho|likh|likho|bnao|banao|ha|hai|hain|chahiye|chahye|jaldi|abhi|zaroor|krna|karna|dena|lena|gaya|gyi|gye)\b/i.test(
    text,
  );
}

const ENGLISH_HINT = new Set([
  "project", "projects", "requirement", "requirements", "payment", "invoice", "quote", "quotation",
  "call", "meeting", "drawing", "drawings", "estimate", "estimation", "takeoff", "revision", "update",
  "review", "need", "needed", "needs", "contract", "photos", "photo", "site", "file", "files",
  "document", "documents", "signed", "pending", "ready", "complete", "completed", "follow",
  "tomorrow", "today", "week", "info", "information", "missing", "attached", "attachment", "bid",
  "proposal", "deadline", "delay", "thank", "thanks", "confirm", "confirmation", "schedule",
  "available", "please", "share", "send", "sent", "request", "requested", "change", "changes",
  "price", "pricing", "cost", "budget", "paid", "unpaid", "due", "dues", "pay", "outstanding", "walkthrough",
]);

function isProbablyEnglish(text: string): boolean {
  if (looksRomanUrdu(text)) return false;
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2);
  if (!words.length) return false;
  const hits = words.filter(
    w => ENGLISH_HINT.has(w) || /^(the|your|our|this|that|with|from|about|for)$/.test(w) || /(?:ed|ing|ment|tion)$/.test(w),
  );
  return hits.length >= Math.max(1, Math.ceil(words.length * 0.4));
}

function readyMail(who: string, subject: string, news: string): { subject: string; opening: string } {
  return {
    subject,
    opening:
      `Hi ${who},\n\n${news}\n\nPlease take a look when you have a moment and let me know if you need any changes from our side.`,
  };
}

const PAY_RE = /\b(payment|invoice|outstanding|dues?|overdue|unpaid|bill|paisa|pay(?:ment)?s?)\b/;

function toClientSentences(purpose: string): string {
  let s = purpose.trim().replace(/\s+/g, " ");
  s = s.replace(/^(that|please)\s+/i, "");
  s = s.replace(/\bplease pay (it|this|them)?\b/i, "Please arrange payment at your earliest convenience");
  s = s.replace(/\bpay (it|this|them)\b/i, "please arrange payment");
  if (/\bPlease arrange payment/.test(s) && !/[.!?].*Please arrange/.test(s)) {
    s = s.replace(/\s*Please arrange payment/, ". Please arrange payment");
  }
  if (!/^[A-Z]/.test(s)) s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.!?]$/.test(s)) s += ".";
  return s.replace(/\s+\./g, ".").replace(/\.{2,}/g, ".");
}

function subjectFromPurpose(purpose: string, lower: string): string {
  if (PAY_RE.test(lower)) return "Reminder: pending dues";
  const words = purpose.split(/\s+/).filter(Boolean).length;
  if (words >= 6) {
    const clipped = purpose.replace(/^(you |we |i |please )/i, "").trim().slice(0, 72);
    if (clipped.length >= 8) {
      const s = clipped.charAt(0).toUpperCase() + clipped.slice(1);
      return /[.!?]$/.test(s) ? s.replace(/[.!?]$/, "") : s;
    }
  }
  if (/\b(quote|quotation|pricing|price)\b/.test(lower)) return "Following up on your quote";
  if (/\b(meeting|call|schedule|zoom)\b/.test(lower)) return "Can we jump on a call?";
  if (/\b(revision|revise|changes?)\b/.test(lower)) return "Revision update";
  const clipped = purpose.replace(/^(you |we |i |please )/i, "").trim().slice(0, 72);
  if (clipped.length < 4) return "Quick update";
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

function englishFromPurpose(purpose: string, who: string): { subject: string; opening: string } {
  const original = purpose.trim().replace(/\s+/g, " ");
  const p = original.toLowerCase();
  const generic = /^a short (professional )?project update$/i.test(original);
  const done = DONE_RE.test(p);

  if (/\brequirement/.test(p) && done) {
    return readyMail(
      who,
      "Your requirements are complete",
      "We've completed the requirements you shared.",
    );
  }
  if (/\b(drawing|drawings|plans?)\b/.test(p) && done) {
    return readyMail(who, "Your drawings are ready", "Good news — your drawings are ready.");
  }
  if (/\b(estimate|estimation|bid)\b/.test(p) && done) {
    return readyMail(who, "Your estimate is ready", "Good news — your estimate is ready.");
  }
  if (/\btakeoff\b/.test(p) && done) {
    return readyMail(who, "Takeoff is complete", "The takeoff is complete and ready for your review.");
  }
  if (done && !generic && original.length < 40) {
    return readyMail(who, "Your project is ready", "Good news — your project is ready.");
  }
  if (/\b(thank|thanks|shukriya|shukria)\b/.test(p) && original.length < 48) {
    return {
      subject: "Thank you",
      opening:
        `Hi ${who},\n\nThank you — we appreciate you taking the time.\n\nPlease let me know if you need anything else from our side.`,
    };
  }

  const wordCount = original.split(/\s+/).filter(Boolean).length;
  const specificAsk =
    !generic
    && (wordCount >= 6 || PAY_RE.test(p) || /\b(please|pay it|inform|keh|bolke)\b/i.test(p));
  if (specificAsk) {
    const news = toClientSentences(original);
    const payClose = PAY_RE.test(p)
      ? "If you have already paid, please ignore this note or share the receipt so we can update our records."
      : "Please let me know if you have any questions.";
    return {
      subject: subjectFromPurpose(original, p),
      opening: `Hi ${who},\n\n${news}\n\n${payClose}`,
    };
  }

  if (PAY_RE.test(p)) {
    return {
      subject: "Reminder: pending dues",
      opening:
        `Hi ${who},\n\nThis is a reminder that you have pending dues. Please arrange payment at your earliest convenience.\n\nIf you have already paid, please ignore this note or share the receipt so we can update our records.`,
    };
  }
  if (/\b(quote|quotation|pricing|price)\b/.test(p)) {
    return {
      subject: "Following up on your quote",
      opening:
        `Hi ${who},\n\nI wanted to follow up on the quotation we shared.\n\nHappy to walk you through it if useful — just tell me what works.`,
    };
  }
  if (/\b(meeting|call|schedule|tomorrow|zoom)\b/.test(p)) {
    return {
      subject: "Can we jump on a call?",
      opening:
        `Hi ${who},\n\nWould you have a few minutes for a quick call so we can align on next steps?\n\nShare a time that works for you and I’ll lock it in.`,
    };
  }
  if (/\b(revision|revise|changes?)\b/.test(p)) {
    return {
      subject: "Revision update",
      opening:
        `Hi ${who},\n\nI wanted to update you on the revision.\n\nPlease review and tell me if anything still needs to change.`,
    };
  }
  if (/\b(follow\s*up|checking in|touch base|reminder|yaad)\b/.test(p)) {
    return {
      subject: "Checking in",
      opening:
        `Hi ${who},\n\nJust checking in to see how things are looking on your side.\n\nLet me know if you need anything from us.`,
    };
  }

  const clean = original.replace(/[.?!]+$/, "");
  if (clean.length >= 6 && isProbablyEnglish(clean) && !looksRomanUrdu(clean)) {
    const topic = clean.charAt(0).toLowerCase() + clean.slice(1);
    const subject = clean.replace(/^./, c => c.toUpperCase()).slice(0, 80);
    const news = /^(need|needed|missing)\b/i.test(topic)
      ? `I wanted to follow up — we still ${topic.replace(/^needed\b/i, "need")}.`
      : `I wanted to follow up regarding ${topic}.`;
    return {
      subject: /^(your |following |quick |can |update:|reminder:)/i.test(subject) ? subject : `Update: ${subject}`,
      opening:
        `Hi ${who},\n\n${news}\n\nPlease let me know if you have any questions or if you'd like me to walk you through anything.`,
    };
  }

  return {
    subject: "Quick update on your project",
    opening:
      `Hi ${who},\n\nI wanted to share a quick update on your project.\n\nPlease let me know if you have any questions or want to hop on a call.`,
  };
}

export async function draftClientMail(opts: {
  fromName: string;
  fromEmail: string;
  to: string;
  clientName?: string;
  company?: string;
  intent: string;
  notes?: string;
}): Promise<{ subject: string; body: string; source: "ollama" | "template" }> {
  const client = (opts.clientName || "there").trim();
  const intent = opts.intent.trim();
  const who = greetName(client === "the client" ? "" : client);
  const branded = !!resolveMailBrand(opts.fromEmail, opts.fromName);
  const sign = branded
    ? ""
    : opts.fromName.trim()
      ? [`Thanks,`, opts.fromName.trim(), opts.fromEmail.trim()].filter(Boolean).join("\n")
      : "Thanks,";
  const written = englishFromPurpose(intent, who);
  let safe = written;
  if (looksRomanUrdu(`${safe.subject}\n${safe.opening}`)) {
    const lower = intent.toLowerCase();
    const classified = PAY_RE.test(lower)
      ? "you have pending dues. Please arrange payment at your earliest convenience"
      : /\b(quote|quotation|pricing|price)\b/.test(lower)
        ? "follow up on the quote"
        : "a short project update";
    safe = englishFromPurpose(classified, who);
  }
  const body = sign ? `${safe.opening}\n\n${sign}` : safe.opening;
  return {
    subject: safe.subject,
    body,
    source: "template",
  };
}
