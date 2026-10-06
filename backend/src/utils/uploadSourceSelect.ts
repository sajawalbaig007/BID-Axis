/** CSR API — only expose sudo alias, never real source name */
export const CSR_UPLOAD_FILE_SELECT = {
  companyName: true,
  source: { select: { sudoName: true } },
} as const;

/** Admin API — full source metadata */
export const ADMIN_UPLOAD_SOURCE_SELECT = {
  id:       true,
  name:     true,
  sudoName: true,
} as const;
