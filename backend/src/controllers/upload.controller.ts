import { Request, Response } from "express";
import prisma from "../config/db";
import cloudinary from "../config/cloudinary";
import { invalidateCache, flushAdminClientsCache } from "../utils/cache";
import {
  readExcelRows,
  parseLeadRows,
  classifyRows,
} from "../utils/uploadExcelParse";
import { resolveUploadCategory, isUploadCategory, UPLOAD_CATEGORIES, inferUploadCategoryFromLead, type UploadCategory } from "../utils/uploadCategory";
import { isWonClientUploadStatus, clearPendingDuplicatesForPhone, reconcileClientOldFlagsForCsr } from "../utils/leadClientPromotion";
import { seedLeadNotesFromCommentsForFile } from "../utils/leadNotes";
import { deleteLeadsCascade, invalidateAllLeadCaches } from "../utils/deleteLeadsCascade";
import { ADMIN_UPLOAD_SOURCE_SELECT } from "../utils/uploadSourceSelect";
import { findLeadsByPhonesBulk } from "../utils/leadPhoneLookup";
import { parseSubContactsCell, parseTradeList, insertMissingTrades } from "../utils/masterFormatTrades";
import type { ParsedLeadRow } from "../utils/uploadExcelParse";
import { estDateYmd } from "../utils/estTime";

const CHUNK_INSERT = 500;
const CHUNK_INSERT_LARGE = 1500;
const BATCH_UPDATE = 30;

/** Many different values per id — one Mongo update command instead of N round-trips. */
async function bulkSetLeadFields(updates: { id: string; data: Record<string, string> }[]) {
  const CHUNK = 1000;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    await prisma.$runCommandRaw({
      update: "Lead",
      updates: slice.map(u => ({
        q: { _id: u.id },
        u: { $set: u.data },
      })),
      ordered: false,
    });
  }
}

async function createLeadsChunked(
  rows: Record<string, unknown>[],
  chunk: number,
  parallel: number,
) {
  const slices: Record<string, unknown>[][] = [];
  for (let i = 0; i < rows.length; i += chunk) slices.push(rows.slice(i, i + chunk));
  let cursor = 0;
  const worker = async () => {
    while (cursor < slices.length) {
      const batch = slices[cursor++];
      if (!batch?.length) break;
      await prisma.lead.createMany({ data: batch as never });
    }
  };
  const workers = Math.max(1, Math.min(parallel, slices.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

async function upsertTradesFromRows(rawValues: (string | null | undefined)[]) {
  const names = new Set<string>();
  for (const raw of rawValues) {
    for (const t of parseTradeList(raw)) names.add(t);
  }
  if (names.size === 0) return;
  await insertMissingTrades([...names]);
}

async function attachExcelSubContacts(uploadedFileId: string, rows: ParsedLeadRow[]) {
  const withContacts = rows.filter(r => r.subContactsRaw?.trim());
  if (withContacts.length === 0) return;

  const created = await prisma.lead.findMany({
    where: { uploadedFileId },
    select: { id: true, phone: true, name: true, email: true },
  });

  const byPhone = new Map<string, typeof created>();
  const byNameEmail = new Map<string, typeof created>();
  const byName = new Map<string, typeof created>();
  const pushMap = (map: Map<string, typeof created>, key: string, lead: (typeof created)[number]) => {
    const list = map.get(key);
    if (list) list.push(lead);
    else map.set(key, [lead]);
  };
  for (const lead of created) {
    if (lead.phone) pushMap(byPhone, lead.phone, lead);
    if (lead.name && lead.email) pushMap(byNameEmail, `${lead.name}::${lead.email}`, lead);
    if (lead.name) pushMap(byName, lead.name, lead);
  }

  const used = new Set<string>();
  const payloads: { leadId: string; name: string; designation?: string; phone?: string; email?: string }[] = [];
  const takeUnused = (list: typeof created | undefined) => list?.find(l => !used.has(l.id));

  for (const row of withContacts) {
    const contacts = parseSubContactsCell(row.subContactsRaw);
    if (contacts.length === 0) continue;
    const lead =
      (row.phone ? takeUnused(byPhone.get(row.phone)) : undefined) ||
      (row.name && row.email ? takeUnused(byNameEmail.get(`${row.name}::${row.email}`)) : undefined) ||
      (row.name ? takeUnused(byName.get(row.name)) : undefined);
    if (!lead) continue;
    used.add(lead.id);
    for (const c of contacts) {
      payloads.push({
        leadId: lead.id,
        name: c.name,
        designation: c.designation,
        phone: c.phone,
        email: c.email,
      });
    }
  }

  if (payloads.length === 0) return;
  await prisma.subContact.createMany({ data: payloads });
}

async function attachSubContactsToLead(leadId: string, raw: string | null | undefined) {
  const contacts = parseSubContactsCell(raw);
  if (contacts.length === 0) return;
  await prisma.subContact.createMany({
    data: contacts.map(c => ({
      leadId,
      name: c.name,
      designation: c.designation,
      phone: c.phone,
      email: c.email,
    })),
  });
}

/** Clear bin flags when upload restores / moves a lead onto a target page */
const CLEAR_BIN = {
  inBin: false,
  binReason: null,
  binPreviousStatus: null,
  notInterestedCount: 0,
  notPickedCount: 0,
} as const;

/** Cloudinary sub-folder under crm_uploads based on upload type */
function getCloudinaryFolder(leadType: string, initialStatuses: string[]): string {
  const status = (initialStatuses[0] ?? "").toLowerCase();

  if (leadType === "active") return "crm_uploads/active-projects";
  if (leadType === "old" || status === "important") return "crm_uploads/old-clients";
  if (leadType === "new" || status === "interested") return "crm_uploads/new-clients";
  if (status === "pending") return "crm_uploads/call-data";
  if (status === "close client") {
    return leadType === "old" ? "crm_uploads/old-clients" : "crm_uploads/new-clients";
  }
  return "crm_uploads/call-data";
}

function uploadRawBuffer(buffer: Buffer, folder: string, publicId?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          resource_type: "raw",
          folder,
          ...(publicId ? { public_id: publicId, format: "json" } : {}),
        },
        (error, result) => {
          if (error || !result) reject(error);
          else resolve(result.secure_url);
        }
      )
      .end(buffer);
  });
}

