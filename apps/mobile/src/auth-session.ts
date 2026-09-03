import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";

export const sessionKeys = {
  access: "registro.access-token",
  refresh: "registro.refresh-token",
  profile: "registro.profile",
};

export async function saveSession(session: {
  accessToken: string;
  refreshToken: string;
  user: unknown;
}) {
  await Promise.all([
    SecureStore.setItemAsync(sessionKeys.access, session.accessToken),
    SecureStore.setItemAsync(sessionKeys.refresh, session.refreshToken),
    SecureStore.setItemAsync(sessionKeys.profile, JSON.stringify(session.user)),
  ]);
}

export async function clearSession() {
  await Promise.all(
    Object.values(sessionKeys).map((key) => SecureStore.deleteItemAsync(key)),
  );
}

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const accessToken = await SecureStore.getItemAsync(sessionKeys.access);
  const request = () =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
    });
  const response = await request();
  if (response.status !== 401) return response;

  const refreshToken = await SecureStore.getItemAsync(sessionKeys.refresh);
  if (!refreshToken) return response;
  const refreshed = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!refreshed.ok) return response;
  const session = await refreshed.json();
  await saveSession(session);
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${session.accessToken}`,
    },
  });
}
