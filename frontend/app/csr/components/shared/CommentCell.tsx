"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  StickyNote,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Clock,
  Loader2,
  CornerDownRight,
  MessageSquareReply,
} from "lucide-react";
import { NoteEntry } from "../../hooks/useLeadsData";
import API from "@/lib/api";
import { getAuthMe, peekAuthMe } from "@/lib/authMeCache";
import { buildNoteHistory, countNotesDeep, nestNoteReplies } from "../../utils/noteHistory";
import { NoteComposer, NoteRichText } from "@/lib/noteRichText";
import { formatEstDateTime } from "@/lib/estTime";

interface CommentCellProps {
  id: string;
  noteHistory?: NoteEntry[];
  noteCount?: number;
  comment?: string;
  apiRole?: "csr" | "admin" | "estimator";
  /** View-only — hide add / edit / delete (e.g. technical reading admin bid instructions). */
  readOnly?: boolean;
  /** Show only `comment` (e.g. projectNotes bid instruction) — never load/thread notes. */
  commentOnly?: boolean;
  /** Never lazy-fetch lead notes — use only `noteHistory` / `comment` from props. */
  skipNotesFetch?: boolean;
  /** Optional short label under the sticky (e.g. "Tech"). */
  badgeLabel?: string;
  /**
   * Extra notes merged into the same sticky (e.g. Technical notes on Admin Project DB).
   * Always shown in history / latest pick; never editable via this cell.
   */
  extraReadOnlyNotes?: NoteEntry[];
  /** Chat bubble layout for Admin↔TM / TM↔Estimator threads. */
  chatStyle?: boolean;
  /** Current user id — only this author can edit/delete their own notes. */
  currentUserId?: string;
  /** Current user role — used when note has authorRole but no authorId (legacy). */
  currentUserRole?: string;
  /** Use technical-notes API (bundle threads) instead of LeadNote CRUD. */
  notesKind?: "lead" | "technical";
  onAddNote?: (id: string, text: string, parentId?: string) => Promise<unknown>;
  onSave?: (id: string, text: string) => Promise<void>;
  onNoteUpdated?: (id: string, noteId: string, text: string, createdAt?: string) => void;
  onNoteDeleted?: (id: string, noteId: string) => void;
}

function adminishRole(role?: string | null): boolean {
  const r = String(role ?? "").toLowerCase();
  return r === "admin" || r === "manager" || r === "technical_manager";
}

function roleOwnsNote(noteRole?: string | null, myRole?: string | null): boolean {
  if (!noteRole || !myRole) return false;
  if (adminishRole(noteRole) && adminishRole(myRole)) return true;
  return noteRole === myRole;
}

function fmtTime(iso: string): string {
  if (!iso) return "";
  const label = formatEstDateTime(iso);
  return label === "—" ? "" : label;
}

