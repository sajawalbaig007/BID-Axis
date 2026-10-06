"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findDuplicateLead = findDuplicateLead;
const db_1 = __importDefault(require("../config/db"));
const phone_1 = require("./phone");
async function findDuplicateLead(phone, email, excludeLeadId) {
    const emailNorm = email?.trim().toLowerCase();
    if (emailNorm) {
        const byEmail = await db_1.default.lead.findFirst({
            where: {
                email: { equals: emailNorm, mode: "insensitive" },
                ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
            },
            select: { id: true, name: true, company: true, phone: true, email: true },
        });
        if (byEmail) {
            return {
                field: "email",
                lead: byEmail,
                message: `Email already exists for client ${byEmail.name ?? "Unknown"}${byEmail.company ? ` (${byEmail.company})` : ""}.`,
            };
        }
    }
    const phoneTrim = phone?.trim();
    if (phoneTrim) {
        const digits = (0, phone_1.normalizePhone)(phoneTrim);
        if (digits.length >= 7) {
            const suffix = digits.slice(-10);
            const candidates = await db_1.default.lead.findMany({
                where: {
                    phone: { not: null, contains: suffix },
                    ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
                },
                select: { id: true, name: true, company: true, phone: true, email: true },
                take: 20,
            });
            const match = candidates.find((l) => l.phone && (0, phone_1.phonesMatch)(l.phone, phoneTrim));
            if (match) {
                return {
                    field: "phone",
                    lead: match,
                    message: `Phone already exists for client ${match.name ?? "Unknown"}${match.company ? ` (${match.company})` : ""}.`,
                };
            }
        }
    }
    return null;
}
