"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Phone, X } from "lucide-react";
import API, { apiErrorMessage } from "@/lib/api";
import { markLeadDialed } from "./dialUnlock";

export type DialTarget = {
  destination: string;
  leadId?: string;
  clientName?: string;
};

type DialerAccount = {
  id: string;
  label: string;
  numbers: string[];
};

type DialerPreference = {
  accountId: string;
  accountLabel: string;
  callerNumber: string;
};

type ZoomDialerApi = {
  open: (target: DialTarget) => void;
  changeDefault: () => void;
  clearDefault: () => Promise<void>;
  preference: DialerPreference | null;
  preferenceLoading: boolean;
};

const ZoomDialerContext = createContext<ZoomDialerApi | null>(null);

export function useZoomDialer() {
  return useContext(ZoomDialerContext);
}

/** Sits beside a client number. Opens the picker that saves the outgoing number. */
export function ChangeDialerNumber({ className = "" }: { className?: string }) {
  const dialer = useZoomDialer();
  if (!dialer) return null;
  const from = dialer.preference?.callerNumber;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        dialer.changeDefault();
      }}
      className={`text-[10px] font-semibold text-[#1B6FE8] shrink-0 hover:underline ${className}`}
      title={from ? `Calls go from ${from}. Change it.` : "Choose the number calls go from"}
    >
      Change number
    </button>
  );
}

function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

function launchZoomCall(destination: string, callerId: string) {
  const link = document.createElement("a");
  // setAttribute keeps the + signs. Assigning .href encodes them, and Zoom then ignores the caller ID.
  link.setAttribute("href", `zoomphonecall://${destination}?callerid=${callerId}`);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function sameNumber(a: string, b: string) {
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  if (!da || !db) return false;
  if (da === db) return true;
  return da.length >= 10 && db.length >= 10 && da.slice(-10) === db.slice(-10);
}

function dialWithPreference(target: DialTarget, preference: DialerPreference) {
  const destination = toE164(target.destination);
  const callerId = toE164(preference.callerNumber);
  if (!destination || !callerId) {
    toast.error("That phone number cannot be dialed.");
    return;
  }
  launchZoomCall(destination, callerId);
  markLeadDialed(target.leadId);
  toast.success(`Calling ${target.destination} from ${preference.callerNumber}`);
}

export function ZoomDialerProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<DialTarget | null>(null);
  const [pickingDefault, setPickingDefault] = useState(false);
  const [preference, setPreference] = useState<DialerPreference | null>(null);
  const [preferenceLoading, setPreferenceLoading] = useState(true);
  const pendingTarget = useRef<DialTarget | null>(null);

  const refreshPreference = useCallback(async () => {
    try {
      const res = await API.get("/dialer/preference");
      setPreference(res.data.preference ?? null);
    } catch {
      setPreference(null);
    } finally {
      setPreferenceLoading(false);
    }
  }, []);

  useEffect(() => { void refreshPreference(); }, [refreshPreference]);

  const open = useCallback((next: DialTarget) => {
    if (preferenceLoading) {
      pendingTarget.current = next;
      return;
    }
    pendingTarget.current = null;
    if (preference) {
      dialWithPreference(next, preference);
      return;
    }
    setPickingDefault(false);
    setTarget(next);
  }, [preference, preferenceLoading]);

  useEffect(() => {
    if (preferenceLoading || !pendingTarget.current) return;
    const next = pendingTarget.current;
    pendingTarget.current = null;
    if (preference) {
      dialWithPreference(next, preference);
      return;
    }
    setPickingDefault(false);
    setTarget(next);
  }, [preference, preferenceLoading]);

  const changeDefault = useCallback(() => {
    setTarget(null);
    setPickingDefault(true);
  }, []);

  const clearDefault = useCallback(async () => {
    await API.delete("/dialer/preference");
    setPreference(null);
  }, []);

  const api = useMemo(
    () => ({ open, changeDefault, clearDefault, preference, preferenceLoading }),
    [open, changeDefault, clearDefault, preference, preferenceLoading],
  );

  return (
    <ZoomDialerContext.Provider value={api}>
      {children}
      {(target || pickingDefault) && (
        <ZoomDialerModal
          target={target}
          pickingDefault={pickingDefault}
          preference={preference}
          onPreference={setPreference}
          onClose={() => { setTarget(null); setPickingDefault(false); }}
        />
      )}
    </ZoomDialerContext.Provider>
  );
}

