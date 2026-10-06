import * as XLSX from "xlsx";
import type { Prisma } from "@prisma/client";
import prisma from "../config/db";
import {
  CSR_RESET_GROUPS,
  buildCsrResetScopeWhere,
  type CsrResetScopeId,
} from "./csrResetPages";
import { binReasonLabel } from "./binLeads";
import { parseProjectPayments } from "./projectPayments";
import { parseTradeNotes } from "./masterFormatTrades";
import { formatEstDateTime } from "./estTime";
import { ADMIN_UPLOAD_SOURCE_SELECT } from "./uploadSourceSelect";

const EXPORT_SELECT = {
  id: true,
  name: true,
  company: true,
  phone: true,
  email: true,
  website: true,
  ownerName: true,
  state: true,
  timezone: true,
  status: true,
  important: true,
  interested: true,
  isOldClient: true,
  nextSchedule: true,
  nextTime: true,
  interestedService: true,
  trade: true,
  subTrades: true,
  tradeNotes: true,
  comments: true,
  followUpNotes: true,
  notPickedCount: true,
  notInterestedCount: true,
  clientCode: true,
  projectCode: true,
  projectTitle: true,
  projectScope: true,
  projectBudget: true,
  paidAmount: true,
  projectPayments: true,
  projectDeadline: true,
  deadlineTiming: true,
  projectPhase: true,
  projectWorkStatus: true,
  projectSource: true,
  hiddenOnMain: true,
  inBin: true,
  binReason: true,
  binPreviousStatus: true,
  createdAt: true,
  updatedAt: true,
  uploadFile: {
    select: {
      companyName: true,
      source: { select: ADMIN_UPLOAD_SOURCE_SELECT },
    },
  },
  subContacts: {
    select: { name: true, designation: true, phone: true, email: true },
    orderBy: { createdAt: "asc" as const },
  },
  notes: {
    orderBy: { createdAt: "asc" as const },
    take: 40,
    select: { text: true, createdAt: true },
  },
} satisfies Prisma.LeadSelect;

type ExportLead = Prisma.LeadGetPayload<{ select: typeof EXPORT_SELECT }>;

type ExportSheetDef = {
  sheetName: string;
  group: string;
  label: string;
  scopes: CsrResetScopeId[];
};

const GROUP_PREFIX: Record<string, string> = {
  "call-data": "CD",
  "potential-clients": "PC",
  "not-interested-page": "NI",
  clients: "CL",
  "active-projects": "AP",
  bin: "Bin",
};

const ALL_TAB_GROUPS = new Set(["potential-clients", "not-interested-page", "clients"]);

function shortenLabel(label: string): string {
  return label
    .replace("Today / Pending", "Today")
    .replace("Important (Bold / New)", "Important")
    .replace("Interested Clients", "Interested")
    .replace("Schedule Call", "Schedule")
    .replace("Project DB", "Projects");
}

function excelSheetName(raw: string, used: Set<string>): string {
  let name = raw.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) name = "Sheet";
  name = name.slice(0, 31);
  let candidate = name;
  let i = 2;
  while (used.has(candidate)) {
    const suffix = ` ${i}`;
    candidate = `${name.slice(0, 31 - suffix.length)}${suffix}`;
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

/** Same uniqueness as CSR All / pill tables: one row per phone (7+ digits). */
function uniqueLeadsByPhone<T extends { id: string; phone?: string | null }>(leads: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const lead of leads) {
    const digits = (lead.phone ?? "").replace(/\D/g, "");
    const key = digits.length >= 7 ? digits : lead.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lead);
  }
  return out;
}

export function buildCsrExportSheetDefs(): ExportSheetDef[] {
  const used = new Set<string>();
  const sheets: ExportSheetDef[] = [];

  for (const group of CSR_RESET_GROUPS) {
    const prefix = GROUP_PREFIX[group.id] ?? group.label.slice(0, 4);
    if (ALL_TAB_GROUPS.has(group.id) && group.children.length > 1) {
      sheets.push({
        sheetName: excelSheetName(`${prefix} All`, used),
        group: group.label,
        label: "All",
        scopes: group.children.map(c => c.id),
      });
    }
    for (const child of group.children) {
      sheets.push({
        sheetName: excelSheetName(`${prefix} ${shortenLabel(child.label)}`, used),
        group: group.label,
        label: child.label,
        scopes: [child.id],
      });
    }
  }

  return sheets;
}

