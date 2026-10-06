import * as XLSX from "xlsx";
import type { Prisma } from "@prisma/client";
import prisma from "../config/db";
import { SEED_USER_EMAILS } from "../constants/seedUsers";
import {
  closedClientStatusWhere,
  isImportantStatusWhere,
  isInterestedStatusWhere,
  uniqueClosedLeadsByClientCode,
  uniqueLeadsByClientIdentity,
} from "./adminClientQueries";
import { notInBinFilter } from "./binLeads";
import { formatEstDateTime } from "./estTime";
import { isDisplayableProjectLead } from "./projectLeads";

const SELECT = {
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
  nextSchedule: true,
  nextTime: true,
  interestedService: true,
  comments: true,
  followUpNotes: true,
  clientCode: true,
  projectCode: true,
  projectTitle: true,
  projectScope: true,
  projectBudget: true,
  paidAmount: true,
  projectDeadline: true,
  projectPhase: true,
  projectWorkStatus: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: true,
  inBin: true,
  isOldClient: true,
  csr: { select: { id: true, name: true, csrCode: true, isActive: true } },
} satisfies Prisma.LeadSelect;

type ClientLead = Prisma.LeadGetPayload<{ select: typeof SELECT }>;

const HEADERS = [
  "Category",
  "CSR",
  "CSR Code",
  "Client Name",
  "Company",
  "Phone",
  "Email",
  "Owner",
  "State",
  "Timezone",
  "Status",
  "Client Code",
  "Project Code",
  "Project Title",
  "Scope / Service",
  "Budget",
  "Paid",
  "Deadline",
  "Phase",
  "Work Status",
  "Next Schedule",
  "Next Time",
  "Comments",
  "Follow-up Notes",
  "Website",
  "Updated At",
] as const;

type Header = (typeof HEADERS)[number];
type Row = Record<Header, string | number>;

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function excelSheetName(raw: string, used: Set<string>): string {
  let name = raw.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) name = "CSR";
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

function toRow(lead: ClientLead, category: string): Row {
  const scope = cell(lead.projectScope) || cell(lead.interestedService);
  return {
    Category: category,
    CSR: cell(lead.csr?.name),
    "CSR Code": cell(lead.csr?.csrCode),
    "Client Name": cell(lead.name),
    Company: cell(lead.company),
    Phone: cell(lead.phone),
    Email: cell(lead.email),
    Owner: cell(lead.ownerName),
    State: cell(lead.state),
    Timezone: cell(lead.timezone),
    Status: cell(lead.status),
    "Client Code": cell(lead.clientCode),
    "Project Code": cell(lead.projectCode),
    "Project Title": cell(lead.projectTitle),
    "Scope / Service": scope,
    Budget: cell(lead.projectBudget),
    Paid: cell(lead.paidAmount),
    Deadline: cell(lead.projectDeadline),
    Phase: cell(lead.projectPhase),
    "Work Status": cell(lead.projectWorkStatus),
    "Next Schedule": cell(lead.nextSchedule),
    "Next Time": cell(lead.nextTime),
    Comments: cell(lead.comments),
    "Follow-up Notes": cell(lead.followUpNotes),
    Website: cell(lead.website),
    "Updated At": formatEstDateTime(lead.updatedAt),
  };
}

function colWidths(rows: Row[]): XLSX.ColInfo[] {
  return HEADERS.map(h => {
    const longest = Math.max(
      h.length,
      ...rows.slice(0, 400).map(r => String(r[h] ?? "").length),
    );
    return { wch: Math.min(42, Math.max(12, longest + 2)) };
  });
}

function sheetFromRows(rows: Row[]): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [
    [...HEADERS],
    ...rows.map(row => HEADERS.map(h => row[h])),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = colWidths(rows);
  return ws;
}

function sheetWithSections(
  sections: Array<{ title: string; rows: Row[] }>,
): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [[...HEADERS]];
  for (const section of sections) {
    if (aoa.length > 1) aoa.push([]);
    const banner = Array(HEADERS.length).fill("") as string[];
    banner[0] = `${section.title} (${section.rows.length})`;
    aoa.push(banner);
    for (const row of section.rows) aoa.push(HEADERS.map(h => row[h]));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const sample = sections.flatMap(s => s.rows);
  ws["!cols"] = colWidths(sample);
  return ws;
}

function isImportant(lead: ClientLead): boolean {
  return (lead.status ?? "").toLowerCase() === "important";
}

function isInterested(lead: ClientLead): boolean {
  return (lead.status ?? "").toLowerCase() === "interested";
}

function isClosed(lead: ClientLead): boolean {
  const s = (lead.status ?? "").toLowerCase();
  return s === "close client" || s === "completed" || s === "closed";
}

