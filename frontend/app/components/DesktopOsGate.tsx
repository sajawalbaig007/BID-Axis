"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import DesktopOnlyScreen from "@/app/components/DesktopOnlyScreen";
import { isDesktopOsUserAgent, isPublicDevicePath } from "@/lib/desktopUserAgent";

type UaData = {
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ mobile?: boolean; platform?: string; model?: string }>;
};

/** Phone or tablet, including Chrome opened with Desktop site. */
async function isPhoneClient(): Promise<boolean> {
  const ua = navigator.userAgent || "";
  if (!isDesktopOsUserAgent(ua)) return true;

  const uaData = (navigator as Navigator & { userAgentData?: UaData }).userAgentData;
  if (uaData?.mobile) return true;
  if (/android|iphone|ipad|ipod/i.test(uaData?.platform || "")) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  if (/linux\s*(arm|aarch64)|armv8|armv7/i.test(navigator.platform || "")) return true;

  const shortSide = Math.min(window.screen?.width || 0, window.screen?.height || 0);
  const coarse = window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(hover: none)").matches;
  if (navigator.maxTouchPoints > 1 && coarse && shortSide > 0 && shortSide <= 900) return true;

  const touch = navigator.maxTouchPoints > 0;
  const desktopSpoof = /X11|Linux/i.test(ua) && !/CrOS|Windows NT/i.test(ua);
  if (touch && desktopSpoof) return true;
  if (touch && coarse && !/Windows NT|Macintosh|CrOS/i.test(ua)) return true;
  const cssShort = shortSide / (window.devicePixelRatio || 1);
  if (touch && coarse && cssShort > 0 && cssShort <= 820) return true;

  try {
    const high = await uaData?.getHighEntropyValues?.(["platform", "model", "mobile"]);
    if (high?.mobile) return true;
    if (/^(android|ios)$/i.test(high?.platform || "")) return true;
    if ((high?.model || "").trim()) return true;
  } catch {
    /* hints are optional */
  }
  return false;
}

export default function DesktopOsGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (isPublicDevicePath(pathname)) {
      setAllowed(true);
      return;
    }
    let cancelled = false;
    void isPhoneClient().then((phone) => {
      if (!cancelled) setAllowed(!phone);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (isPublicDevicePath(pathname)) return <>{children}</>;
  if (allowed === true) return <>{children}</>;
  if (allowed === false) return <DesktopOnlyScreen />;
  return null;
}
