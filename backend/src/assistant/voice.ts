import type { ChatTurn } from "./intent";
import { runAssistantChat } from "./chatService";

/**
 * Voice architecture (no live training):
 *   Voice → Speech-to-Text → same Nexa agent → CRM tools → answer
 *
 * Current STT: browser Web Speech API (Chrome) sends `transcript`.
 * Future: Whisper / local Ollama audio can POST audio here; this function stays the same.
 */
export async function runVoiceTurn(opts: {
  userId: string;
  role: string;
  transcript: string;
  history?: ChatTurn[];
}) {
  return runAssistantChat({
    userId: opts.userId,
    role: opts.role,
    message: opts.transcript,
    history: opts.history,
  });
}
