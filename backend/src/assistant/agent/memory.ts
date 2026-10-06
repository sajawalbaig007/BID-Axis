import { lastEntityKind, lastFocusFromHistory, resolveWithHistory, type ChatTurn } from "../intent";

export function buildMemoryBlock(message: string, history: ChatTurn[]): {
  block: string;
  resolved: string;
  focus: string;
} {
  const focus = lastFocusFromHistory(history);
  const kind = lastEntityKind(history);
  const resolved = resolveWithHistory(message, history);
  const recent = history
    .slice(-16)
    .map(t => `${t.role === "user" ? "CEO" : "Nexa"}: ${t.text.slice(0, 700)}`)
    .join("\n");
  const who =
    kind === "person"
      ? `Last mentioned is STAFF from the Users/Employees page: ${focus || "none"}. Do NOT search them as a client. Use getPersonSnapshot. "history" / "details" / "projects" means their employee workload.`
      : kind === "client"
        ? `Last mentioned is a CLIENT: ${focus || "none"}. Use getClientHistory / getClientDetails.`
        : `Last mentioned person/client: ${focus || "none"}`;
  const block = [
    who,
    resolved !== message.trim() ? `Resolved follow-up text: ${resolved}` : "",
    recent ? `This chat so far (stay consistent with it):\n${recent}` : "No prior turns.",
  ]
    .filter(Boolean)
    .join("\n");
  return { block, resolved, focus };
}
