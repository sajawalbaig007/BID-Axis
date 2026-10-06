import { requestNotificationPermission } from "@/lib/chatUnreadStore";

export { requestNotificationPermission };

/** @deprecated Use StaffChatNotifier + WebSocket via initChatRealtime */
export function useChatNotifications() {
  // Realtime handled by StaffChatNotifier / initChatRealtime
}
