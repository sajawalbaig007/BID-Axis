import { Dispatch, SetStateAction } from "react";
import API, { apiErrorMessage } from "@/lib/api";
import { invalidateAllCsrListCaches } from "@/lib/csrApiCache";
import { invalidateCsrTabCaches } from "@/lib/csrTabApiCache";
import { Lead } from "../types/lead";
import { NoteEntry } from "./useLeadsData";
import { normStatus } from "../constants/leadStatuses";
import toast from "react-hot-toast";
import { consumeLeadDial } from "../components/dialer/dialUnlock";

/** Keep optimistic flags in sync with status so lists/tabs don't drift. */
function flagsFromStatus(status: unknown): Partial<Lead> {
  if (typeof status !== "string") return {};
  const n = normStatus(status);
  return {
    important:  n === "important",
    interested: n === "interested",
    ...(n !== "important"
      ? { nextSchedule: "", nextTime: "" }
      : {}),
  };
}

/** Only these keys may patch local Lead state on status/pipeline updates.
 *  Never spread raw API/payload onto Lead — Prisma uses `name` while UI uses `client`,
 *  and placeholders like phone:"N/A" must not overwrite real contact fields. */
const LEAD_SAFE_PATCH_KEYS = new Set([
  "status",
  "important",
  "interested",
  "interestedService",
  "nextSchedule",
  "nextTime",
  "timezone",
  "followUpNotes",
  "comments",
  "hiddenOnMain",
  "statusUpdatedAt",
  "trade",
  "subTrades",
  "tradeNotes",
]);

function safeLeadPatch(payload: Record<string, unknown>): Partial<Lead> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!LEAD_SAFE_PATCH_KEYS.has(key)) continue;
    if (value === undefined) continue;
    patch[key] = value;
  }
  return patch as Partial<Lead>;
}

function cleanOutgoingContact(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (lower === "n/a" || lower === "na" || lower === "unknown" || lower === "not provided") {
    return undefined;
  }
  return s;
}

/** Strip placeholder contact fields before sending status/pipeline updates to API. */
function sanitizePayloadForApi(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  const contactKeys = ["name", "phone", "email", "company", "state", "website", "client"] as const;
  for (const key of contactKeys) {
    if (!(key in out)) continue;
    const cleaned = cleanOutgoingContact(out[key]);
    if (cleaned === undefined) delete out[key];
    else out[key] = cleaned;
  }
  /* UI Lead uses `client` — map to backend `name` only when real */
  if (typeof out.client === "string") {
    out.name = out.client;
    delete out.client;
  }
  return out;
}

