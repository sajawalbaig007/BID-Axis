"use client";

import EstimatorSidebar from "@/app/estimator/components/layout/Sidebar";
import EstimatorCheckInBanner from "@/app/estimator/components/EstimatorCheckInBanner";

/** Estimator pages — top nav only (no side column). Check-in banner sits below header. */
export default function EstimatorPageShell({
  children,
  className = "",
  bgClass = "bg-[#F0F2F8] dark:bg-crm-bg-subtle",
}: {
  children: React.ReactNode;
  className?: string;
  bgClass?: string;
}) {
  return (
    <div className={`min-h-screen ${bgClass}`}>
      <EstimatorSidebar />
      <main className={`w-full min-w-0 ${className}`}>
        <EstimatorCheckInBanner />
        {children}
      </main>
    </div>
  );
}
