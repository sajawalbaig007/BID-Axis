import { getClientAuthToken } from "@/lib/api";

export type ChatSocketEvent =
  | { type: "connected"; userId: string }
  | { type: "message:new"; conversationId: string; message: Record<string, unknown> }
  | { type: "message:edit"; conversationId: string; message: Record<string, unknown> }
  | { type: "message:delete"; conversationId: string; messageId: string }
  | { type: "message:reaction"; conversationId: string; messageId: string; reactions: Record<string, string[]> }
  | { type: "message:pinned"; conversationId: string; pinnedMessage: Record<string, unknown> | null }
  | { type: "conversation:update"; conversationId: string; lastMessage: string; lastMessageAt: string; senderName: string; incrementUnread: boolean }
  | { type: "typing"; conversationId: string; userId: string; name: string }
  | { type: "read"; conversationId: string; userId: string; readAt: string }
  | { type: "presence"; userId: string; isOnline: boolean }
  | { type: "csr-data-reset" }
  | { type: "admin-summary-stale" }
  | { type: "auth:login_attempt"; attemptId: number; message?: string }
  | { type: "auth:force_logout"; message?: string }
  | { type: "pong" };

type Handler = (event: ChatSocketEvent) => void;
type ConnListener = (connected: boolean) => void;

let ws: WebSocket | null = null;
let connectOwners = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectAttempt = 0;
const handlers = new Set<Handler>();
const connListeners = new Set<ConnListener>();
let connected = false;

function notifyConnection(state: boolean) {
  connListeners.forEach(fn => fn(state));
}

export function subscribeChatSocketConnection(fn: ConnListener): () => void {
  connListeners.add(fn);
  fn(connected);
  return () => connListeners.delete(fn);
}

function isLocalHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

function resolveWsUrl(): string | null {
  const token = getClientAuthToken();
  if (!token || typeof window === "undefined") return null;

  const direct =
    process.env.NEXT_PUBLIC_WS_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ??
    "";

  let base: string;
  if (direct && !/localhost|127\.0\.0\.1/i.test(direct)) {
    base = direct.replace(/^http/i, "ws").replace(/\/$/, "");
  } else if (isLocalHost()) {
    base = "ws://127.0.0.1:5000";
  } else {
    return null;
  }

  return `${base}/ws/chat?token=${encodeURIComponent(token)}`;
}

function dispatch(raw: string) {
  try {
    const event = JSON.parse(raw) as ChatSocketEvent;
    handlers.forEach(fn => fn(event));
  } catch { /* ignore */ }
}

function clearPingTimer() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
}

function startPingTimer() {
  clearPingTimer();
  pingTimer = setInterval(() => {
    sendChatSocket({ type: "ping" });
  }, 10_000);
}

function scheduleReconnect() {
  if (connectOwners <= 0 || reconnectTimer) return;
  const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttempt);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, delay);
}

function openSocket() {
  if (typeof window === "undefined" || connectOwners <= 0) return;
  const url = resolveWsUrl();
  if (!url) return;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    connected = true;
    reconnectAttempt = 0;
    startPingTimer();
    sendChatSocket({ type: "presence", online: true });
    notifyConnection(true);
  };

  ws.onmessage = (ev) => {
    dispatch(String(ev.data));
  };

  ws.onclose = () => {
    connected = false;
    clearPingTimer();
    ws = null;
    notifyConnection(false);
    if (connectOwners > 0) {
      reconnectAttempt += 1;
      scheduleReconnect();
    }
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function isChatSocketConnected(): boolean {
  return connected && ws?.readyState === WebSocket.OPEN;
}

export function connectChatSocket(): void {
  if (typeof window === "undefined") return;
  connectOwners += 1;
  if (connectOwners === 1) {
    reconnectAttempt = 0;
    openSocket();
  }
}

export function disconnectChatSocket(force = false): void {
  if (force) connectOwners = 0;
  else connectOwners = Math.max(0, connectOwners - 1);

  if (connectOwners > 0) return;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  clearPingTimer();
  if (ws?.readyState === WebSocket.OPEN) {
    sendChatSocket({ type: "presence", online: false });
  }
  ws?.close();
  ws = null;
  connected = false;
}

export function forceDisconnectChatSocket(): void {
  disconnectChatSocket(true);
}

export function subscribeChatSocket(fn: Handler): () => void {
  handlers.add(fn);
  return () => handlers.delete(fn);
}

export function sendChatSocket(payload: object): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function setWatchingConversation(conversationId: string | null): void {
  sendChatSocket({ type: "watch", conversationId });
}

export function sendTyping(conversationId: string): void {
  sendChatSocket({ type: "typing", conversationId });
}

export function sendPresence(online: boolean): void {
  sendChatSocket({ type: "presence", online });
}
