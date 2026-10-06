"use client";

import { useEffect } from "react";
import { CSR_DATA_RESET_EVENT } from "@/lib/csrCacheReset";

export function useOnCsrDataReset(refetch: () => void): void {
  useEffect(() => {
    const onReset = () => { refetch(); };
    window.addEventListener(CSR_DATA_RESET_EVENT, onReset);
    return () => window.removeEventListener(CSR_DATA_RESET_EVENT, onReset);
  }, [refetch]);
}
