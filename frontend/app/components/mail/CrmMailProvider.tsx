"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Plus, Sparkles, Wand2, X } from "lucide-react";
import toast from "react-hot-toast";
import API, { apiErrorMessage } from "@/lib/api";

export type CrmMailTarget = {
  to: string;
  toOptions?: string[];
  clientName?: string;
  company?: string;
  intent?: string;
  subject?: string;
  body?: string;
  notes?: string;
};

type MailSender = {
  id: string;
  email: string;
  name: string;
  signatureBrand?: "bds" | "ps" | "devcon" | null;
  signatureLabel?: string | null;
};

type CrmMailContextValue = {
  openCompose: (target: CrmMailTarget) => void;
};

const CrmMailContext = createContext<CrmMailContextValue | null>(null);

export function useCrmMail(): CrmMailContextValue | null {
  return useContext(CrmMailContext);
}

export function useOpenCrmMail() {
  const ctx = useContext(CrmMailContext);
  return ctx?.openCompose ?? null;
}

function withSenderSignOff(body: string, sender: MailSender | null) {
  const stripped = body.replace(/\n*(Thanks|Thank you|Best regards|Kind regards|Warm regards|Regards),?\s*\n[\s\S]*$/i, "").trimEnd();
  if (sender?.signatureBrand) return stripped;
  if (!sender) return `${stripped}\n\nThanks,`;
  return `${stripped}\n\nThanks,\n${sender.name}\n${sender.email}`;
}

