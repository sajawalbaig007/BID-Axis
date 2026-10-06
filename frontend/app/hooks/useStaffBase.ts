"use client";

import { usePathname } from "next/navigation";

/** Route prefix for shared admin/manager/technical pages. */
export function useStaffBase(): "/admin" | "/manager" | "/technical" {
  const pathname = usePathname();
  if (pathname.startsWith("/manager")) return "/manager";
  if (pathname.startsWith("/technical")) return "/technical";
  return "/admin";
}
