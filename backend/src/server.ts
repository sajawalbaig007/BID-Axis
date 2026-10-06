import http from "http";
import dotenv from "dotenv";
dotenv.config();

import { getJwtSecret } from "./config/security";
import { validateEnv } from "./config/env";
import { writeAuditLog } from "./utils/auditLog";
import { clearActiveSession } from "./utils/sessions";
import app          from "./app";
import prisma       from "./config/db";
import cloudinary   from "./config/cloudinary";
import { initChatSocket } from "./chat/chatSocket";
import { addEstDays, estDateYmd, estDayBoundsUtc } from "./utils/estTime";
import { closeForgottenWorkSessions } from "./utils/csrSessionTracking";
import { closeForgottenStaffShifts } from "./utils/staffAttendance";
import { refreshShiftSchedules } from "./utils/shiftSchedule";
import { refreshLatePolicies } from "./utils/lateDeduction";

const PORT = process.env.PORT || 5000;

validateEnv();

/* ═══════════════════════════════════════════════
   AUTO OFFLINE CRON — every 60s (Users page presence)
   Marks isOnline=false after ~90s without heartbeat.
   Does NOT close CSR work sessions (Reports keep tracking).
═══════════════════════════════════════════════ */
let _offlineFailStreak = 0;
let _offlinePaused     = false;

function runAutoCheckout() {
  void closeForgottenWorkSessions().catch((err) => console.error("[auto-checkout] sessions", err));
  void closeForgottenStaffShifts().catch((err) => console.error("[auto-checkout] staff", err));
}
runAutoCheckout();
setInterval(runAutoCheckout, 60 * 1000);
void refreshShiftSchedules().catch((err) => console.error("[shift-schedules]", err));
void refreshLatePolicies().catch((err) => console.error("[late-deductions]", err));

setInterval(async () => {
  if (_offlinePaused) return;
  try {
    const threshold = new Date(Date.now() - 90_000);
    await prisma.user.updateMany({
      where: { lastActive: { lt: threshold }, isOnline: true },
      data:  { isOnline: false },
    });
    if (_offlineFailStreak > 0) {
      console.log("[Auto-offline] DB reconnected ✓");
      _offlineFailStreak = 0;
    }
  } catch (err: unknown) {
    _offlineFailStreak++;
    const code = (err as { code?: string }).code ?? "unknown";
    if (_offlineFailStreak === 1) {
      console.log(`[Auto-offline] DB unreachable (${code}) — pausing 60s`);
    }
    if (_offlineFailStreak >= 10) {
      _offlinePaused = true;
      setTimeout(() => { _offlinePaused = false; _offlineFailStreak = 0; }, 60_000);
    }
  }
}, 60_000);

/* ═══════════════════════════════════════════════
   AUTO DAILY REPORT — 3:30 AM
═══════════════════════════════════════════════ */
async function generateDailyReport() {
  try {
    const ymd = addEstDays(estDateYmd(), -1);
    const bounds = estDayBoundsUtc(ymd);
    const yesterday = bounds?.start ?? new Date();
    const endOfYesterday = bounds?.end ?? new Date();

    const leads = await prisma.lead.findMany({
      where:   { createdAt: { gte: yesterday, lte: endOfYesterday } },
      include: { csr: true },
    });

    if (leads.length === 0) {
      console.log(`[Auto Report] ${ymd} EST — No leads, skipping`);
      return;
    }

    const dateLabel = ymd;
    const csrMap    = new Map<string, { name: string; total: number; completed: number; pending: number }>();

    leads.forEach(l => {
      const key  = l.assignedTo;
      const name = l.csr?.name ?? "Unknown";
      if (!csrMap.has(key)) csrMap.set(key, { name, total: 0, completed: 0, pending: 0 });
      const e = csrMap.get(key)!;
      e.total++;
      if (l.status?.toLowerCase() === "completed") e.completed++;
      if (l.status?.toLowerCase() === "pending")   e.pending++;
    });

    const summary = {
      date:       dateLabel,
      totalLeads: leads.length,
      completed:  leads.filter(l => l.status?.toLowerCase() === "completed").length,
      pending:    leads.filter(l => l.status?.toLowerCase() === "pending").length,
      csrs:       Array.from(csrMap.values()),
    };

    const jsonBuffer = Buffer.from(JSON.stringify(summary, null, 2));

    const uploaded = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { resource_type: "raw", folder: "crm_reports", public_id: `daily-report-${dateLabel}`, format: "json" },
          (err, result) => { if (err || !result) reject(err); else resolve({ secure_url: result.secure_url }); }
        )
        .end(jsonBuffer);
    });

    const admin = await prisma.user.findFirst({ where: { role: "admin" } });
    await prisma.report.create({
      data: { reportName: `Daily Report — ${dateLabel}`, reportUrl: uploaded.secure_url, reportType: "json", generatedBy: admin?.id ?? null },
    });

    console.log(`[Auto Report] ✅ ${dateLabel} — ${leads.length} leads`);
  } catch (err) {
    console.log("[Auto Report] Error:", err);
  }
}

function scheduleAutoReport() {
  const now     = new Date();
  const next330 = new Date(now);
  next330.setHours(3, 30, 0, 0);
  if (next330.getTime() <= now.getTime()) next330.setDate(next330.getDate() + 1);

  const msUntil = next330.getTime() - now.getTime();
  console.log(`[Auto Report] Scheduled at 3:30 AM — next in ${Math.round(msUntil / 3600000 * 10) / 10}h`);

  setTimeout(() => {
    generateDailyReport();
    setInterval(generateDailyReport, 24 * 60 * 60 * 1000);
  }, msUntil);
}

