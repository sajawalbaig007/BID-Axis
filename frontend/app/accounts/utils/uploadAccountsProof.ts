import API, { apiErrorMessage } from "@/lib/api";
import type { AccountsPageKey } from "../types";

export async function uploadAccountsProof(
  page: AccountsPageKey,
  recordDate: string,
  file: File,
): Promise<{ fileUrl: string; fileName: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await API.post(`/accounts/${page}/${recordDate}/upload`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  const upload = res.data?.upload;
  if (!upload?.fileUrl) throw new Error("No file URL returned");
  return {
    fileUrl: String(upload.fileUrl),
    fileName: String(upload.fileName ?? file.name),
  };
}

export function isImageProofUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(url) || url.includes("/image/upload/");
}
