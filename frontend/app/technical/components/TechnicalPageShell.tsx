"use client";

import TechnicalSidebar from "@/app/technical/components/layout/Sidebar";

/** Technical Manager pages — top nav only (no side column). */
export default function TechnicalPageShell({
  children,
  className = "",
  bgClass = "bg-[#F0F2F8] dark:bg-crm-bg-subtle",
}: {
  children: React.ReactNode;
  className?: string;
  bgClass?: string;
}) {
  return (
    <div className={`min-h-screen technical-shell ${bgClass}`}>
      <TechnicalSidebar />
      <main className={`w-full min-w-0 ${className}`}>
        {children}
      </main>
    </div>
  );
}
