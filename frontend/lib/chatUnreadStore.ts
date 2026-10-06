import { playChatSound, primeChatSound } from "@/lib/chatSound";
import type { ChatConversation } from "./chatConversations";
import {
  fetchArchivedConversations,
  fetchChatConversations,
  patchConversationUnread,
  peekArchivedConversations,
  peekChatConversations,
} from "./chatApiCache";
import {
  isChatSocketConnected,
  subscribeChatSocket,
  subscribeChatSocketConnection,
  type ChatSocketEvent,
} from "./chatSocket";

type Listener = (total: number, convs: ChatConversation[]) => void;

let totalUnread = 0;
let lastConvs: ChatConversation[] = [];
let lastArchivedConvs: ChatConversation[] = [];
const listeners = new Set<Listener>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let panelOpenCount = 0;
let pollGeneration = 0;
let inflight: Promise<number> | null = null;
let archivedInflight: Promise<ChatConversation[]> | null = null;
let prevTotal = 0;
let prevById: Record<string, number> = {};
let notifOk = false;
let isFirstPoll = true;
let visibilityBound = false;
let realtimeBound = false;
let watchingConvId: string | null = null;

const POLL_FALLBACK_MS = 60_000;

function notify() {
  listeners.forEach(fn => fn(totalUnread, lastConvs));
}

function requestNotifPermissionOnce() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") notifOk = true;
  else if (Notification.permission === "default") {
    Notification.requestPermission().then(p => { notifOk = p === "granted"; });
  }
}

function showNotif(convName: string, body: string) {
  if (!notifOk || typeof Notification === "undefined") return;
  new Notification("New chat message", {
    body: `${convName}: ${body}`,
    icon: "/images/image.png",
    tag:  `chat-${convName}`,
  });
}

function handleConversationUpdate(ev: Extract<ChatSocketEvent, { type: "conversation:update" }>) {
  const { conversationId, lastMessage, lastMessageAt, senderName, incrementUnread } = ev;
  const isWatching = watchingConvId === conversationId;

  let found = false;
  lastConvs = lastConvs.map(c => {
    if (c.id !== conversationId) return c;
    found = true;
    const unreadCount = incrementUnread && !isWatching
      ? (c.unreadCount ?? 0) + 1
      : isWatching ? 0 : (c.unreadCount ?? 0);
    return {
      ...c,
      lastMessage,
      lastMessageAt,
      unreadCount,
    };
  });

  if (!found && incrementUnread) {
    lastConvs = [{
      id:            conversationId,
      type:          "direct",
      name:          senderName,
      lastMessage,
      lastMessageAt,
      unreadCount:   isWatching ? 0 : 1,
    }, ...lastConvs];
  }

  const prev = prevById[conversationId] ?? 0;
  const cur = lastConvs.find(c => c.id === conversationId)?.unreadCount ?? 0;

  if (incrementUnread && !isWatching && cur > prev) {
    const conv = lastConvs.find(c => c.id === conversationId);
    playChatSound();
    showNotif(conv?.name ?? senderName, lastMessage);
  }

  totalUnread = lastConvs.reduce((s, c) => s + (c.unreadCount ?? 0), 0);
  prevTotal = totalUnread;
  prevById = Object.fromEntries(lastConvs.map(c => [c.id, c.unreadCount ?? 0]));
  notify();
}

function onSocketEvent(event: ChatSocketEvent) {
  if (event.type === "conversation:update") {
    handleConversationUpdate(event);
  }
}

function bindRealtime() {
  if (realtimeBound || typeof window === "undefined") return;
  realtimeBound = true;
  primeChatSound();
  requestNotifPermissionOnce();
  subscribeChatSocket(onSocketEvent);
  subscribeChatSocketConnection(() => syncPolling());
}

function pollIntervalMs(): number | null {
  if (typeof document === "undefined") return null;
  if (isChatSocketConnected()) return null;
  return POLL_FALLBACK_MS;
}

function clearPollTimer() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function onVisibilityChange() {
  syncPolling();
  if (!document.hidden) void pollChatUnread(true);
}

function bindVisibility() {
  if (typeof document === "undefined" || visibilityBound) return;
  document.addEventListener("visibilitychange", onVisibilityChange);
  visibilityBound = true;
}

