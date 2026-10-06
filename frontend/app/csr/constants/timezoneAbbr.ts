export const STATE_TIMEZONES: Record<string, { label: string; abbreviation: string }> = {
  "washington d c":       { label: "Eastern Time",           abbreviation: "ET"  },
  "washington dc":        { label: "Eastern Time",           abbreviation: "ET"  },
  "district of columbia": { label: "Eastern Time",           abbreviation: "ET"  },
  "north carolina":       { label: "Eastern Time",           abbreviation: "ET"  },
  "south carolina":       { label: "Eastern Time",           abbreviation: "ET"  },
  "new hampshire":        { label: "Eastern Time",           abbreviation: "ET"  },
  "rhode island":         { label: "Eastern Time",           abbreviation: "ET"  },
  "west virginia":        { label: "Eastern Time",           abbreviation: "ET"  },
  "north dakota":         { label: "Central Time",           abbreviation: "CT"  },
  "south dakota":         { label: "Central Time",           abbreviation: "CT"  },
  "new jersey":           { label: "Eastern Time",           abbreviation: "ET"  },
  "new mexico":           { label: "Mountain Time",          abbreviation: "MT"  },
  "new york":             { label: "Eastern Time",           abbreviation: "ET"  },
  alabama:                { label: "Central Time",           abbreviation: "CT"  },
  alaska:                 { label: "Alaska Time",            abbreviation: "AKT" },
  arizona:                { label: "Mountain Time (no DST)", abbreviation: "MST" },
  arkansas:               { label: "Central Time",           abbreviation: "CT"  },
  california:             { label: "Pacific Time",           abbreviation: "PT"  },
  colorado:               { label: "Mountain Time",          abbreviation: "MT"  },
  connecticut:            { label: "Eastern Time",           abbreviation: "ET"  },
  delaware:               { label: "Eastern Time",           abbreviation: "ET"  },
  florida:                { label: "Eastern Time",           abbreviation: "ET"  },
  georgia:                { label: "Eastern Time",           abbreviation: "ET"  },
  hawaii:                 { label: "Hawaii Time",            abbreviation: "HST" },
  idaho:                  { label: "Mountain Time",          abbreviation: "MT"  },
  illinois:               { label: "Central Time",           abbreviation: "CT"  },
  indiana:                { label: "Eastern Time",           abbreviation: "ET"  },
  iowa:                   { label: "Central Time",           abbreviation: "CT"  },
  kansas:                 { label: "Central Time",           abbreviation: "CT"  },
  kentucky:               { label: "Eastern Time",           abbreviation: "ET"  },
  louisiana:              { label: "Central Time",           abbreviation: "CT"  },
  maine:                  { label: "Eastern Time",           abbreviation: "ET"  },
  maryland:               { label: "Eastern Time",           abbreviation: "ET"  },
  massachusetts:          { label: "Eastern Time",           abbreviation: "ET"  },
  michigan:               { label: "Eastern Time",           abbreviation: "ET"  },
  minnesota:              { label: "Central Time",           abbreviation: "CT"  },
  mississippi:            { label: "Central Time",           abbreviation: "CT"  },
  missouri:               { label: "Central Time",           abbreviation: "CT"  },
  montana:                { label: "Mountain Time",          abbreviation: "MT"  },
  nebraska:               { label: "Central Time",           abbreviation: "CT"  },
  nevada:                 { label: "Pacific Time",           abbreviation: "PT"  },
  ohio:                   { label: "Eastern Time",           abbreviation: "ET"  },
  oklahoma:               { label: "Central Time",           abbreviation: "CT"  },
  oregon:                 { label: "Pacific Time",           abbreviation: "PT"  },
  pennsylvania:           { label: "Eastern Time",           abbreviation: "ET"  },
  tennessee:              { label: "Central Time",           abbreviation: "CT"  },
  texas:                  { label: "Central Time",           abbreviation: "CT"  },
  utah:                   { label: "Mountain Time",          abbreviation: "MT"  },
  vermont:                { label: "Eastern Time",           abbreviation: "ET"  },
  virginia:               { label: "Eastern Time",           abbreviation: "ET"  },
  washington:             { label: "Pacific Time",           abbreviation: "PT"  },
  wisconsin:              { label: "Central Time",           abbreviation: "CT"  },
  wyoming:                { label: "Mountain Time",          abbreviation: "MT"  },
};

const STATE_ABBREVIATIONS: Record<string, string> = {
  al:"alabama", ak:"alaska", az:"arizona", ar:"arkansas", ca:"california",
  co:"colorado", ct:"connecticut", de:"delaware", fl:"florida", ga:"georgia",
  hi:"hawaii", id:"idaho", il:"illinois", in:"indiana", ia:"iowa",
  ks:"kansas", ky:"kentucky", la:"louisiana", me:"maine", md:"maryland",
  ma:"massachusetts", mi:"michigan", mn:"minnesota", ms:"mississippi", mo:"missouri",
  mt:"montana", ne:"nebraska", nv:"nevada", nh:"new hampshire", nj:"new jersey",
  nm:"new mexico", ny:"new york", nc:"north carolina", nd:"north dakota", oh:"ohio",
  ok:"oklahoma", or:"oregon", pa:"pennsylvania", ri:"rhode island", sc:"south carolina",
  sd:"south dakota", tn:"tennessee", tx:"texas", ut:"utah", vt:"vermont",
  va:"virginia", wa:"washington", wv:"west virginia", wi:"wisconsin", wy:"wyoming",
  dc:"district of columbia",
};

