"use client";

import { formatStatusTimestamp } from "@/lib/formatStatusTimestamp";
import { statusBadgeClass, statusDisplayLabel } from "../../constants/leadStatuses";

type Props = {
  status: string;
  statusUpdatedAt?: string | null;
  className?: string;
  badgeClassName?: string;
  label?: string;
  showTimestamp?: boolean;
};

export default function StatusWithTimestamp({
  status,
  statusUpdatedAt,
  className = "",
  badgeClassName = "",
  label,
  showTimestamp = false,
}: Props) {
  const ts = showTimestamp ? formatStatusTimestamp(statusUpdatedAt) : null;
  return (
    <div className={className}>
      <div className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-sm font-semibold w-fit whitespace-nowrap ${badgeClassName || statusBadgeClass(status)}`}>
        {label ?? statusDisplayLabel(status)}
      </div>
      {ts && (
        <p className="text-[9px] sm:text-[10px] text-gray-400 mt-1 font-mono tabular-nums">{ts}</p>
      )}
    </div>
  );
}
