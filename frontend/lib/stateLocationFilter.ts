import { US_STATES, CA_PROVINCES, STATE_AREA_CODES, stateMatches } from "@/app/csr/constants/locations";

const ALL_LOCATIONS = [...US_STATES, ...CA_PROVINCES];

function isPlaceholderState(state: string): boolean {
  const s = state.trim().toLowerCase();
  return !s || s === "n/a" || s === "na" || s === "unknown" || s === "-";
}

/** Normalize phone to 10-digit NANP national number (US/Canada). */
export function phoneNationalDigits(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 11 && digits.startsWith("1")) {
    return digits.slice(1, 11);
  }
  if (digits.length >= 10) {
    return digits.slice(0, 10);
  }
  return digits;
}

/** First 3 digits of a valid 10-digit NANP number, else null. */
export function phoneAreaCode(phone: string | null | undefined): string | null {
  const national = phoneNationalDigits(phone);
  if (national.length < 10) return null;
  return national.slice(0, 3);
}

/** If state field clearly belongs to a known US state / CA province, return its name. */
function resolveKnownState(state: string): string | null {
  if (isPlaceholderState(state)) return null;
  for (const loc of ALL_LOCATIONS) {
    if (stateMatches(state, loc.name)) return loc.name;
  }
  return null;
}

/**
 * Match lead/client by state field and/or phone area code.
 * Area code is used only when state is empty/unknown, or doesn't map to another region.
 */
export function matchesStateLocationFilter(
  state: string | null | undefined,
  phone: string | null | undefined,
  filterName: string,
): boolean {
  if (!filterName.trim()) return true;

  const stateVal = (state ?? "").trim();

  if (!isPlaceholderState(stateVal) && stateMatches(stateVal, filterName)) {
    return true;
  }

  const knownState = resolveKnownState(stateVal);
  if (knownState && knownState !== filterName) {
    return false;
  }

  const areaCode = phoneAreaCode(phone);
  if (!areaCode) return false;
  return (STATE_AREA_CODES[filterName] ?? []).includes(areaCode);
}

/** Match phone by typed area code or prefix (e.g. 214, 416, 214555). */
export function matchesPhoneAreaCodeFilter(
  phone: string | null | undefined,
  query: string,
): boolean {
  const typed = query.replace(/\D/g, "");
  if (!typed) return true;
  const national = phoneNationalDigits(phone);
  if (!national) return false;
  return national.startsWith(typed);
}
