"use client";

import { useEffect } from "react";
import { initChatRealtime, forceStopChatUnreadPolling } from "@/lib/chatUnreadStore";
import { useChatEnabled } from "@/lib/useChatEnabled";

/** Starts WebSocket-driven chat notifications on all staff dashboards. */
export default function StaffChatNotifier() {
  const chatEnabled = useChatEnabled();

  useEffect(() => {
    if (!chatEnabled) {
      forceStopChatUnreadPolling();
      return;
    }
    initChatRealtime();
  }, [chatEnabled]);

  return null;
}
