import prisma from "../config/db";
import { notInBinFilter } from "./binLeads";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `FOO-01` → { base: "FOO", seq: 1 }. No suffix → seq 1. */
export function parseProjectCodeSeq(raw: string | null | undefined): { base: string; seq: number } | null {
  const code = String(raw ?? "").trim();
  if (!code) return null;
  const m = code.match(/^(.*)-(\d+)$/);
  if (!m) return { base: code, seq: 1 };
  const base = m[1]!.trim();
  const seq = parseInt(m[2]!, 10);
  if (!base || !Number.isFinite(seq) || seq < 1) return { base: code, seq: 1 };
  return { base, seq };
}

export function projectCodeSeqOf(lead: {
  projectCode?: string | null;
  clientCode?: string | null;
}): { base: string; seq: number } | null {
  return parseProjectCodeSeq(lead.projectCode) ?? parseProjectCodeSeq(lead.clientCode);
}

/** Retained = exactly the second job (`-01` → `-02`). `-03+` is not retained. */
export function isRetainedSecondProjectCode(lead: {
  projectCode?: string | null;
  clientCode?: string | null;
}): boolean {
  return projectCodeSeqOf(lead)?.seq === 2;
}

/** Next code for a client: `{base}-1`, `{base}-2`, … based on max existing suffix. */
export async function allocateNextProjectCode(
  baseCode: string,
  opts?: { assignedTo?: string },
): Promise<string> {
  const base = baseCode.trim();
  if (!base) return "";

  const where: Record<string, unknown> = {
    ...notInBinFilter(),
    OR: [
      { clientCode: base },
      { projectCode: base },
      { projectCode: { startsWith: `${base}-` } },
    ],
  };
  if (opts?.assignedTo) where.assignedTo = opts.assignedTo;

  const leads = await prisma.lead.findMany({
    where,
    select: { projectCode: true },
  });

  let max = 0;
  const re = new RegExp(`^${escapeRegex(base)}-(\\d+)$`, "i");
  for (const l of leads) {
    const pc = l.projectCode?.trim();
    if (!pc) continue;
    if (pc.toLowerCase() === base.toLowerCase()) {
      max = Math.max(max, 0);
      continue;
    }
    const m = pc.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }

  return `${base}-${max + 1}`;
}
