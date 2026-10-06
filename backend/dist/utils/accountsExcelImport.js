"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeAccountsExcel = mergeAccountsExcel;
const XLSX = __importStar(require("xlsx"));
function parseNum(v) {
    if (typeof v === "number" && Number.isFinite(v))
        return v;
    const s = String(v ?? "").replace(/,/g, "").trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}
function readSheetRows(buffer) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet)
        return [];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}
/** Merge spreadsheet rows into page data (best-effort by page layout). */
function mergeAccountsExcel(page, existing, buffer) {
    const rows = readSheetRows(buffer).filter(r => r.some(c => String(c ?? "").trim()));
    if (rows.length === 0)
        return existing;
    const next = structuredClone(existing);
    if (page === "balance_sheet") {
        const assetSections = next.assetSections ?? [];
        const equityLiabilitySections = next.equityLiabilitySections ?? [];
        let current = assetSections[0]?.title ?? "Non-Current Assets";
        for (const row of rows) {
            const label = String(row[0] ?? "").trim();
            if (!label)
                continue;
            const lower = label.toLowerCase();
            if (lower.includes("non-current assets")) {
                current = "Non-Current Assets";
                continue;
            }
            if (lower.includes("current assets") && !lower.includes("non")) {
                current = "Current Assets";
                continue;
            }
            if (lower === "equity") {
                current = "Equity";
                continue;
            }
            if (lower.includes("non-current liabilities")) {
                current = "Non-Current Liabilities";
                continue;
            }
            if (lower.includes("current liabilities")) {
                current = "Current Liabilities";
                continue;
            }
            if (lower.startsWith("total"))
                continue;
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
                if (note && !Number.isFinite(Number(note)))
                    hit.note = note;
            }
            else {
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
        const teamSalaries = next.teamSalaries ?? [];
        const opexHeads = next.opexHeads ?? [];
        for (const row of rows) {
            const label = String(row[0] ?? "").trim();
            if (!label)
                continue;
            const amount = parseNum(row[row.length - 1]);
            if (label.toLowerCase().includes("revenue")) {
                next.totalRevenue = amount;
                continue;
            }
            const team = teamSalaries.find(t => t.team.toLowerCase() === label.toLowerCase());
            if (team) {
                team.totalSalary = amount;
                continue;
            }
            const opex = opexHeads.find(o => o.label.toLowerCase() === label.toLowerCase());
            if (opex) {
                opex.amount = amount;
                continue;
            }
            if (label.toLowerCase().includes("salary") || label.toLowerCase().includes("team")) {
                teamSalaries.push({
                    id: `t-${Date.now()}`,
                    team: label,
                    headLabels: String(row[1] ?? "").split(/[,•|]/).map(s => s.trim()).filter(Boolean),
                    totalSalary: amount,
                });
            }
            else {
                opexHeads.push({ id: `o-${Date.now()}`, label, amount });
            }
        }
        next.teamSalaries = teamSalaries;
        next.opexHeads = opexHeads;
        return next;
    }
    if (page === "total_assets") {
        const companies = next.companies ?? {
            BEM: [],
            GPS: [],
            BDS: [],
        };
        // Excel import targets BEM by default (company column can be added later)
        const sections = companies.BEM ?? (next.sections ?? []);
        for (const row of rows) {
            const title = String(row[0] ?? "").trim();
            if (!title || title.toLowerCase().startsWith("grand"))
                continue;
            const total = parseNum(row[row.length - 1]);
            const heads = String(row[1] ?? "").split(/[,•|]/).map(s => s.trim()).filter(Boolean);
            const hit = sections.find(s => s.title.toLowerCase() === title.toLowerCase());
            if (hit) {
                hit.total = total;
                if (heads.length)
                    hit.heads = heads;
            }
            else {
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
        const bankHeads = next.bankHeads ?? [];
        const months = next.months ?? [];
        let monthBlock = months[months.length - 1];
        for (const row of rows) {
            const c0 = String(row[0] ?? "").trim();
            if (!c0)
                continue;
            if (/^\d{4}-\d{2}-\d{2}$/.test(c0) || /\d{1,2}\/\d/.test(c0)) {
                const desc = String(row[1] ?? "").trim();
                const netAmount = parseNum(row[row.length - 1]);
                const bankAmounts = {};
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
            }
            else if (c0.toLowerCase().includes("paypal") || c0.toLowerCase().includes("metro")) {
                if (!bankHeads.includes(c0))
                    bankHeads.push(c0);
            }
        }
        next.bankHeads = bankHeads;
        next.months = months;
        return next;
    }
    return next;
}
