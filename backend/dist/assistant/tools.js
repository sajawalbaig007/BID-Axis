"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_HANDLERS = void 0;
exports.searchClients = searchClients;
exports.getClientDetails = getClientDetails;
exports.getClientHistory = getClientHistory;
exports.getProjectStatus = getProjectStatus;
exports.getAccountsMonth = getAccountsMonth;
exports.getCrmStatistics = getCrmStatistics;
exports.prepareClientEmail = prepareClientEmail;
exports.getTechnicalOverview = getTechnicalOverview;
exports.getEstimatorWorkload = getEstimatorWorkload;
exports.getPaymentsSnapshot = getPaymentsSnapshot;
exports.getStaffRoster = getStaffRoster;
exports.getCsrDesk = getCsrDesk;
exports.getPersonSnapshot = getPersonSnapshot;
const db_1 = __importDefault(require("../config/db"));
const technicalEstimators_1 = require("../utils/technicalEstimators");
const technicalMonitoring_1 = require("../utils/technicalMonitoring");
const paymentsSummary_1 = require("../utils/paymentsSummary");
const csrSessionTracking_1 = require("../utils/csrSessionTracking");
const accountsSnapshot_1 = require("../utils/accountsSnapshot");
const projectCurrencyCollections_1 = require("../utils/projectCurrencyCollections");
const currencyFormula_1 = require("../utils/currencyFormula");
const accountsDefaults_1 = require("../utils/accountsDefaults");
const clientMail_1 = require("../utils/clientMail");
const estTime_1 = require("../utils/estTime");
const projectPayments_1 = require("../utils/projectPayments");
const adminClientQueries_1 = require("../utils/adminClientQueries");
const fuzzy_1 = require("./fuzzy");
const permissions_1 = require("./permissions");
const LEAD_SELECT = {
    id: true,
    name: true,
    company: true,
    phone: true,
    email: true,
    status: true,
    assignedTo: true,
    projectTitle: true,
    projectCode: true,
    clientCode: true,
    projectPhase: true,
    projectWorkStatus: true,
    projectDeadline: true,
    projectBudget: true,
    paidAmount: true,
    projectPayments: true,
    interestedService: true,
    nextSchedule: true,
    comments: true,
    followUpNotes: true,
    projectNotes: true,
    technicalAssignments: true,
    inBin: true,
    createdAt: true,
    updatedAt: true,
    csr: { select: { id: true, name: true, csrCode: true } },
};
function visibleLead(actor, lead) {
    if (lead.inBin === true && actor.role === "csr")
        return false;
    if (actor.role === "admin" || actor.role === "manager" || actor.role === "technical_manager")
        return true;
    if (actor.role === "csr")
        return lead.assignedTo === actor.id;
    if (actor.role === "estimator") {
        const list = (0, technicalEstimators_1.parseTechnicalAssignments)(lead.technicalAssignments);
        return list.some(a => (0, technicalEstimators_1.assignmentBelongsToEstimator)(a, actor));
    }
    return false;
}
function phaseLabel(phase) {
    const p = (phase ?? "not_started").toLowerCase();
    if (p === "qa_phase")
        return "QA / final submission";
    if (p === "delivery_phase")
        return "Delivery";
    if (p.startsWith("pricing"))
        return "Pricing";
    if (p === "takeoff_completed")
        return "Takeoff completed";
    if (p === "not_started")
        return "Not started (takeoff)";
    return phase || "Unknown";
}
function summarizeLead(lead) {
    const assignments = (0, technicalEstimators_1.parseTechnicalAssignments)(lead.technicalAssignments);
    return {
        id: lead.id,
        name: lead.name,
        company: lead.company,
        phone: lead.phone,
        email: lead.email,
        status: lead.status,
        csr: lead.csr ? `${lead.csr.csrCode ?? ""} ${lead.csr.name}`.trim() : null,
        projectTitle: lead.projectTitle,
        projectCode: lead.projectCode || lead.clientCode,
        clientCode: lead.clientCode,
        stage: phaseLabel(lead.projectPhase),
        projectPhase: lead.projectPhase,
        workStatus: lead.projectWorkStatus,
        deadline: lead.projectDeadline,
        budget: lead.projectBudget,
        paidAmount: lead.paidAmount,
        service: lead.interestedService,
        followUp: lead.nextSchedule || null,
        estimators: assignments.map(a => ({
            name: a.estimatorName,
            takeoffDone: a.takeoffDone,
            pricingSent: a.pricingSent,
            deadline: a.deadline,
            manHours: a.manHours,
        })),
    };
}
function identityKey(s) {
    const e = (s.email ?? "").trim().toLowerCase();
    if (e.includes("@"))
        return `e:${e}`;
    const p = (s.phone ?? "").replace(/\D/g, "").slice(-10);
    if (p.length >= 7)
        return `p:${p}`;
    const code = (0, adminClientQueries_1.clientCodeFamilyKey)(s.clientCode, s.projectCode);
    if (code)
        return code;
    return `id:${s.id}`;
}
function collapseSamePerson(matches) {
    const map = new Map();
    for (const m of matches) {
        const key = identityKey(m);
        if (!map.has(key))
            map.set(key, m);
    }
    return [...map.values()];
}
function preferQueryHits(matches, query) {
    const q = (query ?? "").trim().toLowerCase();
    if (q.length < 2)
        return matches;
    const exactCode = matches.filter(m => (m.clientCode ?? "").toLowerCase() === q || (m.projectCode ?? "").toLowerCase() === q);
    if (exactCode.length)
        return exactCode;
    if (q.includes("@")) {
        const exactEmail = matches.filter(m => (m.email ?? "").toLowerCase() === q);
        if (exactEmail.length)
            return exactEmail;
    }
    return matches;
}
function moneyOf(lead) {
    const fromPayments = (0, projectPayments_1.paidTotalFromEntries)((0, projectPayments_1.parseProjectPayments)(lead.projectPayments));
    const paid = fromPayments > 0 ? fromPayments : (0, projectPayments_1.parseMoney)(lead.paidAmount);
    const quoted = (0, projectPayments_1.parseMoney)(lead.projectBudget);
    return { paid, quoted };
}
function isWonStatus(status) {
    const s = (status ?? "").trim().toLowerCase();
    return s === "close client" || s === "completed" || s === "closed";
}
function isProjectRow(lead) {
    return !!((lead.projectTitle ?? "").trim() ||
        (lead.projectCode ?? "").trim() ||
        (lead.clientCode ?? "").trim() ||
        isWonStatus(lead.status));
}
function usd(n) {
    return `$${Math.round(n).toLocaleString("en-US")}`;
}
function lineTotal(row) {
    const subs = row.subHeads ?? [];
    if (subs.length)
        return subs.reduce((a, s) => a + (Number(s.amount) || 0), 0);
    return Number(row.amount ?? row.totalSalary) || 0;
}
function sumHeads(rows) {
    if (!Array.isArray(rows))
        return 0;
    return rows.reduce((a, r) => a + lineTotal(r), 0);
}
function containsCI(value) {
    return { contains: value, mode: "insensitive" };
}
function equalsCI(value) {
    return { equals: value, mode: "insensitive" };
}
function startsCI(value) {
    return { startsWith: value, mode: "insensitive" };
}
function leadTextClauses(q) {
    if (q.length <= 2) {
        return [
            { name: equalsCI(q) },
            { name: startsCI(q) },
            { company: startsCI(q) },
            { clientCode: startsCI(q) },
            { projectCode: startsCI(q) },
        ];
    }
    const contains = containsCI(q);
    const clauses = [
        { name: contains },
        { company: contains },
        { ownerName: contains },
        { projectCode: contains },
        { clientCode: contains },
        { projectTitle: contains },
    ];
    const dash = q.match(/^([a-z0-9][a-z0-9._]*)-\d+$/i);
    if (dash?.[1] && dash[1].length >= 2) {
        clauses.push({ clientCode: startsCI(dash[1]) });
        clauses.push({ projectCode: startsCI(dash[1]) });
    }
    return clauses;
}
function subContactClauses(opts) {
    const or = [];
    for (const e of opts.emails)
        or.push({ email: equalsCI(e) });
    for (const p of opts.phones) {
        const suffix = p.slice(-10);
        if (suffix.length >= 7)
            or.push({ phone: { equals: suffix } }, { phone: { equals: p } });
    }
    for (const t of opts.texts) {
        if (t.length <= 2)
            or.push({ name: equalsCI(t) }, { name: startsCI(t) });
        else
            or.push({ name: containsCI(t) }, { email: equalsCI(t) });
    }
    return or;
}
function phoneVariants(digits) {
    const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
    return [...new Set([digits, last10, `+1${last10}`, `1${last10}`, `+${digits}`])];
}
function toVisible(actor, leads) {
    const seen = new Set();
    return leads.filter(l => {
        if (!l || seen.has(l.id) || !visibleLead(actor, l))
            return false;
        seen.add(l.id);
        return true;
    }).map(summarizeLead);
}
async function searchClients(actor, args) {
    if (!(0, permissions_1.canSearchClients)(actor.role))
        return (0, permissions_1.deny)("Your role cannot search clients.");
    const query = (args.query ?? "").trim();
    const emailArg = (args.email ?? "").trim().toLowerCase();
    const phoneArg = (args.phone ?? "").trim();
    const emails = new Set();
    if (emailArg.includes("@"))
        emails.add(emailArg);
    const emailFromQuery = query.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
    for (const e of emailFromQuery)
        emails.add(e.toLowerCase());
    const phones = new Set();
    const phoneArgDigits = phoneArg.replace(/\D/g, "");
    if (phoneArgDigits.length >= 7)
        phones.add(phoneArgDigits);
    const phoneFromQuery = query.match(/\+?\d[\d\s().-]{6,18}\d/);
    if (phoneFromQuery) {
        const d = phoneFromQuery[0].replace(/\D/g, "");
        if (d.length >= 7)
            phones.add(d);
    }
    const queryDigits = query.replace(/\D/g, "");
    if (queryDigits.length >= 7 && queryDigits.length <= 15 && !/[a-z]/i.test(query)) {
        phones.add(queryDigits);
    }
    let rest = query;
    for (const e of emails) {
        rest = rest.replace(new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
    }
    if (phoneFromQuery)
        rest = rest.replace(phoneFromQuery[0], " ");
    rest = rest.replace(/\s+/g, " ").trim();
    const texts = [];
    if (rest.length >= 2)
        texts.push(rest);
    const csrScope = actor.role === "csr" ? { assignedTo: actor.id } : {};
    if (emails.size) {
        const list = [...emails];
        const [exact, subs] = await Promise.all([
            db_1.default.lead.findMany({
                where: { AND: [csrScope, { OR: list.map(e => ({ email: equalsCI(e) })) }] },
                select: LEAD_SELECT,
                take: 40,
                orderBy: { updatedAt: "desc" },
            }),
            db_1.default.subContact.findMany({
                where: { OR: list.map(e => ({ email: equalsCI(e) })) },
                select: { leadId: true },
                take: 20,
            }),
        ]);
        const missing = subs.map(s => s.leadId).filter(id => !exact.some(l => l.id === id));
        const extra = missing.length
            ? await db_1.default.lead.findMany({ where: { id: { in: missing } }, select: LEAD_SELECT, take: 20 })
            : [];
        const visible = toVisible(actor, [...exact, ...extra]);
        if (visible.length)
            return { ok: true, data: { matches: visible, count: visible.length } };
    }
    if (phones.size) {
        const variants = [...phones].flatMap(phoneVariants);
        const leads = await db_1.default.lead.findMany({
            where: { AND: [csrScope, { phone: { in: variants } }] },
            select: LEAD_SELECT,
            take: 20,
            orderBy: { updatedAt: "desc" },
        });
        const visible = toVisible(actor, leads);
        if (visible.length)
            return { ok: true, data: { matches: visible, count: visible.length } };
    }
    const or = [];
    for (const t of texts)
        or.push(...leadTextClauses(t));
    if (!or.length && !emails.size && !phones.size) {
        return (0, permissions_1.deny)("Give a name, email, phone, or client/project code to search.");
    }
    if (!or.length) {
        return { ok: true, data: { matches: [], count: 0 } };
    }
    const [leads, subHits] = await Promise.all([
        db_1.default.lead.findMany({
            where: { AND: [csrScope, { OR: or }] },
            select: LEAD_SELECT,
            take: 12,
            orderBy: { updatedAt: "desc" },
        }),
        (() => {
            const subOr = subContactClauses({ emails: [...emails], phones: [...phones], texts });
            if (!subOr.length)
                return Promise.resolve([]);
            return db_1.default.subContact.findMany({ where: { OR: subOr }, select: { leadId: true }, take: 12 });
        })(),
    ]);
    const extraIds = subHits.map(s => s.leadId).filter(id => !leads.some(l => l.id === id));
    const extra = extraIds.length
        ? await db_1.default.lead.findMany({ where: { id: { in: extraIds } }, select: LEAD_SELECT, take: 12 })
        : [];
    const visible = toVisible(actor, [...leads, ...extra]);
    return { ok: true, data: { matches: visible, count: visible.length } };
}
async function getClientDetails(actor, args) {
    if (!(0, permissions_1.canSearchClients)(actor.role))
        return (0, permissions_1.deny)("Your role cannot view client details.");
    let lead = null;
    if (args.leadId) {
        lead = await db_1.default.lead.findUnique({ where: { id: args.leadId }, select: LEAD_SELECT });
    }
    else {
        const found = await searchClients(actor, { query: args.query, phone: args.phone });
        if (!found.ok)
            return found;
        const matches = preferQueryHits(found.data.matches, args.query);
        if (matches.length === 0)
            return { ok: true, data: { found: false, message: "No matching client." } };
        const people = collapseSamePerson(matches);
        if (people.length > 1) {
            return {
                ok: true,
                data: {
                    found: false,
                    needPick: true,
                    message: "Multiple clients matched. Ask which one (name / email / phone / client code).",
                    matches: people,
                },
            };
        }
        const chosen = people[0];
        const clusterIds = matches.filter(m => identityKey(m) === identityKey(chosen)).map(m => m.id);
        lead = await db_1.default.lead.findUnique({ where: { id: chosen.id }, select: LEAD_SELECT });
        if (!lead || !visibleLead(actor, lead))
            return (0, permissions_1.deny)("Client not found or you do not have access.");
        const notes = await db_1.default.leadNote.findMany({
            where: { leadId: { in: clusterIds.length ? clusterIds : [lead.id] } },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { text: true, createdAt: true },
        });
        const calls = await db_1.default.callLog.findMany({
            where: { leadId: { in: clusterIds.length ? clusterIds : [lead.id] } },
            orderBy: { createdAt: "desc" },
            take: 8,
            select: { status: true, notes: true, createdAt: true },
        });
        return {
            ok: true,
            data: {
                found: true,
                client: {
                    ...summarizeLead(lead),
                    comments: lead.comments,
                    followUpNotes: lead.followUpNotes,
                    projectNotes: lead.projectNotes,
                },
                recentNotes: notes.map(n => ({ text: n.text, at: n.createdAt })),
                recentCalls: calls.map(c => ({ status: c.status, notes: c.notes, at: c.createdAt })),
            },
        };
    }
    if (!lead || !visibleLead(actor, lead))
        return (0, permissions_1.deny)("Client not found or you do not have access.");
    const notes = await db_1.default.leadNote.findMany({
        where: { leadId: lead.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { text: true, createdAt: true },
    });
    const calls = await db_1.default.callLog.findMany({
        where: { leadId: lead.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { status: true, notes: true, createdAt: true },
    });
    return {
        ok: true,
        data: {
            found: true,
            client: {
                ...summarizeLead(lead),
                comments: lead.comments,
                followUpNotes: lead.followUpNotes,
                projectNotes: lead.projectNotes,
            },
            recentNotes: notes.map(n => ({ text: n.text, at: n.createdAt })),
            recentCalls: calls.map(c => ({ status: c.status, notes: c.notes, at: c.createdAt })),
        },
    };
}
async function getClientHistory(actor, args) {
    if (!(0, permissions_1.canSearchClients)(actor.role))
        return (0, permissions_1.deny)("Your role cannot view client details.");
    const query = (args.query ?? "").trim();
    const phone = (args.phone ?? "").trim();
    const emailFromQuery = query.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase() ?? "";
    const email = ((args.email ?? "").trim().toLowerCase().includes("@")
        ? (args.email ?? "").trim().toLowerCase()
        : emailFromQuery);
    const found = await searchClients(actor, {
        query,
        phone,
        email: email.includes("@") ? email : "",
    });
    if (!found.ok)
        return found;
    const seeds = found.data.matches;
    if (!seeds.length) {
        return { ok: true, data: { found: false, message: "No client found for that name, email, phone, or client code." } };
    }
    const distinct = new Map();
    for (const s of seeds) {
        const key = identityKey(s);
        if (!distinct.has(key))
            distinct.set(key, s);
    }
    if (distinct.size > 1 && !email.includes("@") && phone.replace(/\D/g, "").length < 7) {
        return {
            ok: true,
            data: {
                needPick: true,
                found: false,
                message: "Several people matched. Tell me the exact name, email, phone, or client code — I will only open that one.",
                matches: [...distinct.values()].slice(0, 8).map(s => ({
                    name: s.name,
                    phone: s.phone,
                    email: s.email,
                    projectCode: s.projectCode,
                    status: s.status,
                })),
            },
        };
    }
    const seed = [...distinct.values()][0];
    const emailKeys = [(seed.email ?? "").trim().toLowerCase()].filter(e => e.includes("@"));
    const phoneKeys = [(seed.phone ?? "").replace(/\D/g, "").slice(-10)].filter(p => p.length >= 7);
    let clusterWhere;
    if (emailKeys.length) {
        clusterWhere = { email: equalsCI(emailKeys[0]) };
    }
    else if (phoneKeys.length) {
        clusterWhere = { phone: { in: phoneVariants(phoneKeys[0]) } };
    }
    else {
        const sameIds = seeds.filter(s => identityKey(s) === identityKey(seed)).map(s => s.id);
        clusterWhere = { id: { in: sameIds } };
    }
    const cluster = await db_1.default.lead.findMany({
        where: clusterWhere,
        select: LEAD_SELECT,
        take: 40,
        orderBy: { createdAt: "asc" },
    });
    const visible = cluster.filter(l => visibleLead(actor, l));
    if (!visible.length)
        return (0, permissions_1.deny)("Client not found or you do not have access.");
    const head = visible[0];
    const projects = visible.filter(isProjectRow);
    let quoted = 0;
    let paid = 0;
    const projectRows = (projects.length ? projects : visible).map(p => {
        const m = moneyOf(p);
        quoted += m.quoted;
        paid += m.paid;
        return {
            code: p.projectCode || p.clientCode || "—",
            title: p.projectTitle || p.name || "—",
            status: p.status,
            stage: phaseLabel(p.projectPhase),
            quoted: m.quoted,
            paid: m.paid,
            quotedLabel: usd(m.quoted),
            paidLabel: usd(m.paid),
            createdAt: p.createdAt,
        };
    });
    return {
        ok: true,
        data: {
            history: true,
            found: true,
            name: head.name,
            company: head.company,
            email: head.email || emailKeys[0] || null,
            phone: head.phone || null,
            csr: head.csr ? `${head.csr.csrCode ?? ""} ${head.csr.name}`.trim() : null,
            projectCount: projectRows.length,
            quotedTotal: quoted,
            paidTotal: paid,
            quotedLabel: usd(quoted),
            paidLabel: usd(paid),
            projects: projectRows,
        },
    };
}
async function getProjectStatus(actor, args) {
    if (!(0, permissions_1.canReadProjects)(actor.role))
        return (0, permissions_1.deny)("Your role cannot view projects.");
    const code = (args.projectCode || args.query || "").trim();
    if (code.length < 2)
        return (0, permissions_1.deny)("Give a project code (or client name).");
    const where = {
        OR: [
            { projectCode: { contains: code, mode: "insensitive" } },
            { clientCode: { contains: code, mode: "insensitive" } },
            { projectTitle: { contains: code, mode: "insensitive" } },
            { name: { contains: code, mode: "insensitive" } },
            { company: { contains: code, mode: "insensitive" } },
        ],
    };
    if (actor.role === "csr")
        where.assignedTo = actor.id;
    const leads = await db_1.default.lead.findMany({
        where,
        select: LEAD_SELECT,
        take: 15,
        orderBy: { updatedAt: "desc" },
    });
    const visible = leads.filter(l => visibleLead(actor, l));
    if (!visible.length)
        return { ok: true, data: { found: false, message: "No project found for that code." } };
    return {
        ok: true,
        data: {
            found: true,
            projects: visible.map(l => {
                const s = summarizeLead(l);
                const pricing = s.estimators.some(e => e.pricingSent);
                const takeoff = s.estimators.some(e => e.takeoffDone);
                return {
                    ...s,
                    pipeline: s.stage,
                    takeoffStarted: s.estimators.length > 0,
                    takeoffDone: takeoff,
                    inPricing: pricing || (s.projectPhase ?? "").toLowerCase().includes("pricing"),
                };
            }),
        },
    };
}
async function getAccountsMonth(actor, args) {
    if (!(0, permissions_1.canReadAccounts)(actor.role))
        return (0, permissions_1.deny)("Accounts reports are only available to Accounts and CEO.");
    const month = (args.month ?? "").trim() || (0, estTime_1.estDateYmd)().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month))
        return (0, permissions_1.deny)("Give a month like 2026-08 or August 2026.");
    const page = (args.page ?? "reports").trim() || "reports";
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const from = `${month}-01`;
    const to = `${month}-${String(lastDay).padStart(2, "0")}`;
    const [isRecs, dashRecs] = await Promise.all([
        db_1.default.accountsRecord.findMany({
            where: { page: "income_statement", recordDate: { gte: from, lte: to } },
            select: { recordDate: true, data: true },
        }),
        db_1.default.accountsRecord.findMany({
            where: { page: "dashboard", recordDate: { gte: from, lte: to } },
            select: { recordDate: true, data: true },
        }),
    ]);
    const isSnap = (0, accountsSnapshot_1.pickLatestMeaningful)(isRecs);
    const dashSnap = (0, accountsSnapshot_1.pickLatestMeaningful)(dashRecs);
    const collections = await (0, projectCurrencyCollections_1.aggregateCollectionsForMonths)([month]);
    const dashRaw = dashSnap?.data ?? (0, accountsDefaults_1.defaultAccountsData)("dashboard");
    const dash = (0, projectCurrencyCollections_1.applyCollectionsToDashboardData)(dashRaw, collections.get(month) ?? (0, projectCurrencyCollections_1.emptyDayCollections)());
    const revenue = (0, currencyFormula_1.currencyFormulaTotalFromDashboard)(dash);
    const data = isSnap?.data ?? {};
    const payroll = sumHeads(data.teamSalaries);
    const opex = sumHeads(data.opexHeads);
    const expense = payroll + opex;
    const net = revenue - expense;
    return {
        ok: true,
        data: {
            accountsReport: true,
            month,
            page,
            sourceDate: isSnap?.recordDate ?? dashSnap?.recordDate ?? null,
            revenue,
            payroll,
            opex,
            expense,
            totalCost: expense,
            netProfit: net,
            result: net > 0 ? "profit" : net < 0 ? "loss" : "break-even",
        },
    };
}
async function getCrmStatistics(actor, args) {
    if (!(0, permissions_1.canReadStats)(actor.role))
        return (0, permissions_1.deny)("No dashboard stats for this role.");
    if (actor.role === "accounts") {
        const month = args.month || (0, estTime_1.estDateYmd)().slice(0, 7);
        return getAccountsMonth(actor, { month });
    }
    if (actor.role === "admin" || actor.role === "manager" || actor.role === "technical_manager") {
        const [totalLeads, pending, interested, scheduled, closedProjects, onlineCSRs, inBin, revisions, activeUsers, estimators, projects,] = await Promise.all([
            db_1.default.lead.count({ where: { inBin: false } }),
            db_1.default.lead.count({ where: { inBin: false, status: { equals: "pending", mode: "insensitive" } } }),
            db_1.default.lead.count({ where: { inBin: false, status: { equals: "interested", mode: "insensitive" } } }),
            db_1.default.lead.count({ where: { inBin: false, status: { equals: "important", mode: "insensitive" } } }),
            db_1.default.lead.count({
                where: { inBin: false, status: { in: ["Close Client", "close client", "completed", "closed"] } },
            }),
            db_1.default.user.count({ where: { role: "csr", isOnline: true } }),
            db_1.default.lead.count({ where: { inBin: true } }),
            db_1.default.lead.count({ where: { needsRevision: true, inBin: false } }),
            db_1.default.user.count({ where: { isActive: true } }),
            db_1.default.user.count({ where: { role: "estimator", isActive: true } }),
            db_1.default.lead.count({ where: { inBin: false, projectCode: { not: null } } }),
        ]);
        return {
            ok: true,
            data: {
                totalLeads,
                pending,
                interested,
                scheduled,
                closedProjects,
                onlineCSRs,
                inBin,
                revisions,
                activeUsers,
                estimators,
                projects,
            },
        };
    }
    if (actor.role === "csr") {
        const month = args.month || (0, estTime_1.estDateYmd)().slice(0, 7);
        const start = new Date(`${month}-01T00:00:00.000Z`);
        const [y, m] = month.split("-").map(Number);
        const end = new Date(Date.UTC(y, m, 1));
        const total = await db_1.default.lead.count({ where: { assignedTo: actor.id } });
        const addedThisMonth = await db_1.default.lead.count({
            where: { assignedTo: actor.id, createdAt: { gte: start, lt: end } },
        });
        return { ok: true, data: { assignedLeads: total, addedThisMonth, month } };
    }
    if (actor.role === "estimator") {
        const raw = await db_1.default.lead.findMany({
            where: { technicalAssignments: { not: null } },
            select: LEAD_SELECT,
            take: 200,
        });
        const mine = raw.filter(l => visibleLead(actor, l));
        return {
            ok: true,
            data: {
                assignedProjects: mine.length,
                inPricing: mine.filter(l => (0, technicalEstimators_1.parseTechnicalAssignments)(l.technicalAssignments).some(a => a.pricingSent)).length,
                takeoffDone: mine.filter(l => (0, technicalEstimators_1.parseTechnicalAssignments)(l.technicalAssignments).some(a => a.takeoffDone)).length,
            },
        };
    }
    return (0, permissions_1.deny)("No stats available.");
}
function packClientNotes(lead, notes, calls) {
    const chunks = [];
    if (lead.followUpNotes?.trim())
        chunks.push(`Follow-up: ${lead.followUpNotes.trim()}`);
    if (lead.projectNotes?.trim())
        chunks.push(`Project notes: ${lead.projectNotes.trim()}`);
    if (lead.comments?.trim())
        chunks.push(`Comments: ${lead.comments.trim()}`);
    for (const n of notes) {
        const text = n.text.trim();
        if (text)
            chunks.push(`Note: ${text}`);
    }
    for (const c of calls) {
        const text = (c.notes ?? "").trim();
        if (text)
            chunks.push(`Call (${c.status}): ${text}`);
    }
    return chunks.join("\n").slice(0, 4500);
}
async function prepareClientEmail(actor, args) {
    if (!(0, permissions_1.canEmailClients)(actor.role))
        return (0, permissions_1.deny)("Your role cannot email clients.");
    const query = (args.query ?? "").trim();
    const phone = (args.phone ?? "").trim();
    if (query.length < 2 && phone.replace(/\D/g, "").length < 7) {
        return {
            ok: true,
            data: {
                needPick: true,
                message: "Which client? Give a name, email, phone, or client code — I will read their notes and draft the email.",
            },
        };
    }
    const found = await getClientDetails(actor, { query: args.query, phone: args.phone });
    if (!found.ok)
        return found;
    if (!("client" in found.data) || !found.data.found)
        return found;
    const client = found.data.client;
    if (!client.email)
        return (0, permissions_1.deny)("That client has no email on file.");
    const purpose = (args.intent ?? "").trim() || "a quick follow-up";
    const notePack = packClientNotes(client, found.data.recentNotes ?? [], found.data.recentCalls ?? []);
    const senders = (0, clientMail_1.publicSenders)();
    const draft = await (0, clientMail_1.draftClientMail)({
        fromName: "",
        fromEmail: "",
        to: client.email,
        clientName: client.name ?? undefined,
        company: client.company ?? undefined,
        intent: purpose,
        notes: notePack,
    });
    return {
        ok: true,
        data: {
            compose: true,
            to: client.email,
            clientName: client.name,
            company: client.company,
            intent: purpose,
            purpose,
            subject: draft.subject,
            body: draft.body,
            notes: notePack,
            fromAccounts: senders,
            message: senders.length === 0
                ? "Draft is ready, but none of your From emails are configured yet."
                : "I wrote this as you. When you send, pick Devcon, BIM Design Studio, or PS Estimating — that mailbox’s signature goes in the footer.",
        },
    };
}
let techCache = null;
let payCache = null;
async function technicalSnapshot() {
    if (techCache && Date.now() - techCache.at < 25000)
        return techCache.data;
    const data = await (0, technicalMonitoring_1.buildTechnicalMonitoring)();
    techCache = { at: Date.now(), data };
    return data;
}
function hoursLabel(seconds) {
    const h = Math.round((seconds / 3600) * 10) / 10;
    return `${h}h`;
}
async function getTechnicalOverview(actor, args) {
    if (!(0, permissions_1.canReadTechnical)(actor.role))
        return (0, permissions_1.deny)("Technical pipeline is only for CEO / Technical.");
    const [snap, revisions] = await Promise.all([
        technicalSnapshot(),
        db_1.default.lead.count({ where: { needsRevision: true, inBin: false } }),
    ]);
    const { kpi } = snap;
    const q = `${args.query ?? ""} ${args.focus ?? ""}`.toLowerCase();
    const wantsLive = args.focus === "live" ||
        /\b(chief\s*estimator|technical\s*manager|tech\s*manager|live projects|dashboard)\b/.test(q);
    const focus = wantsLive
        ? "live"
        : args.focus === "count" || args.focus === "scoreboard" || args.focus === "full" || args.focus === "pipeline"
            ? args.focus
            : /\b(kitn[aeiy]|how many|count|kitny)\b/.test(q) && /\bprojects?\b/.test(q)
                ? "count"
                : /\b(full|snapshot|overview)\b/.test(q)
                    ? "full"
                    : "pipeline";
    const live = focus === "live" || focus === "full"
        ? (snap.live ?? []).map(p => ({
            code: p.projectCode || "—",
            title: p.projectTitle || "Untitled",
            phase: phaseLabel(p.projectPhase),
            workStatus: p.workStatus || "",
            estimators: p.estimators.map(e => ({
                name: e.name,
                code: e.code,
                manHours: e.manHours || "—",
                logged: hoursLabel(e.loggedSeconds),
                takeoffDone: e.takeoffDone,
                overdue: e.overdue,
                timerRunning: e.timerRunning,
                deadline: e.deadline || "",
            })),
        }))
        : [];
    return {
        ok: true,
        data: {
            technical: true,
            focus,
            generatedAt: snap.generatedAt,
            pipeline: kpi.pipeline,
            live,
            summary: {
                totalAssignments: kpi.summary.totalAssignments,
                pending: kpi.summary.pendingAssignments,
                completed: kpi.summary.completedAssignments,
                overdue: kpi.summary.overdueAssignments,
                timersRunning: kpi.summary.timersRunning,
                logged: hoursLabel(kpi.summary.totalLoggedSeconds),
                plannedHours: kpi.summary.plannedManHours,
                completionRate: kpi.summary.completionRate,
                emergencyMorning: kpi.summary.emergencyMorning,
                emergencyCob: kpi.summary.emergencyCob,
                revisions,
            },
            scoreboard: focus === "count" ? [] : kpi.scoreboard.slice(0, 12).map(m => ({
                name: m.name,
                code: m.code,
                assigned: m.assigned,
                pending: m.pending,
                completed: m.completed,
                overdue: m.overdue,
                timers: m.timersRunning,
                logged: hoursLabel(m.loggedSeconds),
                score: m.score,
                completionRate: m.completionRate,
            })),
        },
    };
}
async function getEstimatorWorkload(actor, args) {
    if (!(0, permissions_1.canReadTechnical)(actor.role) && actor.role !== "estimator") {
        return (0, permissions_1.deny)("Estimator workload is only for CEO / Technical.");
    }
    const q = (args.query ?? "").trim().toLowerCase();
    if (!q)
        return getTechnicalOverview(actor, { focus: "full" });
    const snap = await technicalSnapshot();
    const pick = (0, fuzzy_1.bestNameMatch)(q, snap.team, m => `${m.name} ${m.code}`)
        ?? snap.team.find(m => m.estimatorId.toLowerCase() === q)
        ?? null;
    if (!pick) {
        return getPersonSnapshot(actor, { query: args.query, intent: "estimator" });
    }
    return {
        ok: true,
        data: {
            estimator: true,
            name: pick.name,
            code: pick.code,
            assigned: pick.assigned,
            pending: pick.pending,
            completed: pick.completed,
            overdue: pick.overdue,
            timers: pick.timersRunning,
            logged: hoursLabel(pick.loggedSeconds),
            plannedHours: pick.plannedHours,
            score: pick.score,
            completionRate: pick.completionRate,
            projects: pick.projects.slice(0, 12).map(p => ({
                code: p.projectCode,
                title: p.projectTitle,
                phase: p.projectPhase,
                deadline: p.deadline,
                takeoffDone: p.takeoffDone,
                overdue: p.overdue,
                timerRunning: p.timerRunning,
                scopes: p.scopes,
            })),
        },
    };
}
async function getPaymentsSnapshot(actor, args) {
    if (!(0, permissions_1.canReadPayments)(actor.role))
        return (0, permissions_1.deny)("Payments snapshot is only for CEO / Accounts.");
    const month = (args.month || "").trim();
    const key = month && /^\d{4}-\d{2}$/.test(month) ? month : "";
    if (payCache && payCache.month === key && Date.now() - payCache.at < 25000) {
        const cached = payCache.data;
        return {
            ok: true,
            data: {
                payments: true,
                month: cached.monthLabel,
                totals: cached.totals,
                statusBreakdown: cached.statusBreakdown,
                channels: cached.channels.slice(0, 6).map(c => ({
                    label: c.label,
                    totalAmount: c.totalAmount,
                    paymentCount: c.paymentCount,
                    projectCount: c.projectCount,
                })),
            },
        };
    }
    const snap = await (0, paymentsSummary_1.buildPaymentsSummary)(key || null);
    payCache = { at: Date.now(), month: key, data: snap };
    return {
        ok: true,
        data: {
            payments: true,
            month: snap.monthLabel,
            totals: snap.totals,
            statusBreakdown: snap.statusBreakdown,
            channels: snap.channels.slice(0, 6).map(c => ({
                label: c.label,
                totalAmount: c.totalAmount,
                paymentCount: c.paymentCount,
                projectCount: c.projectCount,
            })),
        },
    };
}
async function getStaffRoster(actor) {
    if (!(0, permissions_1.canReadStaff)(actor.role))
        return (0, permissions_1.deny)("Staff roster is only for CEO.");
    const users = await db_1.default.user.findMany({
        where: { isActive: true },
        select: {
            name: true,
            role: true,
            csrCode: true,
            employeeCode: true,
            isOnline: true,
            lastActive: true,
            lastLoginAt: true,
        },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        take: 80,
    });
    const byRole = {};
    let online = 0;
    for (const u of users) {
        byRole[u.role] = (byRole[u.role] ?? 0) + 1;
        if (u.isOnline)
            online += 1;
    }
    return {
        ok: true,
        data: {
            staff: true,
            total: users.length,
            online,
            byRole,
            people: users.map(u => ({
                name: u.name,
                role: u.role,
                code: u.csrCode || u.employeeCode || "",
                online: u.isOnline,
                lastActive: u.lastActive,
            })),
        },
    };
}
async function getCsrDesk(actor, args) {
    if (!(0, permissions_1.canReadStaff)(actor.role) && actor.role !== "csr") {
        return (0, permissions_1.deny)("CSR desk is only for CEO.");
    }
    const junk = new Set([
        "active", "online", "status", "stats", "sttaus", "staus", "today", "month",
        "csr", "csrs", "how", "many", "are", "is", "the", "gimme", "give",
    ]);
    const raw = (args.query ?? "").trim().toLowerCase();
    const q = !raw || (0, fuzzy_1.isNearFiller)(raw, junk) ? "" : raw;
    const csrUsers = await db_1.default.user.findMany({
        where: {
            role: "csr",
            isActive: true,
            ...(q
                ? {
                    OR: [
                        { name: { contains: q, mode: "insensitive" } },
                        { csrCode: { contains: q, mode: "insensitive" } },
                        { email: { contains: q, mode: "insensitive" } },
                    ],
                }
                : {}),
        },
        select: { id: true, name: true, csrCode: true, isOnline: true, email: true },
        take: 40,
    });
    const matched = q
        ? csrUsers.filter(u => (0, fuzzy_1.fuzzyNameHit)(q, u.name) || (0, fuzzy_1.fuzzyNameHit)(q, u.csrCode || "") || u.email.toLowerCase().includes(q))
        : csrUsers;
    const useList = matched.length ? matched : q ? [] : csrUsers;
    if (q && useList.length === 0) {
        return getPersonSnapshot(actor, { query: args.query, intent: "csr" });
    }
    const desks = await Promise.all(useList.slice(0, 12).map(async (u) => {
        const [total, pending, interested, closed] = await Promise.all([
            db_1.default.lead.count({ where: { assignedTo: u.id, inBin: false } }),
            db_1.default.lead.count({
                where: { assignedTo: u.id, inBin: false, status: { equals: "pending", mode: "insensitive" } },
            }),
            db_1.default.lead.count({
                where: { assignedTo: u.id, inBin: false, status: { equals: "interested", mode: "insensitive" } },
            }),
            db_1.default.lead.count({
                where: {
                    assignedTo: u.id,
                    inBin: false,
                    status: { in: ["Close Client", "close client", "completed", "closed"] },
                },
            }),
        ]);
        return {
            name: u.name,
            code: u.csrCode,
            online: u.isOnline,
            email: u.email,
            total,
            pending,
            interested,
            closed,
        };
    }));
    return {
        ok: true,
        data: {
            csrDesk: true,
            active: desks.length,
            online: desks.filter(d => d.online).length,
            desks,
        },
    };
}
function monthKeyFromDeadline(raw) {
    const s = String(raw ?? "").slice(0, 7);
    return /^\d{4}-\d{2}$/.test(s) ? s : "";
}
async function getPersonSnapshot(actor, args) {
    const q = (args.query ?? "").trim();
    if (q.length < 3) {
        return {
            ok: true,
            data: {
                needPick: true,
                message: "Which person? Give an estimator or CSR name — e.g. Bariq, Zainab, or a CSR code.",
            },
        };
    }
    const month = (args.month || (0, estTime_1.estDateYmd)().slice(0, 7)).trim();
    const todayYmd = (0, estTime_1.estDateYmd)();
    const dayArg = (args.day ?? "").trim();
    const dayYmd = /^\d{4}-\d{2}-\d{2}$/.test(dayArg) ? dayArg : todayYmd;
    const isToday = dayYmd === todayYmd;
    const bounds = (0, estTime_1.estDayBoundsUtc)(dayYmd);
    const [users, snap] = await Promise.all([
        db_1.default.user.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                role: true,
                csrCode: true,
                employeeCode: true,
                contactNo: true,
                isOnline: true,
                lastActive: true,
                lastLoginAt: true,
                email: true,
            },
            take: 200,
        }),
        (0, permissions_1.canReadTechnical)(actor.role) || actor.role === "estimator"
            ? technicalSnapshot()
            : Promise.resolve(null),
    ]);
    const user = (0, fuzzy_1.bestNameMatch)(q, users, u => `${u.name} ${u.csrCode || ""} ${u.employeeCode || ""}`);
    const est = snap
        ? (0, fuzzy_1.bestNameMatch)(q, snap.team, m => `${m.name} ${m.code}`)
        : null;
    if (!user && !est) {
        const asked = (args.intent ?? "").toLowerCase();
        const staffAsk = /\b(estimator|csr|accounts|staff|employee|check[- ]?in|checkin|kitn[aeiy]|kitny|how many)\b/.test(asked);
        if (!staffAsk && (0, permissions_1.canSearchClients)(actor.role)) {
            return getClientHistory(actor, { query: q });
        }
        return {
            ok: true,
            data: {
                found: false,
                message: `No employee matching “${q}”. Try first name (Bariq, Hammad, Zainab) — spelling can be off.`,
            },
        };
    }
    let checkin = null;
    if (user && bounds) {
        const live = isToday ? await (0, csrSessionTracking_1.getCsrWorkSessionStatus)(user.id) : null;
        const dayRow = await db_1.default.csrWorkSession.findFirst({
            where: { userId: user.id, loginAt: { gte: bounds.start, lte: bounds.end } },
            orderBy: { loginAt: "desc" },
        });
        checkin = {
            day: dayYmd,
            isToday,
            checkedIn: isToday ? !!live?.checkedIn : false,
            paused: isToday ? !!live?.paused : false,
            online: user.isOnline,
            checkInAtEst: live?.session?.checkInAtEst ?? (dayRow ? (0, estTime_1.formatEstDateTime)(dayRow.loginAt) : null),
            duration: live?.session?.totalDuration ?? (dayRow ? (0, estTime_1.formatDurationMs)((dayRow.dashboardMs ?? 0) + (dayRow.awayMs ?? 0)) : null),
            checkedOutAtEst: dayRow?.logoutAt ? (0, estTime_1.formatEstDateTime)(dayRow.logoutAt) : null,
            hadSessionToday: !!dayRow || (isToday && !!live?.checkedIn),
            lastLoginAt: user.lastLoginAt ? (0, estTime_1.formatEstDateTime)(user.lastLoginAt) : null,
            lastActive: user.lastActive ? (0, estTime_1.formatEstDateTime)(user.lastActive) : null,
        };
    }
    const linkedEst = est ||
        (user && snap ? (0, fuzzy_1.bestNameMatch)(user.name, snap.team, m => m.name) : null);
    let csr = null;
    if (user?.role === "csr") {
        const [total, pending, interested, closed] = await Promise.all([
            db_1.default.lead.count({ where: { assignedTo: user.id, inBin: false } }),
            db_1.default.lead.count({
                where: { assignedTo: user.id, inBin: false, status: { equals: "pending", mode: "insensitive" } },
            }),
            db_1.default.lead.count({
                where: { assignedTo: user.id, inBin: false, status: { equals: "interested", mode: "insensitive" } },
            }),
            db_1.default.lead.count({
                where: {
                    assignedTo: user.id,
                    inBin: false,
                    status: { in: ["Close Client", "close client", "completed", "closed"] },
                },
            }),
        ]);
        csr = { total, pending, interested, closed };
    }
    const monthProjects = linkedEst
        ? linkedEst.projects.filter(p => monthKeyFromDeadline(p.deadline) === month)
        : [];
    return {
        ok: true,
        data: {
            person: true,
            name: user?.name || linkedEst?.name || q,
            role: user?.role || (linkedEst ? "estimator" : ""),
            code: user?.csrCode || user?.employeeCode || linkedEst?.code || "",
            email: user?.email || "",
            phone: user?.contactNo || "",
            employeeCode: user?.employeeCode || "",
            online: user?.isOnline ?? false,
            lastLoginAt: user?.lastLoginAt ? (0, estTime_1.formatEstDateTime)(user.lastLoginAt) : null,
            checkin,
            csr,
            estimator: linkedEst
                ? {
                    assigned: linkedEst.assigned,
                    pending: linkedEst.pending,
                    completed: linkedEst.completed,
                    overdue: linkedEst.overdue,
                    timers: linkedEst.timersRunning,
                    logged: hoursLabel(linkedEst.loggedSeconds),
                    plannedHours: linkedEst.plannedHours,
                    score: linkedEst.score,
                    month,
                    monthCount: monthProjects.length,
                    projects: linkedEst.projects.map(p => ({
                        code: p.projectCode,
                        title: p.projectTitle,
                        phase: phaseLabel(p.projectPhase),
                        deadline: p.deadline,
                        takeoffDone: p.takeoffDone,
                        overdue: p.overdue,
                        timerRunning: p.timerRunning,
                        manHours: p.manHours || "—",
                        logged: hoursLabel(p.loggedSeconds),
                        scopes: p.scopes,
                    })),
                }
                : null,
        },
    };
}
exports.TOOL_HANDLERS = {
    searchClients,
    getClientDetails,
    getClientHistory,
    getProjectStatus,
    getAccountsMonth,
    getCrmStatistics,
    prepareClientEmail,
    getTechnicalOverview,
    getEstimatorWorkload,
    getPaymentsSnapshot,
    getStaffRoster,
    getCsrDesk,
    getPersonSnapshot,
};