const HEADERS = [
  "Name",
  "Company",
  "Phone",
  "Email",
  "Website",
  "Owner",
  "State",
  "Timezone",
  "Status",
  "Important",
  "Interested",
  "Old Client",
  "Next Schedule",
  "Next Time",
  "Interested Service",
  "Search Trade",
  "Trades",
  "Trade Notes",
  "Sub Contacts",
  "Comments",
  "Follow-up Notes",
  "Notes (oldest first)",
  "NP Count",
  "NI Count",
  "Client Code",
  "Project Code",
  "Project Title",
  "Project Scope",
  "Budget",
  "Paid Amount",
  "Payments",
  "Deadline",
  "Deadline Timing",
  "Phase",
  "Work Status",
  "Project Source",
  "Our Company",
  "Source",
  "Bin Reason",
  "Bin Previous Status",
  "Hidden On Main",
  "In Bin",
  "Created At",
  "Updated At",
] as const;

function yn(v: boolean | null | undefined): string {
  return v ? "Yes" : "No";
}

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function formatPayments(raw: string | null | undefined): string {
  return parseProjectPayments(raw)
    .map(p => {
      const bits = [
        p.type,
        p.amount,
        p.isPaid ? "paid" : "unpaid",
        p.currency,
        p.paymentChannel,
        p.link,
        p.paidAt,
      ].filter(Boolean);
      return bits.join(" ");
    })
    .join(" | ");
}

function formatSubContacts(lead: ExportLead): string {
  return (lead.subContacts ?? [])
    .map(c => [c.name, c.designation, c.phone, c.email].filter(Boolean).join(" | "))
    .filter(Boolean)
    .join("; ");
}

function formatNotes(lead: ExportLead): string {
  return (lead.notes ?? [])
    .map(n => {
      const when = formatEstDateTime(n.createdAt);
      const text = (n.text ?? "").replace(/\s+/g, " ").trim();
      return text ? `${when}: ${text}` : when;
    })
    .filter(Boolean)
    .join("\n");
}

function formatSource(lead: ExportLead): string {
  const src = lead.uploadFile?.source;
  if (!src) return "";
  return src.sudoName ? `${src.name} · ${src.sudoName}` : src.name;
}

function leadToRow(lead: ExportLead): Record<(typeof HEADERS)[number], string | number> {
  return {
    Name: cell(lead.name),
    Company: cell(lead.company),
    Phone: cell(lead.phone),
    Email: cell(lead.email),
    Website: cell(lead.website),
    Owner: cell(lead.ownerName),
    State: cell(lead.state),
    Timezone: cell(lead.timezone),
    Status: cell(lead.status),
    Important: yn(lead.important),
    Interested: yn(lead.interested),
    "Old Client": yn(lead.isOldClient),
    "Next Schedule": cell(lead.nextSchedule),
    "Next Time": cell(lead.nextTime),
    "Interested Service": cell(lead.interestedService),
    "Search Trade": cell(lead.trade),
    Trades: cell(lead.subTrades),
    "Trade Notes": parseTradeNotes(lead.tradeNotes).join(" | "),
    "Sub Contacts": formatSubContacts(lead),
    Comments: cell(lead.comments),
    "Follow-up Notes": cell(lead.followUpNotes),
    "Notes (oldest first)": formatNotes(lead),
    "NP Count": lead.notPickedCount ?? 0,
    "NI Count": lead.notInterestedCount ?? 0,
    "Client Code": cell(lead.clientCode),
    "Project Code": cell(lead.projectCode),
    "Project Title": cell(lead.projectTitle),
    "Project Scope": cell(lead.projectScope),
    Budget: cell(lead.projectBudget),
    "Paid Amount": cell(lead.paidAmount),
    Payments: formatPayments(lead.projectPayments),
    Deadline: cell(lead.projectDeadline),
    "Deadline Timing": cell(lead.deadlineTiming),
    Phase: cell(lead.projectPhase),
    "Work Status": cell(lead.projectWorkStatus),
    "Project Source": cell(lead.projectSource),
    "Our Company": cell(lead.uploadFile?.companyName),
    Source: formatSource(lead),
    "Bin Reason": lead.binReason ? binReasonLabel(lead.binReason) : "",
    "Bin Previous Status": cell(lead.binPreviousStatus),
    "Hidden On Main": yn(lead.hiddenOnMain),
    "In Bin": yn(lead.inBin),
    "Created At": formatEstDateTime(lead.createdAt),
    "Updated At": formatEstDateTime(lead.updatedAt),
  };
}

