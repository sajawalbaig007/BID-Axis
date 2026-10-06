"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYMENT_CHANNEL_LABELS = exports.PAYMENT_CURRENCIES = exports.PAYMENT_CHANNELS = void 0;
exports.parseProjectPayments = parseProjectPayments;
exports.stringifyProjectPayments = stringifyProjectPayments;
exports.parseMoney = parseMoney;
exports.paidTotalFromEntries = paidTotalFromEntries;
exports.latestPaidEntry = latestPaidEntry;
exports.paymentPercent = paymentPercent;
exports.normalizePaymentsInput = normalizePaymentsInput;
exports.preservePaymentSlipLinksForCsr = preservePaymentSlipLinksForCsr;
exports.PAYMENT_CHANNELS = ["AH", "SN", "CHQ", "HM"];
exports.PAYMENT_CURRENCIES = ["USD", "CAD", "PKR"];
exports.PAYMENT_CHANNEL_LABELS = {
    AH: "Ahmed Hamza",
    SN: "Sharjeel Nasir",
    CHQ: "Cheque",
    HM: "Habib Metro",
};
function normalizeChannel(raw) {
    const v = String(raw ?? "").trim().toUpperCase();
    if (v === "AH" || v === "SN" || v === "CHQ" || v === "HM")
        return v;
    return undefined;
}
function normalizeCurrency(raw) {
    const v = String(raw ?? "").trim().toUpperCase();
    if (v === "USD" || v === "CAD" || v === "PKR")
        return v;
    return undefined;
}
function normalizeAccountsMonth(raw) {
    const v = String(raw ?? "").trim();
    if (/^\d{4}-\d{2}$/.test(v))
        return v;
    if (/^\d{4}-\d{2}-\d{2}/.test(v))
        return v.slice(0, 7);
    return undefined;
}
function sanitizeEntry(raw) {
    const channel = normalizeChannel(raw.paymentChannel);
    const currency = normalizeCurrency(raw.currency);
    const accountsMonth = normalizeAccountsMonth(raw.accountsMonth);
    const entry = {
        id: String(raw.id ?? ""),
        type: String(raw.type ?? "Partial"),
        amount: String(raw.amount ?? ""),
        isPaid: Boolean(raw.isPaid),
    };
    if (typeof raw.link === "string" && raw.link.trim())
        entry.link = raw.link.trim();
    if (typeof raw.paidAt === "string" && raw.paidAt.trim())
        entry.paidAt = raw.paidAt.trim();
    if (typeof raw.createdAt === "string" && raw.createdAt.trim())
        entry.createdAt = raw.createdAt.trim();
    if (!entry.createdAt && entry.paidAt)
        entry.createdAt = entry.paidAt;
    if (channel)
        entry.paymentChannel = channel;
    if (currency)
        entry.currency = currency;
    if (accountsMonth)
        entry.accountsMonth = accountsMonth;
    return entry;
}
function parseProjectPayments(raw) {
    if (!raw?.trim())
        return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed.map((e) => sanitizeEntry((e ?? {})));
    }
    catch {
        return [];
    }
}
function stringifyProjectPayments(entries) {
    return JSON.stringify(entries.map((e) => sanitizeEntry(e)));
}
function parseMoney(raw) {
    if (!raw)
        return 0;
    const cleaned = String(raw).replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
}
function paidTotalFromEntries(entries) {
    return entries
        .filter((e) => e.isPaid)
        .reduce((sum, e) => sum + parseMoney(e.amount), 0);
}
function latestPaidEntry(entries) {
    const paid = entries.filter((e) => e.isPaid && e.paidAt);
    if (paid.length === 0) {
        const anyPaid = entries.filter((e) => e.isPaid);
        return anyPaid.length ? anyPaid[anyPaid.length - 1] : null;
    }
    return [...paid].sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))[0];
}
function paymentPercent(entries, budget) {
    const budgetNum = parseMoney(budget);
    if (budgetNum <= 0)
        return 0;
    return Math.min(100, (paidTotalFromEntries(entries) / budgetNum) * 100);
}
function normalizePaymentsInput(input) {
    if (input === undefined)
        return undefined;
    if (typeof input === "string") {
        return stringifyProjectPayments(parseProjectPayments(input));
    }
    if (Array.isArray(input)) {
        return stringifyProjectPayments(input.map((e) => sanitizeEntry((e ?? {}))));
    }
    return undefined;
}
/**
 * CSR cannot set/change payment slip links, channel, currency, or accounts month —
 * keep existing values from DB per payment id. New CSR-created entries get none.
 */
function preservePaymentSlipLinksForCsr(incomingRaw, existingRaw) {
    if (incomingRaw === undefined)
        return undefined;
    const incoming = parseProjectPayments(incomingRaw);
    const existingById = new Map(parseProjectPayments(existingRaw).map((e) => [e.id, e]));
    const merged = incoming.map((e) => {
        const prev = existingById.get(e.id);
        const next = { ...e };
        if (prev?.link?.trim())
            next.link = prev.link.trim();
        else
            delete next.link;
        if (prev?.paymentChannel)
            next.paymentChannel = prev.paymentChannel;
        else
            delete next.paymentChannel;
        if (prev?.currency)
            next.currency = prev.currency;
        else
            delete next.currency;
        if (prev?.accountsMonth)
            next.accountsMonth = prev.accountsMonth;
        else
            delete next.accountsMonth;
        // Keep history timestamps
        if (prev?.createdAt && !next.createdAt)
            next.createdAt = prev.createdAt;
        if (prev?.paidAt && e.isPaid && !next.paidAt)
            next.paidAt = prev.paidAt;
        return next;
    });
    return stringifyProjectPayments(merged);
}
