"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Old Total Assets register — now lives on Balance Sheet. */
export default function TotalAssetsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/accounts/balance-sheet#bs-assets");
  }, [router]);
  return null;
}
