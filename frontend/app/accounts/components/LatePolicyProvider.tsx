"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import API from "@/lib/api";
import { publishLatePolicies } from "../utils/latePolicy";

export default function LatePolicyProvider({ month, children }: { month: string; children: ReactNode }) {
  const [readyMonth, setReadyMonth] = useState("");
  const seen = useRef("");
  if (seen.current !== month) {
    seen.current = month;
    publishLatePolicies(month, []);
  }

  useEffect(() => {
    let live = true;
    API.get("/attendance/late-deductions", { params: { month } })
      .then((res) => {
        if (!live) return;
        publishLatePolicies(month, res.data.departments ?? []);
        setReadyMonth(month);
      })
      .catch(() => {
        if (!live) return;
        publishLatePolicies(month, []);
        setReadyMonth(month);
      });
    return () => {
      live = false;
    };
  }, [month]);

  return (
    <>
      <span hidden>{readyMonth}</span>
      {children}
    </>
  );
}