async function runBatched<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

/** Merge comma/slash-separated interested services from multiple leads. */
function mergeInterestedServiceStrings(values: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of values) {
    if (!raw?.trim()) continue;
    for (const part of raw.split(/\s*(?:\/|,|;|\||\n|·|•|\band\b)\s*/i)) {
      const p = part.trim();
      if (!p) continue;
      const key = p.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }

  return out.join(", ");
}

/** Keep one interested lead per phone/CSR from this upload; merge service + remove stale dupes. */
async function consolidateInterestedUploadByPhone(uploadedFileId: string) {
  const uploaded = await prisma.lead.findMany({
    where: { uploadedFileId },
    select: { id: true, phone: true, assignedTo: true, interestedService: true, status: true },
  });

  const phones = [...new Set(
    uploaded.map(l => l.phone?.trim()).filter((p): p is string => !!p && p.replace(/\D/g, "").length >= 7)
  )];
  if (phones.length === 0) return;

  const matchMap = await findLeadsByPhonesBulk(phones);

  for (const lead of uploaded) {
    const phone = lead.phone?.trim();
    if (!phone || phone.replace(/\D/g, "").length < 7) continue;

    const matches = matchMap.get(phone) ?? [];
    const siblings = matches.filter(m =>
      m.id !== lead.id &&
      !m.inBin &&
      m.assignedTo === lead.assignedTo &&
      ((m.status ?? "").toLowerCase() === "interested" || m.interested === true)
    );
    if (siblings.length === 0) continue;

    const mergedService = mergeInterestedServiceStrings([
      lead.interestedService,
      ...siblings.map(s => s.interestedService),
    ]);

    if (mergedService) {
      await prisma.lead.update({
        where: { id: lead.id },
        data:  { interestedService: mergedService },
      });
    }

    await deleteLeadsCascade(siblings.map(s => s.id));
  }
}
/** Call-data = daily pending leads on CSR main page */
const CALL_DATA_STATUSES = ["pending"] as const;

function isCallDataUpload(initialStatuses: string[]): boolean {
  return initialStatuses.every(s =>
    CALL_DATA_STATUSES.includes(s.toLowerCase() as typeof CALL_DATA_STATUSES[number])
  );
}

/* ================= UPLOAD LEADS ================= */

