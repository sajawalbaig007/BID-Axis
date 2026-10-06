/** Same clustering as CSR Clients (`splitWonClientsByIdentity`): one Close Client per person. */

function normalizeClientName(name?: string | null): string | null {
  const n = (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!n || n === "unknown" || n === "n/a" || n === "na" || n === "-" || n === "none") return null;
  return n;
}

function leadPhoneKey(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

export type WonIdentityLead = {
  id: string;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
};

/** Union-find by phone, name, or company (when name is missing). */
export function clusterWonClients<T extends WonIdentityLead>(wonLeads: T[]): T[][] {
  const parent = wonLeads.map((_, i) => i);
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i]!);
    return parent[i]!;
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };

  const byPhone = new Map<string, number>();
  const byName = new Map<string, number>();
  const byCompany = new Map<string, number>();

  wonLeads.forEach((lead, i) => {
    const phone = leadPhoneKey(lead.phone);
    if (phone) {
      const prev = byPhone.get(phone);
      if (prev !== undefined) union(prev, i);
      else byPhone.set(phone, i);
    }

    const name = normalizeClientName(lead.name);
    if (name) {
      const prev = byName.get(name);
      if (prev !== undefined) union(prev, i);
      else byName.set(name, i);
    } else {
      const co = (lead.company ?? "").trim().toLowerCase();
      if (co) {
        const prev = byCompany.get(co);
        if (prev !== undefined) union(prev, i);
        else byCompany.set(co, i);
      }
    }
  });

  const clusters = new Map<number, T[]>();
  wonLeads.forEach((lead, i) => {
    const root = find(i);
    const bucket = clusters.get(root);
    if (bucket) bucket.push(lead);
    else clusters.set(root, [lead]);
  });
  return [...clusters.values()];
}

export function countUniqueWonClients(wonLeads: WonIdentityLead[]): number {
  return clusterWonClients(wonLeads).length;
}
