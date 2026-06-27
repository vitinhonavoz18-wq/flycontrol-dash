// Client-side waiter session helper (localStorage).
// The token is HMAC-signed server-side; we only store/transport it.

const KEY = "flycontrol.waiterSession.v1";

export type WaiterSession = {
  token: string;
  expiresAt: number;
  waiter: { id: string; fullName: string; tenantId: string };
};

export function getWaiterSession(): WaiterSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WaiterSession;
    if (!parsed?.token || !parsed?.expiresAt || parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setWaiterSession(s: WaiterSession) {
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearWaiterSession() {
  window.localStorage.removeItem(KEY);
}
