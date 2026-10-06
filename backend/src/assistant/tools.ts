import { Prisma } from "@prisma/client";
import prisma from "../config/db";
import { parseTechnicalAssignments, assignmentBelongsToEstimator } from "../utils/technicalEstimators";
import { buildTechnicalMonitoring } from "../utils/technicalMonitoring";
import { buildPaymentsSummary } from "../utils/paymentsSummary";
import { getCsrWorkSessionStatus } from "../utils/csrSessionTracking";
import { pickLatestMeaningful } from "../utils/accountsSnapshot";
import {
  aggregateCollectionsForMonths,
  applyCollectionsToDashboardData,
  emptyDayCollections,
} from "../utils/projectCurrencyCollections";
import { currencyFormulaTotalFromDashboard } from "../utils/currencyFormula";
import { defaultAccountsData } from "../utils/accountsDefaults";
import { publicSenders, draftClientMail } from "../utils/clientMail";
import { estDateYmd, estDayBoundsUtc, formatDurationMs, formatEstDateTime } from "../utils/estTime";
import { parseMoney, parseProjectPayments, paidTotalFromEntries } from "../utils/projectPayments";
import { clientCodeFamilyKey } from "../utils/adminClientQueries";
import { fuzzyNameHit, isNearFiller, bestNameMatch, nameScore } from "./fuzzy";
import type { AssistantActor } from "./permissions";
import {
  canEmailClients,
  canReadAccounts,
  canReadPayments,
  canReadProjects,
  canReadStaff,
  canReadStats,
  canReadTechnical,
  canSearchClients,
  deny,
} from "./permissions";

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
  website: true,
  timezone: true,
  state: true,
  trade: true,
  subTrades: true,
  ownerName: true,
  projectScope: true,
  nextTime: true,
  important: true,
  interested: true,
  deadlineTiming: true,
  projectSource: true,
  isOldClient: true,
  projectDesk: true,
  needsRevision: true,
  revisionNotes: true,
  notInterestedCount: true,
  notPickedCount: true,
  binReason: true,
  technicalAssignments: true,
  inBin: true,
  createdAt: true,
  updatedAt: true,
  csr: { select: { id: true, name: true, csrCode: true } },
} as const;

type LeadRow = Awaited<ReturnType<typeof prisma.lead.findFirst<{ select: typeof LEAD_SELECT }>>>;

function visibleLead(actor: AssistantActor, lead: { assignedTo: string; technicalAssignments?: string | null; inBin?: boolean | null }) {
  if (lead.inBin === true && actor.role === "csr") return false;
  if (actor.role === "admin" || actor.role === "manager" || actor.role === "technical_manager") return true;
  if (actor.role === "csr") return lead.assignedTo === actor.id;
  if (actor.role === "estimator") {
    const list = parseTechnicalAssignments(lead.technicalAssignments);
    return list.some(a => assignmentBelongsToEstimator(a, actor));
  }
  return false;
}

function phaseLabel(phase: string | null | undefined) {
  const p = (phase ?? "not_started").toLowerCase();
  if (p === "qa_phase") return "QA / final submission";
  if (p === "delivery_phase") return "Delivery";
  if (p.startsWith("pricing")) return "Pricing";
  if (p === "takeoff_completed") return "Takeoff completed";
  if (p === "not_started") return "Not started (takeoff)";
  return phase || "Unknown";
}

function summarizeLead(lead: NonNullable<LeadRow>) {
  const assignments = parseTechnicalAssignments(lead.technicalAssignments);
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
    website: lead.website,
    timezone: lead.timezone,
    state: lead.state,
    trade: lead.trade,
    subTrades: lead.subTrades,
    ownerName: lead.ownerName,
    projectScope: lead.projectScope,
    nextTime: lead.nextTime,
    important: lead.important,
    interested: lead.interested,
    deadlineTiming: lead.deadlineTiming,
    projectSource: lead.projectSource,
    isOldClient: lead.isOldClient,
    projectDesk: lead.projectDesk,
    needsRevision: lead.needsRevision,
    revisionNotes: lead.revisionNotes,
    comments: lead.comments,
    followUpNotes: lead.followUpNotes,
    projectNotes: lead.projectNotes,
    notInterestedCount: lead.notInterestedCount,
    notPickedCount: lead.notPickedCount,
    binReason: lead.binReason,
    projectPayments: lead.projectPayments,
    inBin: lead.inBin,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    estimators: assignments.map(a => ({
      name: a.estimatorName,
      takeoffDone: a.takeoffDone,
      pricingSent: a.pricingSent,
      deadline: a.deadline,
      manHours: a.manHours,
    })),
  };
}

function identityKey(s: {
  id: string;
  email?: string | null;
  phone?: string | null;
  clientCode?: string | null;
  projectCode?: string | null;
}) {
  const e = (s.email ?? "").trim().toLowerCase();
  if (e.includes("@")) return `e:${e}`;
  const p = (s.phone ?? "").replace(/\D/g, "").slice(-10);
  if (p.length >= 7) return `p:${p}`;
  const code = clientCodeFamilyKey(s.clientCode, s.projectCode);
  if (code) return code;
  return `id:${s.id}`;
}

