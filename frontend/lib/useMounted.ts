"use client";

import { useEffect, useState } from "react";

/** True after first client paint — use to defer charts/clocks that need DOM dimensions or live time. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
