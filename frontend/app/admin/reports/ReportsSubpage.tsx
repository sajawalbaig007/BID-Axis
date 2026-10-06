"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DashboardNavbar from "../components/layout/Navbar";
import { StaffSidebar } from "@/app/hooks/useStaffSidebar";

export default function ReportsSubpage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const back = pathname.startsWith("/manager") ? "/manager/reports" : "/admin/reports";

  return (
    <div className="flex min-h-screen bg-[#EEF1F7] dark:bg-crm-bg-subtle">
      <StaffSidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden mt-[var(--app-header-h,64px)]">
        <DashboardNavbar />
        <div className="w-full px-3 sm:px-5 lg:px-6 xl:px-8 2xl:px-10 py-4 sm:py-5 space-y-4">
          <header>
            <Link href={back} className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B6FE8]">
              <ArrowLeft size={14} /> Reports
            </Link>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-crm-text tracking-tight">{title}</h1>
            <p className="text-sm text-gray-500 dark:text-crm-text-muted mt-1">{subtitle}</p>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
