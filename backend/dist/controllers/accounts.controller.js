"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAccountsDates = listAccountsDates;
exports.getAccountsRecord = getAccountsRecord;
exports.saveAccountsRecord = saveAccountsRecord;
exports.uploadAccountsFile = uploadAccountsFile;
exports.getAccountsDashboardSummary = getAccountsDashboardSummary;
exports.getIncomeBudgetActuals = getIncomeBudgetActuals;
exports.listEmployeeNameMerges = listEmployeeNameMerges;
exports.getProvidentFundBreakdown = getProvidentFundBreakdown;
const streamifier_1 = __importDefault(require("streamifier"));
const db_1 = __importDefault(require("../config/db"));
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const accountsDefaults_1 = require("../utils/accountsDefaults");
const accountsExcelImport_1 = require("../utils/accountsExcelImport");
const incomeStatementNormalize_1 = require("../utils/incomeStatementNormalize");
const salesPayrollDefaults_1 = require("../utils/salesPayrollDefaults");
const technicalPayrollDefaults_1 = require("../utils/technicalPayrollDefaults");
const currencyFormula_1 = require("../utils/currencyFormula");
const projectCurrencyCollections_1 = require("../utils/projectCurrencyCollections");
const accountsStorage_1 = require("../utils/accountsStorage");
const incomeBudget_1 = require("../utils/incomeBudget");
const loadStaffPayroll_1 = require("../utils/loadStaffPayroll");
const pfNameAlias_1 = require("../utils/pfNameAlias");
const employeeNameMerge_1 = require("../utils/employeeNameMerge");
const estTime_1 = require("../utils/estTime");
const accountsSnapshot_1 = require("../utils/accountsSnapshot");
function todayIsoDate() {
    return (0, estTime_1.estDateYmd)();
}
/** Full income-statement pipeline: sales-lead split → technical sync → executive commission. */
function prepareIncomeStatement(data) {
    return (0, incomeStatementNormalize_1.recomputeExecutiveTeamInIncomeStatement)((0, technicalPayrollDefaults_1.recomputeTechnicalTeamInIncomeStatement)((0, incomeStatementNormalize_1.normalizeIncomeStatementData)(data)));
}
/** Read existing record or return null — never auto-creates (avoids empty date pollution). */
async function findRecord(page, recordDate) {
    return db_1.default.accountsRecord.findUnique({
        where: { page_recordDate: { page: (0, accountsDefaults_1.toPrismaAccountsPage)(page), recordDate } },
    });
}
/** Create only when an explicit write needs a row (upload / save already upserts). */
async function getOrCreateRecord(page, recordDate, userId) {
    const existing = await findRecord(page, recordDate);
    if (existing)
        return existing;
    return db_1.default.accountsRecord.create({
        data: {
            page: (0, accountsDefaults_1.toPrismaAccountsPage)(page),
            recordDate,
            data: (0, accountsDefaults_1.defaultAccountsData)(page),
            updatedBy: userId ?? null,
        },
    });
}
function preparePageData(page, data) {
    if (page === "income_statement")
        return prepareIncomeStatement(data);
    if (page === "technical_payroll") {
        return (0, technicalPayrollDefaults_1.normalizeTechnicalPayrollData)(data);
    }
    if (page === "sales_payroll") {
        return (0, salesPayrollDefaults_1.normalizeSalesPayrollData)(data);
    }
    return data;
}
async function listAccountsDates(req, res) {
    try {
        const pageParam = String(req.params.page ?? "");
        if (!(0, accountsDefaults_1.isAccountsPageKey)(pageParam)) {
            return res.status(400).json({ success: false, message: "Invalid accounts page." });
        }
        const from = String(req.query.from ?? "").trim();
        const to = String(req.query.to ?? "").trim();
        const where = {
            page: (0, accountsDefaults_1.toPrismaAccountsPage)(pageParam),
        };
        if (from || to) {
            where.recordDate = {};
            if (from)
                where.recordDate.gte = from;
            if (to)
                where.recordDate.lte = to;
        }
        const records = await db_1.default.accountsRecord.findMany({
            where,
            select: { recordDate: true, updatedAt: true, data: true },
            orderBy: { recordDate: "desc" },
        });
        const visible = records.filter(r => (0, accountsSnapshot_1.hasMeaningfulAccountsData)(r.data));
        return res.json({
            success: true,
            dates: visible.map(r => r.recordDate),
            records: visible.map(r => ({
                recordDate: r.recordDate,
                updatedAt: r.updatedAt,
            })),
        });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Failed to list account dates." });
    }
}
async function getAccountsRecord(req, res) {
    try {
        const pageParam = String(req.params.page ?? "");
        const recordDate = String(req.params.date ?? "").trim();
        if (!(0, accountsDefaults_1.isAccountsPageKey)(pageParam)) {
            return res.status(400).json({ success: false, message: "Invalid accounts page." });
        }
        if (!(0, accountsDefaults_1.isValidRecordDate)(recordDate)) {
            return res.status(400).json({ success: false, message: "Invalid date. Use YYYY-MM-DD." });
        }
        const resolved = await (0, accountsSnapshot_1.resolveAccountsSnapshot)(pageParam, recordDate);
        const record = resolved.record;
        let raw = record?.data ?? (0, accountsDefaults_1.defaultAccountsData)(pageParam);
        if (pageParam === "income_statement") {
            raw = await (0, loadStaffPayroll_1.applyStaffPayrollToIncomeData)(raw, recordDate);
        }
        let responseData = preparePageData(pageParam, raw);
        if (pageParam === "dashboard") {
            const collections = await (0, projectCurrencyCollections_1.aggregateCollectionsForDate)(recordDate);
            responseData = (0, projectCurrencyCollections_1.applyCollectionsToDashboardData)(responseData, collections);
        }
        const uploads = await db_1.default.accountsFileUpload.findMany({
            where: { page: (0, accountsDefaults_1.toPrismaAccountsPage)(pageParam), recordDate },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                fileName: true,
                fileUrl: true,
                mimeType: true,
                createdAt: true,
            },
        });
        return res.json({
            success: true,
            recordDate,
            persisted: !!record && !resolved.copiedFrom,
            copiedFrom: resolved.copiedFrom,
            data: responseData,
            updatedAt: record?.updatedAt ?? null,
            uploads,
        });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Failed to load accounts record." });
    }
}
async function saveAccountsRecord(req, res) {
    try {
        const pageParam = String(req.params.page ?? "");
        const recordDate = String(req.params.date ?? "").trim();
        const { data } = req.body;
        if (!(0, accountsDefaults_1.isAccountsPageKey)(pageParam)) {
            return res.status(400).json({ success: false, message: "Invalid accounts page." });
        }
        if (!(0, accountsDefaults_1.isValidRecordDate)(recordDate)) {
            return res.status(400).json({ success: false, message: "Invalid date. Use YYYY-MM-DD." });
        }
        if (!data || typeof data !== "object") {
            return res.status(400).json({ success: false, message: "Missing data payload." });
        }
        let incoming = data;
        if (pageParam === "income_statement") {
            incoming = await (0, loadStaffPayroll_1.applyStaffPayrollToIncomeData)(data, recordDate);
        }
        let payload = preparePageData(pageParam, incoming);
        if (pageParam === "dashboard") {
            const collections = await (0, projectCurrencyCollections_1.aggregateCollectionsForDate)(recordDate);
            payload = (0, projectCurrencyCollections_1.applyCollectionsToDashboardData)(payload, collections);
        }
        const prismaPage = (0, accountsDefaults_1.toPrismaAccountsPage)(pageParam);
        const record = await db_1.default.accountsRecord.upsert({
            where: { page_recordDate: { page: prismaPage, recordDate } },
            create: {
                page: prismaPage,
                recordDate,
                data: payload,
                updatedBy: req.user?.id ?? null,
            },
            update: {
                data: payload,
                updatedBy: req.user?.id ?? null,
            },
        });
        return res.json({
            success: true,
            recordDate,
            persisted: true,
            data: record.data,
            updatedAt: record.updatedAt,
        });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Failed to save accounts record." });
    }
}
async function uploadAccountsFile(req, res) {
    try {
        const pageParam = String(req.params.page ?? "");
        const recordDate = String(req.params.date ?? "").trim();
        const file = req.file;
        if (!(0, accountsDefaults_1.isAccountsPageKey)(pageParam)) {
            return res.status(400).json({ success: false, message: "Invalid accounts page." });
        }
        if (!(0, accountsDefaults_1.isValidRecordDate)(recordDate)) {
            return res.status(400).json({ success: false, message: "Invalid date. Use YYYY-MM-DD." });
        }
        if (!file) {
            return res.status(400).json({ success: false, message: "No file uploaded." });
        }
        if (!req.user?.id) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }
        const uploaded = await new Promise((resolve, reject) => {
            const stream = cloudinary_1.default.uploader.upload_stream({
                folder: (0, accountsStorage_1.accountsUploadFolder)({
                    page: pageParam,
                    fileName: file.originalname,
                    mimeType: file.mimetype,
                }),
                resource_type: "auto",
            }, (error, result) => {
                if (error || !result)
                    reject(error ?? new Error("Upload failed"));
                else
                    resolve(result);
            });
            streamifier_1.default.createReadStream(file.buffer).pipe(stream);
        });
        const uploadRow = await db_1.default.accountsFileUpload.create({
            data: {
                page: (0, accountsDefaults_1.toPrismaAccountsPage)(pageParam),
                recordDate,
                fileName: file.originalname,
                fileUrl: uploaded.secure_url,
                mimeType: file.mimetype,
                uploadedBy: req.user.id,
            },
        });
        let mergedData;
        const name = file.originalname.toLowerCase();
        const isSheet = name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv");
        if (isSheet) {
            const record = await getOrCreateRecord(pageParam, recordDate, req.user.id);
            mergedData = preparePageData(pageParam, (0, accountsExcelImport_1.mergeAccountsExcel)(pageParam, record.data ?? (0, accountsDefaults_1.defaultAccountsData)(pageParam), file.buffer));
            await db_1.default.accountsRecord.upsert({
                where: { page_recordDate: { page: (0, accountsDefaults_1.toPrismaAccountsPage)(pageParam), recordDate } },
                create: {
                    page: (0, accountsDefaults_1.toPrismaAccountsPage)(pageParam),
                    recordDate,
                    data: mergedData,
                    updatedBy: req.user.id,
                },
                update: { data: mergedData, updatedBy: req.user.id },
            });
        }
        const uploads = await db_1.default.accountsFileUpload.findMany({
            where: { page: (0, accountsDefaults_1.toPrismaAccountsPage)(pageParam), recordDate },
            orderBy: { createdAt: "desc" },
            select: { id: true, fileName: true, fileUrl: true, mimeType: true, createdAt: true },
        });
        return res.json({
            success: true,
            upload: uploadRow,
            merged: !!mergedData,
            data: mergedData,
            uploads,
        });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Failed to upload accounts file." });
    }
}
async function getAccountsDashboardSummary(req, res) {
    try {
        const mode = String(req.query.mode ?? "day").trim().toLowerCase();
        const toDate = String(req.query.to ?? req.query.date ?? todayIsoDate()).trim();
        const fromDate = String(req.query.from ?? "").trim();
        if (!(0, accountsDefaults_1.isValidRecordDate)(toDate)) {
            return res.status(400).json({ success: false, message: "Invalid date." });
        }
        const useRange = mode === "all_time" || mode === "range" || mode === "month";
        if (useRange && mode !== "all_time") {
            if (!(0, accountsDefaults_1.isValidRecordDate)(fromDate)) {
                return res.status(400).json({ success: false, message: "Invalid from date." });
            }
        }
        const sumLines = (rows) => (rows ?? []).reduce((a, row) => {
            if (row.subHeads && row.subHeads.length > 0) {
                return a + row.subHeads.reduce((x, h) => x + (Number(h.amount) || 0), 0);
            }
            return a + (Number(row.amount ?? row.totalSalary) || 0);
        }, 0);
        const sumItems = (items) => (items ?? []).reduce((a, i) => {
            if (i.subHeads && i.subHeads.length > 0) {
                return a + i.subHeads.reduce((x, h) => x + (Number(h.amount) || 0), 0);
            }
            return a + (Number(i.amount) || 0);
        }, 0);
        const summarizeBalanceSheet = (data) => {
            const assetSections = data.assetSections ??
                [];
            const eqSections = data.equityLiabilitySections ?? [];
            const totalAssets = assetSections.reduce((a, s) => a + sumItems(s.items), 0);
            const equityItems = eqSections.find(s => (s.title ?? "").toLowerCase() === "equity")?.items ?? [];
            const totalEquity = sumItems(equityItems);
            const liabilitySections = eqSections.filter(s => (s.title ?? "").toLowerCase() !== "equity");
            const totalLiabilities = liabilitySections.reduce((a, s) => a + sumItems(s.items), 0);
            const totalEquityLiabilities = totalEquity + totalLiabilities;
            return {
                balanceSheetTotalAssets: totalAssets,
                balanceSheetTotalEquity: totalEquity,
                balanceSheetTotalLiabilities: totalLiabilities,
                balanceSheetEquityLiabilities: totalEquityLiabilities,
                balanceSheetDifference: totalAssets - totalEquityLiabilities,
            };
        };
        const cashRowNet = (row) => {
            let debit = 0;
            let credit = 0;
            for (const amt of Object.values(row.bankAmounts ?? {})) {
                debit += Number(amt?.debit) || 0;
                credit += Number(amt?.credit) || 0;
            }
            if (debit === 0 && credit === 0)
                return Number(row.netAmount) || 0;
            return debit - credit;
        };
        const summarizeCashFlow = (data) => {
            const months = data.months ?? [];
            return months.reduce((acc, m) => acc + m.rows.reduce((a, r) => a + cashRowNet(r), 0), 0);
        };
        const incomePartsFromRaw = async (raw, recordDate) => {
            const data = preparePageData("income_statement", await (0, loadStaffPayroll_1.applyStaffPayrollToIncomeData)(raw, recordDate));
            return {
                payroll: sumLines(data.teamSalaries),
                opex: sumLines(data.opexHeads),
                loans: sumLines(data.loanHeads),
                pf: sumLines(data.providentFundHeads),
            };
        };
        const assignIncomeSummaries = (target, parts) => {
            const expense = parts.payroll + parts.opex;
            target.currencyFormulaTotal = parts.currencyTotal ?? parts.revenue;
            target.incomeTotalRevenue = parts.revenue;
            target.incomePayroll = parts.payroll;
            target.incomeOpex = parts.opex;
            target.incomeLoans = parts.loans;
            target.incomeProvidentFund = parts.pf;
            target.incomeTotalExpense = expense;
            target.incomeNetProfit = parts.revenue - expense;
        };
        const summarizeTotalAssets = (data) => {
            const sumSections = (sections) => sections.reduce((a, s) => {
                if (s.subHeads && s.subHeads.length > 0) {
                    return a + s.subHeads.reduce((x, h) => x + (Number(h.amount) || 0), 0);
                }
                return a + (Number(s.total) || 0);
            }, 0);
            const companies = data.companies;
            if (companies && (companies.BEM || companies.GPS || companies.BDS)) {
                return (sumSections(companies.BEM ?? []) +
                    sumSections(companies.GPS ?? []) +
                    sumSections(companies.BDS ?? []));
            }
            const sections = data.sections ?? [];
            return sumSections(sections);
        };
        const summaries = {};
        const persistedPages = {};
        let recordDate = toDate;
        let dashData = (0, accountsDefaults_1.defaultAccountsData)("dashboard");
        let channelTotals = (0, currencyFormula_1.emptyCurrencyChannelNetTotals)();
        let paymentFx = (0, projectCurrencyCollections_1.emptyDayCollections)();
        if (useRange) {
            // Income Statement page in Month / Date Range shows the latest saved day
            // in that period (not a sum of every daily snapshot). Match that here.
            // All Time: latest IS day per calendar month, then sum those months.
            // Revenue: project collections once per calendar month (no day double-count).
            const flowWhere = mode === "all_time" ? { lte: toDate } : { gte: fromDate, lte: toDate };
            const stockWhere = mode === "all_time" ? { lte: toDate } : { gte: fromDate, lte: toDate };
            const rangeMonths = mode === "all_time" ? [] : (0, projectCurrencyCollections_1.yearMonthsInclusive)(fromDate, toDate);
            const rangeMonthStarts = rangeMonths.map(projectCurrencyCollections_1.monthStartIso);
            const dashWhere = mode === "all_time"
                ? { page: "dashboard", recordDate: { lte: toDate } }
                : {
                    page: "dashboard",
                    OR: [
                        { recordDate: { gte: fromDate, lte: toDate } },
                        { recordDate: { in: rangeMonthStarts } },
                    ],
                };
            const [dashRecs, isRecs, bsRecs, cfRecs, taRecs] = await Promise.all([
                db_1.default.accountsRecord.findMany({
                    where: dashWhere,
                    orderBy: { recordDate: "asc" },
                }),
                db_1.default.accountsRecord.findMany({
                    where: { page: "income_statement", recordDate: flowWhere },
                    orderBy: { recordDate: "asc" },
                }),
                db_1.default.accountsRecord.findMany({
                    where: { page: "balance_sheet", recordDate: stockWhere },
                    orderBy: { recordDate: "desc" },
                    take: 1,
                }),
                db_1.default.accountsRecord.findMany({
                    where: { page: "cash_flow", recordDate: stockWhere },
                    orderBy: { recordDate: "desc" },
                    take: 1,
                }),
                db_1.default.accountsRecord.findMany({
                    where: { page: "total_assets", recordDate: stockWhere },
                    orderBy: { recordDate: "desc" },
                    take: 1,
                }),
            ]);
            const paidMonths = mode === "all_time"
                ? [...(await (0, projectCurrencyCollections_1.aggregateAllCollectionMonths)()).keys()].filter(m => m <= toDate.slice(0, 7))
                : [];
            const collectionMonths = [
                ...new Set([
                    ...(mode === "all_time"
                        ? [
                            ...dashRecs.map(r => (0, projectCurrencyCollections_1.yearMonthFromDate)(r.recordDate)),
                            ...isRecs.map(r => (0, projectCurrencyCollections_1.yearMonthFromDate)(r.recordDate)),
                            ...paidMonths,
                        ]
                        : rangeMonths),
                ]),
            ];
            const collectionsByMonth = await (0, projectCurrencyCollections_1.aggregateCollectionsForMonths)(collectionMonths);
            paymentFx = (0, projectCurrencyCollections_1.sumDayCollections)(collectionsByMonth.values());
            const dashForMonth = (ym) => {
                const inMonth = dashRecs.filter(r => (0, projectCurrencyCollections_1.yearMonthFromDate)(r.recordDate) === ym);
                const picked = (0, accountsSnapshot_1.pickLatestMeaningful)(inMonth);
                const raw = picked?.data ??
                    (0, accountsDefaults_1.defaultAccountsData)("dashboard");
                return (0, projectCurrencyCollections_1.applyCollectionsToDashboardData)(raw, collectionsByMonth.get(ym) ?? (0, projectCurrencyCollections_1.emptyDayCollections)());
            };
            if (mode === "all_time") {
                const latestByMonth = (0, accountsSnapshot_1.pickLatestMeaningfulByMonth)(isRecs);
                let revenue = 0;
                let payroll = 0;
                let opex = 0;
                let loans = 0;
                let pf = 0;
                const monthsForFormula = latestByMonth.size > 0 ? [...latestByMonth.keys()] : collectionMonths;
                for (const ym of monthsForFormula) {
                    const dash = dashForMonth(ym);
                    revenue += (0, currencyFormula_1.currencyFormulaTotalFromDashboard)(dash);
                    channelTotals = (0, currencyFormula_1.addCurrencyChannelNetTotals)(channelTotals, dash);
                }
                for (const [, snap] of latestByMonth) {
                    const parts = await incomePartsFromRaw(snap.data, snap.recordDate);
                    payroll += parts.payroll;
                    opex += parts.opex;
                    loans += parts.loans;
                    pf += parts.pf;
                }
                assignIncomeSummaries(summaries, {
                    revenue,
                    currencyTotal: revenue,
                    payroll,
                    opex,
                    loans,
                    pf,
                });
            }
            else {
                // Month / date range: same snapshot the Income Statement page shows
                const latestIs = (0, accountsSnapshot_1.pickLatestMeaningful)(isRecs);
                const snapshotYm = latestIs
                    ? (0, projectCurrencyCollections_1.yearMonthFromDate)(latestIs.recordDate)
                    : (rangeMonths[rangeMonths.length - 1] ?? (0, projectCurrencyCollections_1.yearMonthFromDate)(toDate));
                const dash = dashForMonth(snapshotYm);
                const revenue = (0, currencyFormula_1.currencyFormulaTotalFromDashboard)(dash);
                channelTotals = (0, currencyFormula_1.addCurrencyChannelNetTotals)((0, currencyFormula_1.emptyCurrencyChannelNetTotals)(), dash);
                const parts = latestIs
                    ? await incomePartsFromRaw(latestIs.data, latestIs.recordDate)
                    : { payroll: 0, opex: 0, loans: 0, pf: 0 };
                assignIncomeSummaries(summaries, { revenue, payroll: parts.payroll, opex: parts.opex, loans: parts.loans, pf: parts.pf });
                if (latestIs)
                    recordDate = latestIs.recordDate;
            }
            const bs = bsRecs[0];
            persistedPages.balance_sheet = !!bs;
            Object.assign(summaries, summarizeBalanceSheet(preparePageData("balance_sheet", bs?.data ?? (0, accountsDefaults_1.defaultAccountsData)("balance_sheet"))));
            const cf = cfRecs[0];
            persistedPages.cash_flow = !!cf;
            summaries.cashFlowNet = summarizeCashFlow(preparePageData("cash_flow", cf?.data ?? (0, accountsDefaults_1.defaultAccountsData)("cash_flow")));
            const ta = taRecs[0];
            persistedPages.total_assets = !!ta;
            summaries.totalAssetsRegister = summarizeTotalAssets(preparePageData("total_assets", ta?.data ?? (0, accountsDefaults_1.defaultAccountsData)("total_assets")));
            persistedPages.income_statement = isRecs.length > 0;
            persistedPages.dashboard = dashRecs.length > 0;
            const latestDash = (0, accountsSnapshot_1.pickLatestMeaningful)(dashRecs);
            dashData = latestDash
                ? dashForMonth((0, projectCurrencyCollections_1.yearMonthFromDate)(latestDash.recordDate))
                : (0, accountsDefaults_1.defaultAccountsData)("dashboard");
            if (mode === "all_time")
                recordDate = toDate;
        }
        else {
            const pages = [
                "balance_sheet",
                "income_statement",
                "cash_flow",
                "total_assets",
            ];
            for (const page of pages) {
                const resolved = await (0, accountsSnapshot_1.resolveAccountsSnapshot)(page, toDate);
                const record = resolved.record;
                persistedPages[page] = !!record && !resolved.copiedFrom;
                const data = preparePageData(page, record?.data ?? (0, accountsDefaults_1.defaultAccountsData)(page));
                if (page === "balance_sheet") {
                    Object.assign(summaries, summarizeBalanceSheet(data));
                }
                else if (page === "income_statement") {
                    const dashResolved = await (0, accountsSnapshot_1.resolveAccountsSnapshot)("dashboard", toDate);
                    const dashRec = dashResolved.record;
                    const collections = await (0, projectCurrencyCollections_1.aggregateCollectionsForDate)(toDate);
                    const dashMerged = (0, projectCurrencyCollections_1.applyCollectionsToDashboardData)(dashRec?.data ?? (0, accountsDefaults_1.defaultAccountsData)("dashboard"), collections);
                    const revenue = (0, currencyFormula_1.currencyFormulaTotalFromDashboard)(dashMerged);
                    const parts = await incomePartsFromRaw(record?.data ?? (0, accountsDefaults_1.defaultAccountsData)(page), record?.recordDate ?? toDate);
                    assignIncomeSummaries(summaries, { revenue, ...parts });
                }
                else if (page === "cash_flow") {
                    summaries.cashFlowNet = summarizeCashFlow(data);
                }
                else if (page === "total_assets") {
                    summaries.totalAssetsRegister = summarizeTotalAssets(data);
                }
            }
            const dashResolved = await (0, accountsSnapshot_1.resolveAccountsSnapshot)("dashboard", toDate);
            const dash = dashResolved.record;
            const dayCollections = await (0, projectCurrencyCollections_1.aggregateCollectionsForDate)(toDate);
            paymentFx = dayCollections;
            dashData = (0, projectCurrencyCollections_1.applyCollectionsToDashboardData)(dash?.data ?? (0, accountsDefaults_1.defaultAccountsData)("dashboard"), dayCollections);
            channelTotals = (0, currencyFormula_1.addCurrencyChannelNetTotals)((0, currencyFormula_1.emptyCurrencyChannelNetTotals)(), dashData);
            persistedPages.dashboard = !!dash;
            recordDate = toDate;
        }
        return res.json({
            success: true,
            recordDate,
            mode: mode === "all_time" ? "all_time" : useRange ? "range" : "day",
            throughDate: toDate,
            fromDate: useRange && mode !== "all_time" ? fromDate : undefined,
            summaries,
            channels: channelTotals,
            channelFx: (0, projectCurrencyCollections_1.serializeChannelFx)(paymentFx),
            dashboard: dashData,
            persisted: {
                dashboard: !!persistedPages.dashboard,
                balance_sheet: !!persistedPages.balance_sheet,
                income_statement: !!persistedPages.income_statement,
                cash_flow: !!persistedPages.cash_flow,
                total_assets: !!persistedPages.total_assets,
            },
        });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Failed to load dashboard summary." });
    }
}
/**
 * Aggregate Income Statement actuals for a date/month range,
 * grouped into budget buckets (Sales combined, Technical combined, …).
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD  OR  ?start=2026-01&end=2026-03  OR  ?quarter=2026-Q1
 */
