"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseProjectCodeSeq = parseProjectCodeSeq;
exports.projectCodeSeqOf = projectCodeSeqOf;
exports.isRetainedSecondProjectCode = isRetainedSecondProjectCode;
exports.allocateNextProjectCode = allocateNextProjectCode;
const db_1 = __importDefault(require("../config/db"));
const binLeads_1 = require("./binLeads");
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** `FOO-01` → { base: "FOO", seq: 1 }. No suffix → seq 1. */
function parseProjectCodeSeq(raw) {
    const code = String(raw ?? "").trim();
    if (!code)
        return null;
    const m = code.match(/^(.*)-(\d+)$/);
    if (!m)
        return { base: code, seq: 1 };
    const base = m[1].trim();
    const seq = parseInt(m[2], 10);
    if (!base || !Number.isFinite(seq) || seq < 1)
        return { base: code, seq: 1 };
    return { base, seq };
}
function projectCodeSeqOf(lead) {
    return parseProjectCodeSeq(lead.projectCode) ?? parseProjectCodeSeq(lead.clientCode);
}
/** Retained = exactly the second job (`-01` → `-02`). `-03+` is not retained. */
function isRetainedSecondProjectCode(lead) {
    return projectCodeSeqOf(lead)?.seq === 2;
}
/** Next code for a client: `{base}-1`, `{base}-2`, … based on max existing suffix. */
async function allocateNextProjectCode(baseCode, opts) {
    const base = baseCode.trim();
    if (!base)
        return "";
    const where = {
        ...(0, binLeads_1.notInBinFilter)(),
        OR: [
            { clientCode: base },
            { projectCode: base },
            { projectCode: { startsWith: `${base}-` } },
        ],
    };
    if (opts?.assignedTo)
        where.assignedTo = opts.assignedTo;
    const leads = await db_1.default.lead.findMany({
        where,
        select: { projectCode: true },
    });
    let max = 0;
    const re = new RegExp(`^${escapeRegex(base)}-(\\d+)$`, "i");
    for (const l of leads) {
        const pc = l.projectCode?.trim();
        if (!pc)
            continue;
        if (pc.toLowerCase() === base.toLowerCase()) {
            max = Math.max(max, 0);
            continue;
        }
        const m = pc.match(re);
        if (m)
            max = Math.max(max, parseInt(m[1], 10));
    }
    return `${base}-${max + 1}`;
}
