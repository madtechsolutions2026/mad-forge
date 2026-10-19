import type { Session, Workspace } from "./types";

let csrfToken = "";
let companyId = "";
export function setContext(session: Session, selectedCompany?: string) {
  csrfToken = session.csrfToken;
  companyId = selectedCompany ?? session.companies[0]?.id ?? "";
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  if (companyId) headers.set("X-Company-Id", companyId);
  const response = await fetch(path, { ...options, headers, credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(body.message ?? "The request could not be completed. Please try again.", response.status);
  return body.data ?? body;
}

export const api = {
  me: () => request<Session>("/api/auth/me"),
  login: (email: string, password: string) =>
    request<Session>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string, companyName: string) =>
    request<Session>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password, companyName }),
    }),
  logout: () => request("/api/auth/logout", { method: "POST", body: "{}" }),
  members: () => request<{ members: Member[] }>("/api/auth/members"),
  addMember: (body: { name: string; email: string; password: string; role: string }) =>
    request("/api/auth/members", { method: "POST", body: JSON.stringify(body) }),
  updateRole: (userId: string, role: string) =>
    request(`/api/auth/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  workspace: () => request<Workspace>("/api/erp/workspace"),
  mutate: (path: string, body: unknown, idempotencyKey: string) =>
    request<EntityResult>(`/api/erp${path}`, {
      method: "POST",
      headers: { "X-Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    }),
};
type EntityResult = { id: string; code?: string };
export type Member = { id: string; name: string; email: string; role: string; createdAt: string };
