"use client";

import { useEffect, useMemo, useState } from "react";
import API from "@/lib/api";
import {
  usesProjectSlabRules,
  type SalesPayrollCalcOpts,
} from "../utils/salesPayrollFormula";

/** Live USD/CAD→PKR for Aug 2026+ project slabs; empty rates otherwise. */
export function useSalesPayrollCalcOpts(recordDate?: string): SalesPayrollCalcOpts {
  const slab = usesProjectSlabRules(recordDate);
  const [usdToPkr, setUsdToPkr] = useState(0);
  const [cadToPkr, setCadToPkr] = useState(0);

  useEffect(() => {
    if (!slab) return;
    let cancelled = false;
    API.get("/accounts/fx-rates")
      .then(res => {
        if (cancelled) return;
        setUsdToPkr(Number(res.data.usdToPkr) || 0);
        setCadToPkr(Number(res.data.cadToPkr) || 0);
      })
      .catch(() => {
        /* stored project fxRate still applies */
      });
    return () => {
      cancelled = true;
    };
  }, [slab, recordDate]);

  return useMemo(
    () => ({ recordDate, usdToPkr, cadToPkr }),
    [recordDate, usdToPkr, cadToPkr],
  );
}
