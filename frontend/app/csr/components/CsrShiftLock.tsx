"use client";

import { useEffect } from "react";
import toast from "react-hot-toast";
import API from "@/lib/api";
import { logoutSession } from "@/lib/session";

const CLOSED = "CSR shift ended at 3:00 AM PKT. You can sign in again at 6:00 PM.";

async function leaveIfShiftEnded() {
  try {
    const res = await API.get<{ shiftEnded?: boolean }>("/csr/shift-window");
    if (!res.data?.shiftEnded) return;
    toast.error(CLOSED, { duration: 8000 });
    await logoutSession(() => API.post("/auth/logout"));
    window.location.replace("/");
  } catch {
    /* next poll retries */
  }
}

/** Signs a CSR out at 3:00 AM PKT. Seed accounts stay signed in. */
export default function CsrShiftLock() {
  useEffect(() => {
    void leaveIfShiftEnded();
    const id = window.setInterval(() => void leaveIfShiftEnded(), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}