async function getIncomeBudgetActuals(req, res) {
    try {
        const quarter = String(req.query.quarter ?? "").trim();
        const fromQ = String(req.query.from ?? "").trim();
        const toQ = String(req.query.to ?? "").trim();
        let startMonth = String(req.query.start ?? "").trim();
        let endMonth = String(req.query.end ?? "").trim();
        let fromDate = "";
        let toDate = "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(fromQ) && /^\d{4}-\d{2}-\d{2}$/.test(toQ)) {
            fromDate = fromQ;
            toDate = toQ;
            startMonth = fromQ.slice(0, 7);
            endMonth = toQ.slice(0, 7);
        }
        else if (quarter) {
            const q = (0, incomeBudget_1.quarterMonths)(quarter);
            startMonth = q.startMonth;
            endMonth = q.endMonth;
        }
        if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) {
            return res.status(400).json({
                success: false,
                message: "Provide from/to (YYYY-MM-DD), quarter=YYYY-Qn, or start/end as YYYY-MM.",
            });
        }
        if (startMonth > endMonth) {
            return res.status(400).json({ success: false, message: "start must be ≤ end." });
        }
        if (!fromDate) {
            fromDate = `${startMonth}-01`;
            const [ey, em] = endMonth.split("-").map(Number);
            const lastDay = new Date(Date.UTC(ey, em, 0)).getUTCDate();
            toDate = `${endMonth}-${String(lastDay).padStart(2, "0")}`;
        }
        const [isRecs, dashRecs] = await Promise.all([
            db_1.default.accountsRecord.findMany({
                where: {
                    page: "income_statement",
                    recordDate: { gte: fromDate, lte: toDate },
                },
                select: { recordDate: true, data: true },
                orderBy: { recordDate: "asc" },
            }),
            db_1.default.accountsRecord.findMany({
                where: {
                    page: "dashboard",
                    recordDate: { gte: fromDate, lte: toDate },
                },
                select: { recordDate: true, data: true },
            }),
        ]);
        const collectionMonths = [
            ...new Set([
                ...dashRecs.map((r) => (0, projectCurrencyCollections_1.yearMonthFromDate)(r.recordDate)),
                ...isRecs.map((r) => (0, projectCurrencyCollections_1.yearMonthFromDate)(r.recordDate)),
            ]),
        ];
        const collectionsByMonth = await (0, projectCurrencyCollections_1.aggregateCollectionsForMonths)(collectionMonths);
        const dashForMonth = (ym) => {
            const inMonth = dashRecs.filter(r => (0, projectCurrencyCollections_1.yearMonthFromDate)(r.recordDate) === ym);
            const picked = (0, accountsSnapshot_1.pickLatestMeaningful)(inMonth);
            const raw = picked?.data ??
                (0, accountsDefaults_1.defaultAccountsData)("dashboard");
            return (0, projectCurrencyCollections_1.applyCollectionsToDashboardData)(raw, collectionsByMonth.get(ym) ?? (0, projectCurrencyCollections_1.emptyDayCollections)());
        };
        const actuals = (0, incomeBudget_1.emptyCoreActuals)();
        const byMonth = {};
        const opexHeadsTotal = {};
        const opexHeadsByMonth = {};
        // Latest non-empty day per calendar month (empty later days must not wipe OPEX).
        const latestByMonth = (0, accountsSnapshot_1.pickLatestMeaningfulByMonth)(isRecs);
        for (const [ym, snap] of latestByMonth) {
            byMonth[ym] = (0, incomeBudget_1.emptyCoreActuals)();
            opexHeadsByMonth[ym] = {};
            const data = prepareIncomeStatement(await (0, loadStaffPayroll_1.applyStaffPayrollToIncomeData)(snap.data, snap.recordDate));
            const revenue = (0, currencyFormula_1.currencyFormulaTotalFromDashboard)(dashForMonth(ym));
            (0, incomeBudget_1.accumulateCoreBudget)(data, actuals, revenue, snap.recordDate);
            (0, incomeBudget_1.accumulateCoreBudget)(data, byMonth[ym], revenue, snap.recordDate);
            (0, incomeBudget_1.accumulateOpexHeads)(data, opexHeadsTotal);
            (0, incomeBudget_1.accumulateOpexHeads)(data, opexHeadsByMonth[ym]);
        }
        const payroll = actuals.sales +
            actuals.sales_commission +
            actuals.technical +
            actuals.email_marketing +
            actuals.administration +
            actuals.executive +
            actuals.other_payroll;
        const opexTotal = Object.values(opexHeadsTotal).reduce((a, r) => a + r.amount, 0);
        const totalExpense = payroll + opexTotal;
        const netProfit = actuals.revenue - totalExpense;
        // Always expose default OPEX heads (even if no IS days / all zeros)
        for (const label of incomeBudget_1.DEFAULT_OPEX_HEAD_LABELS) {
            const key = (0, incomeBudget_1.opexHeadKey)(label);
            if (!opexHeadsTotal[key]) {
                opexHeadsTotal[key] = { key, headLabel: label, label, amount: 0 };
            }
        }
        const opexLines = Object.values(opexHeadsTotal)
            .sort((a, b) => a.label.localeCompare(b.label))
            .map(d => ({
            key: d.key,
            headLabel: d.headLabel,
            label: d.label,
            actual: d.amount,
            months: Object.fromEntries(Object.entries(opexHeadsByMonth).map(([ym, map]) => [ym, map[d.key]?.amount ?? 0])),
        }));
        return res.json({
            success: true,
            startMonth,
            endMonth,
            fromDate,
            toDate,
            daysRecorded: latestByMonth.size,
            actuals,
            byMonth,
            opexLines,
            totals: {
                payroll,
                opex: opexTotal,
                totalExpense,
                netProfit,
            },
            lines: [
                ...incomeBudget_1.CORE_BUDGET_LINE_DEFS.map(d => ({
                    key: d.key,
                    label: d.label,
                    kind: "core",
                    actual: actuals[d.key],
                    months: Object.fromEntries(Object.entries(byMonth).map(([ym, vals]) => [ym, vals[d.key]])),
                })),
                ...opexLines.map(d => ({
                    key: d.key,
                    label: d.label,
                    kind: "opex_head",
                    headLabel: d.headLabel,
                    actual: d.actual,
                    months: d.months,
                })),
            ],
        });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Failed to load budget actuals." });
    }
}
async function listEmployeeNameMerges(_req, res) {
    try {
        const pairs = await (0, employeeNameMerge_1.loadMergedNamePairs)();
        return res.json({
            success: true,
            merges: pairs.map(p => ({ from: p.from, to: p.to })),
        });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Failed to load name merges." });
    }
}
/** GET /api/accounts/income-statement/pf-breakdown?from=&to= */
async function getProvidentFundBreakdown(req, res) {
    try {
        const from = String(req.query.from ?? "").trim();
        const to = String(req.query.to ?? "").trim();
        const recs = await db_1.default.accountsRecord.findMany({
            where: { page: "income_statement" },
            select: { recordDate: true, data: true },
        });
        const pairs = await (0, employeeNameMerge_1.loadMergedNamePairs)();
        const byHead = {};
        const bump = (head, name, amount, inPeriod) => {
            const n = Number(amount) || 0;
            const trimmed = name.trim();
            if (!trimmed || n === 0)
                return;
            const resolved = (0, employeeNameMerge_1.resolveMergedName)(trimmed, pairs);
            const key = resolved.key;
            if (!key)
                return;
            if (!byHead[head])
                byHead[head] = {};
            const prev = byHead[head][key] ?? { name: resolved.name, period: 0, allTime: 0 };
            prev.name = resolved.name;
            prev.allTime = Math.round((prev.allTime + n) * 100) / 100;
            if (inPeriod)
                prev.period = Math.round((prev.period + n) * 100) / 100;
            byHead[head][key] = prev;
        };
        for (const rec of recs) {
            const inPeriod = (!from || rec.recordDate >= from) &&
                (!to || rec.recordDate <= to);
            const data = preparePageData("income_statement", rec.data ?? {});
            const heads = data.providentFundHeads ?? [];
            for (const head of heads) {
                const headLabel = (head.label || "Provident Fund").trim() || "Provident Fund";
                const subs = head.subHeads ?? [];
                const labels = subs.map(s => s.label || "");
                for (const sub of subs) {
                    const name = sub.label || "";
                    if ((0, pfNameAlias_1.pfHasLongerCanonical)(name, labels))
                        continue;
                    bump(headLabel, name, Number(sub.amount) || 0, inPeriod);
                }
            }
        }
        for (const head of Object.keys(byHead)) {
            byHead[head] = (0, pfNameAlias_1.collapsePfNameBuckets)(byHead[head]);
        }
        return res.json({
            success: true,
            from: from || null,
            to: to || null,
            byHead,
            nameMerges: pairs.map(p => ({ from: p.from, to: p.to })),
        });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Failed to load PF breakdown." });
    }
}
