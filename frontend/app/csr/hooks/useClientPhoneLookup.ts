import { useCallback, useRef, useState } from "react";
import API from "@/lib/api";
import toast from "react-hot-toast";

export type ClientLookupData = {
  name: string;
  company: string;
  email: string;
  ownerName: string;
  state: string;
  interestedService: string;
};

function extractPhoneForLookup(raw: string): string {
  const slashParts = raw.split(/\s*\/\s*/).map(p => p.trim()).filter(p => p.replace(/\D/g, "").length >= 7);
  if (slashParts.length > 0) return slashParts[0];
  const matches = raw.match(/[\+\d][\d\s.()\-]{5,}/g);
  if (matches?.length) {
    const first = matches.map(p => p.trim()).find(p => p.replace(/\D/g, "").length >= 7);
    if (first) return first;
  }
  return raw.trim();
}

function phoneDigits(phone: string): string {
  return extractPhoneForLookup(phone).replace(/\D/g, "");
}

export function useClientPhoneLookup(
  onApply: (client: ClientLookupData) => void,
  lookupPath = "/csr/lookup-by-phone",
) {
  const [phoneLookupLoading, setPhoneLookupLoading] = useState(false);
  const [returningClient, setReturningClient] = useState(false);
  const lastLookedUpDigits = useRef("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetLookup = useCallback(() => {
    lastLookedUpDigits.current = "";
    setReturningClient(false);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  const lookupClientByPhone = useCallback(async (phone: string) => {
    const trimmed = extractPhoneForLookup(phone);
    const digits = phoneDigits(trimmed);
    if (digits.length < 7 || digits === lastLookedUpDigits.current) return;

    setPhoneLookupLoading(true);
    try {
      const res = await API.get(lookupPath, { params: { phone: trimmed } });
      lastLookedUpDigits.current = digits;

      if (res.data?.found && res.data?.client) {
        onApply(res.data.client);
        setReturningClient(true);
        const count = res.data.projectCount ?? 1;
        toast.success(
          count > 1
            ? `Returning client found (${count} previous projects) — details auto-filled`
            : "Existing client found — details auto-filled",
          { duration: 3500 },
        );
      } else {
        setReturningClient(false);
      }
    } catch {
      /* silent — user can still fill manually */
    }
    setPhoneLookupLoading(false);
  }, [onApply, lookupPath]);

  const scheduleLookup = useCallback((phone: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => void lookupClientByPhone(phone), 500);
  }, [lookupClientByPhone]);

  const onPhoneValueChange = useCallback((value: string) => {
    const digits = phoneDigits(value);
    if (lastLookedUpDigits.current && digits !== lastLookedUpDigits.current) {
      lastLookedUpDigits.current = "";
      setReturningClient(false);
    }
    if (digits.length >= 7) scheduleLookup(value);
  }, [scheduleLookup]);

  const onPhoneBlur = useCallback((phone: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    void lookupClientByPhone(phone);
  }, [lookupClientByPhone]);

  const onPhonePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const pasted = e.clipboardData.getData("text");
    if (!pasted?.trim()) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const input = e.currentTarget;
    setTimeout(() => {
      void lookupClientByPhone(pasted.trim() || input.value);
    }, 50);
  }, [lookupClientByPhone]);

  return {
    phoneLookupLoading,
    returningClient,
    resetLookup,
    onPhoneValueChange,
    onPhoneBlur,
    onPhonePaste,
  };
}
