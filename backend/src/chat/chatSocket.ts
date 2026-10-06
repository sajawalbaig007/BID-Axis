import http from "http";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";
import prisma from "../config/db";
import { getJwtSecret } from "../config/security";
import { formatMessage, messagePreviewText } from "./chatMessageFormat";
import { chatDisplayName } from "../utils/chatAccess";

type MemberRow = {
  userId: string;
  lastReadAt: Date | null;
  user: { id: string; name: string; email?: string | null; role?: string | null };
};

interface ClientMeta {
  userId: string;
  role: string;
  name: string;
  watchingConvId: string | null;
}

const clients = new Map<WebSocket, ClientMeta>();
const userSockets = new Map<string, Set<WebSocket>>();

let wss: WebSocketServer | null = null;

function send(ws: WebSocket, payload: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sendToUser(userId: string, payload: object) {
  const set = userSockets.get(userId);
  if (!set) return;
  for (const ws of set) send(ws, payload);
}

function broadcastPresence(userId: string, isOnline: boolean) {
  for (const [ws] of clients) {
    send(ws, { type: "presence", userId, isOnline });
  }
}

async function verifyWsToken(token: string): Promise<{ id: string; role: string; sid?: string; tv?: number } | null> {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      id: string; role: string; sid?: string; tv?: number;
    };
    if (!decoded.sid) return null;

    const user = await prisma.user.findUnique({
      where:  { id: decoded.id },
      select: {
        activeSessionId: true, tokenVersion: true, isActive: true, role: true, name: true,
        chatEnabled: true,
      },
    });
    if (!user?.isActive) return null;
    if (user.chatEnabled === false) return null;
    if (
      !user.activeSessionId ||
      user.activeSessionId !== decoded.sid ||
      user.tokenVersion !== decoded.tv ||
      user.role !== decoded.role
    ) return null;

    return { id: decoded.id, role: decoded.role };
  } catch {
    return null;
  }
}

function registerClient(ws: WebSocket, userId: string, role: string, name: string) {
  clients.set(ws, { userId, role, name, watchingConvId: null });
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId)!.add(ws);
}

function unregisterClient(ws: WebSocket) {
  const meta = clients.get(ws);
  if (!meta) return;
  clients.delete(ws);
  const set = userSockets.get(meta.userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) {
      userSockets.delete(meta.userId);
      void setUserOffline(meta.userId);
    }
  }
}

async function setUserOnline(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data:  { isOnline: true, lastActive: new Date() },
  }).catch(() => {});
  broadcastPresence(userId, true);
}

async function setUserOffline(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data:  { isOnline: false },
  }).catch(() => {});
  broadcastPresence(userId, false);
}

function isUserWatchingConv(userId: string, conversationId: string): boolean {
  for (const [, meta] of clients) {
    if (meta.userId === userId && meta.watchingConvId === conversationId) return true;
  }
  return false;
}

export function initChatSocket(server: http.Server): void {
  wss = new WebSocketServer({ server, path: "/ws/chat" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const token = url.searchParams.get("token") ?? "";
    const auth = await verifyWsToken(token);
    if (!auth) {
      ws.close(4401, "Unauthorized");
      return;
    }

    const user = await prisma.user.findUnique({
      where:  { id: auth.id },
      select: { name: true },
    });
    const name = user?.name ?? "User";

    registerClient(ws, auth.id, auth.role, name);
    await setUserOnline(auth.id);
    send(ws, { type: "connected", userId: auth.id });

    ws.on("message", (raw) => {
      void handleClientMessage(ws, raw.toString());
    });

    ws.on("close", () => {
      unregisterClient(ws);
    });

    ws.on("error", () => {
      unregisterClient(ws);
    });
  });

  console.log("[Chat WS] WebSocket server ready at /ws/chat");
}

async function handleClientMessage(ws: WebSocket, raw: string) {
  const meta = clients.get(ws);
  if (!meta) return;

  let msg: { type?: string; conversationId?: string; online?: boolean };
  try {
    msg = JSON.parse(raw) as typeof msg;
  } catch {
    return;
  }

  switch (msg.type) {
    case "ping":
      send(ws, { type: "pong" });
      await prisma.user.update({
        where: { id: meta.userId },
        data:  { lastActive: new Date(), isOnline: true },
      }).catch(() => {});
      break;

    case "presence": {
      const online = Boolean(msg.online);
      await prisma.user.update({
        where: { id: meta.userId },
        data:  { isOnline: online, lastActive: new Date() },
      }).catch(() => {});
      broadcastPresence(meta.userId, online);
      break;
    }

    case "watch":
      meta.watchingConvId = msg.conversationId ?? null;
      break;

    case "typing":
      if (!msg.conversationId) break;
      emitTyping(msg.conversationId, meta.userId, meta.name);
      break;

    default:
      break;
  }
}

