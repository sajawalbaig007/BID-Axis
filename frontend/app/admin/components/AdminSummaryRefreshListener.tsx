"use client";

import { useEffect } from "react";
import { subscribeChatSocket } from "@/lib/chatSocket";
import { broadcastAdminSummaryStale } from "@/lib/adminSummaryCache";

/** Refresh admin dashboard counts when CSR data is reset or deleted. */
export default function AdminSummaryRefreshListener() {
  useEffect(() => {
    return subscribeChatSocket((event) => {
      if (event.type !== "admin-summary-stale") return;
      broadcastAdminSummaryStale();
    });
  }, []);

  return null;
}
