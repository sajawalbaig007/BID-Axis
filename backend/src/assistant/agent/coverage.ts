import { parseEmail, extractEmailPurpose, wantsEmailIntent } from "../intent";

export type PlannedCall = { name: string; arguments: Record<string, string> };

export type CoverageReview = {
  complete: boolean;
  reason: string;
  calls: PlannedCall[];
};

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export function digestResults(results: unknown[]): unknown[] {
  return results.map(raw => {
    const r = asRecord(raw);
    const d = asRecord(r.data);
    const est = asRecord(d.estimator);
    const jobs = Array.isArray(est.projects) ? est.projects : Array.isArray(d.projects) ? d.projects : [];
    const projectBrief = (jobs as Array<Record<string, unknown>>).slice(0, 40).map(p => ({
      code: p.code || p.projectCode,
      title: p.title || p.projectTitle,
      overdue: p.overdue,
      name: p.name,
      company: p.company,
      paidLabel: p.paidLabel,
      paidAmount: p.paidAmount,
      lastPayment: p.lastPayment,
      deadline: p.deadline,
    }));
    return {
      tool: r.tool,
      ok: r.ok,
      error: r.error,
      args: r.args,
      found: d.found,
      needPick: d.needPick,
      message: d.message,
      person: d.person ? d.name : undefined,
      overdueCount: est.overdue,
      client: d.history ? d.name : d.name && !d.person ? d.name : undefined,
      paidLabel: d.paidLabel,
      lastPayment: d.lastPayment,
      compose: d.compose === true,
      to: d.to,
      matches: Array.isArray(d.matches) ? d.matches.slice(0, 8) : undefined,
      projects: projectBrief,
    };
  });
}

export async function reviewTaskCoverage(_opts: {
  message: string;
  results: unknown[];
}): Promise<CoverageReview> {
  if (!_opts.results.length) {
    return { complete: false, reason: "No tools have run yet.", calls: [] };
  }

  const digest = digestResults(_opts.results) as Array<Record<string, unknown>>;
  if (digest.some(d => d.needPick === true || (Array.isArray(d.matches) && d.matches.length > 1))) {
    return { complete: true, reason: "Need the CEO to pick a match.", calls: [] };
  }

  if (digest.some(d => d.person) && !wantsEmailIntent(_opts.message.toLowerCase())) {
    const extraClient = /\b(last payment|client overdue|uske client)\b/i.test(_opts.message);
    if (!extraClient) {
      return { complete: true, reason: "Staff snapshot covers this follow-up.", calls: [] };
    }
  }

  if (wantsEmailIntent(_opts.message.toLowerCase()) && !digest.some(d => d.tool === "prepareClientEmail" && d.compose === true)) {
    const email = parseEmail(_opts.message);
    return {
      complete: false,
      reason: "Email compose still needs prepareClientEmail.",
      calls: [{
        name: "prepareClientEmail",
        arguments: {
          query: email || String((digest[0]?.args as Record<string, string> | undefined)?.query || ""),
          intent: extractEmailPurpose(_opts.message),
        },
      }],
    };
  }

  const overdueCodes: string[] = [];
  const covered = new Set<string>();
  for (const d of digest) {
    const jobs = Array.isArray(d.projects) ? (d.projects as Array<Record<string, unknown>>) : [];
    if (d.tool === "getPersonSnapshot") {
      for (const p of jobs) {
        if (p.overdue === true) {
          const code = String(p.code || "").trim();
          if (code) overdueCodes.push(code);
        }
      }
    }
    if (d.tool === "getProjectStatus" || d.tool === "getClientHistory") {
      for (const p of jobs) {
        const code = String(p.code || p.projectCode || "").trim();
        if (code) covered.add(code.toLowerCase());
      }
      const args = d.args && typeof d.args === "object" ? (d.args as Record<string, string>) : {};
      const q = String(args.query || args.projectCode || "").trim().toLowerCase();
      if (q) covered.add(q);
    }
  }

  const missing = [...new Set(overdueCodes)].filter(code => !covered.has(code.toLowerCase()));
  if (missing.length) {
    return {
      complete: false,
      reason: "Overdue jobs still need client/last-payment lookup by project code.",
      calls: missing.slice(0, 3).map(code => ({
        name: "getProjectStatus",
        arguments: { query: code, projectCode: code },
      })),
    };
  }

  return { complete: true, reason: "Original request is covered by live tool data.", calls: [] };
}