export default function CrmMailProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<CrmMailTarget | null>(null);
  const [senders, setSenders] = useState<MailSender[]>([]);
  const [fromId, setFromId] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState<"enhance" | "add" | "write" | "paraphrase" | "rephrase" | "edit" | null>(null);
  const [aiHint, setAiHint] = useState("");

  const loadSenders = useCallback(() => {
    API.get("/mail/from-accounts")
      .then(res => {
        setSenders(Array.isArray(res.data.senders) ? res.data.senders : []);
      })
      .catch(() => setSenders([]));
  }, []);

  useEffect(() => {
    loadSenders();
  }, [loadSenders]);

  const openCompose = useCallback((next: CrmMailTarget) => {
    const options = (next.toOptions ?? [next.to]).map(e => e.trim()).filter(Boolean);
    const first = next.to.trim() || options[0] || "";
    setTarget({ ...next, toOptions: options.length ? options : first ? [first] : [] });
    setTo(first);
    setFromId("");
    setSubject(next.subject ?? "");
    setBody(withSenderSignOff(next.body ?? "", null));
    setConfirming(false);
    setAiHint("");
    setAiBusy(null);
    loadSenders();
  }, [loadSenders]);

  const close = () => {
    if (sending) return;
    setTarget(null);
    setConfirming(false);
  };

  const selectedFrom = senders.find(s => s.id === fromId) ?? null;

  const pickFrom = (id: string) => {
    const sender = senders.find(s => s.id === id) ?? null;
    setFromId(id);
    setConfirming(false);
    setBody(prev => withSenderSignOff(prev, sender));
  };

  const requestSend = () => {
    if (!selectedFrom) {
      toast.error("Select which email to send through.");
      return;
    }
    if (!to) {
      toast.error("Client email is missing.");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.error("Write a subject and message first.");
      return;
    }
    setConfirming(true);
  };

  const rewrite = async (mode: "enhance" | "add" | "write" | "paraphrase" | "rephrase" | "edit") => {
    const instruction = aiHint.trim();
    if ((mode === "write" || mode === "edit") && !instruction) {
      toast.error("Type what Nexa should do, then press Apply.");
      return;
    }
    if (mode !== "write" && !subject.trim() && !body.trim() && !instruction) {
      toast.error("Write something first, or tell Nexa what to change.");
      return;
    }
    setAiBusy(mode);
    try {
      const res = await API.post(
        "/mail/rewrite",
        {
          mode,
          subject,
          body,
          instruction,
          clientName: target?.clientName,
          company: target?.company,
        },
        { timeout: 25_000 },
      );
      const nextSubject = String(res.data.subject ?? "").trim() || subject;
      const nextBody = String(res.data.body ?? "").trim() || body;
      const used = String(res.data.mode ?? mode);
      setSubject(nextSubject);
      setBody(withSenderSignOff(nextBody, selectedFrom));
      setAiHint("");
      setConfirming(false);
      toast.success(
        used === "add" ? "Nexa added more to this draft."
        : used === "write" ? "Nexa wrote a new email from your note."
        : used === "paraphrase" ? "Nexa paraphrased this draft."
        : used === "rephrase" ? "Nexa rephrased this draft."
        : used === "edit" ? "Nexa applied your change."
        : "Nexa polished this draft.",
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Nexa could not rewrite that."));
    } finally {
      setAiBusy(null);
    }
  };

  const send = async () => {
    if (!selectedFrom) return;
    setSending(true);
    try {
      await API.post("/mail/send", {
        fromId: selectedFrom.id,
        to,
        subject: subject.trim(),
        body: body.trim(),
        clientName: target?.clientName,
      });
      toast.success(`Sent from ${selectedFrom.email}`);
      setTarget(null);
      setConfirming(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Send failed."));
    } finally {
      setSending(false);
    }
  };

  const value = useMemo(() => ({ openCompose }), [openCompose]);
  const toOptions = target?.toOptions ?? [];

  return (
    <CrmMailContext.Provider value={value}>
      {children}
      {target && (
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-[min(100%,28rem)] sm:max-w-lg lg:max-w-xl max-h-[min(92dvh,52rem)] flex flex-col bg-white dark:bg-crm-surface rounded-2xl shadow-2xl overflow-hidden min-w-0">
            <div className="shrink-0 flex items-start justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100 dark:border-crm-border">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1B6FE8]">Send as you</p>
                <h2 className="text-base font-extrabold text-[#0F172A] dark:text-gray-100 truncate">
                  {target.clientName || to || "Client"}
                </h2>
                {target.company ? (
                  <p className="text-xs text-gray-500 truncate">{target.company}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={close}
                className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 inline-flex items-center justify-center shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {confirming ? (
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-3">
                <p className="text-sm font-bold text-[#0F172A] dark:text-gray-100">Confirm send</p>
                <div className="rounded-xl bg-[#EAF2FE] border border-[#f5c5ce] px-3 py-3 text-xs text-[#7f1d1d] space-y-1.5 break-words">
                  <p>
                    <span className="font-semibold">From:</span> {selectedFrom?.email}
                  </p>
                  <p>
                    <span className="font-semibold">To:</span> {to}
                  </p>
                  <p>
                    <span className="font-semibold">Subject:</span> {subject}
                  </p>
                  {selectedFrom?.signatureLabel ? (
                    <p>
                      Footer: <span className="font-semibold">{selectedFrom.signatureLabel}</span>
                    </p>
                  ) : null}
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  This sends from the mailbox you picked. The company signature is added automatically.
                </p>
              </div>
            ) : (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-3 sm:space-y-4">
              {toOptions.length > 1 ? (
                <label className="block text-xs font-semibold text-gray-600 min-w-0">
                  Client email (To)
                  <select
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    className="mt-1 h-10 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#0F172A]"
                  >
                    {toOptions.map(em => (
                      <option key={em} value={em}>{em}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-xs text-gray-500 break-words">
                  To: <span className="font-semibold text-[#0F172A]">{to || "—"}</span>
                </p>
              )}

              <label className="block text-xs font-semibold text-gray-600 min-w-0">
                Subject
                <input
                  value={subject}
                  onChange={e => { setSubject(e.target.value); setConfirming(false); }}
                  className="mt-1 h-10 w-full min-w-0 rounded-xl border border-gray-200 px-3 text-sm text-[#0F172A]"
                  placeholder="Subject"
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600 min-w-0">
                Message
                <textarea
                  value={body}
                  onChange={e => { setBody(e.target.value); setConfirming(false); }}
                  rows={5}
                  className="mt-1 w-full min-w-0 rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#0F172A] leading-relaxed"
                  placeholder="Your email..."
                />
              </label>

              <div className="rounded-xl border border-[#f5c5ce] bg-[#FFF8F9] px-3 py-2.5 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#1B6FE8]">Nexa</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={!!aiBusy}
                    onClick={() => void rewrite("enhance")}
                    className="h-8 px-2.5 rounded-lg bg-white border border-[#f5c5ce] text-[#1B6FE8] text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {aiBusy === "enhance" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Enhance
                  </button>
                  <button
                    type="button"
                    disabled={!!aiBusy}
                    onClick={() => void rewrite("paraphrase")}
                    className="h-8 px-2.5 rounded-lg bg-white border border-[#f5c5ce] text-[#1B6FE8] text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {aiBusy === "paraphrase" ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                    Paraphrase
                  </button>
                  <button
                    type="button"
                    disabled={!!aiBusy}
                    onClick={() => void rewrite("rephrase")}
                    className="h-8 px-2.5 rounded-lg bg-white border border-[#f5c5ce] text-[#1B6FE8] text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {aiBusy === "rephrase" ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                    Rephrase
                  </button>
                  <button
                    type="button"
                    disabled={!!aiBusy}
                    onClick={() => void rewrite("add")}
                    className="h-8 px-2.5 rounded-lg bg-white border border-[#f5c5ce] text-[#1B6FE8] text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {aiBusy === "add" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Add more
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    value={aiHint}
                    onChange={e => setAiHint(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void rewrite(body.trim() ? "edit" : "write");
                      }
                    }}
                    placeholder="shorter, more formal…"
                    className="flex-1 h-8 min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] text-[#0F172A] outline-none"
                  />
                  <button
                    type="button"
                    disabled={!!aiBusy}
                    onClick={() => void rewrite(body.trim() ? "edit" : "write")}
                    className="h-8 px-3 rounded-lg bg-[#1B6FE8] text-white text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50 shrink-0"
                  >
                    {aiBusy === "edit" || aiBusy === "write" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Apply
                  </button>
                </div>
              </div>

              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#1B6FE8] mb-2">
                  Send through
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  Pick the mailbox. Its company signature is added to the footer automatically.
                </p>
                {senders.length === 0 ? (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    Your 3 From emails are not loaded. Refresh, then try again.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5">
                    {senders.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickFrom(s.id)}
                        className={`text-left rounded-xl border px-3 py-2.5 transition-colors min-w-0 ${
                          fromId === s.id
                            ? "border-[#1B6FE8] bg-[#EAF2FE] shadow-sm"
                            : "border-gray-200 hover:border-[#1B6FE8]/40"
                        }`}
                      >
                        <p className="text-sm font-semibold text-[#0F172A] truncate">{s.name}</p>
                        <p className="text-[11px] text-gray-500 truncate">{s.email}</p>
                        {s.signatureLabel ? (
                          <p className="text-[10px] font-semibold text-[#0878e8] mt-0.5 truncate">
                            Footer: {s.signatureLabel}
                          </p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            )}

            <div className="shrink-0 px-4 sm:px-5 py-3 sm:py-4 border-t border-gray-100 dark:border-crm-border bg-white dark:bg-crm-surface">
              {!confirming && selectedFrom?.signatureLabel ? (
                <p className="text-[11px] text-gray-500 mb-2 truncate">
                  Footer added on send: {selectedFrom.signatureLabel}
                </p>
              ) : null}
              <div className={`grid gap-2 ${confirming ? "grid-cols-2" : "grid-cols-1"}`}>
                {confirming ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={sending}
                      className="h-11 w-full rounded-xl text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void send()}
                      disabled={sending}
                      className="h-11 w-full rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                      Confirm send
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={requestSend}
                    className="h-11 w-full sm:w-auto sm:ml-auto sm:px-5 rounded-xl bg-[#1B6FE8] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <Mail size={14} />
                    Send
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </CrmMailContext.Provider>
  );
}
