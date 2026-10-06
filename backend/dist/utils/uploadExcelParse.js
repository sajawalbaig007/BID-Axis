"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readExcelRows = readExcelRows;
exports.parseLeadRows = parseLeadRows;
exports.classifyRows = classifyRows;
const xlsx_1 = __importDefault(require("xlsx"));
const db_1 = __importDefault(require("../config/db"));
const leadPhoneLookup_1 = require("./leadPhoneLookup");
const leadClientPromotion_1 = require("./leadClientPromotion");
const CHUNK_LOOKUP = 500;
/** Cap in-memory preview while classifying — large sheets still process all rows. */
const CLASSIFY_PREVIEW_CAP = 500;
function normalizeHeaderKey(key) {
    return key.trim().toLowerCase().replace(/[\s_]+/g, " ");
}
function resolveColumnKey(keys, possibleKeys, excludeKeys = []) {
    const entries = keys.map(raw => ({ raw, norm: normalizeHeaderKey(raw) }));
    for (const p of possibleKeys) {
        const pn = normalizeHeaderKey(p);
        const exact = entries.find(e => e.norm === pn);
        if (exact)
            return exact.raw;
    }
    return keys.find(k => {
        const kl = normalizeHeaderKey(k);
        if (excludeKeys.some(ex => kl.includes(normalizeHeaderKey(ex))))
            return false;
        return possibleKeys.some(p => kl.includes(normalizeHeaderKey(p)));
    });
}
/** Prefer explicit Interested Service / Interested In headers over generic "service" or "interested". */
function resolveServiceColumnKey(keys) {
    const priority = [
        "interested service",
        "interested in",
        "service interested",
        "interested service type",
        "service type",
        "services",
        "service",
        "scope",
        "interest",
        "interested",
    ];
    const resolved = resolveColumnKey(keys, priority, ["status"]);
    if (resolved)
        return resolved;
    return resolveColumnKey(keys, priority, []);
}
function readInterestedService(row, serviceKey, headerKeys) {
    const keys = [
        serviceKey,
        resolveColumnKey(headerKeys, ["interested service", "interested in"], ["status"]),
        resolveColumnKey(headerKeys, ["service type", "services", "service"], ["status", "client", "company", "project"]),
    ].filter((k, i, arr) => !!k && arr.indexOf(k) === i);
    for (const key of keys) {
        const value = readCell(row, key);
        if (value)
            return value;
    }
    return "";
}
function readCell(row, key) {
    if (!key)
        return "";
    const raw = row[key];
    if (raw === undefined || raw === null)
        return "";
    const s = String(raw).trim();
    if (!s || s.toLowerCase() === "n/a" || s.toLowerCase() === "na" || s === "-")
        return "";
    return s;
}
async function chunkedLookup(items, size, query) {
    if (items.length === 0)
        return [];
    const out = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(...await query(items.slice(i, i + size)));
    }
    return out;
}
function readExcelRows(buffer) {
    const workbook = xlsx_1.default.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx_1.default.utils.sheet_to_json(sheet);
    return fillMergedCells(sheet, rows);
}
/** Excel merged cells only store a value on the first row — copy down for uploads. */
function fillMergedCells(sheet, rows) {
    const merges = sheet["!merges"];
    if (!merges?.length || rows.length === 0)
        return rows;
    const ref = sheet["!ref"];
    if (!ref)
        return rows;
    const range = xlsx_1.default.utils.decode_range(ref);
    const headerRow = range.s.r;
    const headerByCol = new Map();
    for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = xlsx_1.default.utils.encode_cell({ r: headerRow, c });
        const cell = sheet[addr];
        if (cell?.v != null) {
            const h = String(cell.v).trim();
            if (h)
                headerByCol.set(c, h);
        }
    }
    const out = rows.map(r => ({ ...r }));
    for (const merge of merges) {
        const { s, e } = merge;
        if (s.r < headerRow)
            continue;
        for (let c = s.c; c <= e.c; c++) {
            const headerKey = headerByCol.get(c);
            if (!headerKey)
                continue;
            const sourceAddr = xlsx_1.default.utils.encode_cell({ r: s.r, c });
            const sourceCell = sheet[sourceAddr];
            const sourceVal = sourceCell?.v;
            if (sourceVal === undefined || sourceVal === null)
                continue;
            const strVal = String(sourceVal).trim();
            if (!strVal || strVal.toLowerCase() === "n/a" || strVal === "-")
                continue;
            for (let r = s.r; r <= e.r; r++) {
                if (r <= headerRow)
                    continue;
                const idx = r - headerRow - 1;
                if (idx < 0 || idx >= out.length)
                    continue;
                const row = out[idx];
                const cur = row[headerKey];
                if (cur === undefined || cur === null || String(cur).trim() === "") {
                    row[headerKey] = sourceVal;
                }
            }
        }
    }
    return out;
}
function parseLeadRows(data, csrs, initialStatuses, leadType) {
    const isActiveUpload = leadType === "active";
    const headerKeys = data.length > 0 ? Object.keys(data[0]) : [];
    const col = {
        clientDetail: resolveColumnKey(headerKeys, [
            "client name", "contact name", "customer name", "person name",
            "name", "client", "customer", "contact person",
        ], ["code", "company"]),
        clientCompany: resolveColumnKey(headerKeys, [
            "client company", "customer company", "company name", "business name",
            "company", "business", "organization",
        ], ["our", "code", "client name"]),
        ourCompany: resolveColumnKey(headerKeys, [
            "our company", "source company", "sudo", "ps estimating", "our co",
        ], []),
        phone: resolveColumnKey(headerKeys, ["phone", "mobile", "cell", "telephone", "number", "contact"], ["person", "name", "detail"]),
        state: resolveColumnKey(headerKeys, ["location", "address", "state", "province", "city", "prov", "region"]),
        service: resolveServiceColumnKey(headerKeys),
        projectTitle: resolveColumnKey(headerKeys, ["project detail", "project title", "project name", "project"], ["code", "client"]),
        projectBudget: resolveColumnKey(headerKeys, ["quotation", "quote", "budget"]),
        email: resolveColumnKey(headerKeys, ["email", "mail", "e-mail"]),
        clientCode: resolveColumnKey(headerKeys, ["client code", "clientcode", "project code", "client_code"]),
        comments: resolveColumnKey(headerKeys, [
            "notes", "note", "comments", "comment", "remarks", "remark",
            "conversation", "discussion", "talk", "history", "follow up", "followup",
        ], ["project"]),
        // Sheet columns: "Search Trade" = main trade, "Trades" = sub-trade / trade type
        trade: resolveColumnKey(headerKeys, ["search trade", "searchtrade", "main trade", "maintrade", "trade", "csi", "division"], ["sub", "trades"]),
        subTrades: resolveColumnKey(headerKeys, ["sub trades", "subtrades", "sub trade", "subtrade", "trades", "trade type", "trade types"], ["search"]),
        subContacts: resolveColumnKey(headerKeys, [
            "sub contacts", "subcontacts", "sub contact", "subcontact",
            "additional contacts", "other contacts",
        ]),
    };
    const parsed = [];
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const csr = csrs[i % csrs.length];
        const rawClientDetail = readCell(row, col.clientDetail);
        const detailLines = rawClientDetail.split(/[\n\r]/).map(l => l.trim()).filter(Boolean);
        const name = detailLines[0] || "";
        let phone = readCell(row, col.phone);
        if (!phone && isActiveUpload) {
            const phoneLine = detailLines.find(l => /^[\+\d][\d\s\-\(\)\.]{5,}$/.test(l));
            if (phoneLine)
                phone = phoneLine.replace(/[^\d\+\-]/g, "");
        }
        let company = readCell(row, col.clientCompany);
        if (!company && !col.clientCompany)
            company = readCell(row, resolveColumnKey(headerKeys, ["company"], ["our"]));
        if (!company && isActiveUpload)
            company = name;
        parsed.push({
            rowIndex: i + 1,
            name,
            company,
            phone,
            email: readCell(row, col.email),
            state: readCell(row, col.state),
            interestedService: readInterestedService(row, col.service, headerKeys),
            clientCode: readCell(row, col.clientCode) || null,
            /* Project Detail / Quotation: Active Projects + New/Old Clients pages */
            projectTitle: readCell(row, col.projectTitle) || (isActiveUpload ? "" : null),
            projectBudget: readCell(row, col.projectBudget) || null,
            comments: readCell(row, col.comments) || null,
            trade: readCell(row, col.trade),
            subTrades: readCell(row, col.subTrades),
            subContactsRaw: readCell(row, col.subContacts),
            csrId: csr.id,
            csrName: csr.name,
            status: initialStatuses[i % initialStatuses.length],
            isOldClient: leadType === "old" || isActiveUpload,
        });
    }
    return parsed;
}
/** Call-data stays pending-only; every other upload category forces the lead onto that page. */
function isCallDataStatus(status) {
    return (status ?? "").toLowerCase() === "pending";
}
function pickActiveRefreshTarget(activeMatches, uploadStatus) {
    const target = (uploadStatus ?? "").toLowerCase();
    if (target === "interested") {
        return (activeMatches.find(m => (m.status ?? "").toLowerCase() === "interested") ??
            activeMatches.find(m => (0, leadClientPromotion_1.isPendingPipelineStatus)(m.status)) ??
            activeMatches.find(m => (m.status ?? "").toLowerCase() === "important") ??
            activeMatches.find(m => !(0, leadClientPromotion_1.isWonClientStatus)(m.status)) ??
            activeMatches[0]);
    }
    if (target === "important") {
        return (activeMatches.find(m => (m.status ?? "").toLowerCase() === "important") ??
            activeMatches.find(m => (0, leadClientPromotion_1.isPendingPipelineStatus)(m.status)) ??
            activeMatches.find(m => !(0, leadClientPromotion_1.isWonClientStatus)(m.status)) ??
            activeMatches[0]);
    }
    const wonMatch = activeMatches.find(m => (0, leadClientPromotion_1.isWonClientStatus)(m.status));
    return wonMatch ?? activeMatches[0];
}
async function classifyRows(parsed, isActiveUpload, _uploadCategory = "call-data", promoteWonClientsArg = false) {
    /* Back-compat: older callers passed promoteWonClients as the 3rd arg */
    const promoteWonClients = typeof _uploadCategory === "boolean" ? _uploadCategory : promoteWonClientsArg;
    const preview = [];
    const previewCounts = { new: 0, duplicate: 0, updated: 0, empty: 0 };
    const pushPreview = (r, status, reason) => {
        previewCounts[status] += 1;
        if (preview.length >= CLASSIFY_PREVIEW_CAP)
            return;
        preview.push({
            row: r.rowIndex,
            name: r.name || "—",
            phone: r.phone || "—",
            email: r.email || "—",
            company: r.company || "—",
            ...(r.interestedService ? { interestedService: r.interestedService } : {}),
            status,
            reason,
        });
    };
    if (isActiveUpload) {
        const validParsed = parsed.filter(r => r.name);
        const uniqueCodes = [...new Set(validParsed.map(r => r.clientCode).filter((c) => !!c))];
        const existingLeads = uniqueCodes.length
            ? await chunkedLookup(uniqueCodes, CHUNK_LOOKUP, chunk => db_1.default.lead.findMany({
                where: { clientCode: { in: chunk } },
                select: { id: true, clientCode: true, inBin: true },
            }))
            : [];
        const existingCodeMap = new Map(existingLeads.map(l => [l.clientCode, l.id]));
        const binByCode = new Map(existingLeads.filter(l => l.inBin).map(l => [l.clientCode, l.id]));
        const fresh = [];
        const toUpdate = [];
        const toRestore = [];
        for (const r of parsed) {
            if (!r.name) {
                pushPreview(r, "empty", "Missing client name");
                continue;
            }
            if (r.clientCode && binByCode.has(r.clientCode)) {
                toRestore.push({ row: r, existingId: binByCode.get(r.clientCode) });
                pushPreview(r, "updated", "Restored from Bin → Active Projects");
            }
            else if (r.clientCode && existingCodeMap.has(r.clientCode)) {
                toUpdate.push(r);
                pushPreview(r, "updated", "Existing project — will refresh on Active Projects");
            }
            else {
                fresh.push(r);
                pushPreview(r, "new", "New project — will be added to Active Projects");
            }
        }
        return {
            fresh,
            toUpdate,
            toPromote: [],
            toRefresh: [],
            toRestore,
            emailUpdates: [],
            preview,
            previewCounts,
            existingCodeMap,
        };
    }
    const phones = [...new Set(parsed.map(r => r.phone).filter(p => p.length >= 7))];
    const emails = [...new Set(parsed.map(r => r.email).filter(e => e.includes("@")))];
    const phoneChunk = phones.length > 5000 ? 2000 : CHUNK_LOOKUP;
    /* Large sheets: skip fuzzy contains — variants cover common formats */
    const [phoneMatchMap, existingByEmail] = await Promise.all([
        (0, leadPhoneLookup_1.findLeadsByPhonesBulk)(phones, phoneChunk, { fuzzy: phones.length <= 800 }),
        chunkedLookup(emails, CHUNK_LOOKUP, chunk => db_1.default.lead.findMany({
            where: { email: { in: chunk } },
            select: { email: true, id: true, phone: true, status: true, inBin: true, assignedTo: true },
        })),
    ]);
    const dupEmails = new Map(existingByEmail
        .filter(l => l.email)
        .map(l => [l.email.toLowerCase(), l]));
    const emailUpdates = [];
    const toPromote = [];
    const toRefresh = [];
    const toRestore = [];
    const fresh = [];
    const pageLabel = (status) => {
        const s = (status ?? "").toLowerCase();
        if (s === "pending")
            return "Call Data";
        if (s === "important")
            return "Important";
        if (s === "interested")
            return "Interested";
        if ((0, leadClientPromotion_1.isWonClientStatus)(s))
            return "Clients";
        return status || "target page";
    };
    for (const r of parsed) {
        const hasValidPhone = r.phone.length >= 7;
        const hasValidEmail = r.email.includes("@");
        if (!r.name && !hasValidPhone && !hasValidEmail) {
            pushPreview(r, "empty", "Empty row — skipped");
            continue;
        }
        if (r.phone && hasValidPhone) {
            const matches = (phoneMatchMap.get(r.phone) ?? []).map(l => ({
                id: l.id,
                phone: l.phone,
                email: l.email,
                status: l.status,
                inBin: l.inBin,
                assignedTo: l.assignedTo,
            }));
            const activeMatches = matches.filter(m => !m.inBin);
            const binMatches = matches.filter(m => m.inBin);
            const callDataUpload = isCallDataStatus(r.status);
            /* Bin-only match → restore onto the upload target page */
            if (binMatches.length > 0 && activeMatches.length === 0) {
                toRestore.push({ row: r, existingId: binMatches[0].id });
                pushPreview(r, "updated", `Restored from Bin → ${pageLabel(r.status)}`);
                continue;
            }
            const pendingMatch = activeMatches.find(m => (0, leadClientPromotion_1.isPendingPipelineStatus)(m.status));
            if (promoteWonClients && pendingMatch && (0, leadClientPromotion_1.isWonClientUploadStatus)(r.status)) {
                toPromote.push({ row: r, existingId: pendingMatch.id });
                pushPreview(r, "updated", "Moved from Call Data → Clients");
                continue;
            }
            /* Non–call-data uploads always land on their target page (refresh existing) */
            if (!callDataUpload && activeMatches.length > 0) {
                const target = pickActiveRefreshTarget(activeMatches, r.status);
                toRefresh.push({ row: r, existingId: target.id });
                pushPreview(r, "updated", `Moved to ${pageLabel(r.status)}`);
                continue;
            }
            /* Call-data: never overwrite existing active leads */
            if (callDataUpload && activeMatches.length > 0) {
                const exactExisting = activeMatches[0];
                if (!exactExisting.email && hasValidEmail) {
                    emailUpdates.push({ id: exactExisting.id, email: r.email });
                }
                pushPreview(r, "duplicate", "Already in database (matching phone)");
                continue;
            }
            /* Call-data + bin only already handled; active empty → fresh below */
        }
        if (r.email && dupEmails.has(r.email.toLowerCase())) {
            const emailHit = dupEmails.get(r.email.toLowerCase());
            if (emailHit.inBin) {
                toRestore.push({ row: r, existingId: emailHit.id });
                pushPreview(r, "updated", `Restored from Bin → ${pageLabel(r.status)}`);
                continue;
            }
            if (!isCallDataStatus(r.status)) {
                toRefresh.push({ row: r, existingId: emailHit.id });
                pushPreview(r, "updated", `Moved to ${pageLabel(r.status)}`);
                continue;
            }
            pushPreview(r, "duplicate", "Already in database (matching email)");
            continue;
        }
        fresh.push(r);
        pushPreview(r, "new", `New contact — will be added to ${pageLabel(r.status)}`);
    }
    return { fresh, toUpdate: [], toPromote, toRefresh, toRestore, emailUpdates, preview, previewCounts };
}
