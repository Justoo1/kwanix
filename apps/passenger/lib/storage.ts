import AsyncStorage from "@react-native-async-storage/async-storage";

const TICKETS_KEY = "saved_ticket_ids";

export async function saveTicketId(id: number): Promise<void> {
  const existing = await loadTicketIds();
  if (!existing.includes(id)) {
    await AsyncStorage.setItem(TICKETS_KEY, JSON.stringify([id, ...existing]));
  }
}

export async function loadTicketIds(): Promise<number[]> {
  const raw = await AsyncStorage.getItem(TICKETS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as number[];
  } catch {
    return [];
  }
}
