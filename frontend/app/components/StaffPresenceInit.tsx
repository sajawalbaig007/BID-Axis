"use client";

import { useEffect } from "react";
import { connectChatSocket, disconnectChatSocket } from "@/lib/chatSocket";
import { startChatStatusHeartbeat, stopChatStatusHeartbeat } from "@/lib/chatStatusHeartbeat";
import { primeChatSound } from "@/lib/chatSound";

/** WebSocket + presence while user is on any staff dashboard (admin / manager / csr). */
export default function StaffPresenceInit() {
  useEffect(() => {
    primeChatSound();
    connectChatSocket();
    startChatStatusHeartbeat();
    return () => {
      stopChatStatusHeartbeat();
      disconnectChatSocket();
    };
  }, []);

  return null;
}
