import express from "express";
import rateLimit from "express-rate-limit";
import { verifyToken, type AuthRequest } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import {
  draftClientMail,
  findSender,
  isValidEmail,
  publicSenders,
  sendClientMail,
} from "../utils/clientMail";
import { rewriteClientEmail } from "../assistant/emailRewrite";

const router = express.Router();

const MAIL_ROLES = ["csr", "admin", "manager", "technical_manager"] as const;

const sendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many emails. Please wait a few minutes." },
});

router.use(verifyToken, allowRoles(...MAIL_ROLES));

router.get("/from-accounts", (_req, res) => {
  return res.json({ success: true, senders: publicSenders() });
});

router.post("/draft", async (req: AuthRequest, res) => {
  try {
    const fromId = String(req.body?.fromId ?? "").trim();
    const to = String(req.body?.to ?? "").trim();
    const intent = String(req.body?.intent ?? "").trim();
    const clientName = String(req.body?.clientName ?? "").trim();
    const company = String(req.body?.company ?? "").trim();
    const notes = String(req.body?.notes ?? "").trim();
    if (!intent) {
      return res.status(400).json({ success: false, message: "Tell the assistant what the email should say." });
    }
    if (!isValidEmail(to)) {
      return res.status(400).json({ success: false, message: "Client email is invalid." });
    }
    const sender = findSender(fromId);
    if (!sender) {
      return res.status(400).json({ success: false, message: "Select a company email first." });
    }
    const draft = await draftClientMail({
      fromName: sender.name,
      fromEmail: sender.email,
      to,
      clientName,
      company,
      intent,
      notes,
    });
    return res.json({ success: true, ...draft });
  } catch (err) {
    console.error("[mail/draft]", err);
    return res.status(500).json({ success: false, message: "Could not draft the email." });
  }
});

router.post("/rewrite", async (req: AuthRequest, res) => {
  try {
    const rewritten = await rewriteClientEmail({
      mode: String(req.body?.mode ?? "").trim(),
      subject: String(req.body?.subject ?? ""),
      body: String(req.body?.body ?? ""),
      instruction: String(req.body?.instruction ?? ""),
      clientName: String(req.body?.clientName ?? ""),
      company: String(req.body?.company ?? ""),
    });
    return res.json({ success: true, ...rewritten });
  } catch (err) {
    console.error("[mail/rewrite]", err);
    return res.status(500).json({ success: false, message: "Nexa could not rewrite that email." });
  }
});

router.post("/send", sendLimiter, async (req: AuthRequest, res) => {
  try {
    const fromId = String(req.body?.fromId ?? "").trim();
    const to = String(req.body?.to ?? "").trim();
    const subject = String(req.body?.subject ?? "").trim();
    const body = String(req.body?.body ?? "").trim();
    if (!isValidEmail(to)) {
      return res.status(400).json({ success: false, message: "Client email is invalid." });
    }
    if (!subject || !body) {
      return res.status(400).json({ success: false, message: "Subject and message are required." });
    }
    if (body.length > 20_000 || subject.length > 200) {
      return res.status(400).json({ success: false, message: "Message is too long." });
    }
    const sender = findSender(fromId);
    if (!sender) {
      return res.status(400).json({
        success: false,
        message: "That company email is not configured yet. Add CRM_FROM_EMAIL / CRM_FROM_PASS in the server env (Hostinger mailbox password, or Gmail app password).",
      });
    }
    await sendClientMail({ sender, to, subject, body });
    console.info(`[mail/send] user=${req.user?.id} from=${sender.email} to=${to}`);
    return res.json({ success: true, message: `Sent from ${sender.email} to ${to}` });
  } catch (err) {
    console.error("[mail/send]", err);
    return res.status(500).json({
      success: false,
      message: "Send failed. Hostinger login was rejected — confirm the selected From email matches that mailbox app password, then try again.",
    });
  }
});

export default router;
