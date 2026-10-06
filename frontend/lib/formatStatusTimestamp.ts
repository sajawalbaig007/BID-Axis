import { formatEstStatusStamp } from "./estTime";

/** Short status-update time in Eastern: `25 Jun, 02:32:05 PM` */
export function formatStatusTimestamp(iso?: string | null): string {
  return formatEstStatusStamp(iso);
}
