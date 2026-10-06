"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import API from "@/lib/api";
import { invalidateAccountsDashboardCache } from "@/lib/accountsDashboardCache";
import type { AccountsPageKey, AccountsUpload, IncomeStatementData } from "../types";
import { todayIso } from "../types";
import {
  currentMonthValue,
  currentYear,
  normalizePeriodPreset,
  periodDateRange,
  type AccountsPeriodPreset,
} from "../utils/accountsPeriodFilters";
import { syncLoansFromIncomeStatement } from "../utils/payrollLoanSync";

type UseAccountsPageOpts<T> = {
  page: AccountsPageKey;
  defaultData: () => T;
  /** Initial quick-period mode (e.g. "daily" for day-wise pages). Default: "all_time". */
  defaultPreset?: AccountsPeriodPreset;
};

function latestDate(dates: string[]): string | null {
  if (!dates.length) return null;
  return [...dates].sort().reverse()[0] ?? null;
}

export function useAccountsPage<T extends Record<string, unknown>>({
  page,
  defaultData,
  defaultPreset = "all_time",
}: UseAccountsPageOpts<T>) {
  const defaultRef = useRef(defaultData);
  useEffect(() => {
    defaultRef.current = defaultData;
  }, [defaultData]);

  const [recordDate, setRecordDate] = useState(todayIso);
  const [periodPreset, setPeriodPresetState] = useState<AccountsPeriodPreset>(defaultPreset);
  const [filterYear, setFilterYearState] = useState(currentYear);
  const [filterMonth, setFilterMonthState] = useState(currentMonthValue);
  const [filterFrom, setFilterFromState] = useState("");
  const [filterTo, setFilterToState] = useState("");
  const [data, setData] = useState<T>(() => defaultData());
  const [uploads, setUploads] = useState<AccountsUpload[]>([]);
  const [savedDates, setSavedDates] = useState<string[]>([]);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Loading is derived: the record effect stamps `loadedKey` when a fetch
  // for the current page/date/version settles. Bumping `loadVersion` forces a reload.
  const [loadVersion, setLoadVersion] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const loadKey = `${page}|${recordDate}|${loadVersion}`;
  const loading = loadedKey !== loadKey;
  const [datesVersion, setDatesVersion] = useState(0);

  const dataRef = useRef(data);
  const dirtyRef = useRef(false);
  const seqRef = useRef(0);
  const recordDateRef = useRef(recordDate);
  const pendingSaveRef = useRef(false);
  const savingLockRef = useRef(false);
  const saveRef = useRef<(override?: T, opts?: { silent?: boolean }) => Promise<void>>(async () => {});

  useEffect(() => {
    recordDateRef.current = recordDate;
  }, [recordDate]);

  const setFilterMonth = useCallback((month: string) => {
    setFilterMonthState(month);
    setPeriodPresetState("month");
    const range = periodDateRange("month", { month });
    setFilterFromState(range.from);
    setFilterToState(range.to);
    // Prefer a real saved day in this month once dates load; seed to month start for now
    if (range.from) setRecordDate(range.from);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = new URLSearchParams(window.location.search).get("month");
    if (m && /^\d{4}-\d{2}$/.test(m)) setFilterMonth(m);
  }, [setFilterMonth]);

  /** Daily mode — one record per calendar day */
  const setFilterDay = useCallback((day: string) => {
    if (!day) return;
    setPeriodPresetState("daily");
    setRecordDate(day);
    setFilterFromState(day);
    setFilterToState(day);
  }, []);

  /**
   * Pick a saved record without leaving the current period mode.
   * Used by All Time / Month / Date Range saved-date chips.
   */
  const selectRecordDate = useCallback((day: string) => {
    if (!day) return;
    setRecordDate(day);
    setPeriodPresetState(prev => {
      if (normalizePeriodPreset(prev) === "daily") {
        setFilterFromState(day);
        setFilterToState(day);
      }
      return prev;
    });
  }, []);

  const setPeriodPreset = useCallback((preset: AccountsPeriodPreset) => {
    const next = normalizePeriodPreset(preset);
    setPeriodPresetState(next);
    if (next === "all_time") {
      setFilterFromState("");
      setFilterToState("");
      // Anchor to today — cards aggregate through this date; no date chips
      setRecordDate(todayIso());
      return;
    }
    if (next === "daily") {
      // Scope to the currently selected day (defaults to today)
      setRecordDate(prev => {
        const day = prev || todayIso();
        setFilterFromState(day);
        setFilterToState(day);
        return day;
      });
      return;
    }
    if (next === "month") {
      const range = periodDateRange("month", { month: filterMonth });
      setFilterFromState(range.from);
      setFilterToState(range.to);
      if (range.from) setRecordDate(range.from);
      return;
    }
    // date_range — keep existing from/to so user can edit
  }, [filterMonth]);

  const setFilterYear = useCallback((year: number) => {
    setFilterYearState(year);
  }, []);

  const setFilterFrom = useCallback((from: string) => {
    setPeriodPresetState("date_range");
    setFilterFromState(from);
    if (from) setRecordDate(from);
  }, []);

  const setFilterTo = useCallback((to: string) => {
    setPeriodPresetState("date_range");
    setFilterToState(to);
    if (to) setRecordDate(to);
  }, []);

  /** Re-fetch the saved-dates list (safe to call from event handlers). */
  const refreshDates = useCallback(() => {
    setDatesVersion(v => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    const mode = normalizePeriodPreset(periodPreset);
    // All Time → no date filter params (full history)
    if (mode !== "all_time") {
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
    }
    const qs = params.toString();
    API.get(`/accounts/${page}${qs ? `?${qs}` : ""}`, {
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    })
      .then(res => {
        if (cancelled) return;
        const dates: string[] = res.data.dates ?? [];
        setSavedDates(dates);
        // Month / Date Range: open a real saved day in range.
        // All Time keeps "today" as anchor — dashboard cards sum through today.
        if (mode !== "daily" && mode !== "all_time" && dates.length > 0) {
          setRecordDate(prev => (dates.includes(prev) ? prev : (latestDate(dates) ?? prev)));
        }
      })
      .catch(() => {
        /* ignores */  
      });
    return () => {
      cancelled = true;
    };
  }, [page, filterFrom, filterTo, periodPreset, datesVersion]);

  useEffect(() => {
    let cancelled = false;
    // Invalidate in-flight PUTs from a previous date/reload so they cannot clobber this load.
    seqRef.current += 1;
    const seqAtStart = seqRef.current;
    dirtyRef.current = false;

    API.get(`/accounts/${page}/${recordDate}`, {
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    })
      .then(res => {
        if (cancelled) return;
        if (seqRef.current !== seqAtStart) {
          return;
        }
        const next = (res.data.data as T) ?? defaultRef.current();
        dataRef.current = next;
        setData(next);
        setUploads(res.data.uploads ?? []);
        setCopiedFrom(typeof res.data.copiedFrom === "string" ? res.data.copiedFrom : null);
        dirtyRef.current = false;
        setDirty(false);
      })
      .catch(() => {
        if (cancelled) return;
        if (seqRef.current !== seqAtStart) return;
        toast.error("Failed to load data for selected date.");
        const fallback = defaultRef.current();
        dataRef.current = fallback;
        setData(fallback);
        setCopiedFrom(null);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(loadKey);
      });
    return () => {
      cancelled = true;
    };
  }, [page, recordDate, loadKey]);

  const patchData = useCallback((updater: (prev: T) => T) => {
    setData(prev => {
      const next = updater(prev);
      dataRef.current = next;
      dirtyRef.current = true;
      seqRef.current += 1;
      setDirty(true);
      return next;
    });
  }, []);

  /**
   * Persist to DB. Pass `override` to save just-updated data without waiting for state.
   * Overlapping saves are coalesced: a PUT that finishes after a newer edit is retried
   * with the latest payload so a stale write cannot wipe a newly added row.
   */
  const save = useCallback(async (override?: T, opts?: { silent?: boolean }) => {
    if (override) dataRef.current = override;
    pendingSaveRef.current = true;
    if (savingLockRef.current) return;
    savingLockRef.current = true;
    setSaving(true);
    try {
      let applied: { payload: T; saved: T; date: string } | null = null;
      while (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        const date = recordDateRef.current;
        const seq = seqRef.current;
        const payload = dataRef.current;
        const res = await API.put(`/accounts/${page}/${date}`, { data: payload });
        if (recordDateRef.current !== date) break;
        if (pendingSaveRef.current || seqRef.current !== seq) {
          pendingSaveRef.current = true;
          continue;
        }
        const saved = (res.data.data as T) ?? payload;
        dataRef.current = saved;
        setData(saved);
        dirtyRef.current = false;
        setDirty(false);
        applied = { payload, saved, date };
        setCopiedFrom(null);
      }

      if (applied) {
        invalidateAccountsDashboardCache();
        if (!opts?.silent) {
          if (page === "income_statement") {
            try {
              const n = await syncLoansFromIncomeStatement(
                (applied.saved as unknown as IncomeStatementData) ??
                  (applied.payload as unknown as IncomeStatementData),
              );
              toast.success(
                n > 0
                  ? `Saved for ${applied.date} · ${n} loan(s) synced to ledger`
                  : `Saved for ${applied.date}`,
              );
            } catch {
              toast.success(`Saved for ${applied.date}`);
              toast.error("Payroll saved, but loan ledger sync failed.");
            }
          } else {
            toast.success(`Saved for ${applied.date}`);
          }
        }
        refreshDates();
      }
    } catch {
      toast.error("Save failed.");
    } finally {
      savingLockRef.current = false;
      setSaving(false);
      if (pendingSaveRef.current) void saveRef.current();
    }
  }, [page, refreshDates]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    const seqAtStart = seqRef.current;
    const date = recordDateRef.current;
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await API.post(`/accounts/${page}/${date}/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.merged && res.data.data && seqRef.current === seqAtStart) {
        const next = res.data.data as T;
        dataRef.current = next;
        setData(next);
        dirtyRef.current = false;
        setDirty(false);
        toast.success("File uploaded and data merged for this date.");
      } else if (res.data.merged && res.data.data) {
        toast.success("File uploaded and data merged for this date.");
      } else {
        toast.success("File uploaded for this date.");
      }
      setUploads(res.data.uploads ?? []);
      invalidateAccountsDashboardCache();
      refreshDates();
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }, [page, refreshDates]);

  return {
    recordDate,
    setRecordDate,
    setFilterDay,
    selectRecordDate,
    periodPreset,
    setPeriodPreset,
    filterYear,
    setFilterYear,
    filterMonth,
    setFilterMonth,
    filterFrom,
    setFilterFrom,
    filterTo,
    setFilterTo,
    data,
    setData: patchData,
    uploads,
    savedDates,
    copiedFrom,
    loading,
    saving,
    uploading,
    dirty,
    save,
    uploadFile,
    reload: () => setLoadVersion(v => v + 1),
  };
}
