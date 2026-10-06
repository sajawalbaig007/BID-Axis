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
exports.PROJECT_DB_EXCEL_HEADERS = exports.PROJECT_DB_TEMPLATE_HEADERS = exports.PROJECT_DB_TEMPLATE_COLUMNS = exports.PROJECT_DB_EXCEL_PAYMENT_SLOTS = void 0;
exports.buildProjectDbTemplateBuffer = buildProjectDbTemplateBuffer;
exports.parseProjectDbExcel = parseProjectDbExcel;
exports.excelRowToProjectBody = excelRowToProjectBody;
const XLSX = __importStar(require("xlsx"));
/** Max payment columns in the Project DB Excel template. */
exports.PROJECT_DB_EXCEL_PAYMENT_SLOTS = 5;
const SERVICES = [
    "Estimating",
    "Scheduling",
    "Shop Drawing",
    "Drafting",
    "BIM",
    "IT",
];
const PHASES = [
    "not_started",
    "takeoff_started",
    "takeoff_completed",
    "pricing_phase",
    "qa_phase",
    "delivery_phase",
];
const WORK_STATUSES = ["in_progress", "not_completed", "completed"];
const TIMINGS = ["morning", "cob"];
const PAYMENT_TYPES = ["Partial", "Full"];
const CHANNELS = ["AH", "SN", "CHQ", "HM"];
const CURRENCIES = ["USD", "CAD", "PKR"];
/**
 * Downloaded template columns — same fields as Admin Add New Project
 * (client, project, quotation, bid instruction, payment entries).
 * Extra technical columns are omitted from the file; the parser still
 * accepts them if someone uploads an older camelCase sheet.
 */