export function emitTyping(conversationId: string, userId: string, name: string) {
  void (async () => {
    const members = await prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    for (const m of members) {
      if (m.userId === userId) continue;
      sendToUser(m.userId, { type: "typing", conversationId, userId, name });
    }
  })();
}

export function emitNewMessage(
  conversationId: string,
  senderId: string,
  message: Parameters<typeof formatMessage>[0],
  members: MemberRow[],
) {
  const preview = messagePreviewText(message.type, message.text);
  const lastMessageAt = message.createdAt instanceof Date
    ? message.createdAt.toISOString()
    : String(message.createdAt);

  for (const member of members) {
    const uid = member.userId;
    const formatted = formatMessage(message, uid, members);
    sendToUser(uid, { type: "message:new", conversationId, message: formatted });

    const watching = isUserWatchingConv(uid, conversationId);
    const incrementUnread = uid !== senderId && !watching;
    sendToUser(uid, {
      type:         "conversation:update",
      conversationId,
      lastMessage:  preview,
      lastMessageAt,
      senderName:   chatDisplayName(message.sender),
      incrementUnread,
    });
  }
}

export function emitMessageEdit(
  conversationId: string,
  message: Parameters<typeof formatMessage>[0],
  members: MemberRow[],
) {
  for (const member of members) {
    sendToUser(member.userId, {
      type: "message:edit",
      conversationId,
      message: formatMessage(message, member.userId, members),
    });
  }
}

export function emitMessageDelete(conversationId: string, messageId: string, memberIds: string[]) {
  for (const uid of memberIds) {
    sendToUser(uid, { type: "message:delete", conversationId, messageId });
  }
}

export function emitMessageReaction(
  conversationId: string,
  messageId: string,
  reactions: Record<string, string[]>,
  memberIds: string[],
) {
  for (const uid of memberIds) {
    sendToUser(uid, { type: "message:reaction", conversationId, messageId, reactions });
  }
}

export function emitConversationRead(conversationId: string, userId: string, readAt: string, memberIds: string[]) {
  for (const uid of memberIds) {
    sendToUser(uid, { type: "read", conversationId, userId, readAt });
  }
}

export function emitPinnedMessage(
  conversationId: string,
  pinnedMessage: ReturnType<typeof formatMessage> | null,
  memberIds: string[],
) {
  for (const uid of memberIds) {
    sendToUser(uid, { type: "message:pinned", conversationId, pinnedMessage });
  }
}

export function emitPresence(userId: string, isOnline: boolean) {
  broadcastPresence(userId, isOnline);
}

/** Tell a CSR browser to drop cached lists after admin reset. */
export function notifyCsrDataReset(csrId: string): void {
  sendToUser(csrId, { type: "csr-data-reset" });
}

/** Drop every live socket for this user and tell their browser to sign out. */
export function forceLogoutUser(userId: string): void {
  sendToUser(userId, {
    type: "auth:force_logout",
    message: "You were logged out from all devices by an administrator.",
  });
  setTimeout(() => {
    const set = userSockets.get(userId);
    if (!set) return;
    for (const ws of [...set]) {
      try { ws.close(4401, "Logged out"); } catch { /* ignore */ }
    }
  }, 150);
  broadcastPresence(userId, false);
}

/** Notify the active session that another device tried to log in. */
export function notifyLoginAttempt(userId: string, attemptId: number): void {
  sendToUser(userId, {
    type: "auth:login_attempt",
    attemptId,
    message: "Someone is trying to login to your account from another device.",
  });
}

/** Tell admin/manager browsers to refresh dashboard summary counts. */
export function notifyAdminSummaryStale(): void {
  for (const [ws, meta] of clients) {
    if (meta.role === "admin" || meta.role === "manager") {
      send(ws, { type: "admin-summary-stale" });
    }
  }
}

export function isChatSocketReady(): boolean {
  return wss !== null;
}
