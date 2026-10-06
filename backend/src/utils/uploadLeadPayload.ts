import type { ParsedLeadRow } from "./uploadExcelParse";
import { parseSubTradeList, parseTradeList } from "./masterFormatTrades";

/** Map parsed upload row → lead fields (upload type controls status + isOldClient). */
export function buildLeadFieldsFromUploadRow(
  r: ParsedLeadRow,
  uploadedFileId: string,
  hideOnMain: (status: string) => boolean,
) {
  const status = (r.status ?? "").toLowerCase();
  return {
    name:              r.name,
    company:           r.company || null,
    phone:             r.phone || null,
    email:             r.email || null,
    website:           r.website?.trim() || null,
    state:             r.state || null,
    interestedService: r.interestedService || null,
    clientCode:        r.clientCode || null,
    projectTitle:      r.projectTitle,
    projectBudget:     r.projectBudget,
    comments:          r.comments || null,
    status:            r.status,
    important:         status === "important",
    interested:        status === "interested",
    isOldClient:       r.isOldClient,
    assignedTo:        r.csrId,
    uploadedFileId,
    hiddenOnMain:      hideOnMain(r.status),
    inBin:             false,
    trade:             parseTradeList(r.trade).join(", ") || null,
    subTrades:         parseSubTradeList(r.subTrades).join(", ") || null,
  };
}