const SORTED_STATE_NAMES = Object.keys(STATE_TIMEZONES).sort((a, b) => b.length - a.length);

export function getTimezoneAbbr(state?: string | null): string | null {
  if (!state) return null;
  const normalized = state.toLowerCase().replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  for (const name of SORTED_STATE_NAMES) {
    if (normalized.includes(name)) return STATE_TIMEZONES[name].abbreviation;
  }
  for (const token of normalized.split(" ")) {
    const fullName = STATE_ABBREVIATIONS[token];
    if (fullName && STATE_TIMEZONES[fullName]) return STATE_TIMEZONES[fullName].abbreviation;
  }
  return null;
}

export function tzBadgeClass(abbr: string): string {
  if (abbr === "ET")  return "bg-blue-50 text-blue-700 border-blue-200";
  if (abbr === "CT")  return "bg-green-50 text-green-700 border-green-200";
  if (abbr === "MT")  return "bg-orange-50 text-orange-700 border-orange-200";
  if (abbr === "PT")  return "bg-purple-50 text-purple-700 border-purple-200";
  if (abbr === "AKT") return "bg-teal-50 text-teal-700 border-teal-200";
  if (abbr === "MST") return "bg-amber-50 text-amber-700 border-amber-200";
  if (abbr === "HST") return "bg-pink-50 text-pink-700 border-pink-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

const AREA_CODE_TZ: Record<string, string> = {
  // Eastern Time
  "201":"ET","202":"ET","203":"ET","207":"ET","212":"ET","215":"ET","216":"ET",
  "220":"ET","223":"ET","229":"ET","231":"ET","234":"ET","239":"ET","240":"ET",
  "248":"ET","252":"ET","260":"ET","267":"ET","269":"ET","272":"ET","276":"ET",
  "278":"ET","301":"ET","302":"ET","304":"ET","305":"ET","313":"ET","315":"ET",
  "317":"ET","321":"ET","330":"ET","332":"ET","336":"ET","339":"ET","347":"ET",
  "351":"ET","352":"ET","380":"ET","386":"ET","401":"ET","404":"ET","407":"ET",
  "410":"ET","412":"ET","413":"ET","419":"ET","423":"ET","434":"ET","440":"ET",
  "443":"ET","445":"ET","463":"ET","470":"ET","475":"ET","478":"ET","484":"ET",
  "502":"ET","508":"ET","513":"ET","516":"ET","517":"ET","518":"ET","540":"ET",
  "551":"ET","561":"ET","567":"ET","570":"ET","571":"ET","574":"ET","585":"ET",
  "586":"ET","603":"ET","606":"ET","607":"ET","610":"ET","614":"ET","616":"ET",
  "617":"ET","631":"ET","646":"ET","667":"ET","678":"ET","680":"ET","681":"ET",
  "689":"ET","703":"ET","704":"ET","706":"ET","716":"ET","717":"ET","718":"ET",
  "724":"ET","727":"ET","734":"ET","740":"ET","743":"ET","754":"ET","757":"ET",
  "762":"ET","765":"ET","770":"ET","772":"ET","774":"ET","781":"ET","786":"ET",
  "802":"ET","803":"ET","804":"ET","810":"ET","812":"ET","813":"ET","814":"ET",
  "828":"ET","835":"ET","839":"ET","843":"ET","845":"ET","856":"ET","857":"ET",
  "859":"ET","860":"ET","862":"ET","863":"ET","864":"ET","865":"ET","878":"ET",
  "904":"ET","906":"ET","908":"ET","910":"ET","912":"ET","914":"ET","917":"ET",
  "919":"ET","929":"ET","934":"ET","937":"ET","941":"ET","947":"ET","954":"ET",
  "959":"ET","973":"ET","978":"ET","980":"ET","984":"ET","989":"ET",
  // Central Time
  "205":"CT","210":"CT","214":"CT","217":"CT","218":"CT","219":"CT","224":"CT",
  "225":"CT","228":"CT","251":"CT","254":"CT","256":"CT","262":"CT","270":"CT",
  "281":"CT","309":"CT","312":"CT","314":"CT","316":"CT","318":"CT","319":"CT",
  "320":"CT","325":"CT","331":"CT","334":"CT","337":"CT","346":"CT","361":"CT",
  "364":"CT","402":"CT","405":"CT","409":"CT","414":"CT","417":"CT","430":"CT",
  "447":"CT","464":"CT","469":"CT","479":"CT","501":"CT","504":"CT","507":"CT",
  "512":"CT","515":"CT","531":"CT","534":"CT","539":"CT","563":"CT","573":"CT",
  "580":"CT","601":"CT","605":"CT","608":"CT","612":"CT","615":"CT","618":"CT",
  "620":"CT","629":"CT","630":"CT","636":"CT","641":"CT","651":"CT","659":"CT",
  "660":"CT","662":"CT","682":"CT","701":"CT","708":"CT","712":"CT","713":"CT",
  "715":"CT","726":"CT","731":"CT","737":"CT","763":"CT","769":"CT","773":"CT",
  "779":"CT","785":"CT","806":"CT","815":"CT","816":"CT","817":"CT","830":"CT",
  "832":"CT","847":"CT","850":"CT","870":"CT","872":"CT","901":"CT","903":"CT",
  "913":"CT","918":"CT","920":"CT","931":"CT","936":"CT","938":"CT","940":"CT",
  "952":"CT","956":"CT","972":"CT","979":"CT","985":"CT",
  // Mountain Time
  "208":"MT","303":"MT","307":"MT","385":"MT","406":"MT","432":"MT","435":"MT",
  "480":"MT","505":"MT","520":"MT","575":"MT","602":"MT","623":"MT","719":"MT",
  "720":"MT","801":"MT","915":"MT","928":"MT","970":"MT","986":"MT",
  // Pacific Time
  "206":"PT","209":"PT","213":"PT","253":"PT","279":"PT","310":"PT","323":"PT",
  "360":"PT","408":"PT","415":"PT","424":"PT","425":"PT","442":"PT","458":"PT",
  "503":"PT","509":"PT","510":"PT","530":"PT","541":"PT","559":"PT","562":"PT",
  "564":"PT","619":"PT","626":"PT","628":"PT","650":"PT","657":"PT","661":"PT",
  "669":"PT","702":"PT","707":"PT","714":"PT","725":"PT","747":"PT","760":"PT",
  "775":"PT","805":"PT","818":"PT","820":"PT","831":"PT","858":"PT","909":"PT",
  "916":"PT","925":"PT","949":"PT","951":"PT","971":"PT",
  // Alaska & Hawaii
  "907":"AKT","808":"HST",
};

export function getTimezoneAbbrFromPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const areaCode = digits.length === 11 && digits[0] === "1"
    ? digits.substring(1, 4)
    : digits.length >= 10
    ? digits.substring(0, 3)
    : null;
  if (!areaCode) return null;
  return AREA_CODE_TZ[areaCode] ?? null;
}

