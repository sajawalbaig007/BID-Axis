"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAssistantChat = runAssistantChat;
const db_1 = __importDefault(require("../config/db"));
const intent_1 = require("./intent");
const ollama_1 = require("./ollama");
const tools_1 = require("./tools");
function chatterReply(kind, name) {
    const who = name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : "";
    if (kind === "thanks")
        return "Anytime. What should I look up next?";
    return `Hey${who}. Ask any CRM detail — client, CSR, technical/estimator, payments, accounts month, staff, or stats. I’ll look it up.`;
}
function asRecord(raw) {
    return raw && typeof raw === "object" ? raw : {};
}
function heading(text) {
    return `**${text}**`;
}
function formatHistory(d, focus) {
    const name = String(d.name || "This client");
    const lines = [heading(name), ""];
    if (focus === "count") {
        return `${heading(name)}\n\n${d.projectCount ?? 0} projects to date.`;
    }
    if (focus === "money") {
        return `${heading(name)}\n\nQuoted: ${d.quotedLabel ?? "$0"}\nPaid: ${d.paidLabel ?? "$0"}`;
    }
    if (focus === "contact") {
        if (d.email)
            lines.push(`Email: ${d.email}`);
        if (d.phone)
            lines.push(`Phone: ${d.phone}`);
        if (d.company)
            lines.push(`Company: ${d.company}`);
        return lines.join("\n");
    }
    if (d.email)
        lines.push(`Email: ${d.email}`);
    if (d.phone)
        lines.push(`Phone: ${d.phone}`);
    if (d.company)
        lines.push(`Company: ${d.company}`);
    if (focus === "projects") {
        lines.push("");
    }
    else {
        lines.push("");
        lines.push(`Projects to date: ${d.projectCount ?? 0}`);
        lines.push(`Quoted: ${d.quotedLabel ?? "$0"}`);
        lines.push(`Paid: ${d.paidLabel ?? "$0"}`);
    }
    const projects = Array.isArray(d.projects) ? d.projects : [];
    if (focus === "history" || focus === "projects") {
        if (projects.length) {
            lines.push("");
            projects.forEach((p, i) => {
                lines.push(`${i + 1}. ${p.code} — ${p.title} — ${p.status} — quoted ${p.quotedLabel} — paid ${p.paidLabel}`);
            });
        }
    }
    return lines.join("\n");
}
function jobLine(p, i) {
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
function formatPerson(d, asked) {
    const role = d.role ? String(d.role).replace(/_/g, " ") : "";
    const title = heading(`${d.name}${d.code ? ` (${d.code})` : ""}${role ? ` · ${role}` : ""}`);
    const focus = (0, intent_1.personFocus)(asked);
    const est = asRecord(d.estimator);
    const csr = asRecord(d.csr);
    const ck = asRecord(d.checkin);
    const jobs = Array.isArray(est.projects) ? est.projects : [];
    const lines = [title, ""];
    const pushEstimatorJobs = () => {
        if (!jobs.length) {
            lines.push("No live assignments on the technical dashboard.");
            return;
        }
        lines.push("");
        jobs.forEach((p, i) => lines.push(jobLine(p, i + 1), ""));
    };
    if (focus === "count") {
        if (Object.keys(est).length) {
            lines.push(`Projects covering now: ${est.assigned ?? 0}`);
            lines.push(`Pending ${est.pending ?? 0} · done ${est.completed ?? 0} · overdue ${est.overdue ?? 0}`);
            lines.push(`Logged ${est.logged ?? "0h"}${est.plannedHours != null ? ` · planned ${est.plannedHours}h` : ""}`);
            pushEstimatorJobs();
            return lines.join("\n").trim();
        }
        if (Object.keys(csr).length) {
            lines.push(`CSR leads: ${csr.total ?? 0}`);
            lines.push(`Pending ${csr.pending ?? 0} · interested ${csr.interested ?? 0} · closed ${csr.closed ?? 0}`);
            return lines.join("\n");
        }
        lines.push("No project count on file for this person.");
        return lines.join("\n");
    }
    if (focus === "contact") {
        if (d.email)
            lines.push(`Email: ${d.email}`);
        if (d.phone)
            lines.push(`Phone: ${d.phone}`);
        if (!d.email && !d.phone)
            lines.push("No email or phone on file.");
        return lines.join("\n");
    }
    if (d.email)
        lines.push(`Email: ${d.email}`);
    if (d.phone)
        lines.push(`Phone: ${d.phone}`);
    if (d.employeeCode)
        lines.push(`Employee code: ${d.employeeCode}`);
    if (Object.keys(ck).length) {
        const when = ck.isToday === false && ck.day ? String(ck.day) : "today";
        if (ck.checkedIn) {
            lines.push(`Check-in ${when}: YES at ${ck.checkInAtEst || "—"}${ck.paused ? " · paused" : ""}`);
            lines.push(`On dashboard: ${ck.duration || "—"}`);
        }
        else if (ck.hadSessionToday) {
            lines.push(`Check-in ${when}: YES at ${ck.checkInAtEst || "—"}`);
            if (ck.checkedOutAtEst)
                lines.push(`Checked out: ${ck.checkedOutAtEst}`);
            if (ck.duration)
                lines.push(`Time on dashboard: ${ck.duration}`);
        }
        else {
            lines.push(`Check-in ${when}: NO session.`);
        }
        lines.push("");
        lines.push(`Portal: ${ck.online || d.online ? "online" : "offline"}`);
        if (ck.lastActive)
            lines.push(`Last active: ${ck.lastActive}`);
    }
    else {
        lines.push(`Portal: ${d.online ? "online" : "offline"} (no check-in record).`);
    }
    if (focus === "checkin")
        return lines.join("\n");
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
function formatFallback(results) {
    const lines = [];
    for (const raw of results) {
        const r = asRecord(raw);
        if (r.ok === false) {
            lines.push(String(r.error || "Could not complete that request."));
            continue;
        }
        const d = asRecord(r.data);
        const focus = String(asRecord(r.args).focus || "history");
        if (d.compose) {
            lines.push(heading("Email ready — written as you"));
            lines.push("");
            if (d.to)
                lines.push(`To: ${d.to}`);
            if (d.subject)
                lines.push(`Subject: ${d.subject}`);
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
            const live = Array.isArray(d.live) ? d.live : [];
            if (focus === "live") {
                lines.push(heading("Chief estimator dashboard (Technical Manager)"));
                lines.push("");
                lines.push(`Live projects: ${p.total ?? live.length}`);
                lines.push(`Not assigned ${p.notAssigned ?? 0} · assigned ${p.assigned ?? 0} · takeoff ready ${p.takeoffDone ?? 0}`);
                lines.push(`Pricing ${p.pricing ?? 0} · QA/delivery ${p.finalSubmission ?? 0}`);
                lines.push("");
                live.forEach((job, i) => {
                    const estimators = Array.isArray(job.estimators) ? job.estimators : [];
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
            const board = Array.isArray(d.scoreboard) ? d.scoreboard : [];
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
            const jobs = Array.isArray(d.projects) ? d.projects : [];
            if (jobs.length) {
                lines.push("");
                jobs.forEach((p, i) => {
                    lines.push(`${i + 1}. ${p.code || "—"} — ${p.title || "Untitled"} · ${p.phase || "—"} · takeoff ${p.takeoffDone ? "done" : "open"}${p.overdue ? " · OVERDUE" : ""}${p.timerRunning ? " · timer on" : ""}`);
                });
            }
            continue;
        }
        if (d.payments) {
            const t = asRecord(d.totals);
            const b = asRecord(d.statusBreakdown);
            lines.push(`Payments — ${d.month || "all"}`);
            lines.push(`Quoted ${Math.round(Number(t.quotedAmount) || 0).toLocaleString("en-US")} · collected ${Math.round(Number(t.collectedAmount) || 0).toLocaleString("en-US")} · outstanding ${Math.round(Number(t.outstandingAmount) || 0).toLocaleString("en-US")} · rate ${t.collectionRate ?? 0}%.`);
            lines.push(`Paid ${b.paid ?? 0} · partial ${b.partial ?? 0} · unpaid ${b.unpaid ?? 0} · projects ${t.projectCount ?? 0}.`);
            const ch = Array.isArray(d.channels) ? d.channels : [];
            if (ch.length) {
                lines.push("Channels: " + ch.map(c => `${c.label} (${c.paymentCount})`).join(" · "));
            }
            continue;
        }
        if (d.staff) {
            const roles = asRecord(d.byRole);
            lines.push(`Staff: ${d.total ?? 0} active · ${d.online ?? 0} online.`);
            lines.push(Object.entries(roles)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · "));
            const people = Array.isArray(d.people) ? d.people : [];
            const live = people.filter(p => p.online).slice(0, 12);
            if (live.length) {
                lines.push("Online now: " + live.map(p => `${p.name} (${p.role})`).join(", "));
            }
            continue;
        }
        if (d.csrDesk && Array.isArray(d.desks)) {
            const desks = d.desks;
            const online = Number(d.online ?? desks.filter(c => c.online).length);
            const active = Number(d.active ?? desks.length);
            lines.push(heading(`CSRs: ${active} on roster · ${online} online now`));
            lines.push("");
            if (!desks.length) {
                lines.push("No CSR records found.");
            }
            else {
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
            const pageLabel = page === "income-statement" ? "Income Statement"
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
            if (d.sourceDate)
                lines.push(`Snapshot: ${d.sourceDate}`);
            lines.push("");
            lines.push(`Download PDF is the same visual as the ${pageLabel} page.`);
            continue;
        }
        if (d.history) {
            lines.push(formatHistory(d, focus));
            continue;
        }
        if (Array.isArray(d.projects)) {
            for (const p of d.projects) {
                lines.push(`${p.projectCode || p.clientCode || "Project"} — ${p.projectTitle || p.name}: stage ${p.pipeline || p.stage}. Takeoff ${p.takeoffDone ? "done" : "pending"}, pricing ${p.inPricing ? "yes" : "not sent yet"}. Client: ${p.name} / ${p.company}.`);
            }
            continue;
        }
        if (d.client && typeof d.client === "object") {
            const c = d.client;
            lines.push(heading(`${c.name}`));
            lines.push("");
            lines.push(`${c.company || "—"}`);
            lines.push(`Phone: ${c.phone || "no phone"}`);
            lines.push(`Email: ${c.email || "no email"}`);
            lines.push(`Status: ${c.status}`);
            lines.push(`Project ${c.projectCode || "—"} · stage ${c.stage || "—"}`);
            lines.push(`Follow-up: ${c.followUp || "none"}`);
            continue;
        }
        if (Array.isArray(d.matches)) {
            if (!d.matches.length)
                lines.push("No matching client found (or you do not have access).");
            else {
                lines.push(String(d.message || `I found ${d.matches.length} matching records. Tell me the exact name, phone, or email:`));
                for (const c of d.matches.slice(0, 5)) {
                    lines.push(`- ${c.name} · ${c.phone || "—"} · ${c.email || "—"} · ${c.projectCode || "—"} · ${c.status}`);
                }
                if (d.matches.length > 5)
                    lines.push(`…and ${Number(d.matches.length) - 5} more. Please be more specific.`);
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
            lines.push(`CRM totals: ${d.totalLeads} leads · pending ${d.pending ?? 0} · interested ${d.interested ?? 0} · scheduled ${d.scheduled ?? 0} · closed projects ${d.closedProjects ?? 0} · projects ${d.projects ?? 0} · bin ${d.inBin ?? 0} · revisions ${d.revisions ?? 0}.`);
            lines.push(`People: ${d.activeUsers ?? 0} active users · ${d.estimators ?? 0} estimators · ${d.onlineCSRs ?? 0} CSRs online.`);
            if (d.projectStages && typeof d.projectStages === "object") {
                const stages = Object.entries(d.projectStages)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("; ");
                if (stages)
                    lines.push(`Project stages: ${stages}.`);
            }
            continue;
        }
        if (typeof d.assignedLeads === "number") {
            lines.push(`Your assigned leads: ${d.assignedLeads}. Added in ${d.month ?? "this month"}: ${d.addedThisMonth ?? 0}.`);
            continue;
        }
        if (typeof d.assignedProjects === "number") {
            lines.push(`Your assigned projects: ${d.assignedProjects}. Takeoff done: ${d.takeoffDone ?? 0}. Pricing sent: ${d.inPricing ?? 0}.`);
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
function shouldSkipOllama(_results) {
    return true;
}
async function runAssistantChat(opts) {
    if (opts.role !== "admin") {
        return {
            reply: "This assistant is only available to the CEO.",
            actions: [],
            usedOllama: false,
        };
    }
    const user = await db_1.default.user.findUnique({
        where: { id: opts.userId },
        select: { id: true, name: true, role: true },
    });
    const actor = {
        id: opts.userId,
        role: opts.role,
        name: user?.name ?? "",
    };
    const chatter = (0, intent_1.detectChatter)(opts.message);
    if (chatter) {
        return {
            reply: chatterReply(chatter, actor.name),
            actions: [],
            usedOllama: false,
        };
    }
    const history = opts.history ?? [];
    const focus = (0, intent_1.lastFocusFromHistory)(history);
    const resolved = (0, intent_1.resolveWithHistory)(opts.message, history);
    let planned = (0, intent_1.preferFollowUpPlan)(opts.message, focus) ?? (0, intent_1.planTools)(resolved);
    if (!planned.length) {
        planned = (0, intent_1.fallbackPlan)(resolved, (0, intent_1.isFollowUp)(opts.message) ? focus : "");
    }
    const results = [];
    const actions = [];
    for (const call of planned.slice(0, 3)) {
        const fn = tools_1.TOOL_HANDLERS[call.tool];
        const out = await fn(actor, call.args);
        results.push({ tool: call.tool, args: call.args, ...out });
        if (out.ok && out.data && typeof out.data === "object") {
            const d = out.data;
            if (d.compose && d.to) {
                actions.push({
                    type: "compose_email",
                    to: d.to,
                    clientName: d.clientName,
                    company: d.company,
                    intent: d.intent,
                    subject: d.subject,
                    body: d.body,
                    notes: d.notes,
                });
            }
            if (d.accountsReport && d.month) {
                actions.push({ type: "download_accounts_pdf", month: d.month, page: d.page || "reports" });
            }
        }
    }
    const firstData = asRecord(asRecord(results[0]).data);
    if (firstData.found === false && planned[0]?.tool === "getClientHistory") {
        const q = String(planned[0].args.query || focus).trim();
        if (q.length >= 3) {
            const out = await tools_1.TOOL_HANDLERS.getPersonSnapshot(actor, {
                query: q,
                intent: opts.message,
                month: "",
                day: "",
            });
            if (out.ok) {
                const pd = asRecord(out.data);
                if (pd.person) {
                    results.splice(0, results.length, { tool: "getPersonSnapshot", args: { query: q, intent: opts.message }, ...out });
                }
            }
        }
    }
    const templated = formatFallback(results);
    if (!shouldSkipOllama(results)) {
        const drafted = await (0, ollama_1.ollamaSummarize)({
            userMessage: opts.message,
            toolResults: results,
        });
        if (drafted) {
            return { reply: drafted, actions, usedOllama: true };
        }
    }
    return {
        reply: templated,
        actions,
        usedOllama: false,
    };
}