/* ═══════════════════════════════════════════════
   NOT-COMPLETED SHUFFLE — Every 2 Days 12:00 AM
   Equal distribution to OTHER CSRs (not current)
   3 attempts → DELETE
═══════════════════════════════════════════════ */
export async function runWeeklyShuffle() {
  try {
    console.log("[Shuffle] Starting...");

    const csrs = await prisma.user.findMany({
      where:   { role: "csr", isActive: true },
      select:  { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    if (csrs.length < 2) {
      console.log("[Shuffle] Need at least 2 active CSRs — skipping");
      return;
    }

    const notCompleted = await prisma.lead.findMany({
      where: { status: { in: ["not completed", "Not Completed", "NOT COMPLETED"] } },
    });

    if (notCompleted.length === 0) {
      console.log("[Shuffle] No not-completed leads");
      return;
    }

    console.log(`[Shuffle] ${notCompleted.length} leads | CSRs: ${csrs.map(c => c.name).join(", ")}`);

    let deleted  = 0;
    let shuffled = 0;

    /* Group by current CSR */
    const byCSR = new Map<string, typeof notCompleted>();
    for (const lead of notCompleted) {
      if (!byCSR.has(lead.assignedTo)) byCSR.set(lead.assignedTo, []);
      byCSR.get(lead.assignedTo)!.push(lead);
    }

    for (const [csrId, leads] of byCSR.entries()) {
      /* Delete — 3 attempts done */
      for (const lead of leads.filter(l => l.shuffleAttempts >= 2)) {
        await prisma.lead.delete({ where: { id: lead.id } });
        deleted++;
        console.log(`[Shuffle] Deleted "${lead.name}" — 3 attempts exhausted`);
      }

      const toShuffle = leads.filter(l => l.shuffleAttempts < 2);
      if (toShuffle.length === 0) continue;

      /* Other CSRs only */
      const others   = csrs.filter(c => c.id !== csrId);
      const fromName = csrs.find(c => c.id === csrId)?.name ?? csrId;

      if (others.length === 0) continue;

      console.log(`[Shuffle] ${fromName} has ${toShuffle.length} leads → equally to: ${others.map(c => c.name).join(", ")}`);

      /* Equal distribution — round robin */
      for (let i = 0; i < toShuffle.length; i++) {
        const lead    = toShuffle[i];
        const target  = others[i % others.length];
        const attempt = lead.shuffleAttempts + 1;

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            assignedTo:      target.id,
            shuffleAttempts: attempt,
            status:          "pending",
            followUpNotes: [
              lead.followUpNotes,
              `[Attempt ${attempt}/3] ${fromName} → ${target.name} on ${new Date().toLocaleDateString()}`,
            ].filter(Boolean).join("\n"),
          },
        });
        shuffled++;
      }
    }

    console.log(`[Shuffle] ✅ Shuffled: ${shuffled} | Deleted: ${deleted}`);

    /* Save report */
    try {
      const admin     = await prisma.user.findFirst({ where: { role: "admin" } });
      const dateLabel = estDateYmd();
      const buf       = Buffer.from(JSON.stringify({ type:"shuffle", date:dateLabel, shuffled, deleted, csrs: csrs.map(c => c.name) }, null, 2));

      const url = await new Promise<string>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            { resource_type: "raw", folder: "crm_reports", public_id: `shuffle-${dateLabel}-${Date.now()}`, format: "json" },
            (err, result) => { if (err || !result) reject(err); else resolve(result.secure_url); }
          )
          .end(buf);
      });

      await prisma.report.create({
        data: { reportName: `Lead Shuffle — ${dateLabel}`, reportUrl: url, reportType: "json", generatedBy: admin?.id ?? null },
      });
    } catch (e) {
      console.log("[Shuffle] Report save failed (non-critical):", e);
    }
  } catch (err) {
    console.log("[Shuffle] Error:", err);
  }
}

function scheduleWeeklyShuffle() {
  const now  = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  next.setHours(0, 0, 0, 0);

  const msUntil = next.getTime() - now.getTime();
  console.log(`[Shuffle] First run tonight at 12:00 AM — then every 2 days (${Math.round(msUntil / 3600000 * 10) / 10}h away)`);

  setTimeout(() => {
    runWeeklyShuffle();
    setInterval(runWeeklyShuffle, 2 * 24 * 60 * 60 * 1000);
  }, msUntil);
}
//
scheduleAutoReport();
scheduleWeeklyShuffle();
//
/* ── Deactivate inactive CSR accounts (90 days) ── */
async function deactivateInactiveUsers() {
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const stale = await prisma.user.findMany({
      where: {
        role: "csr",
        isActive: true,
        OR: [
          { lastActive: { lt: cutoff } },
          { lastActive: null, createdAt: { lt: cutoff } },
        ],
      },
      select: { id: true, email: true },
    });
    if (stale.length === 0) return;
    for (const u of stale) {
      await prisma.user.update({
        where: { id: u.id },
        data:  { isActive: false },
      });
      await clearActiveSession(u.id);
      await writeAuditLog({
        action: "account_deactivated",
        userId: u.id,
        email:  u.email,
        meta:   { reason: "inactive_90_days" },
      });
    }
    console.log(`[Security] Deactivated ${stale.length} inactive CSR account(s)`);
  } catch (err) {
    console.log("[Security] Inactive-user check failed:", err);
  }
}

setInterval(() => { void deactivateInactiveUsers(); }, 24 * 60 * 60 * 1000);
void deactivateInactiveUsers();

getJwtSecret();

/* ── START ── */
const server = http.createServer(app);
initChatSocket(server);

/* Large Excel imports (50k+) need long-lived sockets — Render default can cut early */
server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});