function collapseSamePerson<T extends Parameters<typeof identityKey>[0]>(matches: T[]): T[] {
  const map = new Map<string, T>();
  for (const m of matches) {
    const key = identityKey(m);
    if (!map.has(key)) map.set(key, m);
  }
  return [...map.values()];
}

function preferQueryHits<T extends {
  email?: string | null;
  phone?: string | null;
  clientCode?: string | null;
  projectCode?: string | null;
}>(matches: T[], query?: string): T[] {
  const q = (query ?? "").trim().toLowerCase();
  if (q.length < 2) return matches;
  const exactCode = matches.filter(m =>
    (m.clientCode ?? "").toLowerCase() === q || (m.projectCode ?? "").toLowerCase() === q,
  );
  if (exactCode.length) return exactCode;
  if (q.includes("@")) {
    const exactEmail = matches.filter(m => (m.email ?? "").toLowerCase() === q);
    if (exactEmail.length) return exactEmail;
  }
  return matches;
}

function moneyOf(lead: { paidAmount?: string | null; projectBudget?: string | null; projectPayments?: string | null }) {
  const fromPayments = paidTotalFromEntries(parseProjectPayments(lead.projectPayments));
  const paid = fromPayments > 0 ? fromPayments : parseMoney(lead.paidAmount);
  const quoted = parseMoney(lead.projectBudget);
  return { paid, quoted };
}

function isWonStatus(status: string | null | undefined) {
  const s = (status ?? "").trim().toLowerCase();
  return s === "close client" || s === "completed" || s === "closed";
}

function isProjectRow(lead: { projectTitle?: string | null; projectCode?: string | null; clientCode?: string | null; status?: string | null }) {
  return !!(
    (lead.projectTitle ?? "").trim() ||
    (lead.projectCode ?? "").trim() ||
    (lead.clientCode ?? "").trim() ||
    isWonStatus(lead.status)
  );
}

function usd(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function lastPaymentOf(lead: { projectPayments?: string | null; paidAmount?: string | null }) {
  const entries = parseProjectPayments(lead.projectPayments).filter(e => e.isPaid);
  if (!entries.length) {
    const lump = parseMoney(lead.paidAmount);
    return lump > 0
      ? { amount: usd(lump), paidAt: null, type: "total-on-file", note: "No dated payment row; this is the paid total on the lead." }
      : null;
  }
  entries.sort((a, b) => {
    const tb = Date.parse(b.paidAt || b.createdAt || "") || 0;
    const ta = Date.parse(a.paidAt || a.createdAt || "") || 0;
    return tb - ta;
  });
  const e = entries[0]!;
  return {
    amount: usd(parseMoney(e.amount)),
    paidAt: e.paidAt || e.createdAt || null,
    type: e.type || "Payment",
  };
}

function lineTotal(row: { amount?: number; totalSalary?: number; subHeads?: { amount?: number }[] }) {
  const subs = row.subHeads ?? [];
  if (subs.length) return subs.reduce((a, s) => a + (Number(s.amount) || 0), 0);
  return Number(row.amount ?? row.totalSalary) || 0;
}

function sumHeads(rows: unknown) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((a, r) => a + lineTotal(r as { amount?: number; totalSalary?: number; subHeads?: { amount?: number }[] }), 0);
}

function containsCI(value: string): Prisma.StringFilter {
  return { contains: value, mode: "insensitive" };
}
function equalsCI(value: string): Prisma.StringFilter {
  return { equals: value, mode: "insensitive" };
}
function startsCI(value: string): Prisma.StringFilter {
  return { startsWith: value, mode: "insensitive" };
}

