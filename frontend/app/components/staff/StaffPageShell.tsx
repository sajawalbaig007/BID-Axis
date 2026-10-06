"use client";

import { StaffSidebar } from "@/app/hooks/useStaffSidebar";

/** Standard admin/manager page wrapper — top nav + padded main content. */
export default function StaffPageShell({
  children,
  className = "",
  maxWidth = "1400px",
}: {
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
}) {
  return (
    <div className="min-h-screen bg-[#F5F6FA] dark:bg-[#0f1117]">
      <StaffSidebar />
      <main
        className={`pt-[var(--app-header-h,64px)] w-full mx-auto px-3 sm:px-4 md:px-5 lg:px-6 xl:px-8 pb-6 sm:pb-8 ${className}`}
        style={{ maxWidth }}
      >
        {children}
      </main>
    </div>
  );
}
