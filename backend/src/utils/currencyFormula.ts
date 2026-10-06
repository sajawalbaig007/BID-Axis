/** Currency Payment Formula totals — shared with Income Statement Total Revenue. */

type CurrencyTab = {
  usdAmount?: number;
  cadAmount?: number;
  pkrAmount?: number;
  usdToPkrRate?: number;
  cadToPkrRate?: number;
  usdTaxFactor?: number;
  cadTaxFactor?: number;
  taxDeductionRate?: number;
};

type CurrencyBlock = {
  usdAmount?: number;
  cadAmount?: number;
  pkrAmount?: number;
  usdToPkrRate?: number;
  cadToPkrRate?: number;
  tabs?: Partial<Record<"AH" | "SN" | "CHQ" | "HM", CurrencyTab>>;
};

const TAB_DEFAULTS: Record<"AH" | "SN" | "CHQ" | "HM", CurrencyTab> = {
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

function calcTab(t: CurrencyTab): number {
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

function normalize(raw: CurrencyBlock | undefined | null): Record<"AH" | "SN" | "CHQ" | "HM", CurrencyTab> {
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
export function paymentsChannelPkr(
  channel: "AH" | "SN" | "CHQ" | "HM",
  totals: { USD: number; CAD: number; PKR: number },
): number {
  const d = TAB_DEFAULTS[channel];
  if (channel === "CHQ" || channel === "HM") {
    const usdRate = 280;
    const cadRate = 200;
    const pkrGross =
      (Number(totals.PKR) || 0) +
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

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

const CHANNEL_LABELS: Record<"AH" | "SN" | "CHQ" | "HM", string> = {
  AH: "Ahmed Hamza",
  SN: "Sharjeel Nasir",
  CHQ: "Cheque",
  HM: "Habib Metro",
};

export type CurrencyChannelBreakdown = {
  key: "AH" | "SN" | "CHQ" | "HM";
  label: string;
  usd: number;
  cad: number;
  pkr: number;
  netPkr: number;
};

/** Per-channel USD/CAD/PKR + net PKR after tax/FX — same formula as dashboard. */
export function currencyFormulaBreakdownFromDashboard(
  data: Record<string, unknown> | null | undefined,
): CurrencyChannelBreakdown[] {
  const currency = (data?.currency as CurrencyBlock | undefined) ?? null;
  const tabs = normalize(currency);
  return (["AH", "SN", "CHQ", "HM"] as const).map(key => ({
    key,
    label: CHANNEL_LABELS[key],
    usd: Number(tabs[key].usdAmount) || 0,
    cad: Number(tabs[key].cadAmount) || 0,
    pkr: Number(tabs[key].pkrAmount) || 0,
    netPkr: roundMoney(calcTab(tabs[key])),
  }));
}

/** Merged AH+SN+CHQ+HM net — Income Statement Total Revenue source. */
export function currencyFormulaTotalFromDashboard(data: Record<string, unknown> | null | undefined): number {
  return currencyFormulaBreakdownFromDashboard(data).reduce((a, c) => a + c.netPkr, 0);
}

export type CurrencyChannelNetTotals = { AH: number; SN: number; CHQ: number; HM: number };

export function emptyCurrencyChannelNetTotals(): CurrencyChannelNetTotals {
  return { AH: 0, SN: 0, CHQ: 0, HM: 0 };
}

export function addCurrencyChannelNetTotals(
  acc: CurrencyChannelNetTotals,
  data: Record<string, unknown> | null | undefined,
): CurrencyChannelNetTotals {
  const next = { ...acc };
  for (const c of currencyFormulaBreakdownFromDashboard(data)) {
    next[c.key] += c.netPkr;
  }
  return next;
}