function leadTextClauses(q: string): Prisma.LeadWhereInput[] {
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
  const clauses: Prisma.LeadWhereInput[] = [
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

function subContactClauses(opts: { emails: string[]; phones: string[]; texts: string[] }): Prisma.SubContactWhereInput[] {
  const or: Prisma.SubContactWhereInput[] = [];
  for (const e of opts.emails) or.push({ email: equalsCI(e) });
  for (const p of opts.phones) {
    const suffix = p.slice(-10);
    if (suffix.length >= 7) or.push({ phone: { equals: suffix } }, { phone: { equals: p } });
  }
  for (const t of opts.texts) {
    if (t.length <= 2) or.push({ name: equalsCI(t) }, { name: startsCI(t) });
    else or.push({ name: containsCI(t) }, { email: equalsCI(t) });
  }
  return or;
}

function phoneVariants(digits: string): string[] {
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  return [...new Set([digits, last10, `+1${last10}`, `1${last10}`, `+${digits}`])];
}

const OWN_DESK = "You can only see clients on your own dashboard.";

async function outsideOwnDesk(actor: AssistantActor, where: Prisma.LeadWhereInput) {
  if (actor.role !== "csr") return false;
  const hit = await prisma.lead.findFirst({
    where: { AND: [where, { assignedTo: { not: actor.id } }] },
    select: { id: true },
  });
  return !!hit;
}

function toVisible(actor: AssistantActor, leads: NonNullable<LeadRow>[]) {
  const seen = new Set<string>();
  return leads.filter(l => {
    if (!l || seen.has(l.id) || !visibleLead(actor, l)) return false;
    seen.add(l.id);
    return true;
  }).map(summarizeLead);
}

export async function searchClients(actor: AssistantActor, args: { query?: string; phone?: string; email?: string }) {
  if (!canSearchClients(actor.role)) return deny("Your role cannot search clients.");
  const query = (args.query ?? "").trim();
  const emailArg = (args.email ?? "").trim().toLowerCase();
  const phoneArg = (args.phone ?? "").trim();

  const emails = new Set<string>();
  if (emailArg.includes("@")) emails.add(emailArg);
  const emailFromQuery = query.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
  for (const e of emailFromQuery) emails.add(e.toLowerCase());

  const phones = new Set<string>();
  const phoneArgDigits = phoneArg.replace(/\D/g, "");
  if (phoneArgDigits.length >= 7) phones.add(phoneArgDigits);
  const phoneFromQuery = query.match(/\+?\d[\d\s().-]{6,18}\d/);
  if (phoneFromQuery) {
    const d = phoneFromQuery[0].replace(/\D/g, "");
    if (d.length >= 7) phones.add(d);
  }
  const queryDigits = query.replace(/\D/g, "");
  if (queryDigits.length >= 7 && queryDigits.length <= 15 && !/[a-z]/i.test(query)) {
    phones.add(queryDigits);
  }

  let rest = query;
  for (const e of emails) {
    rest = rest.replace(new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
  }
  if (phoneFromQuery) rest = rest.replace(phoneFromQuery[0], " ");
  rest = rest.replace(/\s+/g, " ").trim();
  const texts: string[] = [];
  if (rest.length >= 2) texts.push(rest);

  const csrScope = actor.role === "csr" ? { assignedTo: actor.id } : {};

  if (emails.size) {
    const list = [...emails];
    const [exact, subs] = await Promise.all([
      prisma.lead.findMany({
        where: { AND: [csrScope, { OR: list.map(e => ({ email: equalsCI(e) })) }] },
        select: LEAD_SELECT,
        take: 40,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.subContact.findMany({
        where: { OR: list.map(e => ({ email: equalsCI(e) })) },
        select: { leadId: true },
        take: 20,
      }),
    ]);
    const missing = subs.map(s => s.leadId).filter(id => !exact.some(l => l.id === id));
    const extra = missing.length
      ? await prisma.lead.findMany({ where: { id: { in: missing } }, select: LEAD_SELECT, take: 20 })
      : [];
    const visible = toVisible(actor, [...exact, ...extra]);
    if (visible.length) return { ok: true as const, data: { matches: visible, count: visible.length } };
    if (await outsideOwnDesk(actor, { OR: list.map(e => ({ email: equalsCI(e) })) })) return deny(OWN_DESK);
  }

  if (phones.size) {
    const variants = [...phones].flatMap(phoneVariants);
    const leads = await prisma.lead.findMany({
      where: { AND: [csrScope, { phone: { in: variants } }] },
      select: LEAD_SELECT,
      take: 20,
      orderBy: { updatedAt: "desc" },
    });
    const visible = toVisible(actor, leads);
    if (visible.length) return { ok: true as const, data: { matches: visible, count: visible.length } };
    if (await outsideOwnDesk(actor, { phone: { in: variants } })) return deny(OWN_DESK);
  }

  const or: Prisma.LeadWhereInput[] = [];
  for (const t of texts) or.push(...leadTextClauses(t));
  if (!or.length && !emails.size && !phones.size) {
    return deny("Give a name, email, phone, or client/project code to search.");
  }
  if (!or.length) {
    return { ok: true as const, data: { matches: [], count: 0 } };
  }

  const [leads, subHits] = await Promise.all([
    prisma.lead.findMany({
      where: { AND: [csrScope, { OR: or }] },
      select: LEAD_SELECT,
      take: 12,
      orderBy: { updatedAt: "desc" },
    }),
    (() => {
      const subOr = subContactClauses({ emails: [...emails], phones: [...phones], texts });
      if (!subOr.length) return Promise.resolve([] as { leadId: string }[]);
      return prisma.subContact.findMany({ where: { OR: subOr }, select: { leadId: true }, take: 12 });
    })(),
  ]);

  const extraIds = subHits.map(s => s.leadId).filter(id => !leads.some(l => l.id === id));
  const extra = extraIds.length
    ? await prisma.lead.findMany({ where: { id: { in: extraIds } }, select: LEAD_SELECT, take: 12 })
    : [];
  const visible = toVisible(actor, [...leads, ...extra]);
  if (!visible.length && await outsideOwnDesk(actor, { OR: or })) return deny(OWN_DESK);
  return { ok: true as const, data: { matches: visible, count: visible.length } };
}

export async function getClientDetails(actor: AssistantActor, args: { leadId?: string; query?: string; phone?: string; email?: string }) {
  if (!canSearchClients(actor.role)) return deny("Your role cannot view client details.");
  let lead: LeadRow = null;
  if (args.leadId) {
    lead = await prisma.lead.findUnique({ where: { id: args.leadId }, select: LEAD_SELECT });
  } else {
    const found = await searchClients(actor, { query: args.query, phone: args.phone, email: args.email });
    if (!found.ok) return found;
    const matches = preferQueryHits(found.data.matches, args.query);
    if (matches.length === 0) return { ok: true as const, data: { found: false, message: "No matching client." } };
    const people = collapseSamePerson(matches);
    if (people.length > 1) {
      return {
        ok: true as const,
        data: {
          found: false,
          needPick: true,
          message: "Multiple clients matched. Ask which one (name / email / phone / client code).",
          matches: people,
        },
      };
    }
    const chosen = people[0]!;
    const clusterIds = matches.filter(m => identityKey(m) === identityKey(chosen)).map(m => m.id);
    lead = await prisma.lead.findUnique({ where: { id: chosen.id }, select: LEAD_SELECT });
    if (!lead) return deny("Client not found or you do not have access.");
    if (!visibleLead(actor, lead)) return deny(actor.role === "csr" ? OWN_DESK : "Client not found or you do not have access.");
    const notes = await prisma.leadNote.findMany({
      where: { leadId: { in: clusterIds.length ? clusterIds : [lead.id] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { text: true, createdAt: true },
    });
    const calls = await prisma.callLog.findMany({
      where: { leadId: { in: clusterIds.length ? clusterIds : [lead.id] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { status: true, notes: true, createdAt: true },
    });
    return {
      ok: true as const,
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
  if (!lead) return deny("Client not found or you do not have access.");
  if (!visibleLead(actor, lead)) return deny(actor.role === "csr" ? OWN_DESK : "Client not found or you do not have access.");
  const notes = await prisma.leadNote.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { text: true, createdAt: true },
  });
  const calls = await prisma.callLog.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { status: true, notes: true, createdAt: true },
  });
  return {
    ok: true as const,
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

export async function getClientHistory(
  actor: AssistantActor,
  args: { query?: string; phone?: string; email?: string },
) {
  if (!canSearchClients(actor.role)) return deny("Your role cannot view client details.");
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
  if (!found.ok) return found;
  const seeds = found.data.matches;
  if (!seeds.length) {
    return { ok: true as const, data: { found: false, message: "No client found for that name, email, phone, or client code." } };
  }

  const distinct = new Map<string, (typeof seeds)[0]>();
  for (const s of seeds) {
    const key = identityKey(s);
    if (!distinct.has(key)) distinct.set(key, s);
  }
  if (distinct.size > 1 && !email.includes("@") && phone.replace(/\D/g, "").length < 7) {
    return {
      ok: true as const,
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

  const seed = [...distinct.values()][0]!;
  const emailKeys = [(seed.email ?? "").trim().toLowerCase()].filter(e => e.includes("@"));
  const phoneKeys = [(seed.phone ?? "").replace(/\D/g, "").slice(-10)].filter(p => p.length >= 7);

  let clusterWhere: Prisma.LeadWhereInput;
  if (emailKeys.length) {
    clusterWhere = { email: equalsCI(emailKeys[0]!) };
  } else if (phoneKeys.length) {
    clusterWhere = { phone: { in: phoneVariants(phoneKeys[0]!) } };
  } else {
    const sameIds = seeds.filter(s => identityKey(s) === identityKey(seed)).map(s => s.id);
    clusterWhere = { id: { in: sameIds } };
  }

  const cluster = await prisma.lead.findMany({
    where: clusterWhere,
    select: LEAD_SELECT,
    take: 40,
    orderBy: { createdAt: "asc" },
  });
  const visible = cluster.filter(l => visibleLead(actor, l));
  if (!visible.length) return deny("Client not found or you do not have access.");

  const head = visible[0]!;
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
      lastPayment: lastPaymentOf(p),
      createdAt: p.createdAt,
    };
  });

  return {
    ok: true as const,
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

export async function getProjectStatus(actor: AssistantActor, args: { projectCode?: string; query?: string }) {
  if (!canReadProjects(actor.role)) return deny("Your role cannot view projects.");
  const code = (args.projectCode || args.query || "").trim();
  if (code.length < 2) return deny("Give a project code (or client name).");
  const where: Prisma.LeadWhereInput = {
    OR: [
      { projectCode: { contains: code, mode: "insensitive" } },
      { clientCode: { contains: code, mode: "insensitive" } },
      { projectTitle: { contains: code, mode: "insensitive" } },
      { name: { contains: code, mode: "insensitive" } },
      { company: { contains: code, mode: "insensitive" } },
    ],
  };
  if (actor.role === "csr") where.assignedTo = actor.id;
  const leads = await prisma.lead.findMany({
    where,
    select: LEAD_SELECT,
    take: 15,
    orderBy: { updatedAt: "desc" },
  });
  const visible = leads.filter(l => visibleLead(actor, l));
  if (!visible.length) {
    const codeOr = where.OR;
    if (actor.role === "csr" && codeOr && await outsideOwnDesk(actor, { OR: codeOr })) return deny(OWN_DESK);
    return { ok: true as const, data: { found: false, message: "No project found for that code." } };
  }
  return {
    ok: true as const,
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
          paidLabel: usd(moneyOf(l).paid),
          lastPayment: lastPaymentOf(l),
        };
      }),
    },
  };
}

export async function getAccountsMonth(actor: AssistantActor, args: { month?: string; page?: string }) {
  if (!canReadAccounts(actor.role)) return deny("Accounts reports are only available to Accounts and CEO.");
  const month = (args.month ?? "").trim() || estDateYmd().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return deny("Give a month like 2026-08 or August 2026.");
  const page = (args.page ?? "reports").trim() || "reports";
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  const [isRecs, dashRecs] = await Promise.all([
    prisma.accountsRecord.findMany({
      where: { page: "income_statement", recordDate: { gte: from, lte: to } },
      select: { recordDate: true, data: true },
    }),
    prisma.accountsRecord.findMany({
      where: { page: "dashboard", recordDate: { gte: from, lte: to } },
      select: { recordDate: true, data: true },
    }),
  ]);
  const isSnap = pickLatestMeaningful(isRecs);
  const dashSnap = pickLatestMeaningful(dashRecs);
  const collections = await aggregateCollectionsForMonths([month]);
  const dashRaw =
    (dashSnap?.data as Record<string, unknown> | undefined) ?? defaultAccountsData("dashboard");
  const dash = applyCollectionsToDashboardData(dashRaw, collections.get(month) ?? emptyDayCollections());
  const revenue = currencyFormulaTotalFromDashboard(dash);
  const data = (isSnap?.data as Record<string, unknown> | undefined) ?? {};
  const payroll = sumHeads(data.teamSalaries);
  const opex = sumHeads(data.opexHeads);
  const expense = payroll + opex;
  const net = revenue - expense;
  return {
    ok: true as const,
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

export async function getCrmStatistics(actor: AssistantActor, args: { month?: string }) {
  if (!canReadStats(actor.role)) return deny("No dashboard stats for this role.");
  if (actor.role === "accounts") {
    const month = args.month || estDateYmd().slice(0, 7);
    return getAccountsMonth(actor, { month });
  }
  if (actor.role === "admin" || actor.role === "manager" || actor.role === "technical_manager") {
    const [
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
    ] = await Promise.all([
      prisma.lead.count({ where: { inBin: false } }),
      prisma.lead.count({ where: { inBin: false, status: { equals: "pending", mode: "insensitive" } } }),
      prisma.lead.count({ where: { inBin: false, status: { equals: "interested", mode: "insensitive" } } }),
      prisma.lead.count({ where: { inBin: false, status: { equals: "important", mode: "insensitive" } } }),
      prisma.lead.count({
        where: { inBin: false, status: { in: ["Close Client", "close client", "completed", "closed"] } },
      }),
      prisma.user.count({ where: { role: "csr", isOnline: true } }),
      prisma.lead.count({ where: { inBin: true } }),
      prisma.lead.count({ where: { needsRevision: true, inBin: false } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: "estimator", isActive: true } }),
      prisma.lead.count({ where: { inBin: false, projectCode: { not: null } } }),
    ]);
    return {
      ok: true as const,
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
    const month = args.month || estDateYmd().slice(0, 7);
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const [y, m] = month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 1));
    const total = await prisma.lead.count({ where: { assignedTo: actor.id } });
    const addedThisMonth = await prisma.lead.count({
      where: { assignedTo: actor.id, createdAt: { gte: start, lt: end } },
    });
    return { ok: true as const, data: { assignedLeads: total, addedThisMonth, month } };
  }
  if (actor.role === "estimator") {
    const raw = await prisma.lead.findMany({
      where: { technicalAssignments: { not: null } },
      select: LEAD_SELECT,
      take: 200,
    });
    const mine = raw.filter(l => visibleLead(actor, l));
    return {
      ok: true as const,
      data: {
        assignedProjects: mine.length,
        inPricing: mine.filter(l => parseTechnicalAssignments(l.technicalAssignments).some(a => a.pricingSent)).length,
        takeoffDone: mine.filter(l => parseTechnicalAssignments(l.technicalAssignments).some(a => a.takeoffDone)).length,
      },
    };
  }
  return deny("No stats available.");
}

function packClientNotes(
  lead: {
    comments?: string | null;
    followUpNotes?: string | null;
    projectNotes?: string | null;
  },
  notes: { text: string }[],
  calls: { status: string; notes: string | null }[],
): string {
  const chunks: string[] = [];
  if (lead.followUpNotes?.trim()) chunks.push(`Follow-up: ${lead.followUpNotes.trim()}`);
  if (lead.projectNotes?.trim()) chunks.push(`Project notes: ${lead.projectNotes.trim()}`);
  if (lead.comments?.trim()) chunks.push(`Comments: ${lead.comments.trim()}`);
  for (const n of notes) {
    const text = n.text.trim();
    if (text) chunks.push(`Note: ${text}`);
  }
  for (const c of calls) {
    const text = (c.notes ?? "").trim();
    if (text) chunks.push(`Call (${c.status}): ${text}`);
  }
  return chunks.join("\n").slice(0, 4500);
}

export async function prepareClientEmail(
  actor: AssistantActor,
  args: { query?: string; phone?: string; intent?: string; email?: string },
) {
  if (!canEmailClients(actor.role)) return deny("Your role cannot email clients.");
  const query = (args.email || args.query || "").trim();
  const phone = (args.phone ?? "").trim();
  if (query.length < 2 && phone.replace(/\D/g, "").length < 7) {
    return {
      ok: true as const,
      data: {
        needPick: true,
        message:
          "Which client? Give a name, email, phone, or client code — I will read their notes and draft the email.",
      },
    };
  }
  const found = await getClientDetails(actor, { query, phone: args.phone, email: args.email });
  if (!found.ok) return found;
  if (!("client" in found.data) || !found.data.found) return found;
  const client = found.data.client as {
    email?: string | null;
    name?: string | null;
    company?: string | null;
    comments?: string | null;
    followUpNotes?: string | null;
    projectNotes?: string | null;
  };
  if (!client.email) return deny("That client has no email on file.");
  const purpose = (args.intent ?? "").trim() || "a quick follow-up";
  const notePack = packClientNotes(
    client,
    (found.data.recentNotes as { text: string }[] | undefined) ?? [],
    (found.data.recentCalls as { status: string; notes: string | null }[] | undefined) ?? [],
  );
  const senders = publicSenders();
  const draft = await draftClientMail({
    fromName: "",
    fromEmail: "",
    to: client.email,
    clientName: client.name ?? undefined,
    company: client.company ?? undefined,
    intent: purpose,
    notes: notePack,
  });
  return {
    ok: true as const,
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

let techCache: { at: number; data: Awaited<ReturnType<typeof buildTechnicalMonitoring>> } | null = null;
let payCache: { at: number; month: string; data: Awaited<ReturnType<typeof buildPaymentsSummary>> } | null = null;

async function technicalSnapshot() {
  if (techCache && Date.now() - techCache.at < 25_000) return techCache.data;
  const data = await buildTechnicalMonitoring();
  techCache = { at: Date.now(), data };
  return data;
}

function hoursLabel(seconds: number) {
  const h = Math.round((seconds / 3600) * 10) / 10;
  return `${h}h`;
}

export async function getTechnicalOverview(actor: AssistantActor, args: { query?: string; focus?: string }) {
  if (!canReadTechnical(actor.role)) return deny("Technical pipeline is only for CEO / Technical.");
  const [snap, revisions] = await Promise.all([
    technicalSnapshot(),
    prisma.lead.count({ where: { needsRevision: true, inBin: false } }),
  ]);
  const { kpi } = snap;
  const q = `${args.query ?? ""} ${args.focus ?? ""}`.toLowerCase();
  const wantsLive =
    args.focus === "live" ||
    /\b(chief\s*estimator|technical\s*manager|tech\s*manager|live projects|dashboard)\b/.test(q);
  const focus =
    wantsLive
      ? "live"
      : args.focus === "count" || args.focus === "scoreboard" || args.focus === "full" || args.focus === "pipeline"
        ? args.focus
        : /\b(kitn[aeiy]|how many|count|kitny)\b/.test(q) && /\bprojects?\b/.test(q)
          ? "count"
          : /\b(full|snapshot|overview)\b/.test(q)
            ? "full"
            : "pipeline";
  const live =
    focus === "live" || focus === "full"
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
    ok: true as const,
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

export async function getEstimatorWorkload(actor: AssistantActor, args: { query?: string }) {
  if (!canReadTechnical(actor.role) && actor.role !== "estimator") {
    return deny("Estimator workload is only for CEO / Technical.");
  }
  const q = (args.query ?? "").trim().toLowerCase();
  if (!q) return getTechnicalOverview(actor, { focus: "full" });
  const snap = await technicalSnapshot();
  const pick = bestNameMatch(q, snap.team, m => `${m.name} ${m.code}`)
    ?? snap.team.find(m => m.estimatorId.toLowerCase() === q)
    ?? null;
  if (!pick) {
    return getPersonSnapshot(actor, { query: args.query, intent: "estimator" });
  }
  return {
    ok: true as const,
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

export async function getPaymentsSnapshot(actor: AssistantActor, args: { month?: string }) {
  if (!canReadPayments(actor.role)) return deny("Payments snapshot is only for CEO / Accounts.");
  const month = (args.month || "").trim();
  const key = month && /^\d{4}-\d{2}$/.test(month) ? month : "";
  if (payCache && payCache.month === key && Date.now() - payCache.at < 25_000) {
    const cached = payCache.data;
    return {
      ok: true as const,
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
  const snap = await buildPaymentsSummary(key || null);
  payCache = { at: Date.now(), month: key, data: snap };
  return {
    ok: true as const,
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

export async function getStaffRoster(actor: AssistantActor) {
  if (!canReadStaff(actor.role)) return deny("Staff roster is only for CEO.");
  const [users, staffRows] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        role: true,
        csrCode: true,
        employeeCode: true,
        isOnline: true,
        lastActive: true,
        lastLoginAt: true,
        isActive: true,
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.staffEmployee.findMany({
      select: { userId: true, name: true, manualRole: true, employeeCode: true, company: true },
    }),
  ]);
  const byRole: Record<string, number> = {};
  let online = 0;
  for (const u of users) {
    if (!u.isActive) continue;
    byRole[u.role] = (byRole[u.role] ?? 0) + 1;
    if (u.isOnline) online += 1;
  }
  const people = [
    ...users.map(u => ({
      name: u.name,
      role: roleLabel(u.role),
      code: u.csrCode || u.employeeCode || "",
      online: u.isOnline,
      lastActive: u.lastActive,
      hasDashboard: u.isActive,
      status: u.isActive ? "Active" : "Inactive",
    })),
    ...staffRows
      .filter(s => !s.userId && (s.name || "").trim())
      .map(s => ({
        name: s.name || "",
        role: roleLabel(s.manualRole || "Staff"),
        code: s.employeeCode || "",
        online: false,
        lastActive: null as Date | null,
        hasDashboard: false,
        status: "Employees list",
        company: s.company || "",
      })),
  ];
  return {
    ok: true as const,
    data: {
      staff: true,
      total: people.length,
      online,
      byRole,
      people,
    },
  };
}

export async function getCsrDesk(actor: AssistantActor, args: { query?: string }) {
  if (!canReadStaff(actor.role) && actor.role !== "csr") {
    return deny("CSR desk is only for CEO.");
  }
  const junk = new Set([
    "active", "online", "status", "stats", "sttaus", "staus", "today", "month",
    "csr", "csrs", "how", "many", "are", "is", "the", "gimme", "give",
  ]);
  const raw = (args.query ?? "").trim().toLowerCase();
  const q = !raw || isNearFiller(raw, junk) ? "" : raw;
  const csrUsers = await prisma.user.findMany({
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
    ? csrUsers.filter(u => fuzzyNameHit(q, u.name) || fuzzyNameHit(q, u.csrCode || "") || u.email.toLowerCase().includes(q))
    : csrUsers;
  const useList = matched.length ? matched : q ? [] : csrUsers;
  if (q && useList.length === 0) {
    return getPersonSnapshot(actor, { query: args.query, intent: "csr" });
  }
  const desks = await Promise.all(
    useList.slice(0, 12).map(async u => {
      const [total, pending, interested, closed] = await Promise.all([
        prisma.lead.count({ where: { assignedTo: u.id, inBin: false } }),
        prisma.lead.count({
          where: { assignedTo: u.id, inBin: false, status: { equals: "pending", mode: "insensitive" } },
        }),
        prisma.lead.count({
          where: { assignedTo: u.id, inBin: false, status: { equals: "interested", mode: "insensitive" } },
        }),
        prisma.lead.count({
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
    }),
  );
  return {
    ok: true as const,
    data: {
      csrDesk: true,
      active: desks.length,
      online: desks.filter(d => d.online).length,
      desks,
    },
  };
}

function monthKeyFromDeadline(raw: string | null | undefined): string {
  const s = String(raw ?? "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : "";
}

const PORTAL_ROLES = new Set(["admin", "csr", "manager", "technical_manager", "accounts", "estimator"]);

function roleLabel(role: string) {
  const r = role.trim().toLowerCase().replace(/\s+/g, "_");
  if (r === "admin") return "CEO";
  if (r === "manager") return "Admin";
  if (r === "technical_manager") return "Chief Estimator";
  if (r === "csr") return "CSR";
  if (r === "accounts") return "Accounts";
  if (r === "estimator") return "Estimator";
  return role.replace(/_/g, " ") || "Staff";
}

export async function getPersonSnapshot(
  actor: AssistantActor,
  args: { query?: string; intent?: string; month?: string; day?: string },
) {
  const q = (args.query ?? "").trim();
  if (q.length < 3) {
    return {
      ok: true as const,
      data: {
        needPick: true,
        message: "Which person? Give an estimator, CSR, or employee name from Admin → Users.",
      },
    };
  }
  const month = (args.month || estDateYmd().slice(0, 7)).trim();
  const todayYmd = estDateYmd();
  const dayArg = (args.day ?? "").trim();
  const dayYmd = /^\d{4}-\d{2}-\d{2}$/.test(dayArg) ? dayArg : todayYmd;
  const isToday = dayYmd === todayYmd;
  const bounds = estDayBoundsUtc(dayYmd);

  const [users, staffRows, snap] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        role: true,
        csrCode: true,
        employeeCode: true,
        fatherName: true,
        currentAddress: true,
        contactNo: true,
        cnic: true,
        isActive: true,
        isOnline: true,
        lastActive: true,
        lastLoginAt: true,
        email: true,
      },
    }),
    prisma.staffEmployee.findMany({
      select: {
        id: true,
        userId: true,
        company: true,
        manualRole: true,
        name: true,
        email: true,
        employeeCode: true,
        fatherName: true,
        currentAddress: true,
        contactNo: true,
        notes: true,
        payrollHead: true,
        cnic: true,
      },
    }),
    canReadTechnical(actor.role) || actor.role === "estimator"
      ? technicalSnapshot()
      : Promise.resolve(null),
  ]);

  const user = bestNameMatch(q, users, u => `${u.name} ${u.csrCode || ""} ${u.employeeCode || ""} ${u.email || ""}`);
  const staff = user
    ? (staffRows.find(s => s.userId === user.id) ?? bestNameMatch(q, staffRows, s => `${s.name || ""} ${s.employeeCode || ""}`))
    : bestNameMatch(q, staffRows, s => `${s.name || ""} ${s.employeeCode || ""} ${s.email || ""}`);
  let linkedUser = user;
  if (!linkedUser && staff?.userId) {
    linkedUser = users.find(u => u.id === staff.userId) ?? null;
  }
  const personLabel = linkedUser?.name || staff?.name || q;
  const est = snap
    ? bestNameMatch(personLabel, snap.team, m => `${m.name} ${m.code}`)
    : null;

  if (!linkedUser && !est && !staff) {
    const asked = (args.intent ?? "").toLowerCase();
    const staffAsk = /\b(estimator|csr|accounts|staff|employee|user|check[- ]?in|checkin|kitn[aeiy]|kitny|how many|dashboard)\b/.test(asked);
    if (!staffAsk && canSearchClients(actor.role)) {
      return getClientHistory(actor, { query: q });
    }
    return {
      ok: true as const,
      data: {
        found: false,
        message: `No employee matching “${q}” on Admin → Users. Try first name (Ahmer, Bariq, Zainab).`,
      },
    };
  }

  const hasDashboard = !!(linkedUser && linkedUser.isActive && PORTAL_ROLES.has(linkedUser.role));
  const noDashboardReason = hasDashboard
    ? ""
    : !linkedUser
      ? "No CRM dashboard login. They are listed on Admin → Users / Employees only."
      : !linkedUser.isActive
        ? "Dashboard login is inactive. Profile is still on Admin → Users."
        : "No CRM dashboard assigned for this role.";

  let checkin: Record<string, unknown> | null = null;
  if (linkedUser && bounds && hasDashboard) {
    const live = isToday ? await getCsrWorkSessionStatus(linkedUser.id) : null;
    const dayRow = await prisma.csrWorkSession.findFirst({
      where: { userId: linkedUser.id, loginAt: { gte: bounds.start, lte: bounds.end } },
      orderBy: { loginAt: "desc" },
    });
    checkin = {
      day: dayYmd,
      isToday,
      checkedIn: isToday ? !!live?.checkedIn : false,
      paused: isToday ? !!live?.paused : false,
      online: linkedUser.isOnline,
      checkInAtEst: live?.session?.checkInAtEst ?? (dayRow ? formatEstDateTime(dayRow.loginAt) : null),
      duration: live?.session?.totalDuration ?? (dayRow ? formatDurationMs((dayRow.dashboardMs ?? 0) + (dayRow.awayMs ?? 0)) : null),
      checkedOutAtEst: dayRow?.logoutAt ? formatEstDateTime(dayRow.logoutAt) : null,
      hadSessionToday: !!dayRow || (isToday && !!live?.checkedIn),
      lastLoginAt: linkedUser.lastLoginAt ? formatEstDateTime(linkedUser.lastLoginAt) : null,
      lastActive: linkedUser.lastActive ? formatEstDateTime(linkedUser.lastActive) : null,
    };
  }

  const roleIsEstimator = linkedUser?.role === "estimator" || linkedUser?.role === "technical_manager";
  const estNameClose = !!(est && nameScore(personLabel, est.name) >= 88);
  const linkedEst =
    est && (roleIsEstimator || estNameClose || (!linkedUser && !staff)) ? est : null;

  let csr: Record<string, unknown> | null = null;
  if (linkedUser?.role === "csr" && hasDashboard) {
    const [total, pending, interested, closed] = await Promise.all([
      prisma.lead.count({ where: { assignedTo: linkedUser.id, inBin: false } }),
      prisma.lead.count({
        where: { assignedTo: linkedUser.id, inBin: false, status: { equals: "pending", mode: "insensitive" } },
      }),
      prisma.lead.count({
        where: { assignedTo: linkedUser.id, inBin: false, status: { equals: "interested", mode: "insensitive" } },
      }),
      prisma.lead.count({
        where: {
          assignedTo: linkedUser.id,
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

  const roleRaw = linkedUser?.role || staff?.manualRole || (linkedEst ? "estimator" : "");

  return {
    ok: true as const,
    data: {
      person: true,
      hasDashboard,
      noDashboardReason: noDashboardReason || undefined,
      name: linkedUser?.name || staff?.name || linkedEst?.name || q,
      role: roleLabel(roleRaw),
      status: linkedUser ? (linkedUser.isActive ? "Active" : "Inactive") : "Employees list",
      company: staff?.company || "",
      code: linkedUser?.csrCode || linkedUser?.employeeCode || staff?.employeeCode || linkedEst?.code || "",
      email: linkedUser?.email || staff?.email || "",
      phone: linkedUser?.contactNo || staff?.contactNo || "",
      employeeCode: linkedUser?.employeeCode || staff?.employeeCode || "",
      fatherName: linkedUser?.fatherName || staff?.fatherName || "",
      address: linkedUser?.currentAddress || staff?.currentAddress || "",
      cnic: linkedUser?.cnic || staff?.cnic || "",
      notes: staff?.notes || "",
      payrollHead: staff?.payrollHead || "",
      online: linkedUser?.isOnline ?? false,
      lastLoginAt: linkedUser?.lastLoginAt ? formatEstDateTime(linkedUser.lastLoginAt) : null,
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

export const TOOL_HANDLERS = {
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
} as const;

export type ToolName = keyof typeof TOOL_HANDLERS;