function unbindVisibility() {
  if (typeof document === "undefined" || !visibilityBound) return;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  visibilityBound = false;
}

function syncPolling() {
  if (typeof document === "undefined") return;
  clearPollTimer();
  const ms = pollIntervalMs();
  if (ms == null) {
    unbindVisibility();
    return;
  }
  bindVisibility();
  pollTimer = setInterval(() => void pollChatUnread(true), ms);
}

export function getChatUnreadTotal() {
  return totalUnread;
}

export function getChatConversations() {
  return lastConvs.length > 0 ? lastConvs : peekChatConversations();
}

export function getArchivedConversations() {
  return lastArchivedConvs.length > 0 ? lastArchivedConvs : peekArchivedConversations();
}

export function hasChatCache() {
  return getChatConversations().length > 0;
}

export function setChatWatchingConversation(conversationId: string | null) {
  watchingConvId = conversationId;
}

export function markConversationRead(conversationId: string) {
  if (!conversationId || conversationId.startsWith("temp-")) return;
  lastConvs = lastConvs.map(c =>
    c.id === conversationId ? { ...c, unreadCount: 0 } : c
  );
  totalUnread = lastConvs.reduce((s, c) => s + (c.unreadCount ?? 0), 0);
  prevById[conversationId] = 0;
  patchConversationUnread(conversationId, 0);
  notify();
}

export function subscribeChatUnread(fn: Listener): () => void {
  listeners.add(fn);
  fn(totalUnread, lastConvs);
  return () => listeners.delete(fn);
}

export async function pollChatUnread(force = false): Promise<number> {
  if (inflight) return inflight;

  const gen = pollGeneration;
  inflight = (async () => {
    try {
      const convs = await fetchChatConversations(force);
      if (gen !== pollGeneration) return totalUnread;
      const total = convs.reduce((s, c) => s + (c.unreadCount ?? 0), 0);

      if (!isFirstPoll && !isChatSocketConnected()) {
        let hasNewUnread = false;
        convs.forEach(c => {
          const prev = prevById[c.id] ?? 0;
          if ((c.unreadCount ?? 0) > prev) {
            hasNewUnread = true;
            showNotif(c.name, c.lastMessage ?? "You have a new message");
          }
        });
        if (hasNewUnread || total > prevTotal) playChatSound();
      }

      isFirstPoll = false;
      prevTotal = total;
      prevById = Object.fromEntries(convs.map(c => [c.id, c.unreadCount ?? 0]));
      totalUnread = total;
      lastConvs = convs;
      notify();
      return total;
    } catch {
      return totalUnread;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export async function pollArchivedConversations(force = false): Promise<ChatConversation[]> {
  if (panelOpenCount <= 0) return lastArchivedConvs;
  if (archivedInflight) return archivedInflight;

  archivedInflight = (async () => {
    try {
      lastArchivedConvs = await fetchArchivedConversations(force);
      return lastArchivedConvs;
    } catch {
      return lastArchivedConvs;
    } finally {
      archivedInflight = null;
    }
  })();

  return archivedInflight;
}

function hydrateFromPeek() {
  const peeked = peekChatConversations();
  if (!peeked.length || lastConvs.length > 0) return;
  lastConvs = peeked;
  totalUnread = peeked.reduce((s, c) => s + (c.unreadCount ?? 0), 0);
  notify();
}

/** Global realtime listeners — call once on staff layout mount. */
export function initChatRealtime(): void {
  bindRealtime();
  void pollChatUnread(true);
  syncPolling();
}

export function ensureChatUnreadPolling(): void {
  if (typeof window === "undefined") return;
  bindRealtime();
  panelOpenCount += 1;
  hydrateFromPeek();
  notify();
  syncPolling();
}

export function stopChatUnreadPolling(): void {
  panelOpenCount = Math.max(0, panelOpenCount - 1);
  syncPolling();
}

export function forceStopChatUnreadPolling(): void {
  panelOpenCount = 0;
  pollGeneration += 1;
  inflight = null;
  archivedInflight = null;
  syncPolling();
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") {
    notifOk = true;
    return true;
  }
  if (Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  notifOk = p === "granted";
  return notifOk;
}
