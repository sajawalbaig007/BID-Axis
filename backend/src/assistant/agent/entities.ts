import type { AssistantActor } from "../permissions";
import { searchClients, getPersonSnapshot } from "../tools";

/** Fuzzy person + client lookup. Tools keep live DB + existing fuzzy matching. */
export async function resolveEntity(
  actor: AssistantActor,
  args: { query?: string },
) {
  const query = (args.query ?? "").trim();
  if (query.length < 2) {
    return {
      ok: true as const,
      data: {
        needPick: true,
        message: "Which name? Give a client, estimator, or CSR — even a rough spelling is fine.",
      },
    };
  }
  const [person, clients] = await Promise.all([
    getPersonSnapshot(actor, { query, intent: query }),
    searchClients(actor, { query }),
  ]);
  return {
    ok: true as const,
    data: {
      query,
      person: person.ok ? person.data : { error: person.error },
      clients: clients.ok ? clients.data : { error: clients.error },
      hint: "If both a staff member and a client match, ask which one. Do not merge them.",
    },
  };
}
