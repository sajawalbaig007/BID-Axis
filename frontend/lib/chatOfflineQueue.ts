const KEY = "crm_chat_offline_queue";

export interface QueuedChatMessage {
  id: string;
  conversationId: string;
  text: string;
  replyToId?: string;
  createdAt: string;
}

export function getOfflineQueue(): QueuedChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function addToOfflineQueue(item: QueuedChatMessage): void {
  const q = getOfflineQueue();
  q.push(item);
  localStorage.setItem(KEY, JSON.stringify(q));
}

export function removeFromOfflineQueue(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(getOfflineQueue().filter(m => m.id !== id)));
}

export function clearOfflineQueue(): void {
  localStorage.removeItem(KEY);
}
