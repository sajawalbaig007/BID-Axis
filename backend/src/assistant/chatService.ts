import prisma from "../config/db";
import type { AssistantActor } from "./permissions";
import {
  detectChatter,
  extractEmailPurpose,
  extractSearchQuery,
  fallbackPlan,
  isFollowUp,
  lastEntityKind,
  lastFocusFromHistory,
  parseEmail,
  personFocus,
  planTools,
  preferFollowUpPlan,
  resolveWithHistory,
  wantsEmailIntent,
  wantsPdfDownload,
  wantsWalkthrough,
  type ChatTurn,
  type ClientFocus,
} from "./intent";
import { extractPersonName } from "./fuzzy";
import { ollamaIsUp } from "./ollama";
import { runAgentLoop } from "./agent/loop";
import { generateGroundedAnswer, looksLikeModelAnswer } from "./agent/answer";
import { TOOL_HANDLERS } from "./tools";
import {
  isCrmScopedQuestion,
  looksLikeWorldKnowledge,
  normalizeLookupText,
  OUT_OF_SCOPE_REPLY,
} from "./scope";

export type AssistantAction = {
  type: "compose_email" | "download_accounts_pdf";
  to?: string;
  clientName?: string;
  company?: string;
  intent?: string;
  subject?: string;
  body?: string;
  notes?: string;
  month?: string;
  page?: string;
};