/** Company / client location timezone — from state (or stored IANA timezone), not phone */
export function getCompanyTimezoneAbbr(lead: {
  state?: string | null;
  timezone?: string | null;
}): string | null {
  const fromState = getTimezoneAbbr(lead.state);
  if (fromState) return fromState;
  if (!lead.timezone) return null;
  const tz = lead.timezone.toLowerCase();
  if (tz.includes("new_york") || tz.includes("detroit") || tz.includes("indiana") || tz.includes("kentucky")) return "ET";
  if (tz.includes("chicago") || tz.includes("menominee")) return "CT";
  if (tz.includes("denver") || tz.includes("boise") || tz.includes("phoenix")) return tz.includes("phoenix") ? "MST" : "MT";
  if (tz.includes("los_angeles") || tz.includes("anchorage")) return tz.includes("anchorage") ? "AKT" : "PT";
  if (tz.includes("honolulu")) return "HST";
  return null;
}

/** @deprecated use getCompanyTimezoneAbbr — kept for existing imports */
export function getLeadTimezoneAbbr(lead: {
  state?: string | null;
  timezone?: string | null;
  phone?: string;
}): string | null {
  return getCompanyTimezoneAbbr(lead);
}

/** Map lead timezone to one of the 4 standard US zones (ET, CT, MT, PT) */
export function normalizeStandardTimezone(abbr: string | null): string | null {
  if (!abbr) return null;
  if (abbr === "MST") return "MT"; /* Arizona → Mountain */
  if (abbr === "ET" || abbr === "CT" || abbr === "MT" || abbr === "PT") return abbr;
  return null; /* AK, HI, etc. — not in standard 4 */
}

/** Map lead timezone to one of the 4 standard US zones (ET, CT, MT, PT) — phone area code only */
export function getLeadStandardTimezone(lead: { state?: string | null; phone?: string }): string | null {
  if (!lead.phone) return null;
  return normalizeStandardTimezone(getTimezoneAbbrFromPhone(lead.phone));
}

export function leadMatchesTimezoneFilter(
  lead: { state?: string | null; phone?: string },
  filterAbbr: string
): boolean {
  if (!filterAbbr) return true;
  return getLeadStandardTimezone(lead) === filterAbbr;
}

export const TIMEZONE_FILTER_OPTIONS = [
  { abbr: "ET", label: "Eastern Time",  sub: "NY, FL, GA, OH, PA…" },
  { abbr: "CT", label: "Central Time",  sub: "TX, IL, MO, MN, LA…" },
  { abbr: "MT", label: "Mountain Time", sub: "CO, UT, AZ, NM, WY…" },
  { abbr: "PT", label: "Pacific Time",  sub: "CA, WA, OR, NV…" },
] as const;
