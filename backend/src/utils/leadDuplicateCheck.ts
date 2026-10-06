import prisma from "../config/db";
import { normalizePhone, phonesMatch } from "./phone";

export async function findDuplicateLead(
  phone?: string | null,
  email?: string | null,
  excludeLeadId?: string,
) {
  const emailNorm = email?.trim().toLowerCase();
  if (emailNorm) {
    const byEmail = await prisma.lead.findFirst({
      where: {
        email: { equals: emailNorm, mode: "insensitive" },
        ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
      },
      select: { id: true, name: true, company: true, phone: true, email: true },
    });
    if (byEmail) {
      return {
        field: "email" as const,
        lead: byEmail,
        message: `Email already exists for client ${byEmail.name ?? "Unknown"}${byEmail.company ? ` (${byEmail.company})` : ""}.`,
      };
    }
  }

  const phoneTrim = phone?.trim();
  if (phoneTrim) {
    const digits = normalizePhone(phoneTrim);
    if (digits.length >= 7) {
      const suffix = digits.slice(-10);
      const candidates = await prisma.lead.findMany({
        where: {
          phone: { not: null, contains: suffix },
          ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
        },
        select: { id: true, name: true, company: true, phone: true, email: true },
        take: 20,
      });
      const match = candidates.find((l) => l.phone && phonesMatch(l.phone, phoneTrim));
      if (match) {
        return {
          field: "phone" as const,
          lead: match,
          message: `Phone already exists for client ${match.name ?? "Unknown"}${match.company ? ` (${match.company})` : ""}.`,
        };
      }
    }
  }

  return null;
}
