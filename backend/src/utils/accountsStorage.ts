/**
 * Accounts Dashboard storage — isolated from Admin / CSR.
 *
 * Mongo collections (Prisma @@map):
 *   accounts_dashboard_records
 *   accounts_dashboard_uploads
 *   accounts_dashboard_monthly_reports
 *
 * Cloudinary root (never use crm_uploads / crm_reports / crm_chat):
 *   crm_accounts_dashboard/...
 */

export const ACCOUNTS_CLOUDINARY_ROOT = "crm_accounts_dashboard";

export const ACCOUNTS_CLOUDINARY_FOLDERS = {
  /** General page file uploads (screenshots, sheets, proofs) */
  uploads: `${ACCOUNTS_CLOUDINARY_ROOT}/uploads`,
  /** OPEX / payment proofs under income statement */
  opexProofs: `${ACCOUNTS_CLOUDINARY_ROOT}/opex_proofs`,
  /** Excel / CSV imports */
  excelImports: `${ACCOUNTS_CLOUDINARY_ROOT}/excel_imports`,
  /** Executive monthly Word archives */
  monthlyReports: `${ACCOUNTS_CLOUDINARY_ROOT}/monthly_reports`,
  /** Future: generated salary slips archived to cloud */
  salarySlips: `${ACCOUNTS_CLOUDINARY_ROOT}/salary_slips`,
} as const;

export type AccountsCloudinaryFolderKey = keyof typeof ACCOUNTS_CLOUDINARY_FOLDERS;

/** Pick Cloudinary sub-folder from page + file type. */
export function accountsUploadFolder(opts: {
  page: string;
  fileName?: string;
  mimeType?: string;
}): string {
  const name = (opts.fileName ?? "").toLowerCase();
  const isSheet = name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv");
  if (isSheet) return ACCOUNTS_CLOUDINARY_FOLDERS.excelImports;

  const isImage =
    (opts.mimeType ?? "").startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/i.test(name);
  if (opts.page === "income_statement" && isImage) {
    return ACCOUNTS_CLOUDINARY_FOLDERS.opexProofs;
  }

  return `${ACCOUNTS_CLOUDINARY_FOLDERS.uploads}/${opts.page || "misc"}`;
}
