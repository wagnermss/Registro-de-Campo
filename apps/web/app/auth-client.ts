export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export function saveTokens(session: {
  accessToken: string;
  refreshToken: string;
}) {
  localStorage.setItem("accessToken", session.accessToken);
  localStorage.setItem("refreshToken", session.refreshToken);
}

export function clearTokens() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const send = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  const response = await send(localStorage.getItem("accessToken"));
  if (response.status !== 401) return response;
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return response;
  const refreshed = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!refreshed.ok) {
    clearTokens();
    return response;
  }
  const session = await refreshed.json();
  saveTokens(session);
  return send(session.accessToken);
}
