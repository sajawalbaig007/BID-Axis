import type { useAccountsPage } from "../hooks/useAccountsPage";

/** Spread onto AccountsPageShell from useAccountsPage return value. */
export function accountsShellProps<T extends Record<string, unknown>>(
  acc: ReturnType<typeof useAccountsPage<T>>,
) {
  return {
    recordDate: acc.recordDate,
    /** Daily picker switches to daily mode; chips in other modes keep the preset. */
    onRecordDateChange: acc.setFilterDay,
    onSelectSavedDate: acc.selectRecordDate,
    filterFrom: acc.filterFrom,
    filterTo: acc.filterTo,
    onFilterFromChange: acc.setFilterFrom,
    onFilterToChange: acc.setFilterTo,
    periodPreset: acc.periodPreset,
    onPeriodPresetChange: acc.setPeriodPreset,
    filterYear: acc.filterYear,
    onFilterYearChange: acc.setFilterYear,
    filterMonth: acc.filterMonth,
    onFilterMonthChange: acc.setFilterMonth,
    savedDates: acc.savedDates,
    onSave: () => void acc.save(),
    onUpload: (f: File) => void acc.uploadFile(f),
    saving: acc.saving,
    uploading: acc.uploading,
    loading: acc.loading,
    dirty: acc.dirty,
    copiedFrom: acc.copiedFrom,
    uploads: acc.uploads,
  };
}