function ZoomDialerModal({
  target,
  pickingDefault,
  preference,
  onPreference,
  onClose,
}: {
  target: DialTarget | null;
  pickingDefault: boolean;
  preference: DialerPreference | null;
  onPreference: (next: DialerPreference | null) => void;
  onClose: () => void;
}) {
  const [accounts, setAccounts] = useState<DialerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountId, setAccountId] = useState("");
  const [step, setStep] = useState<"account" | "number">("account");
  const [saveDefault, setSaveDefault] = useState(pickingDefault);
  const preferenceRef = useRef(preference);
  preferenceRef.current = preference;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    API.get("/dialer/accounts").then((accountsRes) => {
      if (cancelled) return;
      const list: DialerAccount[] = accountsRes.data.accounts ?? [];
      setAccounts(list);
      setAccountId("");
      setSaveDefault(pickingDefault || !preferenceRef.current);
      setStep("account");
    }).catch((err) => {
      if (!cancelled) toast.error(apiErrorMessage(err, "Could not load Zoom accounts."));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [target?.destination, pickingDefault]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const account = accounts.find((a) => a.id === accountId) ?? null;

  const chooseAccount = (id: string) => {
    setAccountId(id);
    setStep("number");
  };

  const dialFrom = (number: string) => {
    if (!account) return;
    const callerId = toE164(number);
    if (!callerId) {
      toast.error("That phone number cannot be dialed.");
      return;
    }
    const shouldSave = saveDefault || pickingDefault;
    const accountIdForSave = account.id;
    const accountLabel = account.label;
    if (target) {
      const destination = toE164(target.destination);
      if (!destination) {
        toast.error("That phone number cannot be dialed.");
        return;
      }
      launchZoomCall(destination, callerId);
      markLeadDialed(target.leadId);
      toast.success(`Calling ${target.destination} from ${number}`);
    }
    onClose();
    if (!shouldSave) return;
    void API.put("/dialer/preference", {
      accountId: accountIdForSave,
      callerNumber: number,
    }).then((res) => {
      onPreference(res.data.preference ?? { accountId: accountIdForSave, accountLabel, callerNumber: number });
      toast.success(target ? "Saved as your default. Next numbers call from it." : "Default number saved.");
    }).catch((err) => {
      toast.error(apiErrorMessage(err, "Could not save the default number."));
    });
  };

  const clearDefault = async () => {
    try {
      await API.delete("/dialer/preference");
      onPreference(null);
      setSaveDefault(false);
      toast.success("Default number cleared.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not clear the default."));
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-3 sm:p-6">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1B6FE8]">Zoom dialer</p>
            <h2 className="text-lg font-bold text-[#0F172A] truncate">
              {target ? `Call ${target.destination}` : "Choose a default number"}
            </h2>
            {target?.clientName && (
              <p className="text-xs text-gray-400 truncate">{target.clientName}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-50 text-gray-500 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {loading ? (
            <div className="h-28 rounded-2xl bg-gray-50 animate-pulse" />
          ) : accounts.length === 0 ? (
            <p className="text-sm text-gray-500 bg-[#F8F9FC] rounded-2xl p-4">
              No Zoom accounts yet. An admin needs to add the accounts and their numbers.
            </p>
          ) : step === "account" ? (
            <div>
              <p className="text-sm font-semibold text-[#0F172A] mb-2">Which account?</p>
              <div className="space-y-2">
                {accounts.map((item) => {
                  const isDefault = preference?.accountId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => chooseAccount(item.id)}
                      className="w-full text-left rounded-2xl border border-gray-100 bg-white hover:bg-[#F4F8FF] hover:border-[#1B6FE8] px-3.5 py-3 transition-colors"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-[#0F172A]">{item.label}</span>
                        {isDefault && (
                          <span className="text-[10px] font-bold uppercase text-[#027A48] bg-[#ECFDF3] px-1.5 py-0.5 rounded-md">Default</span>
                        )}
                      </span>
                      <span className="block text-xs text-gray-400 mt-0.5">
                        {item.numbers[0] ? `Main ${item.numbers[0]}` : "No numbers"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#0F172A]">
                  {pickingDefault ? "Which number should be the default?" : "Call from which number?"}
                </p>
                <button
                  type="button"
                  onClick={() => setStep("account")}
                  className="text-xs font-semibold text-[#1B6FE8]"
                >
                  Change account
                </button>
              </div>
              <div className="space-y-2">
                {(account?.numbers ?? []).map((number, index) => {
                  const isDefault = Boolean(preference && preference.accountId === account?.id && sameNumber(preference.callerNumber, number));
                  return (
                    <button
                      key={number}
                      type="button"
                      onClick={() => dialFrom(number)}
                      className="w-full text-left rounded-2xl border border-gray-100 hover:bg-[#F4F8FF] hover:border-[#1B6FE8] px-3.5 py-3 transition-colors"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-[#0F172A]">{number}</span>
                        <Phone size={14} className="text-[#1B6FE8] shrink-0" />
                      </span>
                      {(index === 0 || isDefault) && (
                        <span className="block text-[11px] text-[#027A48] mt-0.5">
                          {index === 0 ? "Main number" : ""}{index === 0 && isDefault ? " · " : ""}{isDefault ? "Saved default" : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-gray-400 leading-relaxed">
                Zoom dials with this caller ID. After you save a default, clicking a client number calls from it immediately.
              </p>

              {!pickingDefault && (
              <label className="flex items-start gap-2.5 text-sm text-[#0F172A] cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-[#1B6FE8]"
                  checked={saveDefault}
                  onChange={(e) => setSaveDefault(e.target.checked)}
                />
                <span>
                  Save the number I click as my default
                  <span className="block text-xs text-gray-400 font-normal">
                    Stays until you clear it or save a different number.
                  </span>
                </span>
              </label>
              )}

              {pickingDefault && (
                <p className="text-xs text-gray-500">Click a number to save it. It will not place a call.</p>
              )}

              {preference && (
                <button type="button" onClick={clearDefault} className="text-xs font-semibold text-gray-400 hover:text-[#1B6FE8]">
                  Clear saved default
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

export function ZoomDialerDefaultCard() {
  const dialer = useZoomDialer();
  const preference = dialer?.preference ?? null;
  const loading = dialer?.preferenceLoading ?? true;

  const clearDefault = async () => {
    try {
      await dialer?.clearDefault();
      toast.success("Default number removed.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not remove the default."));
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] flex items-center justify-center">
          <Phone size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-gray-800">Zoom dialer default</h2>
          {loading ? (
            <p className="text-xs text-gray-400 mt-1">Loading…</p>
          ) : preference ? (
            <p className="text-xs text-gray-500 mt-1">
              Calls go from {preference.accountLabel} · {preference.callerNumber}
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-1">
              No default yet. Set one, then a client number click calls from it.
            </p>
          )}
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={() => dialer?.changeDefault()} className="text-xs font-semibold text-[#1B6FE8]">
              {preference ? "Change number" : "Set default"}
            </button>
            {preference && (
              <button type="button" onClick={() => void clearDefault()} className="text-xs font-semibold text-gray-400">
                Remove default
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