function chatterReply(kind: "greet" | "thanks", name: string): string {
  const who = name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : "";
  if (kind === "thanks") return "Anytime. What should I look up next?";
  return `Hey${who}. Ask any CRM detail — client, CSR, technical/estimator, payments, accounts month, staff, or stats. I’ll look it up.`;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function heading(text: string) {
  return `**${text}**`;
}

function formatHistory(d: Record<string, unknown>, focus: ClientFocus): string {
  const name = String(d.name || "This client");
  const lines: string[] = [heading(name), ""];
  if (focus === "count") {
    return `${heading(name)}\n\n${d.projectCount ?? 0} projects to date.`;
  }
  if (focus === "money") {
    return `${heading(name)}\n\nQuoted: ${d.quotedLabel ?? "$0"}\nPaid: ${d.paidLabel ?? "$0"}`;
  }
  if (focus === "contact") {
    if (d.email) lines.push(`Email: ${d.email}`);
    if (d.phone) lines.push(`Phone: ${d.phone}`);
    if (d.company) lines.push(`Company: ${d.company}`);
    return lines.join("\n");
  }
  if (d.email) lines.push(`Email: ${d.email}`);
  if (d.phone) lines.push(`Phone: ${d.phone}`);
  if (d.company) lines.push(`Company: ${d.company}`);
  if (focus === "projects") {
    lines.push("");
  } else {
    lines.push("");
    lines.push(`Projects to date: ${d.projectCount ?? 0}`);
    lines.push(`Quoted: ${d.quotedLabel ?? "$0"}`);
    lines.push(`Paid: ${d.paidLabel ?? "$0"}`);
  }
  const projects = Array.isArray(d.projects) ? (d.projects as Array<Record<string, unknown>>) : [];
  if (focus === "history" || focus === "projects") {
    if (projects.length) {
      lines.push("");
      projects.forEach((p, i) => {
        lines.push(
          `${i + 1}. ${p.code} — ${p.title} — ${p.status} — quoted ${p.quotedLabel} — paid ${p.paidLabel}`,
        );
      });
    }
  }
  return lines.join("\n");
}

function jobLine(p: Record<string, unknown>, i: number): string {
  const bits = [
    `Status: ${p.phase || "—"}`,
    p.takeoffDone ? "takeoff done" : "takeoff open",
    p.overdue ? "OVERDUE" : "",
    p.timerRunning ? "timer on" : "",
  ].filter(Boolean);
  const hours = [
    p.manHours ? `planned ${p.manHours}` : "",
    p.logged ? `logged ${p.logged}` : "",
  ].filter(Boolean);
  const extra = [
    bits.join(" · "),
    hours.length ? `Man-hours: ${hours.join(" · ")}` : "",
    p.deadline ? `Deadline: ${p.deadline}` : "",
  ].filter(Boolean);
  return `${i}. ${p.code || "—"} — ${p.title || "Untitled"}\n   ${extra.join("\n   ")}`;
}

function formatPerson(d: Record<string, unknown>, asked: string): string {
  const role = d.role ? String(d.role).replace(/_/g, " ") : "";
  const title = heading(`${d.name}${d.code ? ` (${d.code})` : ""}${role ? ` · ${role}` : ""}`);
  const focus = personFocus(asked);
  const est = asRecord(d.estimator);
  const csr = asRecord(d.csr);
  const ck = asRecord(d.checkin);
  const jobs = Array.isArray(est.projects) ? (est.projects as Array<Record<string, unknown>>) : [];
  const lines: string[] = [title, ""];
  if (d.hasDashboard === false) {
    lines.push(String(d.noDashboardReason || "No CRM dashboard for this person."));
    lines.push("");
  }

  const pushEstimatorJobs = () => {
    if (!jobs.length) {
      lines.push("No live assignments on the technical dashboard.");
      return;
    }
    lines.push("");
    jobs.forEach((p, i) => lines.push(jobLine(p, i + 1), ""));
  };

  const pushProfile = () => {
    if (d.status) lines.push(`Status: ${d.status}`);
    if (d.company) lines.push(`Company: ${d.company}`);
    if (d.email) lines.push(`Email: ${d.email}`);
    if (d.phone) lines.push(`Phone: ${d.phone}`);
    if (d.employeeCode) lines.push(`Employee code: ${d.employeeCode}`);
    if (d.fatherName) lines.push(`Father: ${d.fatherName}`);
    if (d.address) lines.push(`Address: ${d.address}`);
    if (d.cnic) lines.push(`CNIC: ${d.cnic}`);
    if (d.payrollHead) lines.push(`Payroll: ${d.payrollHead}`);
    if (d.notes) lines.push(`Notes: ${d.notes}`);
  };

  if (focus === "count") {
    pushProfile();
    if (d.hasDashboard === false) {
      lines.push("");
      lines.push("No live project count — there is no dashboard login.");
      return lines.join("\n").trim();
    }
    if (Object.keys(est).length) {
      lines.push("");
      lines.push(`Projects covering now: ${est.assigned ?? 0}`);
      lines.push(`Pending ${est.pending ?? 0} · done ${est.completed ?? 0} · overdue ${est.overdue ?? 0}`);
      lines.push(`Logged ${est.logged ?? "0h"}${est.plannedHours != null ? ` · planned ${est.plannedHours}h` : ""}`);
      pushEstimatorJobs();
      return lines.join("\n").trim();
    }
    if (Object.keys(csr).length) {
      lines.push("");
      lines.push(`CSR leads: ${csr.total ?? 0}`);
      lines.push(`Pending ${csr.pending ?? 0} · interested ${csr.interested ?? 0} · closed ${csr.closed ?? 0}`);
      return lines.join("\n");
    }
    lines.push("No project count on file for this person.");
    return lines.join("\n");
  }

  if (focus === "contact") {
    if (d.email) lines.push(`Email: ${d.email}`);
    if (d.phone) lines.push(`Phone: ${d.phone}`);
    if (!d.email && !d.phone) lines.push("No email or phone on file.");
    return lines.join("\n");
  }

  pushProfile();
  if (Object.keys(ck).length) {
    const when = ck.isToday === false && ck.day ? String(ck.day) : "today";
    if (ck.checkedIn) {
      lines.push(`Check-in ${when}: YES at ${ck.checkInAtEst || "—"}${ck.paused ? " · paused" : ""}`);
      lines.push(`On dashboard: ${ck.duration || "—"}`);
    } else if (ck.hadSessionToday) {
      lines.push(`Check-in ${when}: YES at ${ck.checkInAtEst || "—"}`);
      if (ck.checkedOutAtEst) lines.push(`Checked out: ${ck.checkedOutAtEst}`);
      if (ck.duration) lines.push(`Time on dashboard: ${ck.duration}`);
    } else {
      lines.push(`Check-in ${when}: NO session.`);
    }
    lines.push("");
    lines.push(`Portal: ${ck.online || d.online ? "online" : "offline"}`);
    if (ck.lastActive) lines.push(`Last active: ${ck.lastActive}`);
  } else if (d.hasDashboard !== false) {
    lines.push(`Portal: ${d.online ? "online" : "offline"} (no check-in record).`);
  }
  if (focus === "checkin") return lines.join("\n");

  if (Object.keys(csr).length) {
    lines.push("");
    lines.push(`CSR desk: ${csr.total ?? 0} leads`);
    lines.push(`Pending ${csr.pending ?? 0} · interested ${csr.interested ?? 0} · closed ${csr.closed ?? 0}`);
  }
  if (Object.keys(est).length) {
    lines.push("");
    lines.push(`Projects covering now: ${est.assigned ?? 0}`);
    lines.push(`Pending ${est.pending ?? 0} · done ${est.completed ?? 0} · overdue ${est.overdue ?? 0}`);
    lines.push(`This month deadlines (${est.month || "now"}): ${est.monthCount ?? 0} · score ${est.score ?? 0} · logged ${est.logged ?? "0h"}`);
    pushEstimatorJobs();
  }
  return lines.join("\n").trim();
}

function formatRecord(row: Record<string, unknown>): string[] {
  const skip = new Set(["id"]);
  const lines = [heading(String(row.name || row.company || "Client"))];
  for (const [key, value] of Object.entries(row)) {
    if (skip.has(key) || value == null || value === "") continue;
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (!text || text === "null" || text === "[]" || text === "{}") continue;
    lines.push(`${key}: ${text}`);
  }
  return lines;
}

function formatFallback(results: unknown[]): string {
  const lines: string[] = [];
  for (const raw of results) {
    const r = asRecord(raw);
    if (r.ok === false) {
      lines.push(String(r.error || "Could not complete that request."));
      continue;
    }
    const d = asRecord(r.data);
    const focus = (String(asRecord(r.args).focus || "history") as ClientFocus);
    if (d.compose) {
      lines.push(heading("Email ready — written as you"));
      lines.push("");
      if (d.to) lines.push(`To: ${d.to}`);
      if (d.subject) lines.push(`Subject: ${d.subject}`);
      if (d.body) {
        lines.push("");
        lines.push(String(d.body));
      }
      lines.push("");
      lines.push("When you send, pick Devcon, BIM Design Studio, or PS Estimating. That mailbox’s signature is added to the footer automatically.");
      continue;
    }
    if (d.technical) {
      const p = asRecord(d.pipeline);
      const s = asRecord(d.summary);
      const focus = String(d.focus || "pipeline");
      const live = Array.isArray(d.live) ? (d.live as Array<Record<string, unknown>>) : [];
      if (focus === "live") {
        lines.push(heading("Chief estimator dashboard (Technical Manager)"));
        lines.push("");
        lines.push(`Live projects: ${p.total ?? live.length}`);
        lines.push(`Not assigned ${p.notAssigned ?? 0} · assigned ${p.assigned ?? 0} · takeoff ready ${p.takeoffDone ?? 0}`);
        lines.push(`Pricing ${p.pricing ?? 0} · QA/delivery ${p.finalSubmission ?? 0}`);
        lines.push("");
        live.forEach((job, i) => {
          const estimators = Array.isArray(job.estimators) ? (job.estimators as Array<Record<string, unknown>>) : [];
          const who = estimators.length
            ? estimators.map(e => {
                const hrs = [e.manHours ? `planned ${e.manHours}` : "", e.logged ? `logged ${e.logged}` : ""].filter(Boolean).join(", ");
                return `${e.name}${e.code && e.code !== "—" ? ` (${e.code})` : ""}${hrs ? ` · ${hrs}` : ""}${e.takeoffDone ? " · takeoff done" : ""}${e.overdue ? " · OVERDUE" : ""}`;
              }).join("; ")
            : "Unassigned";
          lines.push(`${i + 1}. ${job.code || "—"} — ${job.title || "Untitled"}`);
          lines.push(`   Status: ${job.phase || "—"}`);
          lines.push(`   Estimator: ${who}`);
          lines.push("");
        });
        continue;
      }
      if (focus === "count") {
        lines.push(heading("Technical projects"));
        lines.push("");
        lines.push(`Right now: ${p.total ?? 0} projects.`);
        continue;
      }
      lines.push(heading("Technical pipeline"));
      lines.push("");
      lines.push(`Projects: ${p.total ?? 0}`);
      lines.push(`Not assigned ${p.notAssigned ?? 0} · assigned ${p.assigned ?? 0} · takeoff ready ${p.takeoffDone ?? 0}`);
      lines.push(`Pricing ${p.pricing ?? 0} · QA/delivery ${p.finalSubmission ?? 0}`);
      if (focus === "full" || focus === "scoreboard") {
        lines.push("");
        lines.push(`Assignments: ${s.totalAssignments ?? 0} · pending ${s.pending ?? 0} · completed ${s.completed ?? 0} · overdue ${s.overdue ?? 0}`);
        lines.push(`Timers ${s.timersRunning ?? 0} · logged ${s.logged ?? "0h"} · completion ${s.completionRate ?? 0}%`);
        lines.push(`Revisions ${s.revisions ?? 0} · emergency morning ${s.emergencyMorning ?? 0} / COB ${s.emergencyCob ?? 0}`);
      }
      const board = Array.isArray(d.scoreboard) ? (d.scoreboard as Array<Record<string, unknown>>) : [];
      if ((focus === "full" || focus === "scoreboard") && board.length) {
        lines.push("");
        lines.push(heading("Estimator scoreboard"));
        lines.push("");
        for (const m of board) {
          lines.push(heading(`${m.name} (${m.code})`));
          lines.push(`${m.assigned} assigned · ${m.pending} pending · ${m.completed} done · ${m.overdue} overdue`);
          lines.push(`Score ${m.score}`);
          lines.push("");
        }
      }
      continue;
    }
    if (d.person) {
      lines.push(formatPerson(d, String(asRecord(r.args).intent || "")));
      continue;
    }
    if (d.estimator) {
      lines.push(heading(`${d.name} (${d.code || "—"})`));
      lines.push("");
      lines.push(`Assigned ${d.assigned ?? 0} · pending ${d.pending ?? 0} · completed ${d.completed ?? 0} · overdue ${d.overdue ?? 0}`);
      lines.push(`Timers ${d.timers ?? 0} · logged ${d.logged ?? "0h"} / planned ${d.plannedHours ?? 0}h`);
      lines.push(`Score ${d.score ?? 0} · completion ${d.completionRate ?? 0}%`);
      const jobs = Array.isArray(d.projects) ? (d.projects as Array<Record<string, unknown>>) : [];
      if (jobs.length) {
        lines.push("");
        jobs.forEach((p, i) => {
          lines.push(
            `${i + 1}. ${p.code || "—"} — ${p.title || "Untitled"} · ${p.phase || "—"} · takeoff ${p.takeoffDone ? "done" : "open"}${p.overdue ? " · OVERDUE" : ""}${p.timerRunning ? " · timer on" : ""}`,
          );
        });
      }
      continue;
    }
    if (d.payments) {
      const t = asRecord(d.totals);
      const b = asRecord(d.statusBreakdown);
      lines.push(`Payments — ${d.month || "all"}`);
      lines.push(
        `Quoted ${Math.round(Number(t.quotedAmount) || 0).toLocaleString("en-US")} · collected ${Math.round(Number(t.collectedAmount) || 0).toLocaleString("en-US")} · outstanding ${Math.round(Number(t.outstandingAmount) || 0).toLocaleString("en-US")} · rate ${t.collectionRate ?? 0}%.`,
      );
      lines.push(`Paid ${b.paid ?? 0} · partial ${b.partial ?? 0} · unpaid ${b.unpaid ?? 0} · projects ${t.projectCount ?? 0}.`);
      const ch = Array.isArray(d.channels) ? (d.channels as Array<Record<string, unknown>>) : [];
      if (ch.length) {
        lines.push("Channels: " + ch.map(c => `${c.label} (${c.paymentCount})`).join(" · "));
      }
      continue;
    }
    if (d.staff) {
      const roles = asRecord(d.byRole);
      lines.push(`Staff: ${d.total ?? 0} on Admin → Users/Employees · ${d.online ?? 0} online.`);
      lines.push(
        Object.entries(roles)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · "),
      );
      const people = Array.isArray(d.people) ? (d.people as Array<Record<string, unknown>>) : [];
      const live = people.filter(p => p.online).slice(0, 12);
      if (live.length) {
        lines.push("Online now: " + live.map(p => `${p.name} (${p.role})`).join(", "));
      }
      continue;
    }
    if (d.csrDesk && Array.isArray(d.desks)) {
      const desks = d.desks as Array<Record<string, unknown>>;
      const online = Number(d.online ?? desks.filter(c => c.online).length);
      const active = Number(d.active ?? desks.length);
      lines.push(heading(`CSRs: ${active} on roster · ${online} online now`));
      lines.push("");
      if (!desks.length) {
        lines.push("No CSR records found.");
      } else {
        for (const c of desks) {
          lines.push(heading(`${c.name} (${c.code || "—"}${c.online ? " · online" : ""})`));
          lines.push(`${c.total} leads · pending ${c.pending} · interested ${c.interested} · closed ${c.closed}`);
          lines.push("");
        }
      }
      continue;
    }
    if (d.accountsReport || d.result === "profit" || d.result === "loss" || d.result === "break-even") {
      const net = Number(d.netProfit) || 0;
      const result = String(d.result || (net > 0 ? "profit" : net < 0 ? "loss" : "break-even"));
      const page = String(d.page || "reports");
      const pageLabel =
        page === "income-statement" ? "Income Statement"
        : page === "balance-sheet" ? "Balance Sheet"
        : page === "cash-flow-statement" ? "Cash Flow Statement"
        : page === "dashboard" ? "Accounts Dashboard"
        : page === "total-assets" ? "Total Assets"
        : page.includes("payroll") ? page.replace(/-/g, " ")
        : "Accounts Reports";
      lines.push(heading(`${pageLabel} — ${d.month}`));
      lines.push("");
      lines.push(`Actual revenue: PKR ${Math.round(Number(d.revenue) || 0).toLocaleString("en-US")}`);
      lines.push(`Total cost: PKR ${Math.round(Number(d.expense ?? d.totalCost) || 0).toLocaleString("en-US")}`);
      lines.push(`Payroll: PKR ${Math.round(Number(d.payroll) || 0).toLocaleString("en-US")}`);
      lines.push(`OPEX: PKR ${Math.round(Number(d.opex) || 0).toLocaleString("en-US")}`);
      lines.push(`Profit / Loss: ${result} · PKR ${Math.round(net).toLocaleString("en-US")}`);
      if (d.sourceDate) lines.push(`Snapshot: ${d.sourceDate}`);
      lines.push("");
      lines.push("Say “download pdf” for the Accounts Reports file (graphs included).");
      continue;
    }
    if (d.history) {
      lines.push(formatHistory(d, focus));
      continue;
    }
    if (Array.isArray(d.projects)) {
      for (const p of d.projects as Array<Record<string, unknown>>) {
        lines.push(
          `${p.projectCode || p.clientCode || "Project"} — ${p.projectTitle || p.name}: stage ${p.pipeline || p.stage}. Takeoff ${p.takeoffDone ? "done" : "pending"}, pricing ${p.inPricing ? "yes" : "not sent yet"}. Client: ${p.name} / ${p.company}.`,
        );
      }
      continue;
    }
    if (d.client && typeof d.client === "object") {
      lines.push(...formatRecord(d.client as Record<string, unknown>));
      const notes = Array.isArray(d.recentNotes) ? d.recentNotes as Array<Record<string, unknown>> : [];
      const calls = Array.isArray(d.recentCalls) ? d.recentCalls as Array<Record<string, unknown>> : [];
      if (notes.length) {
        lines.push("");
        lines.push(heading("Notes"));
        for (const note of notes) lines.push(`- ${note.at ?? ""} ${note.text ?? ""}`.trim());
      }
      if (calls.length) {
        lines.push("");
        lines.push(heading("Calls"));
        for (const call of calls) lines.push(`- ${call.at ?? ""} ${call.status ?? ""} ${call.notes ?? ""}`.trim());
      }
      continue;
    }
    if (Array.isArray(d.matches)) {
      if (!d.matches.length) lines.push("No matching client found (or you do not have access).");
      else {
        const rows = (d.matches as Array<Record<string, unknown>>).slice(0, 8);
        lines.push(heading(`${rows.length} client record${rows.length === 1 ? "" : "s"}`));
        for (const c of rows) {
          lines.push("");
          lines.push(...formatRecord(c));
        }
        if (d.matches.length > 8) lines.push(`…and ${Number(d.matches.length) - 8} more. Ask for one name, phone, or email.`);
      }
      continue;
    }
    if (d.needPick) {
      lines.push(String(d.message || "Several matches — specify the client."));
      continue;
    }
    if (d.found === false) {
      lines.push(String(d.message || "No matching record found (or you do not have access)."));
      continue;
    }
    if (typeof d.totalLeads === "number") {
      lines.push(
        `CRM totals: ${d.totalLeads} leads · pending ${d.pending ?? 0} · interested ${d.interested ?? 0} · scheduled ${d.scheduled ?? 0} · closed projects ${d.closedProjects ?? 0} · projects ${d.projects ?? 0} · bin ${d.inBin ?? 0} · revisions ${d.revisions ?? 0}.`,
      );
      lines.push(
        `People: ${d.activeUsers ?? 0} active users · ${d.estimators ?? 0} estimators · ${d.onlineCSRs ?? 0} CSRs online.`,
      );
      if (d.projectStages && typeof d.projectStages === "object") {
        const stages = Object.entries(d.projectStages as Record<string, number>)
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ");
        if (stages) lines.push(`Project stages: ${stages}.`);
      }
      continue;
    }
    if (typeof d.assignedLeads === "number") {
      lines.push(`Your assigned leads: ${d.assignedLeads}. Added in ${d.month ?? "this month"}: ${d.addedThisMonth ?? 0}.`);
      continue;
    }
    if (typeof d.assignedProjects === "number") {
      lines.push(
        `Your assigned projects: ${d.assignedProjects}. Takeoff done: ${d.takeoffDone ?? 0}. Pricing sent: ${d.inPricing ?? 0}.`,
      );
      continue;
    }
    if (d.message) {
      lines.push(String(d.message));
      continue;
    }
    lines.push("I found CRM data for that question, but need a more specific ask (client name, project code, or month).");
  }
  return lines.join("\n") || "I could not find that in the CRM.";
}

function collectActions(results: unknown[], wantsPdf = false): AssistantAction[] {
  const actions: AssistantAction[] = [];
  for (const raw of results) {
    const out = asRecord(raw);
    const d = asRecord(out.data);
    if (d.compose && d.to) {
      actions.push({
        type: "compose_email",
        to: String(d.to),
        clientName: d.clientName ? String(d.clientName) : undefined,
        company: d.company ? String(d.company) : undefined,
        intent: d.intent ? String(d.intent) : undefined,
        subject: d.subject ? String(d.subject) : undefined,
        body: d.body ? String(d.body) : undefined,
        notes: d.notes ? String(d.notes) : undefined,
      });
    }
    if (d.accountsReport && d.month && wantsPdf) {
      actions.push({
        type: "download_accounts_pdf",
        month: String(d.month),
        page: "reports",
      });
    }
  }
  return actions;
}

function toolsUsed(results: unknown[]): string[] {
  const names: string[] = [];
  for (const raw of results) {
    const n = String(asRecord(raw).tool || "").trim();
    if (n && !names.includes(n)) names.push(n);
  }
  return names;
}

async function ensureEmailDraft(
  actor: AssistantActor,
  message: string,
  history: ChatTurn[],
  results: unknown[],
): Promise<unknown[]> {
  if (!wantsEmailIntent(message.toLowerCase())) return results;
  if (collectActions(results).some(a => a.type === "compose_email" && a.to)) return results;
  const email = parseEmail(message);
  const query = email || extractSearchQuery(message) || lastFocusFromHistory(history);
  if (!query) {
    return [
      ...results,
      {
        tool: "prepareClientEmail",
        ok: true,
        args: {},
        data: {
          needPick: true,
          message: "Which client should I email? Name, email, phone, or client code.",
        },
      },
    ];
  }
  const out = await TOOL_HANDLERS.prepareClientEmail(actor, {
    query,
    intent: extractEmailPurpose(message) || message,
  });
  return [...results, { tool: "prepareClientEmail", args: { query }, ...out }];
}

function recapChat(history: ChatTurn[]): string {
  const turns = history.filter(t => t.text.trim()).slice(-14);
  if (!turns.length) return "This chat is empty so far. Ask about a staff member, client, or accounts month.";
  const lines = [heading("This chat so far"), ""];
  for (const t of turns) {
    const who = t.role === "user" ? "You" : "Nexa";
    const bit = t.text.replace(/\s+/g, " ").trim().slice(0, 220);
    lines.push(`- **${who}:** ${bit}`);
  }
  lines.push("");
  lines.push("I still have this context. Ask a follow-up — I will answer from this chat plus live CRM.");
  return lines.join("\n");
}

function clientLookupMissed(results: unknown[]): boolean {
  return results.some(raw => {
    const r = asRecord(raw);
    const tool = String(r.tool || "");
    if (!/getClientHistory|searchClients|getClientDetails/.test(tool)) return false;
    const d = asRecord(r.data);
    if (d.found === false) return true;
    if (Array.isArray(d.matches) && d.matches.length === 0) return true;
    return /no (matching )?client/i.test(String(d.message || ""));
  });
}

async function recoverStaffIfNeeded(
  actor: AssistantActor,
  message: string,
  history: ChatTurn[],
  results: unknown[],
): Promise<unknown[]> {
  if (parseEmail(message)) return results;
  if (results.some(raw => asRecord(asRecord(raw).data).person === true)) return results;
  const kind = lastEntityKind(history);
  const q = (extractPersonName(extractSearchQuery(message) || lastFocusFromHistory(history))
    || lastFocusFromHistory(history)).trim();
  if (q.length < 3) return results;
  const should = clientLookupMissed(results) || kind === "person";
  if (!should) return results;
  const out = await TOOL_HANDLERS.getPersonSnapshot(actor, {
    query: q,
    intent: message,
    month: "",
    day: "",
  });
  if (!out.ok) return results;
  const pd = asRecord(out.data);
  if (!pd.person) return results;
  const kept = results.filter(raw => !/getClientHistory|searchClients|getClientDetails/.test(String(asRecord(raw).tool || "")));
  return [{ tool: "getPersonSnapshot", args: { query: q, intent: message }, ...out }, ...kept];
}

async function runRegexTools(
  actor: AssistantActor,
  message: string,
  history: ChatTurn[],
): Promise<unknown[]> {
  const focus = lastFocusFromHistory(history);
  const resolved = resolveWithHistory(message, history);
  let planned = preferFollowUpPlan(message, focus, lastEntityKind(history)) ?? planTools(resolved);
  if (!planned.length) {
    planned = fallbackPlan(resolved, isFollowUp(message) ? focus : "");
  }

  const results: unknown[] = [];
  for (const call of planned.slice(0, 3)) {
    const fn = TOOL_HANDLERS[call.tool];
    const out = await (fn as (actor: AssistantActor, args: Record<string, string>) => ReturnType<typeof fn>)(
      actor,
      call.args,
    );
    results.push({ tool: call.tool, args: call.args, ...out });
  }

  return recoverStaffIfNeeded(actor, message, history, results);
}

function hasFastPlan(message: string, history: ChatTurn[]): boolean {
  const focus = lastFocusFromHistory(history);
  const planned = preferFollowUpPlan(message, focus, lastEntityKind(history))
    ?? planTools(resolveWithHistory(message, history));
  return planned.length > 0;
}

function structuredEnough(results: unknown[]): boolean {
  return results.some(raw => {
    const d = asRecord(asRecord(raw).data);
    return !!(
      d.person
      || d.accountsReport
      || d.compose
      || d.history
      || d.technical
      || d.payments
      || d.staff
      || Array.isArray(d.matches)
    );
  });
}

export async function runAssistantChat(opts: {
  userId: string;
  role: string;
  message: string;
  history?: ChatTurn[];
}): Promise<{
  reply: string;
  actions: AssistantAction[];
  usedOllama: boolean;
  source: "agent" | "rules";
  tools: string[];
}> {
  if (!opts.role) {
    return {
      reply: "Sign in to use Nexa.",
      actions: [],
      usedOllama: false,
      source: "rules",
      tools: [],
    };
  }
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { id: true, name: true, role: true },
  });
  const actor: AssistantActor = {
    id: opts.userId,
    role: opts.role,
    name: user?.name ?? "",
  };

  const message = normalizeLookupText(opts.message.trim());
  const chatter = detectChatter(message);
  if (chatter) {
    return {
      reply: chatterReply(chatter, actor.name),
      actions: [],
      usedOllama: false,
      source: "rules",
      tools: [],
    };
  }

  if (!isCrmScopedQuestion(message)) {
    return {
      reply: OUT_OF_SCOPE_REPLY,
      actions: [],
      usedOllama: false,
      source: "rules",
      tools: [],
    };
  }

  const history = opts.history ?? [];
  const walkthroughOnly = wantsWalkthrough(message)
    && !extractSearchQuery(message.replace(/\b(go through|go thru|walk through|yeh chat|this chat|is chat|poori chat|saari chat|peechli chat|previous chat|chat context|remind(?: me| kr| karo)?|is conversation)\b/gi, " "));
  if (walkthroughOnly) {
    return {
      reply: recapChat(history),
      actions: [],
      usedOllama: false,
      source: "rules",
      tools: [],
    };
  }

  const pdf = wantsPdfDownload(message);
  const live = hasFastPlan(message, history) ? false : await ollamaIsUp();
  const agent = live ? await runAgentLoop({ actor, message, history }) : null;
  let results: unknown[] = agent?.results?.length ? [...agent.results] : [];
  if (!results.length) {
    results = await runRegexTools(actor, message, history);
  }
  results = await recoverStaffIfNeeded(actor, message, history, results);
  results = await ensureEmailDraft(actor, message, history, results);

  for (const raw of results) {
    const err = String(asRecord(raw).error || "");
    if (err.includes("own dashboard")) {
      return {
        reply: err,
        actions: [],
        usedOllama: false,
        source: "rules",
        tools: toolsUsed(results),
      };
    }
  }

  const mailActions = collectActions(results, pdf).filter(a => a.type === "compose_email" && a.to);
  if (mailActions.length) {
    return {
      reply: "Composer is open with your draft. Review it, change it with Nexa if you want, then send.",
      actions: mailActions,
      usedOllama: !!agent,
      source: "agent",
      tools: toolsUsed(results),
    };
  }

  const accountsHit = results.some(raw => asRecord(asRecord(raw).data).accountsReport === true);
  if (accountsHit || structuredEnough(results)) {
    return {
      reply: formatFallback(results),
      actions: collectActions(results, pdf),
      usedOllama: false,
      source: "rules",
      tools: toolsUsed(results),
    };
  }

  if (results.length) {
    const actions = collectActions(results, pdf);
    const tools = toolsUsed(results);
    const grounded = live
      ? await generateGroundedAnswer({
          message,
          history,
          results,
        })
      : null;
    if (grounded && !looksLikeWorldKnowledge(grounded) && !/no (matching )?client/i.test(grounded)) {
      return { reply: grounded, actions, usedOllama: true, source: "agent", tools };
    }
    if (
      agent?.clarification
      && looksLikeModelAnswer(agent.clarification)
      && !looksLikeWorldKnowledge(agent.clarification)
      && !/no (matching )?client/i.test(agent.clarification)
    ) {
      return { reply: agent.clarification, actions, usedOllama: true, source: "agent", tools };
    }
    return {
      reply: formatFallback(results),
      actions,
      usedOllama: !!agent,
      source: "rules",
      tools,
    };
  }
  if (agent?.clarification && !looksLikeWorldKnowledge(agent.clarification)) {
    return {
      reply: agent.clarification,
      actions: [],
      usedOllama: true,
      source: "agent",
      tools: [],
    };
  }

  return {
    reply: "I could not find that in the CRM.",
    actions: [],
    usedOllama: false,
    source: "rules",
    tools: [],
  };
}