export const uploadLeads = async (req: Request, res: Response) => {
  try {

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const selectedCSRs: string[] = req.body.selectedCSRs
      ? JSON.parse(req.body.selectedCSRs)
      : [];

    const companyName:  string = req.body.companyName?.trim() || "";
    const resetMode:   string = req.body.resetMode || "keep";
    const leadType:    string = req.body.leadType || "new";   /* "new" | "old" — only used when pane = "lead" */
    const sourceId:    string = String(req.body.sourceId ?? "").trim();
    const tradeName:   string = String(req.body.trade ?? "").trim();
    const uploadedBy          = "admin";

    let source: { id: string } | null = null;
    if (sourceId) {
      source = await prisma.uploadSource.findUnique({ where: { id: sourceId } });
      if (!source) {
        return res.status(400).json({ success: false, message: "Invalid upload source" });
      }
    }

    /* accept array of statuses for multi-pane distribution */
    const rawStatuses = req.body.initialStatuses;
    const initialStatuses: string[] = rawStatuses
      ? JSON.parse(rawStatuses)
      : [req.body.initialStatus?.trim() || "pending"];

    const cloudFolder    = getCloudinaryFolder(leadType, initialStatuses);
    const uploadCategory = resolveUploadCategory(leadType, initialStatuses);
    const fileBuffer     = req.file.buffer;
    const rows        = readExcelRows(fileBuffer);

    /* Archive the sheet while rows are matched and inserted — do not block the import. */
    const cloudPromise = uploadRawBuffer(fileBuffer, cloudFolder).then(
      url => url,
      (cloudErr: unknown) => {
        console.log("[Upload] Cloudinary archive failed (non-fatal for import):", cloudErr);
        return "";
      },
    );

    const csrs = await prisma.user.findMany({
      where: {
        role:     "csr",
        isActive: true,
        ...(selectedCSRs.length > 0 && { id: { in: selectedCSRs } }),
      },
      select: { id: true, name: true, email: true },
      orderBy: { csrCode: "asc" },
    });

    if (csrs.length === 0) {
      return res.status(400).json({ success: false, message: "No active CSR users found" });
    }

    /* ── RESET MODE (call data only) ──
       1. Snapshot current call data to Report table
       2. Delete ONLY pending/call-data leads
       3. Other data (important, interested, clients, projects) stays untouched ── */
    if (resetMode === "reset" && isCallDataUpload(initialStatuses)) {

      const callDataLeads = await prisma.lead.findMany({
        where: { status: { equals: "pending", mode: "insensitive" } },
        select: { id: true, assignedTo: true, csr: { select: { name: true } } },
      });

      if (callDataLeads.length > 0) {
        const snapshotDate = estDateYmd();
        const csrSnap: Record<string, { name: string; total: number }> = {};

        callDataLeads.forEach(l => {
          const key  = l.assignedTo;
          const name = l.csr?.name ?? "Unknown";
          if (!csrSnap[key]) csrSnap[key] = { name, total: 0 };
          csrSnap[key].total++;
        });

        const snapshot = {
          type:       "call-data-snapshot",
          date:       snapshotDate,
          totalLeads: callDataLeads.length,
          csrs:       Object.values(csrSnap),
        };

        try {
          const jsonBuf = Buffer.from(JSON.stringify(snapshot));
          const pubId   = `call-data-snapshot-${snapshotDate}-${Date.now()}`;

          const [snapUrl, admin] = await Promise.all([
            uploadRawBuffer(jsonBuf, "crm_reports", pubId),
            prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } }),
          ]);

          await prisma.report.create({
            data: {
              reportName:  `Call data backup before renew — ${snapshotDate}`,
              reportUrl:   snapUrl,
              reportType:  "json",
              generatedBy: admin?.id ?? null,
            },
          });

          console.log(`[Renew] Call-data snapshot saved: ${callDataLeads.length} leads → Report table ✅`);
        } catch (snapErr) {
          console.log("[Renew] Snapshot upload failed (non-critical):", snapErr);
        }
      }

      const deleted = await deleteLeadsCascade(callDataLeads.map(l => l.id));
      await invalidateAllLeadCaches([...new Set(callDataLeads.map(l => l.assignedTo))]);
      console.log(`[Renew] ${deleted} call-data leads deleted. All other data untouched ✅`);
    }

    /* ── SAVE UPLOAD FILE RECORD ── */
    const uploadedFile = await prisma.uploadFile.create({
      data: {
        fileName:      req.file.originalname,
        cloudinaryUrl: "",
        totalLeads:    rows.length,
        uploadedBy,
        companyName:    companyName || null,
        sourceId:       source?.id ?? null,
        uploadCategory,
      },
    });

    const isActiveUpload = leadType === "active";
    const parsed         = parseLeadRows(rows, csrs, initialStatuses, leadType);
    const isSpecialUpload = initialStatuses.some(s => s.toLowerCase() !== "pending");
    const hideOnMain = (status: string) =>
      isSpecialUpload && (status ?? "").toLowerCase() !== "pending";
    const promoteWonClients = isSpecialUpload && initialStatuses.every(isWonClientUploadStatus);

    const { fresh, toUpdate, toPromote, toRefresh, toRestore, emailUpdates, websiteUpdates, preview, previewCounts, existingCodeMap } =
      await classifyRows(parsed, isActiveUpload, uploadCategory, promoteWonClients);

    const distributionMap: Record<string, number> = {};

    const leadFieldsFromRow = (r: typeof parsed[0], opts?: { forceOld?: boolean; skipEmptyInterestedService?: boolean }) => {
      const statusLower = (r.status ?? "").toLowerCase();
      const data: Record<string, unknown> = {
        name:              r.name,
        company:           r.company           || null,
        phone:             r.phone             || null,
        email:             r.email             || null,
        ...(r.website?.trim() ? { website: r.website.trim() } : {}),
        state:             r.state             || null,
        clientCode:        r.clientCode        || null,
        projectTitle:      r.projectTitle,
        projectBudget:     r.projectBudget,
        comments:          r.comments            || null,
        status:            r.status            || (isActiveUpload ? "Close Client" : r.status),
        important:         statusLower === "important",
        interested:        statusLower === "interested",
        isOldClient:       opts?.forceOld ?? r.isOldClient,
        assignedTo:        r.csrId,
        uploadedFileId:    uploadedFile.id,
        hiddenOnMain:      hideOnMain(r.status),
        ...CLEAR_BIN,
      };
      if (r.interestedService?.trim()) {
        data.interestedService = r.interestedService.trim();
      } else if (!opts?.skipEmptyInterestedService) {
        data.interestedService = null;
      }
      const rowTrade = r.trade?.trim();
      if (rowTrade) data.trade = rowTrade;
      else if (tradeName) data.trade = tradeName;
      if (r.subTrades?.trim()) data.subTrades = r.subTrades.trim();
      return data;
    };

    if (isActiveUpload && toUpdate.length > 0 && existingCodeMap) {
      await runBatched(toUpdate, BATCH_UPDATE, r =>
        prisma.lead.update({
          where: { id: existingCodeMap.get(r.clientCode!)! },
          data: {
            ...leadFieldsFromRow(r, { forceOld: true }),
            status: r.status || "Close Client",
            isOldClient: true,
          },
        })
      );
      for (const r of toUpdate) {
        distributionMap[r.csrName] = (distributionMap[r.csrName] || 0) + 1;
      }
    }

    if (!isActiveUpload && emailUpdates.length > 0) {
      if (emailUpdates.length > 200) {
        await bulkSetLeadFields(emailUpdates.map(u => ({ id: u.id, data: { email: u.email } })));
      } else {
        await runBatched(emailUpdates, BATCH_UPDATE, ({ id, email }) =>
          prisma.lead.update({ where: { id }, data: { email } })
        );
      }
    }

    if (!isActiveUpload && websiteUpdates.length > 0) {
      if (websiteUpdates.length > 200) {
        await bulkSetLeadFields(websiteUpdates.map(u => ({ id: u.id, data: { website: u.website } })));
      } else {
        await runBatched(websiteUpdates, BATCH_UPDATE, ({ id, website }) =>
          prisma.lead.update({ where: { id }, data: { website } })
        );
      }
    }

    const skipEmptyService = (status: string) =>
      (status ?? "").toLowerCase() === "interested";

    if (toRestore.length > 0) {
      await runBatched(toRestore, BATCH_UPDATE, ({ row, existingId }) =>
        prisma.lead.update({
          where: { id: existingId },
          data: leadFieldsFromRow(row, {
            forceOld: isActiveUpload || row.isOldClient,
            skipEmptyInterestedService: skipEmptyService(row.status),
          }),
        })
      );
      for (const { row } of toRestore) {
        distributionMap[row.csrName] = (distributionMap[row.csrName] || 0) + 1;
      }
      await runBatched(toRestore, BATCH_UPDATE, ({ row, existingId }) =>
        attachSubContactsToLead(existingId, row.subContactsRaw),
      );
    }

    if (!isActiveUpload && toPromote.length > 0) {
      await runBatched(toPromote, BATCH_UPDATE, ({ row, existingId }) =>
        prisma.lead.update({
          where: { id: existingId },
          data: {
            ...leadFieldsFromRow(row),
            important: false,
            interested: false,
          },
        })
      );
      for (const { row } of toPromote) {
        distributionMap[row.csrName] = (distributionMap[row.csrName] || 0) + 1;
      }
    }

    if (!isActiveUpload && toRefresh.length > 0) {
      await runBatched(toRefresh, BATCH_UPDATE, ({ row, existingId }) =>
        prisma.lead.update({
          where: { id: existingId },
          data: leadFieldsFromRow(row, {
            skipEmptyInterestedService: skipEmptyService(row.status),
          }),
        })
      );
      for (const { row } of toRefresh) {
        distributionMap[row.csrName] = (distributionMap[row.csrName] || 0) + 1;
      }
    }

    /* After restore/refresh: drop leftover bin copies for the same phone */
    const restoredPhones = [
      ...toRestore.map(x => x.row.phone),
      ...toRefresh.map(x => x.row.phone),
      ...toPromote.map(x => x.row.phone),
    ].filter(p => p && p.length >= 7);
    const uniqueRestoredPhones = [...new Set(restoredPhones)];
    if (uniqueRestoredPhones.length > 0) {
      const binMatchMap = await findLeadsByPhonesBulk(uniqueRestoredPhones);
      for (const phone of uniqueRestoredPhones) {
        const matches = binMatchMap.get(phone) ?? [];
        const keepIds = new Set([
          ...toRestore.filter(x => x.row.phone === phone).map(x => x.existingId),
          ...toRefresh.filter(x => x.row.phone === phone).map(x => x.existingId),
          ...toPromote.filter(x => x.row.phone === phone).map(x => x.existingId),
        ]);
        const binDupes = matches.filter(m => m.inBin && !keepIds.has(m.id));
        if (binDupes.length > 0) {
          await deleteLeadsCascade(binDupes.map(m => m.id));
        }
      }
    }

    if (fresh.length > 0) {
      const insertRows = fresh.map(r => ({
        name:              r.name,
        company:           r.company,
        phone:             r.phone,
        email:             r.email,
        website:           r.website?.trim() || null,
        state:             r.state             || null,
        interestedService: r.interestedService?.trim() || null,
        clientCode:        r.clientCode        || null,
        projectTitle:      r.projectTitle,
        projectBudget:     r.projectBudget,
        comments:          r.comments            || null,
        status:            r.status,
        important:         (r.status ?? "").toLowerCase() === "important",
        interested:        (r.status ?? "").toLowerCase() === "interested",
        isOldClient:       r.isOldClient,
        assignedTo:        r.csrId,
        uploadedFileId:    uploadedFile.id,
        hiddenOnMain:      hideOnMain(r.status),
        inBin:             false,
        trade:             r.trade?.trim() || tradeName || null,
        subTrades:         r.subTrades?.trim() || null,
      }));

      const largeInsert = insertRows.length > 20_000;
      await createLeadsChunked(
        insertRows as Record<string, unknown>[],
        largeInsert ? CHUNK_INSERT_LARGE : CHUNK_INSERT,
        largeInsert ? 4 : 1,
      );

      await attachExcelSubContacts(uploadedFile.id, fresh);
      await upsertTradesFromRows([...fresh.map(r => r.trade), tradeName]);

      for (const r of fresh) {
        distributionMap[r.csrName] = (distributionMap[r.csrName] || 0) + 1;
      }

      if (promoteWonClients || uploadCategory === "new-client" || uploadCategory === "old-client") {
        const created = await prisma.lead.findMany({
          where: { uploadedFileId: uploadedFile.id },
          select: { id: true, phone: true, assignedTo: true, status: true },
        });
        for (const lead of created) {
          if (!lead.phone?.trim() || !isWonClientUploadStatus(lead.status)) continue;
          await clearPendingDuplicatesForPhone(lead.phone, lead.assignedTo, lead.id);
        }
      }
    }

    if (uploadCategory === "interested") {
      await consolidateInterestedUploadByPhone(uploadedFile.id);
    }

    flushAdminClientsCache();
    /* Old/new client flags only matter for won/client uploads — skip on call-data */
    if (uploadCategory !== "call-data") {
      for (const csr of csrs) {
        await reconcileClientOldFlagsForCsr(csr.id);
      }
    }
    invalidateCache(
      "admin:csrs",
      ...csrs.flatMap(c => [
        `csr:dashboard:${c.id}`,
        `csr:leads:${c.id}`,
        `csr:clients:${c.id}`,
        `csr:projects:${c.id}`,
        `csr:not-interested:${c.id}`,
        `csr:bin:${c.id}`,
      ])
    );

    const distribution = Object.entries(distributionMap).map(([name, leads]) => ({ name, leads }));
    const addedCount   =
      fresh.length +
      (isActiveUpload ? toUpdate.length : 0) +
      toPromote.length +
      toRefresh.length +
      toRestore.length;

    await prisma.uploadFile.update({
      where: { id: uploadedFile.id },
      data:  { totalLeads: addedCount },
    });

    /* Prefer actual Mongo count when this file has linked leads */
    try {
      const linkedNow = await prisma.lead.count({ where: { uploadedFileId: uploadedFile.id } });
      if (linkedNow > 0 && linkedNow !== addedCount) {
        await prisma.uploadFile.update({
          where: { id: uploadedFile.id },
          data: { totalLeads: linkedNow },
        });
      }
    } catch {
      /* keep addedCount */
    }

    const hasSheetComments = [
      ...fresh,
      ...toUpdate,
      ...toPromote.map(x => x.row),
      ...toRefresh.map(x => x.row),
      ...toRestore.map(x => x.row),
    ].some(r => r.comments?.trim());
    if (hasSheetComments) {
      await seedLeadNotesFromCommentsForFile(uploadedFile.id);
    }

    const cloudinaryUrl = await cloudPromise;
    if (cloudinaryUrl) {
      await prisma.uploadFile.update({
        where: { id: uploadedFile.id },
        data: { cloudinaryUrl },
      });
    }

    return res.json({
      success:       true,
      totalLeads:    addedCount,
      cloudinaryUrl: cloudinaryUrl,
      file:          { ...uploadedFile, cloudinaryUrl, uploadCategory },
      distribution,
      rowResults:    preview,
      summary: {
        new:       previewCounts.new,
        duplicate: previewCounts.duplicate,
        updated:   previewCounts.updated,
        empty:     previewCounts.empty,
      },
    });

  } catch (error: unknown) {
    console.log(error);
    const err = error as { code?: string; message?: string; name?: string };
    if (err?.code === "LIMIT_FILE_SIZE" || /File too large/i.test(err?.message ?? "")) {
      return res.status(413).json({
        success: false,
        message: "File too large. Max upload size is 100 MB — split the sheet or compress and retry.",
      });
    }
    return res.status(500).json({
      success: false,
      message: err?.message?.slice(0, 200) || "Upload failed",
    });
  }
};

