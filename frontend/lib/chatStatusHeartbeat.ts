import API from "@/lib/api";
import { playChatSound, primeChatSound } from "@/lib/chatSound";
import { isChatSocketConnected, sendPresence } from "@/lib/chatSocket";

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatOwners = 0;
let lastPingAt = 0;
const PING_TTL_MS = 25_000;
const HEARTBEAT_MS = 60_000;

function pingOnline(force = false) {
  if (!force && Date.now() - lastPingAt < PING_TTL_MS) return;
  lastPingAt = Date.now();
  if (isChatSocketConnected()) {
    sendPresence(true);
  } else {
    void API.post("/chat/status", { online: true }).catch(() => {});
  }
}

function pingOffline() {
  lastPingAt = 0;
  if (isChatSocketConnected()) {
    sendPresence(false);
  }
  void API.post("/chat/status", { online: false }).catch(() => {});
}

export function startChatStatusHeartbeat(): void {
  if (typeof window === "undefined") return;
  heartbeatOwners += 1;
  if (heartbeatTimer) {
    pingOnline(true);
    return;
  }

  pingOnline(true);
  heartbeatTimer = setInterval(() => pingOnline(), HEARTBEAT_MS);
}

export function stopChatStatusHeartbeat(): void {
  heartbeatOwners = Math.max(0, heartbeatOwners - 1);
  if (heartbeatOwners > 0 || !heartbeatTimer) return;

  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  pingOffline();
}

/** Hard stop — logout or leaving staff app shell. */
export function forceStopChatStatusHeartbeat(): void {
  heartbeatOwners = 0;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  pingOffline();
}
