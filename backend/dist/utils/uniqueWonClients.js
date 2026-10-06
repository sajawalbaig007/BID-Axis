"use strict";
/** Same clustering as CSR Clients (`splitWonClientsByIdentity`): one Close Client per person. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.clusterWonClients = clusterWonClients;
exports.countUniqueWonClients = countUniqueWonClients;
function normalizeClientName(name) {
    const n = (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!n || n === "unknown" || n === "n/a" || n === "na" || n === "-" || n === "none")
        return null;
    return n;
}
function leadPhoneKey(phone) {
    const digits = (phone ?? "").replace(/\D/g, "");
    return digits.length >= 7 ? digits : null;
}
/** Union-find by phone, name, or company (when name is missing). */
function clusterWonClients(wonLeads) {
    const parent = wonLeads.map((_, i) => i);
    const find = (i) => {
        if (parent[i] !== i)
            parent[i] = find(parent[i]);
        return parent[i];
    };
    const union = (a, b) => {
        const pa = find(a);
        const pb = find(b);
        if (pa !== pb)
            parent[pa] = pb;
    };
    const byPhone = new Map();
    const byName = new Map();
    const byCompany = new Map();
    wonLeads.forEach((lead, i) => {
        const phone = leadPhoneKey(lead.phone);
        if (phone) {
            const prev = byPhone.get(phone);
            if (prev !== undefined)
                union(prev, i);
            else
                byPhone.set(phone, i);
        }
        const name = normalizeClientName(lead.name);
        if (name) {
            const prev = byName.get(name);
            if (prev !== undefined)
                union(prev, i);
            else
                byName.set(name, i);
        }
        else {
            const co = (lead.company ?? "").trim().toLowerCase();
            if (co) {
                const prev = byCompany.get(co);
                if (prev !== undefined)
                    union(prev, i);
                else
                    byCompany.set(co, i);
            }
        }
    });
    const clusters = new Map();
    wonLeads.forEach((lead, i) => {
        const root = find(i);
        const bucket = clusters.get(root);
        if (bucket)
            bucket.push(lead);
        else
            clusters.set(root, [lead]);
    });
    return [...clusters.values()];
}
function countUniqueWonClients(wonLeads) {
    return clusterWonClients(wonLeads).length;
}
