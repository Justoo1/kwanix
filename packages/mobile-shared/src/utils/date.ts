const GH_LOCALE = "en-GH";
const GH_TZ = "Africa/Accra";

export function formatGhDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(GH_LOCALE, {
    timeZone: GH_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatGhTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(GH_LOCALE, {
    timeZone: GH_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatGhDateTime(isoString: string): string {
  return `${formatGhDate(isoString)} · ${formatGhTime(isoString)}`;
}
