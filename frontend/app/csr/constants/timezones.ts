export const usTimezones = [
  { value: "America/Adak",                  label: "Hawaii-Aleutian (UTC-10:00)", abbreviation: "HAST" },
  { value: "America/Anchorage",             label: "Alaska (UTC-09:00)",          abbreviation: "AKST" },
  { value: "America/Los_Angeles",           label: "Pacific Time (UTC-08:00)",    abbreviation: "PT"   },
  { value: "America/Denver",               label: "Mountain Time (UTC-07:00)",   abbreviation: "MT"   },
  { value: "America/Chicago",              label: "Central Time (UTC-06:00)",    abbreviation: "CT"   },
  { value: "America/New_York",             label: "Eastern Time (UTC-05:00)",    abbreviation: "ET"   },
  { value: "America/Phoenix",              label: "Arizona (UTC-07:00) - No DST",abbreviation: "MST"  },
  { value: "America/Indiana/Indianapolis", label: "Indiana (UTC-05:00)",          abbreviation: "EST"  },
  { value: "Pacific/Honolulu",             label: "Hawaii (UTC-10:00) - No DST", abbreviation: "HST"  },
];

export const getCurrentTimeInTimezone = (tz: string): string => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true,
    }).format(new Date());
  } catch { return "--:-- --"; }
};
