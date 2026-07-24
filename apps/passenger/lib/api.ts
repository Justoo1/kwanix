import { createApiClient, createPublicApi } from "@routpass/mobile-shared";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

export const { apiFetch } = createApiClient(BASE_URL, async () => null);
export const publicApi = createPublicApi(apiFetch);
