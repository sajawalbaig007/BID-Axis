import { Response } from "express";
import { Prisma } from "@prisma/client";
import streamifier from "streamifier";
import prisma from "../config/db";
import cloudinary from "../config/cloudinary";
import { AuthRequest } from "../middleware/auth.middleware";
import {
  defaultAccountsData,
  isAccountsPageKey,
  isValidRecordDate,
  toPrismaAccountsPage,
  type AccountsPageKey,
} from "../utils/accountsDefaults";
import { mergeAccountsExcel } from "../utils/accountsExcelImport";
import {
  normalizeIncomeStatementData,
  recomputeExecutiveTeamInIncomeStatement,
} from "../utils/incomeStatementNormalize";
import { normalizeSalesPayrollData } from "../utils/salesPayrollDefaults";
import {
  normalizeTechnicalPayrollData,
  recomputeTechnicalTeamInIncomeStatement,
} from "../utils/technicalPayrollDefaults";
import { currencyFormulaTotalFromDashboard, emptyCurrencyChannelNetTotals, addCurrencyChannelNetTotals } from "../utils/currencyFormula";
import {
  aggregateCollectionsForDate,
  aggregateCollectionsForMonths,
  aggregateAllCollectionMonths,
  applyCollectionsToDashboardData,
  emptyDayCollections,
  sumDayCollections,
  serializeChannelFx,
  monthStartIso,
  monthEndIso,
  yearMonthFromDate,
  yearMonthsInclusive,
  pickLatestRecordOnOrBefore,
} from "../utils/projectCurrencyCollections";
import { accountsUploadFolder } from "../utils/accountsStorage";
import {
  accumulateCoreBudget,
  accumulateOpexHeads,
  CORE_BUDGET_LINE_DEFS,
  DEFAULT_OPEX_HEAD_LABELS,
  emptyCoreActuals,
  opexHeadKey,
  quarterMonths,
  type OpexHeadBucket,
} from "../utils/incomeBudget";
import { applyStaffPayrollToIncomeData } from "../utils/loadStaffPayroll";
import { collapsePfNameBuckets, pfHasLongerCanonical } from "../utils/pfNameAlias";
import { loadMergedNamePairs, resolveMergedName } from "../utils/employeeNameMerge";
import { estDateYmd } from "../utils/estTime";
import {
  hasMeaningfulAccountsData,
  pickLatestMeaningful,
  pickLatestMeaningfulByMonth,
  resolveAccountsSnapshot,
} from "../utils/accountsSnapshot";

function todayIsoDate(): string {
  return estDateYmd();
}

/** Full income-statement pipeline: sales-lead split → technical sync → executive commission. */
function prepareIncomeStatement(data: Record<string, unknown>): Record<string, unknown> {
  return recomputeExecutiveTeamInIncomeStatement(
    recomputeTechnicalTeamInIncomeStatement(normalizeIncomeStatementData(data)),
  );
}

/** Read existing record or return null — never auto-creates (avoids empty date pollution). */
async function findRecord(page: AccountsPageKey, recordDate: string) {
  return prisma.accountsRecord.findUnique({
    where: { page_recordDate: { page: toPrismaAccountsPage(page), recordDate } },
  });
}

/** Create only when an explicit write needs a row (upload / save already upserts). */
async function getOrCreateRecord(page: AccountsPageKey, recordDate: string, userId?: string) {
  const existing = await findRecord(page, recordDate);
  if (existing) return existing;

  return prisma.accountsRecord.create({
    data: {
      page: toPrismaAccountsPage(page),
      recordDate,
      data: defaultAccountsData(page) as Prisma.InputJsonValue,
      updatedBy: userId ?? null,
    },
  });
}

function preparePageData(page: AccountsPageKey, data: Record<string, unknown>): Record<string, unknown> {
  if (page === "income_statement") return prepareIncomeStatement(data);
  if (page === "technical_payroll") {
    return normalizeTechnicalPayrollData(data) as unknown as Record<string, unknown>;
  }
  if (page === "sales_payroll") {
    return normalizeSalesPayrollData(data) as unknown as Record<string, unknown>;
  }
  return data;
}

