"use strict";
/** Match short accounts names to later Admin/HR full names (Ahmer → Ahmer Shah). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pfNameTokens = pfNameTokens;
exports.pfNormName = pfNormName;
exports.pfNamesAreSamePerson = pfNamesAreSamePerson;
exports.pfAliasMergeAllowed = pfAliasMergeAllowed;
exports.pfHasLongerCanonical = pfHasLongerCanonical;
exports.collapsePfNameBuckets = collapsePfNameBuckets;
function pfNameTokens(label) {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .split(" ")
        .filter(Boolean);
}
function pfNormName(label) {
    return pfNameTokens(label).join(" ");
}
function pfNamesAreSamePerson(a, b) {
    const ta = pfNameTokens(a);
    const tb = pfNameTokens(b);
    if (!ta.length || !tb.length)
        return false;
    if (ta.join(" ") === tb.join(" "))
        return true;
    const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    if (short.every((tok, i) => long[i] === tok))
        return true;
    if (short.length >= 2) {
        let j = 0;
        for (const tok of long) {
            if (tok === short[j])
                j += 1;
            if (j === short.length)
                return true;
        }
    }
    return false;
}
function pfAliasMergeAllowed(a, b, pool) {
    if (!pfNamesAreSamePerson(a, b))
        return false;
    const ta = pfNameTokens(a);
    const tb = pfNameTokens(b);
    const short = ta.length <= tb.length ? ta : tb;
    if (short.length !== 1)
        return true;
    const token = short[0];
    const longerStarts = pool.filter(n => {
        const t = pfNameTokens(n);
        return t.length > 1 && t[0] === token;
    });
    const unique = [...new Set(longerStarts.map(n => pfNormName(n)))];
    return unique.length <= 1;
}
/** True when `name` is a shorter alias of a longer label already in `labels`. */
function pfHasLongerCanonical(name, labels) {
    const self = pfNormName(name);
    return labels.some(other => {
        if (pfNormName(other) === self)
            return false;
        if (pfNameTokens(other).length <= pfNameTokens(name).length)
            return false;
        return pfAliasMergeAllowed(name, other, labels);
    });
}
function collapsePfNameBuckets(bucket) {
    const entries = Object.values(bucket);
    if (entries.length <= 1)
        return bucket;
    const pool = entries.map(e => e.name);
    entries.sort((a, b) => pfNameTokens(b.name).length - pfNameTokens(a.name).length);
    const used = new Set();
    const out = {};
    for (const e of entries) {
        const k = pfNormName(e.name);
        if (!k || used.has(k))
            continue;
        let period = Number(e.period) || 0;
        let allTime = Number(e.allTime) || 0;
        used.add(k);
        for (const o of entries) {
            const ok = pfNormName(o.name);
            if (!ok || used.has(ok) || ok === k)
                continue;
            if (!pfAliasMergeAllowed(e.name, o.name, pool))
                continue;
            period += Number(o.period) || 0;
            allTime += Number(o.allTime) || 0;
            used.add(ok);
        }
        out[k] = {
            name: e.name,
            period: Math.round(period * 100) / 100,
            allTime: Math.round(allTime * 100) / 100,
        };
    }
    return out;
}
