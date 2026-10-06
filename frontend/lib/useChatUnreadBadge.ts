"use client";

import { useEffect, useState } from "react";
import { getChatUnreadTotal, subscribeChatUnread } from "@/lib/chatUnreadStore";

export function useChatUnreadBadge() {
  const [totalUnread, setTotalUnread] = useState(() => getChatUnreadTotal());

  useEffect(() => subscribeChatUnread((total) => setTotalUnread(total)), []);

  return totalUnread;
}