export async function buildAllCsrClientsWorkbook(): Promise<{
  buffer: Buffer;
  filename: string;
  summary: Array<{
    csr: string;
    important: number;
    interested: number;
    closeClients: number;
    activeProjects: number;
  }>;
}> {
  const csrs = await prisma.user.findMany({
    where: { role: "csr", email: { notIn: SEED_USER_EMAILS } },
    select: { id: true, name: true, csrCode: true, isActive: true },
    orderBy: { name: "asc" },
  });

  const leads = await prisma.lead.findMany({
    where: {
      AND: [
        notInBinFilter(),
        {
          OR: [
            isImportantStatusWhere(),
            isInterestedStatusWhere(),
            closedClientStatusWhere(),
          ],
        },
      ],
    },
    select: SELECT,
    orderBy: { updatedAt: "desc" },
  });

  const importantAll = uniqueLeadsByClientIdentity(leads.filter(isImportant));
  const interestedAll = uniqueLeadsByClientIdentity(leads.filter(isInterested));
  const closedAll = uniqueClosedLeadsByClientCode(leads.filter(isClosed));
  const projectsAll = leads.filter(isDisplayableProjectLead);

  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const summary: Array<{
    csr: string;
    important: number;
    interested: number;
    closeClients: number;
    activeProjects: number;
  }> = [];

  const byCsr = new Map<string, ClientLead[]>();
  for (const lead of leads) {
    const id = lead.assignedTo;
    const list = byCsr.get(id);
    if (list) list.push(lead);
    else byCsr.set(id, [lead]);
  }

  for (const csr of csrs) {
    const mine = byCsr.get(csr.id) ?? [];
    const important = uniqueLeadsByClientIdentity(mine.filter(isImportant));
    const interested = uniqueLeadsByClientIdentity(mine.filter(isInterested));
    const closed = uniqueClosedLeadsByClientCode(mine.filter(isClosed));
    const projects = mine.filter(isDisplayableProjectLead);
    summary.push({
      csr: csr.name,
      important: important.length,
      interested: interested.length,
      closeClients: closed.length,
      activeProjects: projects.length,
    });
  }

  const exportedAt = formatEstDateTime(new Date());
  const indexRows: (string | number)[][] = [
    ["CRM CSR clients export"],
    ["Exported at (ET)", exportedAt],
    ["Not in bin — Important, Interested, Close Client, Active Projects"],
    [],
    ["CSR", "CSR Code", "Active", "Important", "Interested", "Close Clients", "Active Projects"],
  ];
  for (const csr of csrs) {
    const row = summary.find(s => s.csr === csr.name);
    indexRows.push([
      csr.name,
      csr.csrCode ?? "",
      csr.isActive ? "Yes" : "No",
      row?.important ?? 0,
      row?.interested ?? 0,
      row?.closeClients ?? 0,
      row?.activeProjects ?? 0,
    ]);
  }
  indexRows.push([]);
  indexRows.push([
    "TOTAL",
    "",
    "",
    importantAll.length,
    interestedAll.length,
    closedAll.length,
    projectsAll.length,
  ]);

  const indexWs = XLSX.utils.aoa_to_sheet(indexRows);
  indexWs["!cols"] = [
    { wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, indexWs, excelSheetName("Summary", usedNames));

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(importantAll.map(l => toRow(l, "Important"))),
    excelSheetName("All Important", usedNames),
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(interestedAll.map(l => toRow(l, "Interested"))),
    excelSheetName("All Interested", usedNames),
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(closedAll.map(l => toRow(l, "Close Client"))),
    excelSheetName("All Close Clients", usedNames),
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(projectsAll.map(l => toRow(l, "Active Project"))),
    excelSheetName("All Active Projects", usedNames),
  );

  for (const csr of csrs) {
    const mine = byCsr.get(csr.id) ?? [];
    const important = uniqueLeadsByClientIdentity(mine.filter(isImportant));
    const interested = uniqueLeadsByClientIdentity(mine.filter(isInterested));
    const closed = uniqueClosedLeadsByClientCode(mine.filter(isClosed));
    const projects = mine.filter(isDisplayableProjectLead);
    const tabName = excelSheetName(csr.name, usedNames);
    XLSX.utils.book_append_sheet(
      wb,
      sheetWithSections([
        { title: "IMPORTANT", rows: important.map(l => toRow(l, "Important")) },
        { title: "INTERESTED", rows: interested.map(l => toRow(l, "Interested")) },
        { title: "CLOSE CLIENTS", rows: closed.map(l => toRow(l, "Close Client")) },
        { title: "ACTIVE PROJECTS", rows: projects.map(l => toRow(l, "Active Project")) },
      ]),
      tabName,
    );
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return {
    buffer,
    filename: `CRM-CSR-Clients.xlsx`,
    summary,
  };
}