/* ================= GET LATEST UPLOAD ================= */

export const getLatestUpload = async (req: Request, res: Response) => {
  try {
    const latestFile = await prisma.uploadFile.findFirst({
      orderBy: { createdAt: "desc" },
      include: {
        source: { select: ADMIN_UPLOAD_SOURCE_SELECT },
        leads: {
          include: {
            csr: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!latestFile) {
      return res.json({ success: true, file: null });
    }

    const distributionMap: Record<string, number> = {};
    latestFile.leads.forEach(lead => {
      const csrName = lead.csr.name;
      if (!distributionMap[csrName]) distributionMap[csrName] = 0;
      distributionMap[csrName] += 1;
    });

    const distribution = Object.entries(distributionMap).map(([name, leads]) => ({ name, leads }));

    return res.json({
      success: true,
      file: {
        id:            latestFile.id,
        fileName:      latestFile.fileName,
        totalLeads:    latestFile.totalLeads,
        cloudinaryUrl: latestFile.cloudinaryUrl,
        companyName:   latestFile.companyName,
        source:        latestFile.source,
        createdAt:     latestFile.createdAt,
        distribution,
      },
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch latest upload" });
  }
};

/* ================= PREVIEW UPLOAD (no save) ================= */

export const previewUpload = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const selectedCSRs: string[] = req.body.selectedCSRs
      ? JSON.parse(req.body.selectedCSRs)
      : [];

    const leadType: string = req.body.leadType || "new";
    const rawStatuses = req.body.initialStatuses;
    const initialStatuses: string[] = rawStatuses
      ? JSON.parse(rawStatuses)
      : [req.body.initialStatus?.trim() || "pending"];

    const csrs = await prisma.user.findMany({
      where: {
        role:     "csr",
        isActive: true,
        ...(selectedCSRs.length > 0 && { id: { in: selectedCSRs } }),
      },
      select: { id: true, name: true },
    });

    if (csrs.length === 0) {
      return res.status(400).json({ success: false, message: "No active CSR users found" });
    }

    const rows   = readExcelRows(req.file.buffer);
    const parsed = parseLeadRows(rows, csrs, initialStatuses, leadType);
    const isSpecialUpload = initialStatuses.some(s => s.toLowerCase() !== "pending");
    const promoteWonClients = isSpecialUpload && initialStatuses.every(isWonClientUploadStatus);
    const { preview, previewCounts } = await classifyRows(parsed, leadType === "active", resolveUploadCategory(leadType, initialStatuses), promoteWonClients);

    const summary = {
      new:       previewCounts.new,
      duplicate: previewCounts.duplicate,
      updated:   previewCounts.updated,
      empty:     previewCounts.empty,
      total:     previewCounts.new + previewCounts.duplicate + previewCounts.updated + previewCounts.empty,
    };

    /* Cap payload — UI only shows a page; full 10k+ JSON freezes browser + proxy */
    const PREVIEW_CAP = 400;
    const capped =
      preview.length > PREVIEW_CAP
        ? preview.slice(0, PREVIEW_CAP)
        : preview;

    return res.json({
      success: true,
      preview: capped,
      summary,
      previewCapped: summary.total > PREVIEW_CAP,
      previewTotal: summary.total,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Preview failed" });
  }
};

/* ================= UPLOAD HISTORY ================= */

export const getUploadHistory = async (req: Request, res: Response) => {
  try {
    const categoryParam = String(req.query.category ?? "all").trim();
    const filterCategory =
      categoryParam !== "all" && isUploadCategory(categoryParam)
        ? categoryParam
        : null;

    /* Load ALL upload files from Mongo (no artificial page cut). */
    const uploads = await prisma.uploadFile.findMany({
      where: filterCategory ? { uploadCategory: filterCategory } : undefined,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        totalLeads: true,
        companyName: true,
        cloudinaryUrl: true,
        uploadCategory: true,
        createdAt: true,
        source: { select: ADMIN_UPLOAD_SOURCE_SELECT },
        leads: {
          take: 1,
          select: { status: true, isOldClient: true, projectTitle: true },
        },
      },
    });

    type EnrichedUpload = (typeof uploads)[number] & {
      effectiveCategory: UploadCategory | "uncategorized";
    };

    const enriched: EnrichedUpload[] = uploads.map(u => {
      let effectiveCategory: UploadCategory | "uncategorized" =
        (u.uploadCategory as UploadCategory | null) ?? "uncategorized";

      if (!u.uploadCategory && u.leads[0]) {
        effectiveCategory = inferUploadCategoryFromLead(u.leads[0]);
        void prisma.uploadFile
          .update({ where: { id: u.id }, data: { uploadCategory: effectiveCategory } })
          .catch(() => undefined);
      }

      return { ...u, effectiveCategory };
    });

    /* One Mongo aggregation — real linked lead counts for every file (safe at 50k+) */
    const linkedByFile = new Map<string, number>();
    const fileIds = enriched.map(u => u.id);
    if (fileIds.length > 0) {
      try {
        const agg = await prisma.$runCommandRaw({
          aggregate: "Lead",
          pipeline: [
            { $match: { uploadedFileId: { $in: fileIds } } },
            { $group: { _id: "$uploadedFileId", n: { $sum: 1 } } },
          ],
          cursor: {},
        });
        const batch = (agg as { cursor?: { firstBatch?: { _id?: string; n?: number }[] } })
          ?.cursor?.firstBatch ?? [];
        for (const row of batch) {
          if (row?._id) linkedByFile.set(String(row._id), Number(row.n) || 0);
        }
      } catch (aggErr) {
        console.log("[UploadHistory] Mongo lead aggregation failed, using totalLeads:", aggErr);
      }
    }

    const counts: Record<string, number> = { all: enriched.length };
    for (const cat of UPLOAD_CATEGORIES) counts[cat] = 0;
    for (const u of enriched) {
      if (u.effectiveCategory in counts) counts[u.effectiveCategory]++;
      else counts.uncategorized = (counts.uncategorized ?? 0) + 1;
    }

    /* If filtered by category, still show global tab totals from Mongo */
    if (filterCategory) {
      try {
        counts.all = await prisma.uploadFile.count();
        await Promise.all(
          UPLOAD_CATEGORIES.map(async cat => {
            counts[cat] = await prisma.uploadFile.count({ where: { uploadCategory: cat } });
          }),
        );
      } catch {
        /* keep filtered-page counts */
      }
    }

    const filtered = filterCategory
      ? enriched.filter(u => u.effectiveCategory === filterCategory)
      : enriched;

    return res.json({
      success: true,
      counts,
      uploads: filtered.map(u => {
        const linked = linkedByFile.get(u.id);
        return {
          id:             u.id,
          fileName:       u.fileName,
          totalLeads:     linked ?? u.totalLeads,
          linkedLeads:    linked ?? u.totalLeads,
          companyName:    u.companyName,
          cloudinaryUrl:  u.cloudinaryUrl,
          uploadCategory: u.effectiveCategory === "uncategorized" ? null : u.effectiveCategory,
          source:         u.source,
          createdAt:      u.createdAt,
        };
      }),
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch upload history" });
  }
};

/* ================= ASSIGN SOURCE TO EXISTING UPLOAD ================= */

export const patchUploadFileSource = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    let sourceId = String(req.body.sourceId ?? "").trim();

    const name = String(req.body.name ?? "").trim();
    const sudoNameRaw = req.body.sudoName !== undefined ? String(req.body.sudoName).trim() : "";

    if (!sourceId && name) {
      const existing = await prisma.uploadSource.findUnique({ where: { name } });
      if (existing) {
        if (sudoNameRaw && existing.sudoName !== sudoNameRaw) {
          await prisma.uploadSource.update({
            where: { id: existing.id },
            data:  { sudoName: sudoNameRaw || null },
          });
        }
        sourceId = existing.id;
      } else {
        const created = await prisma.uploadSource.create({
          data: { name, sudoName: sudoNameRaw || null },
        });
        sourceId = created.id;
      }
    }

    if (!sourceId) {
      return res.status(400).json({ success: false, message: "Select or create a source" });
    }

    const source = await prisma.uploadSource.findUnique({ where: { id: sourceId } });
    if (!source) {
      return res.status(404).json({ success: false, message: "Source not found" });
    }

    const upload = await prisma.uploadFile.findUnique({ where: { id } });
    if (!upload) {
      return res.status(404).json({ success: false, message: "Upload not found" });
    }

    const updated = await prisma.uploadFile.update({
      where: { id },
      data:  { sourceId },
      include: {
        source: { select: ADMIN_UPLOAD_SOURCE_SELECT },
        _count:  { select: { leads: true } },
      },
    });

    const leads = await prisma.lead.findMany({
      where:  { uploadedFileId: id },
      select: { assignedTo: true },
    });
    const csrIds = [...new Set(leads.map(l => l.assignedTo))];
    await invalidateAllLeadCaches(csrIds);

    return res.json({
      success: true,
      upload: {
        id:             updated.id,
        fileName:       updated.fileName,
        totalLeads:     updated.totalLeads,
        linkedLeads:    updated._count.leads,
        companyName:    updated.companyName,
        uploadCategory: updated.uploadCategory,
        source:         updated.source,
        createdAt:      updated.createdAt,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to assign source" });
  }
};

/* ================= DELETE UPLOAD + LINKED LEADS ================= */

export const deleteUploadFile = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const upload = await prisma.uploadFile.findUnique({
      where: { id },
      select: { id: true, fileName: true },
    });

    if (!upload) {
      return res.status(404).json({ success: false, message: "Upload not found" });
    }

    const leads = await prisma.lead.findMany({
      where: { uploadedFileId: id },
      select: { id: true, assignedTo: true },
    });

    const leadIds = leads.map(l => l.id);
    const deleted = await deleteLeadsCascade(leadIds);

    await prisma.lead.updateMany({
      where: { uploadedFileId: id },
      data: { uploadedFileId: null },
    });

    await prisma.uploadFile.delete({ where: { id } });

    const csrIds = [...new Set(leads.map(l => l.assignedTo))];
    await invalidateAllLeadCaches(csrIds);

    return res.json({
      success:      true,
      message:      `"${upload.fileName}" deleted — ${deleted} lead(s) removed from database and CSR dashboards`,
      deletedLeads: deleted,
    });
  } catch (error) {
    console.log(error);
    const msg = error instanceof Error ? error.message : "Failed to delete upload";
    return res.status(500).json({ success: false, message: msg.includes("constraint") || msg.includes("Foreign") ? "Could not delete this file because related contacts are still linked. Try again or contact support." : "Failed to delete upload" });
  }
};