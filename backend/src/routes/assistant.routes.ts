import express from "express";
import rateLimit from "express-rate-limit";
import { verifyToken, type AuthRequest } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { runAssistantChat } from "../assistant/chatService";
import { appendFeedback } from "../assistant/feedback";
import { runVoiceTurn } from "../assistant/voice";
import type { ChatTurn } from "../assistant/intent";

function parseHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatTurn[] = [];
  for (const item of raw.slice(-16)) {
    if (!item || typeof item !== "object") continue;
    const role = String((item as { role?: string }).role ?? "");
    const text = String((item as { text?: string }).text ?? "").trim();
    if ((role !== "user" && role !== "assistant") || !text) continue;
    const tools = Array.isArray((item as { tools?: unknown }).tools)
      ? ((item as { tools: unknown[] }).tools).map(t => String(t).slice(0, 80)).filter(Boolean).slice(0, 12)
      : undefined;
    out.push({ role, text: text.slice(0, 2000), tools });
  }
  return out;
}

const router = express.Router();

const STAFF = ["admin", "manager", "csr", "technical_manager", "accounts", "estimator", "bim_manager", "bim"] as const;

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many assistant requests. Slow down." },
});

router.use(verifyToken, allowRoles(...STAFF));
router.use(chatLimiter);

router.post("/chat", async (req: AuthRequest, res) => {
  try {
    const message = String(req.body?.message ?? "").trim();
    if (!message) {
      return res.status(400).json({ success: false, message: "Type a question first." });
    }
    if (message.length > 2000) {
      return res.status(400).json({ success: false, message: "Message is too long." });
    }
    if (!req.user?.id || !req.user.role) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }
    const result = await runAssistantChat({
      userId: req.user.id,
      role: req.user.role,
      message,
      history: parseHistory(req.body?.history),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("[assistant/chat]", err);
    return res.status(500).json({ success: false, message: "Assistant failed. Try again." });
  }
});

router.post("/voice", async (req: AuthRequest, res) => {
  try {
    const transcript = String(req.body?.transcript ?? req.body?.message ?? "").trim();
    if (!transcript) {
      return res.status(400).json({ success: false, message: "No speech transcript received." });
    }
    if (transcript.length > 2000) {
      return res.status(400).json({ success: false, message: "Transcript is too long." });
    }
    if (!req.user?.id || !req.user.role) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }
    const result = await runVoiceTurn({
      userId: req.user.id,
      role: req.user.role,
      transcript,
      history: parseHistory(req.body?.history),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("[assistant/voice]", err);
    return res.status(500).json({ success: false, message: "Voice turn failed. Try again." });
  }
});

router.post("/feedback", async (req: AuthRequest, res) => {
  try {
    const rating = String(req.body?.rating ?? "").trim();
    if (rating !== "up" && rating !== "down") {
      return res.status(400).json({ success: false, message: "Rating must be up or down." });
    }
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }
    const correction = String(req.body?.correction ?? "").trim().slice(0, 4000);
    const tools = Array.isArray(req.body?.tools)
      ? (req.body.tools as unknown[]).map(t => String(t).slice(0, 80)).filter(Boolean).slice(0, 12)
      : [];
    await appendFeedback({
      at: new Date().toISOString(),
      userId: req.user.id,
      rating,
      userMessage: String(req.body?.userMessage ?? "").trim().slice(0, 4000),
      assistantReply: String(req.body?.assistantReply ?? "").trim().slice(0, 8000),
      correction: correction || undefined,
      source: String(req.body?.source ?? "").trim().slice(0, 20) || undefined,
      tools,
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("[assistant/feedback]", err);
    return res.status(500).json({ success: false, message: "Could not save feedback." });
  }
});

export default router;