function plainNotePreview(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLegacyNoteId(noteId: string) {
  return (
    noteId.startsWith("legacy-") ||
    noteId.startsWith("tmp-") ||
    noteId.startsWith("tech-") ||
    noteId.startsWith("readonly-")
  );
}

function flattenNotes(notes: NoteEntry[]): NoteEntry[] {
  const out: NoteEntry[] = [];
  for (const n of notes) {
    out.push({ ...n, replies: undefined });
    for (const r of n.replies ?? []) out.push({ ...r, parentId: n.id, replies: undefined });
  }
  return out;
}

function upsertLocalNote(prev: NoteEntry[] | null, note: NoteEntry, fallback: NoteEntry[]): NoteEntry[] {
  const flat = flattenNotes(prev ?? fallback).filter((n) => n.id !== note.id);
  flat.push(note);
  return nestNoteReplies(flat);
}

function removeLocalNote(prev: NoteEntry[] | null, noteId: string, fallback: NoteEntry[]): NoteEntry[] {
  const flat = flattenNotes(prev ?? fallback).filter(
    (n) => n.id !== noteId && n.parentId !== noteId,
  );
  return nestNoteReplies(flat);
}

type CtxMenu = { x: number; y: number; noteId: string; isReply: boolean };

export default function CommentCell({
  id,
  noteHistory,
  noteCount,
  comment,
  apiRole = "csr",
  readOnly = false,
  commentOnly = false,
  skipNotesFetch = false,
  badgeLabel,
  extraReadOnlyNotes,
  chatStyle = false,
  currentUserId,
  currentUserRole,
  notesKind = "lead",
  onAddNote,
  onSave,
  onNoteUpdated,
  onNoteDeleted,
}: CommentCellProps) {
  const peeked = peekAuthMe();
  const [meId, setMeId] = useState<string | undefined>(currentUserId || peeked?.id);
  const [meRole, setMeRole] = useState<string | undefined>(currentUserRole || peeked?.role);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySaving, setReplySaving] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const [localNotes, setLocalNotes] = useState<NoteEntry[] | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [commentOverride, setCommentOverride] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState(false);
  const [editingBidIndex, setEditingBidIndex] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  const popupRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const fetchStartedRef = useRef(false);
  const deletedNoteIdsRef = useRef<Set<string>>(new Set());

  const readonlyExtras = (extraReadOnlyNotes ?? [])
    .filter((n) => n.text?.trim())
    .map((n) => ({
      ...n,
      id: n.id.startsWith("tech-") || n.id.startsWith("readonly-") ? n.id : `readonly-${n.id}`,
      parentId: null as string | null,
      replies: [] as NoteEntry[],
    }));

  const baseNotes = commentOnly
    ? []
    : nestNoteReplies(
        flattenNotes(localNotes !== null ? localNotes : (noteHistory ?? [])).filter(
          (n) => n.text?.trim() && !deletedNoteIdsRef.current.has(n.id),
        ),
      );

  const displayNotes = (() => {
    const roots = [...baseNotes];
    for (const extra of readonlyExtras) {
      if (roots.some((n) => n.id === extra.id || n.text === extra.text)) continue;
      roots.push(extra);
    }
    return roots.sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      // Chat: oldest → newest (conversation flow). Sticky: newest first.
      return chatStyle ? diff : diff;
    });
  })();

  const effectiveComment = (commentOverride !== null ? commentOverride : comment)?.trim() || "";
  const legacyComment = effectiveComment
    ? commentOnly || !flattenNotes(displayNotes).some((n) => n.text === effectiveComment)
      ? effectiveComment
      : null
    : null;
  const bidItems = commentOnly && effectiveComment
    ? effectiveComment.split(/\n\s*---\s*\n/).map(s => s.trim()).filter(Boolean)
    : [];

  const latestAny = flattenNotes(displayNotes).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  const latestAt = latestAny?.createdAt || null;

  const preloadedDeep = noteHistory ? countNotesDeep(noteHistory) : 0;
  const baseCount = commentOnly
    ? 0
    : localNotes !== null
      ? countNotesDeep(localNotes)
      : Math.max(preloadedDeep, noteCount ?? 0);
  const extrasUniqueCount = readonlyExtras.filter(
    (extra) =>
      !flattenNotes(localNotes ?? noteHistory ?? []).some(
        (n) => n.id === extra.id || n.text === extra.text,
      ),
  ).length;
  const count = baseCount + extrasUniqueCount + (commentOnly ? bidItems.length : (legacyComment ? 1 : 0));
  const canMutate = !readOnly;
  /** Technical thread notes use skipNotesFetch but still allow own-note edit/delete. Admin/TM can edit bid stickies too. */
  const canEditDelete =
    canMutate &&
    (notesKind === "technical" || !skipNotesFetch || adminishRole(meRole) || apiRole === "admin");
  /** Bid Instruction / projectNotes via onSave */
  const canEditComment = canMutate && !!onSave && (commentOnly || !!legacyComment || skipNotesFetch);
  const previewRaw = latestAny?.text || legacyComment || comment || "";
  const previewText = plainNotePreview(previewRaw);
  // Always prefer text + optional +N (never bare +N when we have previewable text from any source).
  const showRowPreview = !chatStyle && !commentOnly && !!previewText;
  const extraNotesCount = showRowPreview
    ? Math.max(0, count > 0 ? count - 1 : 0)
    : 0;

  const noteApiPath = (noteId: string) =>
    notesKind === "technical"
      ? apiRole === "estimator"
        ? `/estimator/lead/${id}/notes/${noteId}`
        : `/admin/lead/${id}/technical-notes/${noteId}`
      : `/${apiRole}/lead/${id}/notes/${noteId}`;

  useEffect(() => {
    if (currentUserId) setMeId(currentUserId);
    if (currentUserRole) setMeRole(currentUserRole);
  }, [currentUserId, currentUserRole]);

  useEffect(() => {
    const apply = () => {
      const u = peekAuthMe();
      if (u?.id) setMeId((prev) => prev || u.id);
      if (u?.role) setMeRole((prev) => prev || u.role);
    };
    apply();
    void getAuthMe().then((u) => {
      if (u?.id) setMeId(u.id);
      if (u?.role) setMeRole(u.role);
    }).catch(() => {});
    const onAuth = () => apply();
    window.addEventListener("crm-auth-me-updated", onAuth);
    return () => window.removeEventListener("crm-auth-me-updated", onAuth);
  }, []);

  const isOwnNote = (note: NoteEntry) => {
    /* Admin / TM / CEO may edit or delete any bid-instruction sticky. */
    if (notesKind !== "technical" && (adminishRole(meRole) || apiRole === "admin")) return true;
    if (notesKind === "technical") {
      if (note.authorId && meId) return note.authorId === meId;
      if (note.authorRole && meRole) return roleOwnsNote(note.authorRole, meRole);
      // Legacy notes (no author meta): allow signed-in user so old threads remain manageable.
      return !!meId && !note.authorId && !note.authorRole;
    }
    if (!note.authorId) return true;
    return !!meId && note.authorId === meId;
  };

  useEffect(() => {
    if (!noteHistory?.length) return;
    setLocalNotes((prev) => {
      if (prev === null) return null;
      const flatPrev = flattenNotes(prev);
      const ids = new Set(flatPrev.map((n) => n.id));
      const incoming = flattenNotes(noteHistory).filter(
        (n) => !ids.has(n.id) && !deletedNoteIdsRef.current.has(n.id),
      );
      if (!incoming.length) return prev;
      return nestNoteReplies([...flatPrev, ...incoming]);
    });
  }, [noteHistory]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setCtxMenu(null);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [ctxMenu]);

  const calcStyle = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const popupH = 440;
    const popupW = Math.min(360, Math.max(280, window.innerWidth - 16));
    const spaceBelow = window.innerHeight - rect.bottom;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popupW - 8));

    if (spaceBelow < popupH && rect.top > popupH) {
      setPopupStyle({
        position: "fixed",
        bottom: window.innerHeight - rect.top + 4,
        left,
        width: popupW,
        maxWidth: "calc(100vw - 16px)",
      });
    } else {
      setPopupStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left,
        width: popupW,
        maxWidth: "calc(100vw - 16px)",
      });
    }
  };

  useEffect(() => {
    if (!open) return;
    calcStyle();
    window.addEventListener("scroll", calcStyle, true);
    window.addEventListener("resize", calcStyle);
    return () => {
      window.removeEventListener("scroll", calcStyle, true);
      window.removeEventListener("resize", calcStyle);
    };
  }, [open]);

  const loadNotesIfNeeded = async () => {
    if (commentOnly || skipNotesFetch) return;
    if (localNotes !== null || fetchStartedRef.current) return;

    const loadedCount = noteHistory ? countNotesDeep(noteHistory) : 0;
    const shouldFetch = (noteCount ?? 0) > loadedCount || loadedCount === 0;
    if (!shouldFetch && !comment?.trim()) return;

    fetchStartedRef.current = true;
    setNotesLoading(true);
    try {
      const res = await API.get(`/${apiRole}/lead/${id}`);
      const raw = res.data.lead;
      const fetched: NoteEntry[] = (raw?.notes ?? []).map(
        (n: { id: string; text: string; createdAt: string; parentId?: string | null }) => ({
          id: n.id,
          text: n.text,
          createdAt: n.createdAt,
          parentId: n.parentId ?? null,
        }),
      );
      const { noteHistory: built } = buildNoteHistory({
        notes: fetched,
        comments: raw?.comments,
        followUpNotes: raw?.followUpNotes,
        createdAt: raw?.createdAt,
        updatedAt: raw?.updatedAt,
      });
      setLocalNotes(built);
    } catch {
      setLocalNotes(noteHistory ?? []);
    } finally {
      setNotesLoading(false);
    }
  };

  const handleOpen = () => {
    calcStyle();
    const willOpen = !open;
    setOpen(willOpen);
    setCtxMenu(null);
    if (willOpen) void loadNotesIfNeeded();
  };

  const persistNewNote = async (text: string, parentId?: string): Promise<NoteEntry | null> => {
    let result: unknown;
    if (onAddNote) result = await onAddNote(id, text, parentId);
    else if (!parentId && onSave) await onSave(id, text);
    else {
      const res = await API.post(`/${apiRole}/lead/${id}/notes`, {
        text,
        ...(parentId ? { parentId } : {}),
      });
      result = res.data?.note;
    }

    if (result && typeof result === "object" && "id" in (result as object)) {
      const n = result as NoteEntry & { parentId?: string | null };
      return {
        id: n.id,
        text: n.text ?? text,
        createdAt: n.createdAt ?? new Date().toISOString(),
        parentId: n.parentId ?? parentId ?? null,
        authorId: n.authorId,
        authorRole: n.authorRole,
        authorName: n.authorName,
      };
    }
    return {
      id: Date.now().toString(),
      text,
      createdAt: new Date().toISOString(),
      parentId: parentId || null,
      authorId: meId,
    };
  };

  const handleAdd = async () => {
    const text = draft.trim();
    if (!text) return;
    const tempNote: NoteEntry = {
      id: `tmp-${Date.now()}`,
      text,
      createdAt: new Date().toISOString(),
      parentId: null,
      authorId: meId,
    };
    setLocalNotes((prev) => upsertLocalNote(prev, tempNote, noteHistory ?? []));
    setDraft("");
    setSaving(true);
    try {
      const newNote = await persistNewNote(text);
      if (newNote) {
        setLocalNotes((prev) => {
          const withoutTmp = removeLocalNote(prev, tempNote.id, noteHistory ?? []);
          return upsertLocalNote(withoutTmp, newNote, []);
        });
      }
    } catch {
      setLocalNotes((prev) => removeLocalNote(prev, tempNote.id, noteHistory ?? []));
    } finally {
      setSaving(false);
    }
  };

  const handleReply = async (parentId: string) => {
    const text = replyDraft.trim();
    if (!text || isLegacyNoteId(parentId)) return;
    const tempNote: NoteEntry = {
      id: `tmp-${Date.now()}`,
      text,
      createdAt: new Date().toISOString(),
      parentId,
    };
    setLocalNotes((prev) => upsertLocalNote(prev, tempNote, noteHistory ?? []));
    setReplyDraft("");
    setReplySaving(true);
    try {
      const newNote = await persistNewNote(text, parentId);
      if (newNote) {
        setLocalNotes((prev) => {
          const withoutTmp = removeLocalNote(prev, tempNote.id, noteHistory ?? []);
          return upsertLocalNote(withoutTmp, newNote, []);
        });
      }
      setReplyToId(null);
    } catch {
      setLocalNotes((prev) => removeLocalNote(prev, tempNote.id, noteHistory ?? []));
    } finally {
      setReplySaving(false);
    }
  };

  const handleUpdate = async (noteId: string) => {
    const text = editText.trim();
    if (!text || isLegacyNoteId(noteId)) return;
    setEditSaving(true);
    try {
      const res = await API.put(noteApiPath(noteId), { text });
      const serverNote = res.data?.note as
        | { id?: string; text?: string; createdAt?: string; parentId?: string | null }
        | undefined;
      const bumpedAt = serverNote?.createdAt ?? new Date().toISOString();
      setLocalNotes((prev) => {
        const flat = flattenNotes(prev ?? noteHistory ?? []).map((n) =>
          n.id === noteId
            ? {
                ...n,
                text: serverNote?.text ?? text,
                createdAt: bumpedAt,
                parentId: serverNote?.parentId ?? n.parentId ?? null,
              }
            : n,
        );
        return nestNoteReplies(flat);
      });
      onNoteUpdated?.(id, noteId, text, bumpedAt);
      setEditId(null);
    } catch {
      /* toast from interceptor */
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (isLegacyNoteId(noteId)) return;
    if (!confirm("Delete this note?")) return;
    setDeleting(noteId);
    try {
      await API.delete(noteApiPath(noteId));
      deletedNoteIdsRef.current.add(noteId);
      setLocalNotes((prev) => removeLocalNote(prev, noteId, noteHistory ?? []));
      onNoteDeleted?.(id, noteId);
      if (replyToId === noteId) setReplyToId(null);
      if (editId === noteId) setEditId(null);
    } catch {
      /* toast from interceptor */
    } finally {
      setDeleting(null);
    }
  };

  const saveCommentField = async (text: string) => {
    if (!onSave) return;
    setCommentSaving(true);
    try {
      await onSave(id, text);
      setCommentOverride(text);
      setEditingComment(false);
      setEditingBidIndex(null);
      setCommentDraft("");
      setDraft("");
    } finally {
      setCommentSaving(false);
    }
  };

  const saveBidAt = async (index: number, text: string) => {
    const next = bidItems.map((b, i) => (i === index ? text.trim() : b)).filter(Boolean);
    await saveCommentField(next.join("\n\n---\n\n"));
  };

  const deleteBidAt = async (index: number) => {
    if (!confirm("Delete this bid instruction?")) return;
    const next = bidItems.filter((_, i) => i !== index);
    await saveCommentField(next.join("\n\n---\n\n"));
  };

  const addBidInstruction = async () => {
    const text = draft.trim();
    if (!text) return;
    await saveCommentField([...bidItems, text].join("\n\n---\n\n"));
  };

  const deleteCommentField = async () => {
    if (!onSave) return;
    if (!confirm("Delete this bid instruction?")) return;
    setCommentSaving(true);
    try {
      await onSave(id, "");
      setCommentOverride("");
      setEditingComment(false);
      setCommentDraft("");
    } finally {
      setCommentSaving(false);
    }
  };

  const openCtx = (e: React.MouseEvent, noteId: string, isReply: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const note = flattenNotes(displayNotes).find((n) => n.id === noteId);
    if (!canMutate || isLegacyNoteId(noteId) || (note && !isOwnNote(note))) return;
    setCtxMenu({ x: e.clientX, y: e.clientY, noteId, isReply });
  };

  const renderNoteBody = (note: NoteEntry, isReply: boolean) => {
            const editable = canEditDelete && !isLegacyNoteId(note.id) && isOwnNote(note);
    const isTech = note.id.startsWith("tech-") || note.id.startsWith("readonly-");
    const mine = isOwnNote(note);

    if (editId === note.id) {
      return (
        <div className="space-y-2">
          <NoteComposer
            autoFocus
            value={editText}
            onChange={setEditText}
            rows={3}
            placeholder="Edit note…"
            onSubmit={() => void handleUpdate(note.id)}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => void handleUpdate(note.id)}
              disabled={editSaving || !editText.trim()}
              className="flex-1 h-7 rounded-lg bg-amber-600 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"
            >
              {editSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditId(null)}
              className="flex-1 h-7 rounded-lg bg-white/80 text-amber-800 text-[11px] font-semibold border border-amber-200"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        onContextMenu={(e) => openCtx(e, note.id, isReply)}
        className={editable ? "cursor-context-menu" : undefined}
      >
        {chatStyle && (
          <p className={`text-[9px] font-bold mb-0.5 truncate ${mine ? "text-white/80" : "text-amber-800/70"}`}>
            {mine ? "You" : note.authorName || note.authorRole || "Teammate"}
          </p>
        )}
        {isTech && (
          <span className="inline-flex mb-1 text-[9px] font-extrabold uppercase tracking-wide text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-md">
            Tech
          </span>
        )}
        {isReply && !chatStyle && (
          <span className="inline-flex mb-1 items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-amber-700/80">
            <CornerDownRight size={9} />
            Reply
          </span>
        )}
        <p className={`text-[12px] leading-snug ${chatStyle ? "text-inherit" : "text-amber-950 dark:text-amber-950"}`}>
          <NoteRichText text={note.text} className={chatStyle ? undefined : "text-amber-950 dark:text-amber-950"} />
        </p>
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {note.createdAt && (
            <span className={`text-[9px] inline-flex items-center gap-1 mr-auto ${chatStyle ? "opacity-70" : "text-amber-700/70"}`}>
              <Clock size={9} />
              {fmtTime(note.createdAt)}
            </span>
          )}
          {editable && !isReply && !chatStyle && (
            <button
              type="button"
              onClick={() => {
                setReplyToId(note.id);
                setReplyDraft("");
                setEditId(null);
              }}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-white/80 border border-amber-200 text-amber-800 hover:bg-white text-[10px] font-bold"
              title="Reply (or right-click)"
            >
              <MessageSquareReply size={9} />
              Reply
            </button>
          )}
          {editable && (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditId(note.id);
                  setEditText(note.text);
                  setReplyToId(null);
                }}
                className={
                  chatStyle && mine
                    ? "inline-flex items-center gap-1 h-6 px-2 rounded-md bg-white/20 border border-white/30 text-white hover:bg-white/30 text-[10px] font-bold"
                    : "inline-flex items-center gap-1 h-6 px-2 rounded-md bg-white/80 border border-amber-200 text-amber-800 hover:bg-white text-[10px] font-bold"
                }
              >
                <Pencil size={9} />
                Edit
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(note.id)}
                disabled={deleting === note.id}
                className={
                  chatStyle && mine
                    ? "inline-flex items-center gap-1 h-6 px-2 rounded-md bg-black/20 border border-white/20 text-white hover:bg-black/30 text-[10px] font-bold disabled:opacity-50"
                    : "inline-flex items-center gap-1 h-6 px-2 rounded-md bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 text-[10px] font-bold disabled:opacity-50"
                }
              >
                {deleting === note.id ? (
                  <Loader2 size={9} className="animate-spin" />
                ) : (
                  <Trash2 size={9} />
                )}
                Del
              </button>
            </>
          )}
        </div>

        {replyToId === note.id && (
          <div className="mt-2 pt-2 border-t border-amber-200/70 space-y-1.5">
            <NoteComposer
              autoFocus
              value={replyDraft}
              onChange={setReplyDraft}
              rows={2}
              placeholder="Write a reply… (Ctrl+Enter)"
              onSubmit={() => void handleReply(note.id)}
            />
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => void handleReply(note.id)}
                disabled={replySaving || !replyDraft.trim()}
                className="flex-1 h-7 rounded-lg bg-amber-600 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"
              >
                {replySaving ? <Loader2 size={10} className="animate-spin" /> : <MessageSquareReply size={10} />}
                Send reply
              </button>
              <button
                type="button"
                onClick={() => {
                  setReplyToId(null);
                  setReplyDraft("");
                }}
                className="h-7 px-3 rounded-lg bg-white/80 text-amber-800 text-[11px] font-semibold border border-amber-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const popup = open && (
    <div
      ref={popupRef}
      style={{ ...popupStyle, zIndex: 9999 }}
      className="rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.2)] border border-amber-200/80 overflow-hidden w-[min(360px,calc(100vw-16px))] bg-[#FFFBEB]"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-amber-200/70 bg-gradient-to-r from-amber-100 to-amber-50">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-amber-200/80 text-amber-800 flex items-center justify-center shrink-0 shadow-sm">
            <StickyNote size={14} />
            </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-amber-900 dark:text-amber-950 truncate">
              {commentOnly || (readOnly && !chatStyle)
                ? "Bid Instruction"
                : chatStyle
                  ? badgeLabel || "Chat"
                  : "Sticky Notes"}
              {!chatStyle && !commentOnly && badgeLabel ? ` · ${badgeLabel}` : ""}
            </p>
            <p className="text-[10px] text-amber-800/80">
              {count} note{count === 1 ? "" : "s"}
              {canMutate && !chatStyle && !commentOnly ? " · right-click to reply" : ""}
              {chatStyle ? " · only your messages can be edited" : ""}
              {commentOnly && canEditComment ? " · edit or delete below" : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="w-7 h-7 rounded-lg text-amber-700/70 hover:bg-amber-200/60 hover:text-amber-900 flex items-center justify-center"
          aria-label="Close notes"
        >
          <X size={14} />
        </button>
      </div>

      <div className="max-h-[300px] overflow-y-auto p-2.5 space-y-2 bg-[#FFFDF5]">
        {commentOnly
          ? bidItems.map((item, bidIdx) => (
          <div key={`bid-${bidIdx}`} className="rounded-xl border border-amber-200 bg-[#FEF3C7] px-3 py-2.5 shadow-sm rotate-[-0.3deg]">
            {editingBidIndex === bidIdx ? (
              <div className="space-y-2">
                <NoteComposer
                  autoFocus
                  value={commentDraft}
                  onChange={setCommentDraft}
                  rows={3}
                  placeholder="Edit bid instruction…"
                  onSubmit={() => void saveBidAt(bidIdx, commentDraft)}
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void saveBidAt(bidIdx, commentDraft)}
                    disabled={commentSaving || !commentDraft.trim()}
                    className="flex-1 h-7 rounded-lg bg-amber-600 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {commentSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingBidIndex(null); setCommentDraft(""); }}
                    className="flex-1 h-7 rounded-lg bg-white/80 text-amber-900 text-[11px] font-semibold border border-amber-200"
                  >
                    Cancel
                  </button>
                </div>
          </div>
            ) : (
              <>
                <p className="text-[12px] text-amber-950 leading-snug">
                  <NoteRichText text={item} className="text-amber-950" />
                </p>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <p className="text-[9px] text-amber-800/80 font-medium mr-auto">
                    Bid instruction{bidItems.length > 1 ? ` ${bidIdx + 1}` : ""}
                  </p>
                  {canEditComment && (
                    <>
                      <button
                        type="button"
                        onClick={() => { setEditingBidIndex(bidIdx); setCommentDraft(item); }}
                        className="h-6 px-2 rounded-md text-[10px] font-bold text-amber-900 bg-white/70 border border-amber-200 hover:bg-white inline-flex items-center gap-1"
                      >
                        <Pencil size={10} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteBidAt(bidIdx)}
                        disabled={commentSaving}
                        className="h-6 px-2 rounded-md text-[10px] font-bold text-red-600 bg-white/70 border border-red-200 hover:bg-red-50 inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        {commentSaving ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                        Delete
                      </button>
                    </>
                  )}
          </div>
              </>
        )}
          </div>
            ))
          : legacyComment && (
          <div className="rounded-xl border border-amber-200 bg-[#FEF3C7] px-3 py-2.5 shadow-sm rotate-[-0.3deg]">
            {editingComment ? (
              <div className="space-y-2">
                <NoteComposer
                  autoFocus
                  value={commentDraft}
                  onChange={setCommentDraft}
                  rows={3}
                  placeholder="Edit bid instruction…"
                  onSubmit={() => void saveCommentField(commentDraft.trim())}
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void saveCommentField(commentDraft.trim())}
                    disabled={commentSaving || !commentDraft.trim()}
                    className="flex-1 h-7 rounded-lg bg-amber-600 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {commentSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingComment(false);
                      setCommentDraft("");
                    }}
                    className="flex-1 h-7 rounded-lg bg-white/80 text-amber-900 text-[11px] font-semibold border border-amber-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[12px] text-amber-950 dark:text-amber-950 leading-snug">
                  <NoteRichText text={legacyComment} className="text-amber-950 dark:text-amber-950" />
                </p>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <p className="text-[9px] text-amber-800/80 font-medium mr-auto">Bid instruction</p>
                  {canEditComment && (
                    <>
                    <button
                        type="button"
                        onClick={() => {
                          setEditingComment(true);
                          setCommentDraft(legacyComment);
                        }}
                        className="h-6 px-2 rounded-md text-[10px] font-bold text-amber-900 bg-white/70 border border-amber-200 hover:bg-white inline-flex items-center gap-1"
                      >
                        <Pencil size={10} /> Edit
                    </button>
                    <button
                        type="button"
                        onClick={() => void deleteCommentField()}
                        disabled={commentSaving}
                        className="h-6 px-2 rounded-md text-[10px] font-bold text-red-600 bg-white/70 border border-red-200 hover:bg-red-50 inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        {commentSaving ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                      Delete
                    </button>
                    </>
                )}
              </div>
              </>
            )}
          </div>
        )}

        {notesLoading && (
          <div className="py-8 text-center">
            <Loader2 size={20} className="text-amber-500 mx-auto mb-2 animate-spin" />
            <p className="text-[12px] text-amber-700/70">Loading notes…</p>
          </div>
        )}

        {!notesLoading && displayNotes.length === 0 && !legacyComment && bidItems.length === 0 && (
          <div className="py-8 text-center">
            <StickyNote size={28} className="text-amber-200 mx-auto mb-2" />
            <p className="text-[12px] text-amber-700/60 dark:text-amber-800/70">
              {commentOnly
                ? "No bid instruction yet"
                : chatStyle
                  ? "No messages yet — start the conversation"
                  : "No sticky notes yet"}
            </p>
          </div>
        )}

        {!notesLoading &&
          displayNotes.map((note, idx) => {
            const mineBubble = isOwnNote(note);
            if (chatStyle) {
              return (
                <div
                  key={note.id}
                  className={`flex ${mineBubble ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-3 py-2 shadow-sm border ${
                      mineBubble
                        ? "bg-[#1B6FE8] text-white border-[#1B6FE8] rounded-br-md"
                        : "bg-white text-gray-800 border-amber-200 rounded-bl-md"
                    }`}
                  >
                    {renderNoteBody(note, false)}
                  </div>
                </div>
              );
            }
            return (
            <div key={note.id} className="space-y-1.5">
              <div
                className={`rounded-xl border border-amber-200/90 bg-[#FEF3C7] px-3 py-2.5 shadow-sm ${
                  idx % 2 === 0 ? "rotate-[-0.4deg]" : "rotate-[0.35deg]"
                }`}
              >
                {renderNoteBody(note, false)}
              </div>

              {(note.replies?.length ?? 0) > 0 && (
                <div className="ml-3 pl-2 border-l-2 border-amber-300/80 space-y-1.5">
                  {note.replies!.map((reply) => (
                    <div
                      key={reply.id}
                      className="rounded-xl border border-amber-200/70 bg-[#FFF7D6] px-2.5 py-2 shadow-sm"
                    >
                      {renderNoteBody(reply, true)}
          </div>
        ))}
                </div>
              )}
            </div>
            );
          })}
      </div>

      {canMutate && !commentOnly && (
        <div className="border-t border-amber-200/80 p-3 bg-amber-50/90">
          <NoteComposer
          value={draft}
            onChange={setDraft}
          rows={2}
            placeholder={chatStyle ? "Type a message… (Ctrl+Enter)" : "Write a sticky note… (Ctrl+Enter)"}
            onSubmit={() => void handleAdd()}
            disabled={saving}
        />
        <button
            type="button"
          onClick={() => void handleAdd()}
          disabled={saving || !draft.trim()}
            className="mt-2 w-full h-8 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            {saving ? "Sending…" : chatStyle ? "Send" : "Add sticky"}
          </button>
        </div>
      )}
      {canMutate && commentOnly && canEditComment && editingBidIndex === null && (
        <div className="border-t border-amber-200/80 p-3 bg-amber-50/90">
          <NoteComposer
            value={draft}
            onChange={setDraft}
            rows={3}
            placeholder={bidItems.length ? "Add another bid instruction… (Ctrl+Enter)" : "Write bid instruction… (Ctrl+Enter)"}
            onSubmit={() => void addBidInstruction()}
            disabled={commentSaving}
          />
          <button
            type="button"
            onClick={() => void addBidInstruction()}
            disabled={commentSaving || !draft.trim()}
            className="mt-2 w-full h-8 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {commentSaving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            {commentSaving ? "Saving…" : bidItems.length ? "Add bid" : "Save bid instruction"}
        </button>
      </div>
      )}
    </div>
  );

  const contextMenuPortal =
    ctxMenu &&
    createPortal(
      <div
        className="fixed inset-0 z-[10000]"
        onMouseDown={() => setCtxMenu(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtxMenu(null);
        }}
      >
        <div
          role="menu"
          style={{ position: "fixed", top: ctxMenu.y, left: ctxMenu.x }}
          className="min-w-[140px] rounded-xl border border-amber-200 bg-white shadow-xl py-1 overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {!ctxMenu.isReply && (
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-left text-[12px] font-semibold text-amber-900 hover:bg-amber-50 inline-flex items-center gap-2"
              onClick={() => {
                setReplyToId(ctxMenu.noteId);
                setReplyDraft("");
                setEditId(null);
                setCtxMenu(null);
              }}
            >
              <MessageSquareReply size={12} />
              Reply
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="w-full px-3 py-2 text-left text-[12px] font-semibold text-amber-900 hover:bg-amber-50 inline-flex items-center gap-2"
            onClick={() => {
              const flat = flattenNotes(displayNotes);
              const n = flat.find((x) => x.id === ctxMenu.noteId);
              if (n) {
                setEditId(n.id);
                setEditText(n.text);
                setReplyToId(null);
              }
              setCtxMenu(null);
            }}
          >
            <Pencil size={12} />
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full px-3 py-2 text-left text-[12px] font-semibold text-red-600 hover:bg-red-50 inline-flex items-center gap-2"
            onClick={() => {
              void handleDelete(ctxMenu.noteId);
              setCtxMenu(null);
            }}
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      </div>,
      document.body,
  );

  return (
    <div className="relative min-w-0 w-full max-w-full flex justify-center sm:justify-start">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        title={
          count > 0
            ? `${count} sticky note${count === 1 ? "" : "s"}${latestAt ? ` · latest ${fmtTime(latestAt)}` : ""}${
                previewText ? ` · ${previewText}` : ""
              }`
            : "Add sticky note"
        }
        className={`relative inline-flex gap-1.5 px-2 py-1.5 rounded-xl border transition-all shadow-sm overflow-hidden ${
          showRowPreview
            ? "w-full max-w-full min-w-0 min-h-[56px] items-center"
            : "min-w-[44px] h-9 items-center justify-center"
        } ${
          count > 0
            ? "bg-[#FEF3C7] border-amber-300 text-amber-900 hover:bg-[#FDE68A]"
            : "bg-gray-50 border-dashed border-gray-300 text-gray-400 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50"
        }`}
      >
        <StickyNote size={13} className="shrink-0 text-amber-700" />
        {showRowPreview ? (
          <>
            <span className="min-w-0 flex-1 flex flex-col items-start gap-0.5 text-left overflow-hidden">
              {latestAt ? (
                <span className="text-[9px] sm:text-[10px] font-bold text-amber-800/80 tabular-nums leading-none">
                  {fmtTime(latestAt)}
                </span>
              ) : null}
              <span className="w-full text-[10px] sm:text-[11px] font-semibold text-amber-950 leading-snug line-clamp-2 break-words">
                {previewText}
              </span>
            </span>
            {extraNotesCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[22px] h-[18px] px-1.5 rounded-full bg-amber-700 text-white text-[10px] font-extrabold tabular-nums shrink-0">
                +{extraNotesCount}
        </span>
            )}
          </>
        ) : count > 0 ? (
          <span className="inline-flex items-center justify-center min-w-[22px] h-[18px] px-1.5 rounded-full bg-amber-700 text-white text-[10px] font-extrabold tabular-nums">
            +{count}
          </span>
        ) : (
          <span className="text-[10px] font-bold leading-none whitespace-nowrap">
            Add
          </span>
        )}
      </button>

      {typeof document !== "undefined" && popup && createPortal(popup, document.body)}
      {typeof document !== "undefined" && contextMenuPortal}
    </div>
  );
}
