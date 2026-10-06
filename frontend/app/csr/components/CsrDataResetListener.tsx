"use client";

import { useEffect } from "react";
import toast from "react-hot-toast";
import { subscribeChatSocket } from "@/lib/chatSocket";
import { dispatchCsrDataReset } from "@/lib/csrCacheReset";

/** When admin resets this CSR's data, clear caches and tell open pages to refetch. */
export default function CsrDataResetListener() {
  useEffect(() => {
    return subscribeChatSocket((event) => {
      if (event.type !== "csr-data-reset") return;
      dispatchCsrDataReset();
      toast("Your data was reset by admin. Lists are refreshing.", { icon: "🔄", duration: 5000 });
    });
  }, []);

  return null;
}
