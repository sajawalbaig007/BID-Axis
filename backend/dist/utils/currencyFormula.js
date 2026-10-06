"use strict";
/** Currency Payment Formula totals — shared with Income Statement Total Revenue. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentsChannelPkr = paymentsChannelPkr;
exports.currencyFormulaBreakdownFromDashboard = currencyFormulaBreakdownFromDashboard;
exports.currencyFormulaTotalFromDashboard = currencyFormulaTotalFromDashboard;
exports.emptyCurrencyChannelNetTotals = emptyCurrencyChannelNetTotals;
exports.addCurrencyChannelNetTotals = addCurrencyChannelNetTotals;
const TAB_DEFAULTS = {
    SN: {
        usdAmount: 0,
        cadAmount: 0,
        pkrAmount: 0,
        usdToPkrRate: 280,
        cadToPkrRate: 200,
        usdTaxFactor: 1,
        cadTaxFactor: 0.945,
    },
    AH: {
        usdAmount: 0,
        cadAmount: 0,
        pkrAmount: 0,
        usdToPkrRate: 280,
        cadToPkrRate: 200,
        usdTaxFactor: 0.89,
        cadTaxFactor: 0.89,
    },
    CHQ: {
        usdAmount: 0,
        cadAmount: 0,
        pkrAmount: 0,
        usdToPkrRate: 1,
        cadToPkrRate: 1,
        usdTaxFactor: 1,
        cadTaxFactor: 1,
        taxDeductionRate: 0.25,
    },
    HM: {
        usdAmount: 0,
        cadAmount: 0,
        pkrAmount: 0,
        usdToPkrRate: 1,
        cadToPkrRate: 1,
        usdTaxFactor: 1,
        cadTaxFactor: 1,
        taxDeductionRate: 0.01,
    },
};
function calcTab(t) {
    const rate = Number(t.taxDeductionRate);
    if (Number.isFinite(rate) && rate > 0) {
        const pkrGross = Number(t.pkrAmount) || 0;
        return pkrGross - pkrGross * rate;
    }
    const usdAfterTax = (Number(t.usdAmount) || 0) * (Number(t.usdTaxFactor) || 1);
    const cadAfterTax = (Number(t.cadAmount) || 0) * (Number(t.cadTaxFactor) || 1);
    const usdInPkr = usdAfterTax * (Number(t.usdToPkrRate) || 0);
    const cadInPkr = cadAfterTax * (Number(t.cadToPkrRate) || 0);
    const pkrNet = Number(t.pkrAmount) || 0;
    return usdInPkr + cadInPkr + pkrNet;
}
function normalize(raw) {
    if (raw?.tabs?.SN && raw?.tabs?.AH) {
        return {
            AH: { ...TAB_DEFAULTS.AH, ...raw.tabs.AH, usdTaxFactor: 0.89, cadTaxFactor: 0.89 },
            SN: { ...TAB_DEFAULTS.SN, ...raw.tabs.SN, cadTaxFactor: 0.945 },
            CHQ: {
                ...TAB_DEFAULTS.CHQ,
                ...(raw.tabs.CHQ ?? {}),
                taxDeductionRate: 0.25,
                usdAmount: 0,
                cadAmount: 0,
            },
            HM: {
                ...TAB_DEFAULTS.HM,
                ...(raw.tabs.HM ?? {}),
                taxDeductionRate: 0.01,
                usdAmount: 0,
                cadAmount: 0,
            },
        };
    }
    return {
        SN: {
            ...TAB_DEFAULTS.SN,
            usdAmount: raw?.usdAmount ?? 0,
            cadAmount: raw?.cadAmount ?? 0,
            pkrAmount: raw?.pkrAmount ?? 0,
            usdToPkrRate: raw?.usdToPkrRate ?? TAB_DEFAULTS.SN.usdToPkrRate,
            cadToPkrRate: raw?.cadToPkrRate ?? TAB_DEFAULTS.SN.cadToPkrRate,
        },
        AH: { ...TAB_DEFAULTS.AH },
        CHQ: { ...TAB_DEFAULTS.CHQ },
        HM: { ...TAB_DEFAULTS.HM },
    };
}
/** PKR equivalent for Payments source cards — same tax/rate formula as Accounts. */
function paymentsChannelPkr(channel, totals) {
    const d = TAB_DEFAULTS[channel];
    if (channel === "CHQ" || channel === "HM") {
        const usdRate = 280;
        const cadRate = 200;
        const pkrGross = (Number(totals.PKR) || 0) +
            (Number(totals.USD) || 0) * usdRate +
            (Number(totals.CAD) || 0) * cadRate;
        const tax = Number(d.taxDeductionRate) || 0;
        return roundMoney(pkrGross - pkrGross * tax);
    }
    return roundMoney(calcTab({
        ...d,
        usdAmount: totals.USD,
        cadAmount: totals.CAD,
        pkrAmount: totals.PKR,
    }));
}
function roundMoney(n) {
    return Math.round(n * 100) / 100;
}
const CHANNEL_LABELS = {
    AH: "Ahmed Hamza",
    SN: "Sharjeel Nasir",
    CHQ: "Cheque",
    HM: "Habib Metro",
};
/** Per-channel USD/CAD/PKR + net PKR after tax/FX — same formula as dashboard. */
function currencyFormulaBreakdownFromDashboard(data) {
    const currency = data?.currency ?? null;
    const tabs = normalize(currency);
    return ["AH", "SN", "CHQ", "HM"].map(key => ({
        key,
        label: CHANNEL_LABELS[key],
        usd: Number(tabs[key].usdAmount) || 0,
        cad: Number(tabs[key].cadAmount) || 0,
        pkr: Number(tabs[key].pkrAmount) || 0,
        netPkr: roundMoney(calcTab(tabs[key])),
    }));
}
/** Merged AH+SN+CHQ+HM net — Income Statement Total Revenue source. */
function currencyFormulaTotalFromDashboard(data) {
    return currencyFormulaBreakdownFromDashboard(data).reduce((a, c) => a + c.netPkr, 0);
}
function emptyCurrencyChannelNetTotals() {
    return { AH: 0, SN: 0, CHQ: 0, HM: 0 };
}
function addCurrencyChannelNetTotals(acc, data) {
    const next = { ...acc };
    for (const c of currencyFormulaBreakdownFromDashboard(data)) {
        next[c.key] += c.netPkr;
    }
    return next;
}
