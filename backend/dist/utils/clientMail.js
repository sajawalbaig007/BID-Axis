"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidEmail = isValidEmail;
exports.listConfiguredSenders = listConfiguredSenders;
exports.publicSenders = publicSenders;
exports.findSender = findSender;
exports.sendClientMail = sendClientMail;
exports.draftClientMail = draftClientMail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const mailSignatures_1 = require("./mailSignatures");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
function isValidEmail(value) {
    return EMAIL_RE.test(value.trim());
}
function emailDomain(email) {
    return (email.split("@")[1] ?? "").trim().toLowerCase();
}
function isGmailAddress(email) {
    return GMAIL_DOMAINS.has(emailDomain(email));
}
function readOptionalPort(raw) {
    const n = Number(raw.trim());
    return Number.isInteger(n) && n > 0 ? n : undefined;
}
function readSlot(n) {
    const email = (process.env[`CRM_FROM_EMAIL_${n}`] ?? "").trim();
    const rawPass = (process.env[`CRM_FROM_PASS_${n}`] ?? "").trim();
    const pass = rawPass.replace(/\s/g, "");
    const name = (process.env[`CRM_FROM_NAME_${n}`] ?? "").trim() || email;
    if (!email || !pass || !isValidEmail(email))
        return null;
    const host = (process.env[`CRM_FROM_HOST_${n}`] ?? "").trim() || undefined;
    const port = readOptionalPort(process.env[`CRM_FROM_PORT_${n}`] ?? "");
    const secureRaw = (process.env[`CRM_FROM_SECURE_${n}`] ?? "").trim().toLowerCase();
    const secure = secureRaw === "true" ? true : secureRaw === "false" ? false : undefined;
    return { id: String(n), email, name, pass, host, port, secure };
}
function passwordVariants(pass) {
    const spaced = pass.trim();
    const compact = spaced.replace(/\s/g, "");
    const swapped = compact.startsWith("I") ? `l${compact.slice(1)}`
        : compact.startsWith("l") ? `I${compact.slice(1)}`
            : "";
    const seeds = [compact, compact.toLowerCase(), swapped, swapped.toLowerCase(), spaced];
    const out = [];
    for (const s of seeds) {
        if (!s)
            continue;
        out.push(s, s.replace(/-/g, ""));
    }
    return [...new Set(out)];
}
function smtpHosts(sender) {
    const envHost = (process.env.CRM_SMTP_HOST ?? "").trim();
    return [...new Set([sender.host, envHost, "smtp.hostinger.com"].filter((h) => !!h))];
}
function smtpPorts(sender) {
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
    const seen = new Set();
    return list.filter(p => {
        const key = `${p.port}:${p.secure}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function listConfiguredSenders() {
    return [1, 2, 3, 4].map(n => readSlot(n)).filter((s) => !!s);
}
function publicSenders() {
    return listConfiguredSenders().map(({ id, email, name }) => ({
        id,
        email,
        name,
        signatureBrand: (0, mailSignatures_1.resolveMailBrand)(email, name),
        signatureLabel: (0, mailSignatures_1.signatureLabel)(email, name),
    }));
}
function findSender(id) {
    return listConfiguredSenders().find(s => s.id === id) ?? null;
}
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
async function sendClientMail(opts) {
    const signature = (0, mailSignatures_1.getMailSignature)(opts.sender.email, opts.sender.name);
    const bodyText = signature ? (0, mailSignatures_1.stripMailSignOff)(opts.body) : opts.body;
    const htmlBody = escapeHtml(bodyText).replace(/\r\n|\n|\r/g, "<br>");
    const html = [
        `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111">${htmlBody}</div>`,
        signature
            ? `<div style="margin-top:22px;padding-top:8px">${signature.html}</div>`
            : "",
    ].join("");
    const mail = {
        from: `"${opts.sender.name.replace(/"/g, "")}" <${opts.sender.email}>`,
        to: opts.to.trim(),
        subject: opts.subject.trim(),
        text: bodyText,
        html,
    };
    if (signature?.attachments.length)
        mail.attachments = signature.attachments;
    if (isGmailAddress(opts.sender.email) && !opts.sender.host) {
        const transporter = nodemailer_1.default.createTransport({
            service: "gmail",
            auth: { user: opts.sender.email, pass: opts.sender.pass.replace(/\s/g, "") },
        });
        await transporter.sendMail(mail);
        return;
    }
    let lastErr;
    const passwords = passwordVariants(opts.sender.pass);
    const hosts = smtpHosts(opts.sender);
    const ports = smtpPorts(opts.sender);
    passLoop: for (const pass of passwords) {
        for (const host of hosts) {
            for (const port of ports) {
                try {
                    const transporter = nodemailer_1.default.createTransport({
                        host,
                        port: port.port,
                        secure: port.secure,
                        requireTLS: port.requireTLS,
                        auth: { user: opts.sender.email, pass },
                        authMethod: "LOGIN",
                        connectionTimeout: 12000,
                        greetingTimeout: 12000,
                        socketTimeout: 20000,
                        tls: { minVersion: "TLSv1.2" },
                    });
                    await transporter.sendMail(mail);
                    console.info(`[mail/send] smtp=${host}:${port.port} from=${opts.sender.email}`);
                    return;
                }
                catch (err) {
                    lastErr = err;
                    const code = err.code ?? "";
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
function greetName(clientName) {
    const raw = clientName.trim();
    if (!raw || /^the client$/i.test(raw))
        return "there";
    const first = raw.split(/\s+/)[0] ?? raw;
    if (first.length > 18)
        return "there";
    return first;
}
const DONE_RE = /\b(ready|done|complete|completed|finished|finish|hogya|hogaya|hogai|hogayi|ho\s*gaya|ho\s*gya|tayar|tayyar|kia|kiya|kardiya|krdiya|kar\s*diya|kar\s*di|krdi)\b/;
function looksRomanUrdu(text) {
    return /\b(hogya|hogaya|hogai|hogayi|ho\s*gaya|ho\s*gya|tayar|tayyar|tmhara|tmhari|tmhare|tumhara|tumhari|tumhare|apka|apki|apna|apko|bhej|bhejo|kro|karo|krdo|krdiya|kardiya|kia|kiya|mjhy|mujhe|iski|isse|dekho|likh|likho|bnao|banao|ha|hai|hain|chahiye|chahye|jaldi|abhi|zaroor|krna|karna|dena|lena|gaya|gyi|gye)\b/i.test(text);
}
const ENGLISH_HINT = new Set([
    "project", "projects", "requirement", "requirements", "payment", "invoice", "quote", "quotation",
    "call", "meeting", "drawing", "drawings", "estimate", "estimation", "takeoff", "revision", "update",
    "review", "need", "needed", "needs", "contract", "photos", "photo", "site", "file", "files",
    "document", "documents", "signed", "pending", "ready", "complete", "completed", "follow",
    "tomorrow", "today", "week", "info", "information", "missing", "attached", "attachment", "bid",
    "proposal", "deadline", "delay", "thank", "thanks", "confirm", "confirmation", "schedule",
    "available", "please", "share", "send", "sent", "request", "requested", "change", "changes",
    "price", "pricing", "cost", "budget", "paid", "unpaid", "due", "outstanding", "walkthrough",
]);
function isProbablyEnglish(text) {
    if (looksRomanUrdu(text))
        return false;
    const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2);
    if (!words.length)
        return false;
    const hits = words.filter(w => ENGLISH_HINT.has(w) || /^(the|your|our|this|that|with|from|about|for)$/.test(w) || /(?:ed|ing|ment|tion)$/.test(w));
    return hits.length >= Math.max(1, Math.ceil(words.length * 0.4));
}
function readyMail(who, subject, news) {
    return {
        subject,
        opening: `Hi ${who},\n\n${news}\n\nPlease take a look when you have a moment and let me know if you need any changes from our side.`,
    };
}
function englishFromPurpose(purpose, who) {
    const p = purpose.trim().toLowerCase().replace(/\s+/g, " ");
    const done = DONE_RE.test(p);
    if (/\brequirement/.test(p) && done) {
        return readyMail(who, "Your requirements are complete", "We've completed the requirements you shared.");
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
    if (/\b(payment|invoice|outstanding|due|unpaid|bill|paisa)\b/.test(p)) {
        return {
            subject: "Quick note on payment",
            opening: `Hi ${who},\n\nI wanted to follow up on the outstanding payment for your project.\n\nCould you please share an update when you get a chance?`,
        };
    }
    if (/\b(quote|quotation|pricing|price)\b/.test(p)) {
        return {
            subject: "Following up on your quote",
            opening: `Hi ${who},\n\nI wanted to follow up on the quotation we shared.\n\nHappy to walk you through it if useful — just tell me what works.`,
        };
    }
    if (/\b(meeting|call|schedule|tomorrow|zoom)\b/.test(p)) {
        return {
            subject: "Can we jump on a call?",
            opening: `Hi ${who},\n\nWould you have a few minutes for a quick call so we can align on next steps?\n\nShare a time that works for you and I’ll lock it in.`,
        };
    }
    if (/\b(revision|revise|changes?)\b/.test(p)) {
        return {
            subject: "Revision update",
            opening: `Hi ${who},\n\nI wanted to update you on the revision.\n\nPlease review and tell me if anything still needs to change.`,
        };
    }
    if (done) {
        return readyMail(who, "Your project is ready", "Good news — your project is ready.");
    }
    if (/\b(thank|thanks|shukriya|shukria)\b/.test(p)) {
        return {
            subject: "Thank you",
            opening: `Hi ${who},\n\nThank you — we appreciate you taking the time.\n\nPlease let me know if you need anything else from our side.`,
        };
    }
    if (/\b(follow\s*up|checking in|touch base|reminder|yaad)\b/.test(p)) {
        return {
            subject: "Checking in",
            opening: `Hi ${who},\n\nJust checking in to see how things are looking on your side.\n\nLet me know if you need anything from us.`,
        };
    }
    const clean = purpose.trim().replace(/[.?!]+$/, "");
    if (clean.length >= 6 && isProbablyEnglish(clean) && !looksRomanUrdu(clean)) {
        const topic = clean.charAt(0).toLowerCase() + clean.slice(1);
        const subject = clean.replace(/^./, c => c.toUpperCase()).slice(0, 80);
        const news = /^(need|needed|missing)\b/i.test(topic)
            ? `I wanted to follow up — we still ${topic.replace(/^needed\b/i, "need")}.`
            : `I wanted to follow up regarding ${topic}.`;
        return {
            subject: /^(your |following |quick |can |update:)/i.test(subject) ? subject : `Update: ${subject}`,
            opening: `Hi ${who},\n\n${news}\n\nPlease let me know if you have any questions or if you'd like me to walk you through anything.`,
        };
    }
    return {
        subject: "Quick update on your project",
        opening: `Hi ${who},\n\nI wanted to share a quick update on your project.\n\nPlease let me know if you have any questions or want to hop on a call.`,
    };
}
async function draftClientMail(opts) {
    const client = (opts.clientName || "there").trim();
    const intent = opts.intent.trim();
    const who = greetName(client === "the client" ? "" : client);
    const branded = !!(0, mailSignatures_1.resolveMailBrand)(opts.fromEmail, opts.fromName);
    const sign = branded
        ? ""
        : opts.fromName.trim()
            ? [`Thanks,`, opts.fromName.trim(), opts.fromEmail.trim()].filter(Boolean).join("\n")
            : "Thanks,";
    const written = englishFromPurpose(intent, who);
    const safe = looksRomanUrdu(`${written.subject}\n${written.opening}`)
        ? englishFromPurpose("a short project update", who)
        : written;
    const body = sign ? `${safe.opening}\n\n${sign}` : safe.opening;
    return {
        subject: safe.subject,
        body,
        source: "template",
    };
}
