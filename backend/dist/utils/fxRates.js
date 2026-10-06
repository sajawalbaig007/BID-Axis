"use strict";
/**
 * Live FX rates for Accounts dashboard — primary source: Google Finance pages
 * (USD-PKR / CAD-PKR). Fallbacks: free CDN currency API + Yahoo Finance.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLiveFxRates = fetchLiveFxRates;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
function roundRate(n) {
    return Math.round(n * 10000) / 10000;
}
function parseGoogleFinanceRate(html, pair) {
    // Embedded chart blob: …276.760912,4,-0.13…,null,"USD-PKR"
    const pairRe = new RegExp(`([0-9]{2,3}\\.[0-9]+),\\d+,-?[0-9.]+,\\d+,-?[0-9.eE+-]+,\\d+,null,"${pair}"`);
    const m1 = html.match(pairRe);
    if (m1) {
        const n = Number(m1[1]);
        if (Number.isFinite(n) && n > 50 && n < 1000)
            return n;
    }
    // Alternate: "USD / PKR",3,null,[276.760912,…
    const label = pair.replace("-", " / ");
    const m2 = html.match(new RegExp(`"${label.replace("/", "\\/")}",\\d+,null,\\[([0-9.]+)`));
    if (m2) {
        const n = Number(m2[1]);
        if (Number.isFinite(n) && n > 50 && n < 1000)
            return n;
    }
    // Visible span used on some locales
    const m3 = html.match(/class="YMlKec[^"]*">([0-9]{2,3}(?:[.,][0-9]+)?)</);
    if (m3) {
        const n = Number(m3[1].replace(/,/g, ""));
        if (Number.isFinite(n) && n > 50 && n < 1000)
            return n;
    }
    return null;
}
async function fetchGooglePair(pair) {
    try {
        const res = await fetch(`https://www.google.com/finance/quote/${pair}`, {
            headers: {
                "User-Agent": UA,
                Accept: "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
            },
            signal: AbortSignal.timeout(12000),
        });
        if (!res.ok)
            return null;
        const html = await res.text();
        return parseGoogleFinanceRate(html, pair);
    }
    catch {
        return null;
    }
}
async function fetchCdnRates() {
    try {
        const [usdRes, cadRes] = await Promise.all([
            fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json", {
                signal: AbortSignal.timeout(10000),
            }),
            fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cad.min.json", {
                signal: AbortSignal.timeout(10000),
            }),
        ]);
        if (!usdRes.ok || !cadRes.ok)
            return null;
        const usdJson = (await usdRes.json());
        const cadJson = (await cadRes.json());
        const usdToPkr = Number(usdJson.usd?.pkr);
        const cadToPkr = Number(cadJson.cad?.pkr);
        if (!Number.isFinite(usdToPkr) || !Number.isFinite(cadToPkr))
            return null;
        if (usdToPkr < 50 || cadToPkr < 50)
            return null;
        return { usdToPkr, cadToPkr };
    }
    catch {
        return null;
    }
}
async function fetchYahooPair(symbol) {
    try {
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok)
            return null;
        const json = (await res.json());
        const n = Number(json.chart?.result?.[0]?.meta?.regularMarketPrice);
        if (!Number.isFinite(n) || n < 50 || n > 1000)
            return null;
        return n;
    }
    catch {
        return null;
    }
}
/** Fetch live USD→PKR and CAD→PKR, preferring Google Finance. */
async function fetchLiveFxRates() {
    const [gUsd, gCad] = await Promise.all([fetchGooglePair("USD-PKR"), fetchGooglePair("CAD-PKR")]);
    if (gUsd != null && gCad != null) {
        return {
            usdToPkr: roundRate(gUsd),
            cadToPkr: roundRate(gCad),
            source: "google",
            fetchedAt: new Date().toISOString(),
            usdSource: "Google Finance · USD-PKR",
            cadSource: "Google Finance · CAD-PKR",
        };
    }
    const cdn = await fetchCdnRates();
    if (cdn) {
        return {
            usdToPkr: roundRate(gUsd ?? cdn.usdToPkr),
            cadToPkr: roundRate(gCad ?? cdn.cadToPkr),
            source: gUsd != null || gCad != null ? "google" : "market",
            fetchedAt: new Date().toISOString(),
            usdSource: gUsd != null ? "Google Finance · USD-PKR" : "Live market CDN",
            cadSource: gCad != null ? "Google Finance · CAD-PKR" : "Live market CDN",
        };
    }
    const [yUsd, yCad] = await Promise.all([fetchYahooPair("USDPKR=X"), fetchYahooPair("CADPKR=X")]);
    if (yUsd != null && yCad != null) {
        return {
            usdToPkr: roundRate(gUsd ?? yUsd),
            cadToPkr: roundRate(gCad ?? yCad),
            source: "yahoo",
            fetchedAt: new Date().toISOString(),
            usdSource: gUsd != null ? "Google Finance · USD-PKR" : "Yahoo Finance · USDPKR=X",
            cadSource: gCad != null ? "Google Finance · CAD-PKR" : "Yahoo Finance · CADPKR=X",
        };
    }
    throw new Error("Unable to fetch live FX rates from Google or fallbacks.");
}