function sheetFromRows(rows: ReturnType<typeof leadToRow>[]): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [
    [...HEADERS],
    ...rows.map(row => HEADERS.map(h => row[h])),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = HEADERS.map(h => ({ wch: Math.min(40, Math.max(12, h.length + 2)) }));
  return ws;
}

async function fetchScopeLeads(csrId: string, scope: CsrResetScopeId): Promise<ExportLead[]> {
  return prisma.lead.findMany({
    where: buildCsrResetScopeWhere(csrId, scope),
    select: EXPORT_SELECT,
    orderBy: { updatedAt: "desc" },
  });
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    out.push(...(await Promise.all(chunk.map(fn))));
  }
  return out;
}

export function safeExcelFilePart(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "CSR";
}

export async function buildCsrPagesExcel(csrId: string): Promise<{
  buffer: Buffer;
  filename: string;
  csrName: string;
}> {
  const csr = await prisma.user.findFirst({
    where: { id: csrId, role: "csr" },
    select: { id: true, name: true, csrCode: true },
  });
  if (!csr) {
    throw Object.assign(new Error("CSR not found"), { status: 404 });
  }

  const sheetDefs = buildCsrExportSheetDefs();
  const scopeCache = new Map<CsrResetScopeId, ExportLead[]>();
  const uniqueScopes = [...new Set(sheetDefs.flatMap(s => s.scopes))];

  const fetched = await mapPool(uniqueScopes, 6, async scope => {
    const leads = await fetchScopeLeads(csrId, scope);
    return { scope, leads };
  });
  for (const row of fetched) scopeCache.set(row.scope, row.leads);

  const wb = XLSX.utils.book_new();
  const indexRows: (string | number)[][] = [
    ["CSR", csr.name],
    ["CSR Code", csr.csrCode ?? ""],
    ["Exported At", formatEstDateTime(new Date())],
    [],
    ["Page", "Tab", "Excel Sheet", "Rows"],
  ];

  for (const def of sheetDefs) {
    const merged: ExportLead[] = [];
    for (const scope of def.scopes) {
      merged.push(...(scopeCache.get(scope) ?? []));
    }
    const unique = uniqueLeadsByPhone(merged);
    const rows = unique.map(leadToRow);
    XLSX.utils.book_append_sheet(wb, sheetFromRows(rows), def.sheetName);
    indexRows.push([def.group, def.label, def.sheetName, unique.length]);
  }

  const indexWs = XLSX.utils.aoa_to_sheet(indexRows);
  indexWs["!cols"] = [{ wch: 22 }, { wch: 28 }, { wch: 22 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, indexWs, "Index");
  /* Move Index to first position */
  const names = wb.SheetNames;
  const idx = names.indexOf("Index");
  if (idx > 0) {
    names.splice(idx, 1);
    names.unshift("Index");
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const codePart = csr.csrCode ? `${safeExcelFilePart(csr.csrCode)}-` : "";
  const filename = `${codePart}${safeExcelFilePart(csr.name)}-CSR-pages.xlsx`;
  return { buffer, filename, csrName: csr.name };
}
