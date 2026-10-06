"use client";

import { type ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { useMounted } from "@/lib/useMounted";

interface RechartsBoxProps {
  height: number | string;
  className?: string;
  children: ReactNode;
}

/** ResponsiveContainer wrapper that waits for mount and enforces min dimensions. */
export default function RechartsBox({ height, className = "", children }: RechartsBoxProps) {
  const mounted = useMounted();
  const h = typeof height === "number" ? `${height}px` : height;

  return (
    <div className={`w-full min-w-0 overflow-hidden ${className}`} style={{ height: h, minHeight: h }}>
      {mounted ? (
        <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
