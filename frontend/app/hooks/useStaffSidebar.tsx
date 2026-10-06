"use client";

import { usePathname } from "next/navigation";
import AdminSidebar from "@/app/admin/components/layout/Sidebar";
import ManagerSidebar from "@/app/manager/components/layout/Sidebar";
import TechnicalSidebar from "@/app/technical/components/layout/Sidebar";

/** Stable sidebar component — picks Admin / Manager / Technical from the route. */
export function StaffSidebar() {
  const pathname = usePathname();
  if (pathname.startsWith("/manager")) return <ManagerSidebar />;
  if (pathname.startsWith("/technical")) return <TechnicalSidebar />;
  return <AdminSidebar />;
}
