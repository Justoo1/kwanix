/**
 * Tracks which parcel labels have been printed, using localStorage.
 * The backend has no print-status field, so we persist client-side.
 */

const KEY = "rp_printed_labels";

export function markPrinted(parcelId: number): void {
  try {
    const ids = getPrintedIds();
    if (!ids.includes(parcelId)) {
      localStorage.setItem(KEY, JSON.stringify([...ids, parcelId]));
    }
  } catch { /* private/incognito may block localStorage */ }
}

export function getPrintedIds(): number[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as number[];
  } catch {
    return [];
  }
}
