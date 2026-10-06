import { appendFile, mkdir, readFile } from "fs/promises";
import path from "path";

export type FeedbackRating = "up" | "down";

export type FeedbackRecord = {
  at: string;
  userId: string;
  rating: FeedbackRating;
  userMessage: string;
  assistantReply: string;
  correction?: string;
  source?: string;
  tools?: string[];
};

/**
 * Thumbs are stored for preference-conditioned answers (and later eval / DPO).
 * OpenRouter Gemma weights are not trained live; liked/disliked replies steer the next turn.
 */
function filePath() {
  return path.join(process.cwd(), "data", "nexa-feedback.jsonl");
}

export async function appendFeedback(row: FeedbackRecord): Promise<void> {
  const dir = path.dirname(filePath());
  await mkdir(dir, { recursive: true });
  await appendFile(filePath(), `${JSON.stringify(row)}\n`, "utf8");
  rowsCache = null;
}

let rowsCache: { at: number; rows: FeedbackRecord[] } | null = null;

async function loadRecentFeedback(limit = 80): Promise<FeedbackRecord[]> {
  if (rowsCache && Date.now() - rowsCache.at < 15_000) return rowsCache.rows;
  try {
    const raw = await readFile(filePath(), "utf8");
    const rows: FeedbackRecord[] = [];
    for (const line of raw.trim().split("\n").filter(Boolean).slice(-limit)) {
      try {
        const row = JSON.parse(line) as FeedbackRecord;
        if (row.rating === "up" || row.rating === "down") rows.push(row);
      } catch {
        /* skip bad line */
      }
    }
    rowsCache = { at: Date.now(), rows };
    return rows;
  } catch {
    rowsCache = { at: Date.now(), rows: [] };
    return [];
  }
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2),
  );
}

function overlap(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / (A.size + B.size - n);
}

function clip(text: string, n = 280): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

/**
 * Preference block from CEO thumbs. This is not weight-training (OpenRouter cannot
 * fine-tune live). Liked/disliked replies steer the next answers.
 */
export async function preferencePrompt(question: string): Promise<string> {
  const rows = await loadRecentFeedback();
  if (!rows.length) {
    return "No CEO thumbs yet. Keep answers short and only the asked CRM fields.";
  }
  const ups = rows.filter(r => r.rating === "up").slice(-6);
  const downs = rows.filter(r => r.rating === "down").slice(-6);
  const rankedUp = [...ups].sort((a, b) => overlap(b.userMessage, question) - overlap(a.userMessage, question));
  const rankedDown = [...downs].sort((a, b) => overlap(b.userMessage, question) - overlap(a.userMessage, question));
  const similarUp = rankedUp[0] && overlap(rankedUp[0].userMessage, question) >= 0.22 ? rankedUp[0] : null;
  const similarDown = rankedDown[0] && overlap(rankedDown[0].userMessage, question) >= 0.22 ? rankedDown[0] : null;
  const lines = [
    "LEARNED FROM CEO THUMBS (use this to self-correct; do not quote it):",
    "Prefer short answers that only cover the asked CRM field.",
    similarUp
      ? `A similar question was thumbs-up. Match that style:\nQ: ${clip(similarUp.userMessage, 160)}\nA: ${clip(similarUp.assistantReply)}`
      : ups.length
        ? `Recent thumbs-up style: ${clip(ups[ups.length - 1]!.assistantReply)}`
        : "",
    similarDown
      ? `A similar question was thumbs-down. Do NOT answer like this:\n${clip(similarDown.assistantReply)}`
      : downs.length
        ? `Avoid this thumbs-down pattern: ${clip(downs[downs.length - 1]!.assistantReply)}`
        : "",
  ].filter(Boolean);
  return lines.join("\n");
}