exports.PROJECT_DB_TEMPLATE_COLUMNS = [
    { header: "Client Name", key: "name" },
    { header: "Company Name", key: "company" },
    { header: "Owner Name", key: "ownerName" },
    { header: "Phone", key: "phone" },
    { header: "Email", key: "email" },
    { header: "State", key: "state" },
    { header: "CSR Code", key: "csrCode" },
    { header: "Resource Name", key: "projectSource" },
    { header: "Project Code", key: "projectCode" },
    { header: "Project Title", key: "projectTitle" },
    { header: "Service", key: "interestedService" },
    { header: "Project Deadline", key: "projectDeadline" },
    { header: "Emergency Submit", key: "deadlineTiming" },
    { header: "Scope", key: "projectScope" },
    { header: "Quotation / Budget", key: "projectBudget" },
    { header: "Bid Instruction", key: "projectNotes" },
    { header: "Date Added", key: "createdAt" },
    ...Array.from({ length: exports.PROJECT_DB_EXCEL_PAYMENT_SLOTS }, (_, i) => {
        const n = i + 1;
        return [
            { header: `Payment ${n} Type`, key: `payment${n}Type` },
            { header: `Payment ${n} Amount`, key: `payment${n}Amount` },
            { header: `Payment ${n} Status`, key: `payment${n}IsPaid` },
            { header: `Payment ${n} Date`, key: `payment${n}PaidAt` },
            { header: `Payment ${n} Channel`, key: `payment${n}Channel` },
            { header: `Payment ${n} Currency`, key: `payment${n}Currency` },
            { header: `Payment ${n} Accounts Month`, key: `payment${n}AccountsMonth` },
            { header: `Payment ${n} Link`, key: `payment${n}Link` },
        ];
    }).flat(),
];
exports.PROJECT_DB_TEMPLATE_HEADERS = exports.PROJECT_DB_TEMPLATE_COLUMNS.map((c) => c.header);
/** Canonical keys used when parsing a row (template labels + legacy camelCase). */
exports.PROJECT_DB_EXCEL_HEADERS = [
    "name",
    "company",
    "phone",
    "email",
    "ownerName",
    "state",
    "timezone",
    "projectCode",
    "clientCode",
    "projectTitle",
    "projectScope",
    "interestedService",
    "projectBudget",
    "projectDeadline",
    "deadlineTiming",
    "projectPhase",
    "takeoffDeadline",
    "pricingDeadline",
    "qaDeadline",
    "projectNotes",
    "projectWorkStatus",
    "status",
    "csrCode",
    "projectSource",
    "createdAt",
    ...Array.from({ length: exports.PROJECT_DB_EXCEL_PAYMENT_SLOTS }, (_, i) => {
        const n = i + 1;
        return [
            `payment${n}Type`,
            `payment${n}Amount`,
            `payment${n}IsPaid`,
            `payment${n}PaidAt`,
            `payment${n}Channel`,
            `payment${n}Currency`,
            `payment${n}AccountsMonth`,
            `payment${n}Link`,
            `payment${n}CreatedAt`,
        ];
    }).flat(),
];
function cellStr(v) {
    if (v == null)
        return "";
    if (typeof v === "number" && Number.isFinite(v)) {
        // Excel serial date → ISO date when it looks like a date serial
        if (v > 20000 && v < 80000) {
            const parsed = XLSX.SSF.parse_date_code(v);
            if (parsed) {
                const y = parsed.y;
                const m = String(parsed.m).padStart(2, "0");
                const d = String(parsed.d).padStart(2, "0");
                return `${y}-${m}-${d}`;
            }
        }
        return String(v);
    }
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
        return v.toISOString().slice(0, 10);
    }
    return String(v).trim();
}
function normalizeHeader(raw) {
    return String(raw ?? "")
        .trim()
        .replace(/^\uFEFF/, "")
        .replace(/\s+/g, "")
        .replace(/[_-]/g, "")
        .toLowerCase();
}
/** Map flexible header labels → canonical key. */
const HEADER_ALIASES = (() => {
    const map = {};
    for (const h of exports.PROJECT_DB_EXCEL_HEADERS) {
        map[normalizeHeader(h)] = h;
    }
    for (const { header, key } of exports.PROJECT_DB_TEMPLATE_COLUMNS) {
        map[normalizeHeader(header)] = key;
    }
    const extras = [
        ["clientname", "name"],
        ["client", "name"],
        ["fullname", "name"],
        ["companyname", "company"],
        ["owner", "ownerName"],
        ["title", "projectTitle"],
        ["code", "projectCode"],
        ["service", "interestedService"],
        ["division", "interestedService"],
        ["budget", "projectBudget"],
        ["quoted", "projectBudget"],
        ["quotation", "projectBudget"],
        ["quotationbudget", "projectBudget"],
        ["deadline", "projectDeadline"],
        ["clientdeadline", "projectDeadline"],
        ["deadlinetiming", "deadlineTiming"],
        ["emergencysubmit", "deadlineTiming"],
        ["phase", "projectPhase"],
        ["notes", "projectNotes"],
        ["bidinstruction", "projectNotes"],
        ["bidnotes", "projectNotes"],
        ["workstatus", "projectWorkStatus"],
        ["csr", "csrCode"],
        ["cscode", "csrCode"],
        ["assignedcsr", "csrCode"],
        ["source", "projectSource"],
        ["external", "projectSource"],
        ["othersource", "projectSource"],
        ["resourcename", "projectSource"],
        ["recorddate", "createdAt"],
        ["projectdate", "createdAt"],
        ["dateadded", "createdAt"],
        ["scope", "projectScope"],
    ];
    for (const [alias, key] of extras) {
        if (!map[alias])
            map[alias] = key;
    }
    for (let n = 1; n <= exports.PROJECT_DB_EXCEL_PAYMENT_SLOTS; n++) {
        const paid = `payment${n}IsPaid`;
        const paidAt = `payment${n}PaidAt`;
        map[`payment${n}paid`] = paid;
        map[`payment${n}status`] = paid;
        map[`payment${n}date`] = paidAt;
        map[`payment${n}paymentdate`] = paidAt;
        map[`payment${n}link`] = `payment${n}Link`;
    }
    return map;
})();
function parseBool(raw) {
    const v = raw.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "y" || v === "paid";
}
function pad2(n) {
    return String(n).padStart(2, "0");
}
function expandYear(y) {
    if (y >= 100)
        return y;
    return y > 50 ? 1900 + y : 2000 + y;
}
/** Store as YYYY-MM-DD. Day/month/year when the value is D/M/Y (slash, dash, or dot). */
function toIsoDate(year, month, day) {
    const y = expandYear(year);
    if (month < 1 || month > 12 || day < 1 || day > 31)
        return "";
    return `${y}-${pad2(month)}-${pad2(day)}`;
}
function normalizeDeadline(raw) {
    const s = cellStr(raw);
    if (!s)
        return "";
    // Year first: 2024-06-15, 2024/06/15, 2024.06.15
    const ymd = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:$|T|\s)/);
    if (ymd) {
        return toIsoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3])) || s.slice(0, 10);
    }
    // Day/month/year: 15/06/2024, 15-06-2024, 15.06.24 — never US month/day
    const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (dmy) {
        return toIsoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1])) || s;
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    return s;
}
function paymentsFromCells(get) {
    const out = [];
    for (let i = 1; i <= exports.PROJECT_DB_EXCEL_PAYMENT_SLOTS; i++) {
        const type = get(`payment${i}Type`);
        const amount = get(`payment${i}Amount`);
        if (!type && !amount)
            continue;
        const paidAt = normalizeDeadline(get(`payment${i}PaidAt`));
        const createdAt = normalizeDeadline(get(`payment${i}CreatedAt`)) || paidAt || undefined;
        const entry = {
            id: `pay_import_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            type: type || "Partial",
            amount: amount || "0",
            isPaid: parseBool(get(`payment${i}IsPaid`)) || !!paidAt,
        };
        if (paidAt)
            entry.paidAt = paidAt;
        if (createdAt)
            entry.createdAt = createdAt;
        const channel = get(`payment${i}Channel`).toUpperCase();
        if (CHANNELS.includes(channel)) {
            entry.paymentChannel = channel;
        }
        const currency = get(`payment${i}Currency`).toUpperCase();
        if (CURRENCIES.includes(currency)) {
            entry.currency = currency;
        }
        const month = get(`payment${i}AccountsMonth`).trim();
        if (/^\d{4}-\d{2}$/.test(month))
            entry.accountsMonth = month;
        else if (/^\d{4}-\d{2}-\d{2}/.test(month))
            entry.accountsMonth = month.slice(0, 7);
        const link = get(`payment${i}Link`).trim();
        if (link)
            entry.link = link;
        out.push(entry);
    }
    return out;
}
function exampleRowByKey() {
    return {
        name: "John Smith",
        company: "ABC Construction",
        ownerName: "Jane Owner",
        phone: "+1 555 0100",
        email: "john@abc.com",
        state: "TX",
        csrCode: "CSR001",
        projectSource: "",
        projectCode: "CSR001-01",
        projectTitle: "Warehouse Takeoff",
        interestedService: "Estimating",
        projectDeadline: "15-06-2024",
        deadlineTiming: "cob",
        projectScope: "Full takeoff + pricing",
        projectBudget: "2500",
        projectNotes: "Bid notes / instructions",
        createdAt: "01-04-2024",
        payment1Type: "Partial",
        payment1Amount: "1000",
        payment1IsPaid: "Paid",
        payment1PaidAt: "10-04-2024",
        payment1Channel: "AH",
        payment1Currency: "USD",
        payment1AccountsMonth: "2024-04",
        payment1Link: "",
        payment2Type: "Full",
        payment2Amount: "1500",
        payment2IsPaid: "Paid",
        payment2PaidAt: "01-06-2024",
        payment2Channel: "SN",
        payment2Currency: "USD",
        payment2AccountsMonth: "2024-06",
    };
}
/** Build .xlsx buffer: Projects sheet first (headers across columns), then Instructions. */
function buildProjectDbTemplateBuffer() {
    const wb = XLSX.utils.book_new();
    const headers = exports.PROJECT_DB_TEMPLATE_HEADERS.map((h) => String(h));
    const example = exampleRowByKey();
    const exampleValues = exports.PROJECT_DB_TEMPLATE_COLUMNS.map((c) => String(example[c.key] ?? ""));
    const blankRow = headers.map(() => "");
    // Row1 = heads (separate columns), Row2 = blank for your data, Row3 = sample
    const projectsAoa = [headers, blankRow, exampleValues];
    const wsProjects = XLSX.utils.aoa_to_sheet(projectsAoa);
    // Explicit range so Excel never collapses to a single column
    wsProjects["!ref"] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: projectsAoa.length - 1, c: headers.length - 1 },
    });
    wsProjects["!cols"] = headers.map((h) => ({
        wch: Math.min(28, Math.max(16, h.length + 2)),
    }));
    // Freeze header row
    wsProjects["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, wsProjects, "Projects");
    const instructions = [
        ["BEM CRM — Project DB Excel Template"],
        [""],
        ["HOW TO USE"],
        ["1. Open the Projects sheet (first tab)."],
        ["2. Row 1 = column heads — do not delete, rename, or merge cells."],
        ["3. Fill data starting at Row 2 (one project per row). Same fields as Add New Project."],
        ["4. Row 3 is an example — delete it before upload if not needed."],
        [""],
        ["REQUIRED", "Client Name", "Project Title", "Service", "Project Deadline"],
        [
            "Also fill when adding a new project",
            "Company Name",
            "Phone",
            "Email",
            "State",
            "Project Code",
            "Scope",
            "Quotation / Budget",
            "Bid Instruction",
        ],
        [""],
        ["Service", ...SERVICES],
        ["Emergency Submit", "(empty)", "morning", "cob"],
        ["Payment N Type", ...PAYMENT_TYPES],
        ["Payment N Status", "Paid", "Unpaid", "yes", "no"],
        ["Payment N Channel", ...CHANNELS],
        ["Payment N Currency", ...CURRENCIES],
        [""],
        ["CSR Code", "Active CSR code e.g. CSR001 — leave empty if unassigned"],
        ["Resource Name", "External resource name when there is no CSR"],
        ["Date Added", "Optional day/month/year (used for month filters)"],
        ["Dates", "Day/month/year — 15-06-2024 or 15/06/2024 both become 15-06-2024 on the dashboard"],
        ["Payments", "Up to 5 entries: Type, Amount, Status, Date, Channel, Currency, Accounts Month, Link"],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
    wsInfo["!cols"] = [
        { wch: 22 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsInfo, "Instructions");
    const out = XLSX.write(wb, {
        type: "buffer",
        bookType: "xlsx",
        bookSST: false,
        compression: true,
    });
    return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
function parseProjectDbExcel(buffer) {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "projects") ??
        wb.SheetNames.find((n) => n.toLowerCase() !== "instructions") ??
        wb.SheetNames[0];
    if (!sheetName) {
        return { rows: [], errors: [{ row: 0, message: "Workbook has no sheets." }] };
    }
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: true,
    });
    if (!matrix.length) {
        return { rows: [], errors: [{ row: 0, message: "Projects sheet is empty." }] };
    }
    const headerCells = (matrix[0] ?? []).map((c) => cellStr(c));
    const colIndex = new Map();
    headerCells.forEach((label, idx) => {
        const key = HEADER_ALIASES[normalizeHeader(label)];
        if (key && !colIndex.has(key))
            colIndex.set(key, idx);
    });
    const required = [
        { key: "name", label: "Client Name" },
        { key: "projectTitle", label: "Project Title" },
        { key: "interestedService", label: "Service" },
        { key: "projectDeadline", label: "Project Deadline" },
    ];
    for (const r of required) {
        if (!colIndex.has(r.key)) {
            return {
                rows: [],
                errors: [{ row: 1, message: `Missing required column: ${r.label}` }],
            };
        }
    }
    const rows = [];
    const errors = [];
    for (let r = 1; r < matrix.length; r++) {
        const line = matrix[r] ?? [];
        const excelRow = r + 1;
        const get = (key) => {
            const idx = colIndex.get(key);
            if (idx == null)
                return "";
            return cellStr(line[idx]);
        };
        const name = get("name");
        const projectTitle = get("projectTitle");
        const interestedService = get("interestedService");
        const projectDeadline = normalizeDeadline(get("projectDeadline"));
        // Skip fully blank rows
        if (!name && !projectTitle && !interestedService && !projectDeadline)
            continue;
        if (!name || !projectTitle || !interestedService || !projectDeadline) {
            errors.push({
                row: excelRow,
                message: "Client Name, Project Title, Service, and Project Deadline are required.",
            });
            continue;
        }
        if (!SERVICES.includes(interestedService)) {
            // Allow free-text services that already exist in DB historically
            if (!interestedService.trim()) {
                errors.push({ row: excelRow, message: "interestedService is required." });
                continue;
            }
        }
        let projectPhase = get("projectPhase").trim() || "not_started";
        if (!PHASES.includes(projectPhase)) {
            const lower = projectPhase.toLowerCase().replace(/\s+/g, "_");
            projectPhase = PHASES.includes(lower) ? lower : "not_started";
        }
        let deadlineTiming = get("deadlineTiming").trim().toLowerCase();
        if (deadlineTiming && !TIMINGS.includes(deadlineTiming)) {
            deadlineTiming = "";
        }
        let projectWorkStatus = get("projectWorkStatus").trim().toLowerCase();
        if (projectWorkStatus &&
            !WORK_STATUSES.includes(projectWorkStatus)) {
            projectWorkStatus = "";
        }
        const payments = paymentsFromCells(get);
        const createdAtRaw = normalizeDeadline(get("createdAt"));
        rows.push({
            name,
            company: get("company") || undefined,
            phone: get("phone") || undefined,
            email: get("email") || undefined,
            ownerName: get("ownerName") || undefined,
            state: get("state") || undefined,
            timezone: get("timezone") || undefined,
            projectCode: get("projectCode") || undefined,
            clientCode: get("clientCode") || undefined,
            projectTitle,
            projectScope: get("projectScope") || undefined,
            interestedService,
            projectBudget: get("projectBudget") || undefined,
            projectDeadline,
            deadlineTiming: deadlineTiming || undefined,
            projectPhase,
            takeoffDeadline: normalizeDeadline(get("takeoffDeadline")) || undefined,
            pricingDeadline: normalizeDeadline(get("pricingDeadline")) || undefined,
            qaDeadline: normalizeDeadline(get("qaDeadline")) || undefined,
            projectNotes: get("projectNotes") || undefined,
            projectWorkStatus: projectWorkStatus || undefined,
            status: get("status") || "Close Client",
            csrCode: get("csrCode") || undefined,
            projectSource: get("projectSource") || undefined,
            createdAt: createdAtRaw || undefined,
            projectPayments: payments.length ? payments : undefined,
        });
    }
    return { rows, errors };
}
/** Convert a parsed row into POST /project body fields. */
function excelRowToProjectBody(row) {
    const body = {
        name: row.name,
        projectTitle: row.projectTitle,
        interestedService: row.interestedService,
        projectDeadline: row.projectDeadline,
        status: row.status || "Close Client",
    };
    const optional = [
        "company",
        "phone",
        "email",
        "ownerName",
        "state",
        "timezone",
        "projectCode",
        "clientCode",
        "projectScope",
        "projectBudget",
        "deadlineTiming",
        "projectPhase",
        "takeoffDeadline",
        "pricingDeadline",
        "qaDeadline",
        "projectNotes",
        "projectWorkStatus",
        "projectSource",
    ];
    for (const k of optional) {
        const v = row[k];
        if (v != null && String(v).trim() !== "")
            body[k] = v;
    }
    if (row.projectPayments?.length) {
        body.projectPayments = row.projectPayments;
    }
    return body;
}
