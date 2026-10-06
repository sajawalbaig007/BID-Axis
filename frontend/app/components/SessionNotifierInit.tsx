"use client";

import { useSessionNotifier } from "@/lib/useSessionNotifier";

export default function SessionNotifierInit() {
  useSessionNotifier();
  return null;
}
