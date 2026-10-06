import * as XLSX from "xlsx";
import type { AccountsPageKey } from "./accountsDefaults";

function parseNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function readSheetRows(buffer: Buffer): string[][] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
}

/** Merge spreadsheet rows into page data (best-effort by page layout). */
export function mergeAccountsExcel(
  page: AccountsPageKey,
  existing: Record<string, unknown>,
  buffer: Buffer,
): Record<string, unknown> {
  const rows = readSheetRows(buffer).filter(r => r.some(c => String(c ?? "").trim()));
  if (rows.length === 0) return existing;

  const next = structuredClone(existing) as Record<string, unknown>;

  if (page === "balance_sheet") {
    const assetSections = (next.assetSections as Array<{ id: string; title: string; items: Array<{ id: string; label: string; note?: string; amount: number }> }>) ?? [];
    const equityLiabilitySections = (next.equityLiabilitySections as typeof assetSections) ?? [];
    let current = assetSections[0]?.title ?? "Non-Current Assets";

    for (const row of rows) {
      const label = String(row[0] ?? "").trim();
      if (!label) continue;
      const lower = label.toLowerCase();
      if (lower.includes("non-current assets")) { current = "Non-Current Assets"; continue; }
      if (lower.includes("current assets") && !lower.includes("non")) { current = "Current Assets"; continue; }
      if (lower === "equity") { current = "Equity"; continue; }
      if (lower.includes("non-current liabilities")) { current = "Non-Current Liabilities"; continue; }
      if (lower.includes("current liabilities")) { current = "Current Liabilities"; continue; }
      if (lower.startsWith("total")) continue;

      const note = String(row[1] ?? "").trim();
      const amount = parseNum(row[2] ?? row[1]);
      const pool = ["Equity", "Non-Current Liabilities", "Current Liabilities"].includes(current)
        ? equityLiabilitySections
        : assetSections;
      let section = pool.find(s => s.title === current);
      if (!section) {
        section = { id: `sec-${Date.now()}`, title: current, items: [] };
        pool.push(section);
      }
      const hit = section.items.find(i => i.label.toLowerCase() === label.toLowerCase());
      if (hit) {
        hit.amount = amount;
        if (note && !Number.isFinite(Number(note))) hit.note = note;
      } else {
        section.items.push({
          id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          label,
          note: note && !Number.isFinite(Number(note)) ? note : undefined,
          amount,
        });
      }
    }
    next.assetSections = assetSections;
    next.equityLiabilitySections = equityLiabilitySections;
    return next;
  }

  if (page === "income_statement") {
    const teamSalaries = (next.teamSalaries as Array<{ id: string; team: string; headLabels: string[]; totalSalary: number }>) ?? [];
    const opexHeads = (next.opexHeads as Array<{ id: string; label: string; amount: number }>) ?? [];

    for (const row of rows) {
      const label = String(row[0] ?? "").trim();
      if (!label) continue;
      const amount = parseNum(row[row.length - 1]);
      if (label.toLowerCase().includes("revenue")) {
        next.totalRevenue = amount;
        continue;
      }
      const team = teamSalaries.find(t => t.team.toLowerCase() === label.toLowerCase());
      if (team) { team.totalSalary = amount; continue; }
      const opex = opexHeads.find(o => o.label.toLowerCase() === label.toLowerCase());
      if (opex) { opex.amount = amount; continue; }
      if (label.toLowerCase().includes("salary") || label.toLowerCase().includes("team")) {
        teamSalaries.push({
          id: `t-${Date.now()}`,
          team: label,
          headLabels: String(row[1] ?? "").split(/[,•|]/).map(s => s.trim()).filter(Boolean),
          totalSalary: amount,
        });
      } else {
        opexHeads.push({ id: `o-${Date.now()}`, label, amount });
      }
    }
    next.teamSalaries = teamSalaries;
    next.opexHeads = opexHeads;
    return next;
  }

  if (page === "total_assets") {
    type Sec = { id: string; title: string; heads: string[]; total: number; subHeads?: Array<{ id: string; label: string; amount: number; filledAt: string }> };
    const companies = (next.companies as Record<string, Sec[]> | undefined) ?? {
      BEM: [],
      GPS: [],
      BDS: [],
    };
    // Excel import targets BEM by default (company column can be added later)
    const sections = companies.BEM ?? ((next.sections as Sec[]) ?? []);
    for (const row of rows) {
      const title = String(row[0] ?? "").trim();
      if (!title || title.toLowerCase().startsWith("grand")) continue;
      const total = parseNum(row[row.length - 1]);
      const heads = String(row[1] ?? "").split(/[,•|]/).map(s => s.trim()).filter(Boolean);
      const hit = sections.find(s => s.title.toLowerCase() === title.toLowerCase());
      if (hit) {
        hit.total = total;
        if (heads.length) hit.heads = heads;
      } else {
        sections.push({
          id: `s-${Date.now()}`,
          title,
          heads: heads.length ? heads : ["SR#", "Description", "Qty", "Total Price"],
          total,
        });
      }
    }
    companies.BEM = sections;
    next.companies = companies;
    next.sections = [];
    return next;
  }

  if (page === "cash_flow") {
    const bankHeads = (next.bankHeads as string[]) ?? [];
    const months = (next.months as Array<{
      id: string; month: string; rows: Array<{
        id: string; date: string; description: string;
        bankAmounts: Record<string, { debit: number; credit: number }>;
        netAmount: number;
      }>;
    }>) ?? [];

    let monthBlock = months[months.length - 1];
    for (const row of rows) {
      const c0 = String(row[0] ?? "").trim();
      if (!c0) continue;
      if (/^\d{4}-\d{2}-\d{2}$/.test(c0) || /\d{1,2}\/\d/.test(c0)) {
        const desc = String(row[1] ?? "").trim();
        const netAmount = parseNum(row[row.length - 1]);
        const bankAmounts: Record<string, { debit: number; credit: number }> = {};
        bankHeads.forEach((bank, idx) => {
          const base = 2 + idx * 2;
          bankAmounts[bank] = {
            debit: parseNum(row[base]),
            credit: parseNum(row[base + 1]),
          };
        });
        if (!monthBlock) {
          monthBlock = { id: `m-${Date.now()}`, month: "Imported", rows: [] };
          months.push(monthBlock);
        }
        monthBlock.rows.push({
          id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: c0,
          description: desc,
          bankAmounts,
          netAmount,
        });
      } else if (c0.toLowerCase().includes("paypal") || c0.toLowerCase().includes("metro")) {
        if (!bankHeads.includes(c0)) bankHeads.push(c0);
      }
    }
    next.bankHeads = bankHeads;
    next.months = months;
    return next;
  }

  return next;
}