export async function listAccountsDates(req: AuthRequest, res: Response) {
  try {
    const pageParam = String(req.params.page ?? "");
    if (!isAccountsPageKey(pageParam)) {
      return res.status(400).json({ success: false, message: "Invalid accounts page." });
    }

    const from = String(req.query.from ?? "").trim();
    const to = String(req.query.to ?? "").trim();

    const where: { page: ReturnType<typeof toPrismaAccountsPage>; recordDate?: { gte?: string; lte?: string } } = {
      page: toPrismaAccountsPage(pageParam),
    };
    if (from || to) {
      where.recordDate = {};
      if (from) where.recordDate.gte = from;
      if (to) where.recordDate.lte = to;
    }

    const records = await prisma.accountsRecord.findMany({
      where,
      select: { recordDate: true, updatedAt: true, data: true },
      orderBy: { recordDate: "desc" },
    });
    const visible = records.filter(r => hasMeaningfulAccountsData(r.data));

    return res.json({
      success: true,
      dates: visible.map(r => r.recordDate),
      records: visible.map(r => ({
        recordDate: r.recordDate,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to list account dates." });
  }
}

export async function getAccountsRecord(req: AuthRequest, res: Response) {
  try {
    const pageParam = String(req.params.page ?? "");
    const recordDate = String(req.params.date ?? "").trim();

    if (!isAccountsPageKey(pageParam)) {
      return res.status(400).json({ success: false, message: "Invalid accounts page." });
    }
    if (!isValidRecordDate(recordDate)) {
      return res.status(400).json({ success: false, message: "Invalid date. Use YYYY-MM-DD." });
    }

    const resolved = await resolveAccountsSnapshot(pageParam, recordDate);
    const record = resolved.record;
    let raw = (record?.data as Record<string, unknown> | undefined) ?? defaultAccountsData(pageParam);
    if (pageParam === "income_statement") {
      raw = await applyStaffPayrollToIncomeData(raw, recordDate);
    }
    let responseData = preparePageData(pageParam, raw);

    if (pageParam === "dashboard") {
      const collections = await aggregateCollectionsForDate(recordDate);
      responseData = applyCollectionsToDashboardData(responseData, collections);
    }

    const uploads = await prisma.accountsFileUpload.findMany({
      where: { page: toPrismaAccountsPage(pageParam), recordDate },
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
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to load accounts record." });
  }
}

export async function saveAccountsRecord(req: AuthRequest, res: Response) {
  try {
    const pageParam = String(req.params.page ?? "");
    const recordDate = String(req.params.date ?? "").trim();
    const { data } = req.body as { data?: Record<string, unknown> };

    if (!isAccountsPageKey(pageParam)) {
      return res.status(400).json({ success: false, message: "Invalid accounts page." });
    }
    if (!isValidRecordDate(recordDate)) {
      return res.status(400).json({ success: false, message: "Invalid date. Use YYYY-MM-DD." });
    }
    if (!data || typeof data !== "object") {
      return res.status(400).json({ success: false, message: "Missing data payload." });
    }

    let incoming = data;
    if (pageParam === "income_statement") {
      incoming = await applyStaffPayrollToIncomeData(data, recordDate);
    }
    let payload = preparePageData(pageParam, incoming);

    if (pageParam === "dashboard") {
      const collections = await aggregateCollectionsForDate(recordDate);
      payload = applyCollectionsToDashboardData(payload, collections);
    }

    const prismaPage = toPrismaAccountsPage(pageParam);
    const record = await prisma.accountsRecord.upsert({
      where: { page_recordDate: { page: prismaPage, recordDate } },
      create: {
        page: prismaPage,
        recordDate,
        data: payload as Prisma.InputJsonValue,
        updatedBy: req.user?.id ?? null,
      },
      update: {
        data: payload as Prisma.InputJsonValue,
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
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to save accounts record." });
  }
}

export async function uploadAccountsFile(
  req: AuthRequest & { file?: Express.Multer.File },
  res: Response,
) {
  try {
    const pageParam = String(req.params.page ?? "");
    const recordDate = String(req.params.date ?? "").trim();
    const file = req.file;

    if (!isAccountsPageKey(pageParam)) {
      return res.status(400).json({ success: false, message: "Invalid accounts page." });
    }
    if (!isValidRecordDate(recordDate)) {
      return res.status(400).json({ success: false, message: "Invalid date. Use YYYY-MM-DD." });
    }
    if (!file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    const uploaded = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: accountsUploadFolder({
            page: pageParam,
            fileName: file.originalname,
            mimeType: file.mimetype,
          }),
          resource_type: "auto",
        },
        (error, result) => {
          if (error || !result) reject(error ?? new Error("Upload failed"));
          else resolve(result as { secure_url: string });
        },
      );
      streamifier.createReadStream(file.buffer).pipe(stream);
    });

    const uploadRow = await prisma.accountsFileUpload.create({
      data: {
        page: toPrismaAccountsPage(pageParam),
        recordDate,
        fileName: file.originalname,
        fileUrl: uploaded.secure_url,
        mimeType: file.mimetype,
        uploadedBy: req.user.id,
      },
    });

    let mergedData: Record<string, unknown> | undefined;
    const name = file.originalname.toLowerCase();
    const isSheet = name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv");

    if (isSheet) {
      const record = await getOrCreateRecord(pageParam, recordDate, req.user.id);
      mergedData = preparePageData(
        pageParam,
        mergeAccountsExcel(
        pageParam,
        (record.data as Record<string, unknown>) ?? defaultAccountsData(pageParam),
        file.buffer,
        ),
      );
      await prisma.accountsRecord.upsert({
        where: { page_recordDate: { page: toPrismaAccountsPage(pageParam), recordDate } },
        create: {
          page: toPrismaAccountsPage(pageParam),
          recordDate,
          data: mergedData as Prisma.InputJsonValue,
          updatedBy: req.user.id,
        },
        update: { data: mergedData as Prisma.InputJsonValue, updatedBy: req.user.id },
      });
    }

    const uploads = await prisma.accountsFileUpload.findMany({
      where: { page: toPrismaAccountsPage(pageParam), recordDate },
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
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to upload accounts file." });
  }
}

export async function getAccountsDashboardSummary(req: AuthRequest, res: Response) {
  try {
    const mode = String(req.query.mode ?? "day").trim().toLowerCase();
    const toDate = String(req.query.to ?? req.query.date ?? todayIsoDate()).trim();
    const fromDate = String(req.query.from ?? "").trim();
    if (!isValidRecordDate(toDate)) {
      return res.status(400).json({ success: false, message: "Invalid date." });
    }
    const useRange = mode === "all_time" || mode === "range" || mode === "month";
    if (useRange && mode !== "all_time") {
      if (!isValidRecordDate(fromDate)) {
        return res.status(400).json({ success: false, message: "Invalid from date." });
      }
    }

    const sumLines = (
      rows: Array<{ amount?: number; totalSalary?: number; subHeads?: Array<{ amount?: number }> }> | undefined,
    ) =>
      (rows ?? []).reduce((a, row) => {
        if (row.subHeads && row.subHeads.length > 0) {
          return a + row.subHeads.reduce((x, h) => x + (Number(h.amount) || 0), 0);
        }
        return a + (Number(row.amount ?? row.totalSalary) || 0);
      }, 0);

    const sumItems = (
      items: Array<{ amount?: number; subHeads?: Array<{ amount?: number }> }> | undefined,
    ) =>
      (items ?? []).reduce((a, i) => {
        if (i.subHeads && i.subHeads.length > 0) {
          return a + i.subHeads.reduce((x, h) => x + (Number(h.amount) || 0), 0);
        }
        return a + (Number(i.amount) || 0);
      }, 0);

    const summarizeBalanceSheet = (data: Record<string, unknown>) => {
      const assetSections =
        (data.assetSections as Array<{ items?: Array<{ amount?: number; subHeads?: Array<{ amount?: number }> }> }>) ??
        [];
      const eqSections =
        (data.equityLiabilitySections as Array<{
          title?: string;
          items?: Array<{ amount?: number; subHeads?: Array<{ amount?: number }> }>;
        }>) ?? [];
      const totalAssets = assetSections.reduce((a, s) => a + sumItems(s.items), 0);
      const equityItems =
        eqSections.find(s => (s.title ?? "").toLowerCase() === "equity")?.items ?? [];
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

    const cashRowNet = (row: {
      netAmount?: number;
      bankAmounts?: Record<string, { debit?: number; credit?: number }>;
    }) => {
      let debit = 0;
      let credit = 0;
      for (const amt of Object.values(row.bankAmounts ?? {})) {
        debit += Number(amt?.debit) || 0;
        credit += Number(amt?.credit) || 0;
      }
      if (debit === 0 && credit === 0) return Number(row.netAmount) || 0;
      return debit - credit;
    };

    const summarizeCashFlow = (data: Record<string, unknown>) => {
      const months =
        (data.months as Array<{
          rows: Array<{
            netAmount?: number;
            bankAmounts?: Record<string, { debit?: number; credit?: number }>;
          }>;
        }>) ?? [];
      return months.reduce(
        (acc, m) => acc + m.rows.reduce((a, r) => a + cashRowNet(r), 0),
        0,
      );
    };

    const incomePartsFromRaw = async (raw: Record<string, unknown>, recordDate: string) => {
      const data = preparePageData(
        "income_statement",
        await applyStaffPayrollToIncomeData(raw, recordDate),
      );
      return {
        payroll: sumLines(
          data.teamSalaries as Array<{ totalSalary?: number; subHeads?: Array<{ amount?: number }> }>,
        ),
        opex: sumLines(data.opexHeads as Array<{ amount?: number; subHeads?: Array<{ amount?: number }> }>),
        loans: sumLines(data.loanHeads as Array<{ amount?: number; subHeads?: Array<{ amount?: number }> }>),
        pf: sumLines(
          data.providentFundHeads as Array<{ amount?: number; subHeads?: Array<{ amount?: number }> }>,
        ),
      };
    };

    const assignIncomeSummaries = (
      target: Record<string, number>,
      parts: {
        revenue: number;
        currencyTotal?: number;
        payroll: number;
        opex: number;
        loans: number;
        pf: number;
      },
    ) => {
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

    const summarizeTotalAssets = (data: Record<string, unknown>) => {
      const sumSections = (sections: Array<{ total?: number; subHeads?: Array<{ amount?: number }> }>) =>
        sections.reduce((a, s) => {
          if (s.subHeads && s.subHeads.length > 0) {
            return a + s.subHeads.reduce((x, h) => x + (Number(h.amount) || 0), 0);
          }
          return a + (Number(s.total) || 0);
        }, 0);
      const companies = data.companies as
        | Record<string, Array<{ total?: number; subHeads?: Array<{ amount?: number }> }>>
        | undefined;
      if (companies && (companies.BEM || companies.GPS || companies.BDS)) {
        return (
          sumSections(companies.BEM ?? []) +
          sumSections(companies.GPS ?? []) +
          sumSections(companies.BDS ?? [])
        );
      }
      const sections = (data.sections as Array<{ total?: number; subHeads?: Array<{ amount?: number }> }>) ?? [];
      return sumSections(sections);
    };

    const summaries: Record<string, number> = {};
    const persistedPages: Record<string, boolean> = {};
    let recordDate = toDate;
    let dashData: Record<string, unknown> = defaultAccountsData("dashboard");
    let channelTotals = emptyCurrencyChannelNetTotals();
    let paymentFx = emptyDayCollections();

    if (useRange) {
      // Income Statement page in Month / Date Range shows the latest saved day
      // in that period (not a sum of every daily snapshot). Match that here.
      // All Time: latest IS day per calendar month, then sum those months.
      // Revenue: project collections once per calendar month (no day double-count).
      const flowWhere =
        mode === "all_time" ? { lte: toDate } : { gte: fromDate, lte: toDate };
      const stockWhere =
        mode === "all_time" ? { lte: toDate } : { gte: fromDate, lte: toDate };
      const rangeMonths = mode === "all_time" ? [] : yearMonthsInclusive(fromDate, toDate);
      const rangeMonthStarts = rangeMonths.map(monthStartIso);
      const dashWhere =
        mode === "all_time"
          ? { page: "dashboard" as const, recordDate: { lte: toDate } }
          : {
              page: "dashboard" as const,
              OR: [
                { recordDate: { gte: fromDate, lte: toDate } },
                { recordDate: { in: rangeMonthStarts } },
              ],
            };

      const [dashRecs, isRecs, bsRecs, cfRecs, taRecs] = await Promise.all([
        prisma.accountsRecord.findMany({
          where: dashWhere,
          orderBy: { recordDate: "asc" },
        }),
        prisma.accountsRecord.findMany({
          where: { page: "income_statement", recordDate: flowWhere },
          orderBy: { recordDate: "asc" },
        }),
        prisma.accountsRecord.findMany({
          where: { page: "balance_sheet", recordDate: stockWhere },
          orderBy: { recordDate: "desc" },
          take: 1,
        }),
        prisma.accountsRecord.findMany({
          where: { page: "cash_flow", recordDate: stockWhere },
          orderBy: { recordDate: "desc" },
          take: 1,
        }),
        prisma.accountsRecord.findMany({
          where: { page: "total_assets", recordDate: stockWhere },
          orderBy: { recordDate: "desc" },
          take: 1,
        }),
      ]);

      const paidMonths =
        mode === "all_time"
          ? [...(await aggregateAllCollectionMonths()).keys()].filter(m => m <= toDate.slice(0, 7))
          : [];
      const collectionMonths = [
        ...new Set([
          ...(mode === "all_time"
            ? [
                ...dashRecs.map(r => yearMonthFromDate(r.recordDate)),
                ...isRecs.map(r => yearMonthFromDate(r.recordDate)),
                ...paidMonths,
              ]
            : rangeMonths),
        ]),
      ];
      const collectionsByMonth = await aggregateCollectionsForMonths(collectionMonths);
      paymentFx = sumDayCollections(collectionsByMonth.values());
      const rateSeed =
        mode === "all_time"
          ? null
          : await prisma.accountsRecord.findFirst({
              where: { page: "dashboard", recordDate: { lt: fromDate } },
              orderBy: { recordDate: "desc" },
            });
      const rateHistory = rateSeed ? [rateSeed, ...dashRecs] : dashRecs;
      const dashForMonth = (ym: string) => {
        const picked = pickLatestRecordOnOrBefore(rateHistory, monthEndIso(ym));
        const raw =
          (picked?.data as Record<string, unknown> | undefined) ??
          defaultAccountsData("dashboard");
        return applyCollectionsToDashboardData(
          raw,
          collectionsByMonth.get(ym) ?? emptyDayCollections(),
        );
      };

      if (mode === "all_time") {
        const latestByMonth = pickLatestMeaningfulByMonth(isRecs);
        let revenue = 0;
        let payroll = 0;
        let opex = 0;
        let loans = 0;
        let pf = 0;
        const monthsForFormula = latestByMonth.size > 0 ? [...latestByMonth.keys()] : collectionMonths;
        for (const ym of monthsForFormula) {
          const dash = dashForMonth(ym);
          revenue += currencyFormulaTotalFromDashboard(dash);
          channelTotals = addCurrencyChannelNetTotals(channelTotals, dash);
        }
        for (const [, snap] of latestByMonth) {
          const parts = await incomePartsFromRaw(
            snap.data as Record<string, unknown>,
            snap.recordDate,
          );
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
      } else {
        // Month / date range: same snapshot the Income Statement page shows
        const latestIs = pickLatestMeaningful(isRecs);
        const snapshotYm = latestIs
          ? yearMonthFromDate(latestIs.recordDate)
          : (rangeMonths[rangeMonths.length - 1] ?? yearMonthFromDate(toDate));
        const dash = dashForMonth(snapshotYm);
        const revenue = currencyFormulaTotalFromDashboard(dash);
        channelTotals = addCurrencyChannelNetTotals(emptyCurrencyChannelNetTotals(), dash);
        const parts = latestIs
          ? await incomePartsFromRaw(latestIs.data as Record<string, unknown>, latestIs.recordDate)
          : { payroll: 0, opex: 0, loans: 0, pf: 0 };
        assignIncomeSummaries(summaries, { revenue, payroll: parts.payroll, opex: parts.opex, loans: parts.loans, pf: parts.pf });
        if (latestIs) recordDate = latestIs.recordDate;
        dashData = dash;
      }

      const bs = bsRecs[0];
      persistedPages.balance_sheet = !!bs;
      Object.assign(
        summaries,
        summarizeBalanceSheet(
          preparePageData(
            "balance_sheet",
            (bs?.data as Record<string, unknown> | undefined) ?? defaultAccountsData("balance_sheet"),
          ),
        ),
      );

      const cf = cfRecs[0];
      persistedPages.cash_flow = !!cf;
      summaries.cashFlowNet = summarizeCashFlow(
        preparePageData(
          "cash_flow",
          (cf?.data as Record<string, unknown> | undefined) ?? defaultAccountsData("cash_flow"),
        ),
      );

      const ta = taRecs[0];
      persistedPages.total_assets = !!ta;
      summaries.totalAssetsRegister = summarizeTotalAssets(
        preparePageData(
          "total_assets",
          (ta?.data as Record<string, unknown> | undefined) ?? defaultAccountsData("total_assets"),
        ),
      );

      persistedPages.income_statement = isRecs.length > 0;
      persistedPages.dashboard = dashRecs.length > 0;
      if (mode === "all_time") {
        const latestDash = pickLatestMeaningful(dashRecs);
        dashData = latestDash
          ? dashForMonth(yearMonthFromDate(latestDash.recordDate))
          : defaultAccountsData("dashboard");
        recordDate = toDate;
      }
    } else {
    const pages: AccountsPageKey[] = [
      "balance_sheet",
      "income_statement",
      "cash_flow",
      "total_assets",
    ];

    for (const page of pages) {
        const resolved = await resolveAccountsSnapshot(page, toDate);
        const record = resolved.record;
        persistedPages[page] = !!record && !resolved.copiedFrom;
        const data = preparePageData(
          page,
          (record?.data as Record<string, unknown> | undefined) ?? defaultAccountsData(page),
        );

        if (page === "balance_sheet") {
          Object.assign(summaries, summarizeBalanceSheet(data));
      } else if (page === "income_statement") {
          const dashResolved = await resolveAccountsSnapshot("dashboard", toDate);
          const dashRec = dashResolved.record;
          const collections = await aggregateCollectionsForDate(toDate);
          const dashMerged = applyCollectionsToDashboardData(
            (dashRec?.data as Record<string, unknown> | undefined) ?? defaultAccountsData("dashboard"),
            collections,
          );
          const revenue = currencyFormulaTotalFromDashboard(dashMerged);
          const parts = await incomePartsFromRaw(
            (record?.data as Record<string, unknown> | undefined) ?? defaultAccountsData(page),
            record?.recordDate ?? toDate,
          );
          assignIncomeSummaries(summaries, { revenue, ...parts });
      } else if (page === "cash_flow") {
          summaries.cashFlowNet = summarizeCashFlow(data);
      } else if (page === "total_assets") {
          summaries.totalAssetsRegister = summarizeTotalAssets(data);
        }
      }

      const dashResolved = await resolveAccountsSnapshot("dashboard", toDate);
      let dash = dashResolved.record;
      if (!dash) {
        dash = await prisma.accountsRecord.findFirst({
          where: { page: "dashboard", recordDate: { lt: toDate } },
          orderBy: { recordDate: "desc" },
        });
      }
      const dayCollections = await aggregateCollectionsForDate(toDate);
      paymentFx = dayCollections;
      dashData = applyCollectionsToDashboardData(
        (dash?.data as Record<string, unknown> | undefined) ?? defaultAccountsData("dashboard"),
        dayCollections,
      );
      channelTotals = addCurrencyChannelNetTotals(emptyCurrencyChannelNetTotals(), dashData);
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
      channelFx: serializeChannelFx(paymentFx),
      dashboard: dashData,
      persisted: {
        dashboard: !!persistedPages.dashboard,
        balance_sheet: !!persistedPages.balance_sheet,
        income_statement: !!persistedPages.income_statement,
        cash_flow: !!persistedPages.cash_flow,
        total_assets: !!persistedPages.total_assets,
      },
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to load dashboard summary." });
  }
}

/**
 * Aggregate Income Statement actuals for a date/month range,
 * grouped into budget buckets (Sales combined, Technical combined, …).
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD  OR  ?start=2026-01&end=2026-03  OR  ?quarter=2026-Q1
 */
export async function getIncomeBudgetActuals(req: AuthRequest, res: Response) {
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
    } else if (quarter) {
      const q = quarterMonths(quarter);
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
      const lastDay = new Date(Date.UTC(ey!, em!, 0)).getUTCDate();
      toDate = `${endMonth}-${String(lastDay).padStart(2, "0")}`;
    }

    const [isRecs, dashRecs] = await Promise.all([
      prisma.accountsRecord.findMany({
        where: {
          page: "income_statement",
          recordDate: { gte: fromDate, lte: toDate },
        },
        select: { recordDate: true, data: true },
        orderBy: { recordDate: "asc" },
      }),
      prisma.accountsRecord.findMany({
        where: {
          page: "dashboard",
          recordDate: { gte: fromDate, lte: toDate },
        },
        select: { recordDate: true, data: true },
      }),
    ]);

    const collectionMonths = [
      ...new Set([
        ...dashRecs.map((r) => yearMonthFromDate(r.recordDate)),
        ...isRecs.map((r) => yearMonthFromDate(r.recordDate)),
      ]),
    ];
    const collectionsByMonth = await aggregateCollectionsForMonths(collectionMonths);
    const rateSeed = await prisma.accountsRecord.findFirst({
      where: { page: "dashboard", recordDate: { lt: fromDate } },
      orderBy: { recordDate: "desc" },
    });
    const rateHistory = rateSeed ? [rateSeed, ...dashRecs] : dashRecs;
    const dashForMonth = (ym: string) => {
      const picked = pickLatestRecordOnOrBefore(rateHistory, monthEndIso(ym));
      const raw =
        (picked?.data as Record<string, unknown> | undefined) ??
        defaultAccountsData("dashboard");
      return applyCollectionsToDashboardData(
        raw,
        collectionsByMonth.get(ym) ?? emptyDayCollections(),
      );
    };

    const actuals = emptyCoreActuals();
    const byMonth: Record<string, ReturnType<typeof emptyCoreActuals>> = {};
    const opexHeadsTotal: Record<string, OpexHeadBucket> = {};
    const opexHeadsByMonth: Record<string, Record<string, OpexHeadBucket>> = {};

    // Latest non-empty day per calendar month (empty later days must not wipe OPEX).
    const latestByMonth = pickLatestMeaningfulByMonth(isRecs);

    for (const [ym, snap] of latestByMonth) {
      byMonth[ym] = emptyCoreActuals();
      opexHeadsByMonth[ym] = {};
      const data = prepareIncomeStatement(
        await applyStaffPayrollToIncomeData(snap.data as Record<string, unknown>, snap.recordDate),
      );
      const revenue = currencyFormulaTotalFromDashboard(dashForMonth(ym));
      accumulateCoreBudget(data, actuals, revenue, snap.recordDate);
      accumulateCoreBudget(data, byMonth[ym]!, revenue, snap.recordDate);
      accumulateOpexHeads(data, opexHeadsTotal);
      accumulateOpexHeads(data, opexHeadsByMonth[ym]!);
    }

    const payroll =
      actuals.sales +
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
    for (const label of DEFAULT_OPEX_HEAD_LABELS) {
      const key = opexHeadKey(label);
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
        months: Object.fromEntries(
          Object.entries(opexHeadsByMonth).map(([ym, map]) => [ym, map[d.key]?.amount ?? 0]),
        ),
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
        ...CORE_BUDGET_LINE_DEFS.map(d => ({
          key: d.key,
          label: d.label,
          kind: "core" as const,
          actual: actuals[d.key],
          months: Object.fromEntries(
            Object.entries(byMonth).map(([ym, vals]) => [ym, vals[d.key]]),
          ),
        })),
        ...opexLines.map(d => ({
          key: d.key,
          label: d.label,
          kind: "opex_head" as const,
          headLabel: d.headLabel,
          actual: d.actual,
          months: d.months,
        })),
      ],
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to load budget actuals." });
  }
}

export async function listEmployeeNameMerges(_req: AuthRequest, res: Response) {
  try {
    const pairs = await loadMergedNamePairs();
    return res.json({
      success: true,
      merges: pairs.map(p => ({ from: p.from, to: p.to })),
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to load name merges." });
  }
}

type PfHeadBucket = Record<string, { name: string; period: number; allTime: number }>;

/** GET /api/accounts/income-statement/pf-breakdown?from=&to= */
export async function getProvidentFundBreakdown(req: AuthRequest, res: Response) {
  try {
    const from = String(req.query.from ?? "").trim();
    const to = String(req.query.to ?? "").trim();
    const recs = await prisma.accountsRecord.findMany({
      where: { page: "income_statement" },
      select: { recordDate: true, data: true },
    });

    const pairs = await loadMergedNamePairs();
    const byHead: Record<string, PfHeadBucket> = {};
    const bump = (head: string, name: string, amount: number, inPeriod: boolean) => {
      const n = Number(amount) || 0;
      const trimmed = name.trim();
      if (!trimmed || n === 0) return;
      const resolved = resolveMergedName(trimmed, pairs);
      const key = resolved.key;
      if (!key) return;
      if (!byHead[head]) byHead[head] = {};
      const prev = byHead[head]![key] ?? { name: resolved.name, period: 0, allTime: 0 };
      prev.name = resolved.name;
      prev.allTime = Math.round((prev.allTime + n) * 100) / 100;
      if (inPeriod) prev.period = Math.round((prev.period + n) * 100) / 100;
      byHead[head]![key] = prev;
    };

    for (const rec of recs) {
      const inPeriod =
        (!from || rec.recordDate >= from) &&
        (!to || rec.recordDate <= to);
      const data = preparePageData(
        "income_statement",
        (rec.data as Record<string, unknown> | undefined) ?? {},
      );
      const heads = (data.providentFundHeads as Array<{
        label?: string;
        subHeads?: Array<{ label?: string; amount?: number }>;
      }>) ?? [];
      for (const head of heads) {
        const headLabel = (head.label || "Provident Fund").trim() || "Provident Fund";
        const subs = head.subHeads ?? [];
        const labels = subs.map(s => s.label || "");
        for (const sub of subs) {
          const name = sub.label || "";
          if (pfHasLongerCanonical(name, labels)) continue;
          bump(headLabel, name, Number(sub.amount) || 0, inPeriod);
        }
      }
    }

    for (const head of Object.keys(byHead)) {
      byHead[head] = collapsePfNameBuckets(byHead[head]!);
    }

    return res.json({
      success: true,
      from: from || null,
      to: to || null,
      byHead,
      nameMerges: pairs.map(p => ({ from: p.from, to: p.to })),
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to load PF breakdown." });
  }
}