export function useLeadActions(setLeads: Dispatch<SetStateAction<Lead[]>>) {
  const invalidateCaches = () => {
    invalidateCsrTabCaches();
    invalidateAllCsrListCaches();
  };

  const saveComment = async (id: string, comment: string) => {
    setLeads(prev => prev.map(l => (l.id === id ? { ...l, comments: comment } : l)));
    await API.put(`/csr/lead/${id}`, { comments: comment });
  };

  const addNote = async (
    id: string,
    text: string,
    parentId?: string,
  ): Promise<NoteEntry | null> => {
    const optimistic: NoteEntry = {
      id: `tmp-${Date.now()}`,
      text,
      createdAt: new Date().toISOString(),
      parentId: parentId || null,
    };
    setLeads(prev => prev.map(l => {
      if (l.id !== id) return l;
      const hist = l.noteHistory ?? [];
      let nextHistory: NoteEntry[];
      if (parentId) {
        nextHistory = hist.map((n) =>
          n.id === parentId
            ? { ...n, replies: [...(n.replies ?? []), optimistic] }
            : n,
        );
      } else {
        nextHistory = [...hist, optimistic];
      }
      return {
        ...l,
        noteCount: (l.noteCount ?? 0) + 1,
        noteHistory: nextHistory,
      };
    }));

    try {
      const res = await API.post(`/csr/lead/${id}/notes`, {
        text,
        ...(parentId ? { parentId } : {}),
      });
      const note: NoteEntry = res.data.note
        ? {
            id: res.data.note.id,
            text: res.data.note.text,
            createdAt: res.data.note.createdAt,
            parentId: res.data.note.parentId ?? parentId ?? null,
          }
        : { id: Date.now().toString(), text, createdAt: new Date().toISOString(), parentId: parentId || null };

      setLeads(prev => prev.map(l => {
        if (l.id !== id) return l;
        const hist = l.noteHistory ?? [];
        if (parentId) {
          return {
            ...l,
            noteHistory: hist.map((n) => {
              if (n.id !== parentId) return n;
              const replies = (n.replies ?? [])
                .filter((r) => r.id !== optimistic.id)
                .concat(note);
              return { ...n, replies };
            }),
          };
        }
        return {
          ...l,
          noteHistory: [...hist.filter(n => n.id !== optimistic.id), note],
        };
      }));
      return note;
    } catch (err) {
      setLeads(prev => prev.map(l => {
        if (l.id !== id) return l;
        const hist = l.noteHistory ?? [];
        if (parentId) {
          return {
            ...l,
            noteCount: Math.max(0, (l.noteCount ?? 1) - 1),
            noteHistory: hist.map((n) =>
              n.id === parentId
                ? { ...n, replies: (n.replies ?? []).filter((r) => r.id !== optimistic.id) }
                : n,
            ),
          };
        }
        return {
          ...l,
          noteCount: Math.max(0, (l.noteCount ?? 1) - 1),
          noteHistory: hist.filter(n => n.id !== optimistic.id),
        };
      }));
      return null;
    }
  };

  const updateLead = async (id: string, payload: Record<string, unknown>) => {
    const changingStatus = "status" in payload && String(payload.status ?? "").trim() !== "";
    const now = new Date().toISOString();
    const flagPatch = "status" in payload ? flagsFromStatus(payload.status) : {};
    const uiPatch = { ...safeLeadPatch(payload), ...flagPatch };

    setLeads(prev => prev.map(l => {
      if (l.id !== id) return l;
      const next = { ...l, ...uiPatch };
      if ("status" in payload) next.statusUpdatedAt = now;
      return next;
    }));

    let res;
    try {
      res = await API.put(`/csr/lead/${id}`, sanitizePayloadForApi(payload));
    } catch (err) {
      if (changingStatus) {
        const message = apiErrorMessage(err, "Could not update status.");
        if (message.includes("Zoom dialer")) consumeLeadDial(id);
        toast.error(message);
      }
      throw err;
    }
    if (changingStatus) consumeLeadDial(id);
    invalidateCaches();

    /* Only sync status/flags from server — never copy Prisma `name`/`phone` onto UI Lead */
    const serverLead = res.data?.lead as Record<string, unknown> | undefined;
    if (serverLead && typeof serverLead === "object") {
      setLeads(prev => prev.map(l => {
        if (l.id !== id) return l;
        return {
          ...l,
          ...(serverLead.status !== undefined ? { status: String(serverLead.status) } : {}),
          ...(serverLead.important !== undefined ? { important: !!serverLead.important } : {}),
          ...(serverLead.interested !== undefined ? { interested: !!serverLead.interested } : {}),
          ...(serverLead.nextSchedule !== undefined
            ? { nextSchedule: String(serverLead.nextSchedule ?? "") }
            : {}),
          ...(serverLead.nextTime !== undefined
            ? { nextTime: String(serverLead.nextTime ?? "") }
            : {}),
          ...(serverLead.interestedService !== undefined
            ? { interestedService: String(serverLead.interestedService ?? "") }
            : {}),
          statusUpdatedAt: now,
        };
      }));
    }

    if (res.data?.redistributed) {
      setLeads(prev => prev.filter(l => l.id !== id));
    }
    return res.data;
  };

  const onNoteUpdated = (
    leadId: string,
    noteId: string,
    text: string,
    createdAt?: string,
  ) => {
    const at = createdAt ?? new Date().toISOString();
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        const patchDeep = (notes: NoteEntry[]): NoteEntry[] =>
          notes.map((n) => {
            if (n.id === noteId) return { ...n, text, createdAt: at };
            if (n.replies?.length) return { ...n, replies: patchDeep(n.replies) };
            return n;
          });
        const noteHistory = patchDeep([...(l.noteHistory ?? [])]).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        return { ...l, noteHistory };
      }),
    );
  };

  const onNoteDeleted = (leadId: string, noteId: string) => {
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        const strip = (notes: NoteEntry[]): NoteEntry[] =>
          notes
            .filter((n) => n.id !== noteId)
            .map((n) => ({
              ...n,
              replies: (n.replies ?? []).filter((r) => r.id !== noteId),
            }));
        const noteHistory = strip(l.noteHistory ?? []);
        const deep = noteHistory.reduce((s, n) => s + 1 + (n.replies?.length ?? 0), 0);
        return { ...l, noteHistory, noteCount: deep };
      }),
    );
  };

  return { saveComment, addNote, updateLead, onNoteUpdated, onNoteDeleted };
}
