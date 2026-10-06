"use client";

import dynamic from "next/dynamic";
import ReportsSubpage from "../ReportsSubpage";

const ShiftHoursCard = dynamic(() => import("../ShiftHoursCard"), {
  ssr: false,
  loading: () => <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />,
});

const LateDeductionCard = dynamic(() => import("../LateDeductionCard"), {
  ssr: false,
  loading: () => <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />,
});

const DailyLateCard = dynamic(() => import("../DailyLateCard"), {
  ssr: false,
  loading: () => <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />,
});

export default function ShiftHoursPage() {
  return (
    <ReportsSubpage
      title="Shift time and deductions"
      subtitle="Set check-in and check-out by month, then the late deduction ranges for each department."
    >
      <DailyLateCard />
      <ShiftHoursCard />
      <LateDeductionCard />
    </ReportsSubpage>
  );
}
