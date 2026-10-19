export type CompanyRole = "owner" | "admin" | "purchasing" | "warehouse" | "production" | "finance" | "viewer";

export interface Workspace {
  userId: string;
  companyId: string;
  role: CompanyRole;
}

export interface AuthContext {
  sessionId: string;
  userId: string;
  name: string;
  email: string;
  csrfToken: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      workspace?: Workspace;
    }
  }
}
